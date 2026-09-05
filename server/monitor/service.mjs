import { TimedValueCache } from "../cache.mjs";
import { Sub2ApiClient } from "../upstream-client.mjs";
import { HttpError, UpstreamError } from "../errors.mjs";
import { CLIENT_REQUEST_ERROR_STATUS_QUERY, readClientRequestErrorCount } from "../performance-scope.mjs";
import * as dto from "./normalize.mjs";

export const RANGES = { "24h": 86400000, "7d": 604800000, "30d": 2592000000 };
export const STATUS_TEXT = { ok: "已连接", disabled: "监控未启用", unsupported: "接口未提供", denied: "权限不足或功能未开启", unavailable: "数据暂时不可用" };
export async function section(loader, normalize = (v) => v) {
  try {
    const value = await loader();
    if (value?.enabled === false) return { state: "disabled", data: null };
    return { state: "ok", data: normalize(value) };
  } catch (e) {
    if (!(e instanceof UpstreamError)) throw e;
    return { state: e.status === 404 ? "unsupported" : e.status === 403 ? "denied" : "unavailable", data: null };
  }
}
function requireRealtime(data, validate) {
  if (data?.enabled !== true || !data.account || typeof data.account !== "object" || Array.isArray(data.account)) throw new UpstreamError(502, "invalid_realtime");
  validate([data]);
  return data;
}

export class MonitoringService {
  constructor({ store, config, clientFactory = (c) => new Sub2ApiClient(c), now = () => Date.now() }) {
    Object.assign(this, { store, config, clientFactory, now }); this.version = -1;
  }
  sync() {
    if (this.version === this.store.revision) return;
    this.version = this.store.revision;
    this.cache = new TimedValueCache(this.config.cacheMs);
    const connection = this.store.connection();
    this.client = connection ? this.clientFactory({ ...connection, timeoutMs: this.config.requestTimeoutMs }) : null;
  }
  async catalog() {
    this.sync(); if (!this.client) return [];
    const client = this.client;
    return this.cache.get("catalog", async () => dto.catalog(await client.get("/admin/groups/all")));
  }
  async snapshot({ range = "24h", scope = "all", model = "", topic = "" } = {}, admin = false) {
    if (!Object.hasOwn(RANGES, range)) throw new HttpError(400, "请选择 24 小时、7 天或 30 天");
    if (model.length > 120 || !["", "images"].includes(topic)) throw new HttpError(400, "模型筛选无效");
    this.sync();
    const revision = this.store.revision;
    const display = structuredClone(this.store.state.display);
    if (!admin && (!display.public || !this.client || !display.groups.length)) throw new HttpError(401, "面板尚未公开，请登录后查看");
    let groups = display.groups;
    if (scope !== "all") {
      groups = groups.filter((g) => this.store.scopeId(g.id) === scope);
      if (!groups.length) throw new HttpError(404, "该分组未配置展示");
    }
    if (topic === "images" && model && !display.imageModels.includes(model)) throw new HttpError(400, "该模型不在图片专题中");
    const client = this.client;
    if (!client || !groups.length) return { state: "unconfigured", title: display.title, groups: [], modules: display.modules };
    const snapshot = await this.cache.get(JSON.stringify([range, scope, model, topic, admin]), () => this.load(client, display, groups, { range, model, topic }, admin));
    // A settings change during collection must not publish results from the former source/scope.
    if (revision !== this.store.revision) throw new HttpError(409, "设置已更新，请刷新面板");
    return snapshot;
  }
  async load(client, display, selected, filter, admin) {
    const end = this.now(); const query = { start_time: new Date(end - RANGES[filter.range]).toISOString(), end_time: new Date(end).toISOString() };
    const cache = this.cache;
    const cached = (key, loader) => cache.get(key, loader);
    const groups = await Promise.all(selected.map(async (g) => {
      const q = { ...query, group_id: g.id };
      const get = (path, extra = {}) => cached(`${path}:${g.id}:${filter.range}:${JSON.stringify(extra)}`, () => client.get(path, { ...q, ...extra }));
      const disabled = Promise.resolve({ state: "hidden", data: null });
      const [quality, traffic, capacityRaw, poolRaw] = await Promise.all([
        display.modules.quality ? section(async () => {
          const [overview, errors] = await Promise.all([get("/admin/ops/dashboard/overview"), get("/admin/ops/request-errors", { page: 1, page_size: 1, view: "all", phase: "request", error_owner: "client", status_codes: CLIENT_REQUEST_ERROR_STATUS_QUERY })]);
          return dto.quality(overview, readClientRequestErrorCount(errors));
        }) : disabled,
        display.modules.traffic ? section(() => get("/admin/ops/dashboard/throughput-trend"), dto.throughput) : disabled,
        display.modules.capacity ? section(() => get("/admin/ops/concurrency"), (v) => requireRealtime(v, dto.capacityUnion)) : disabled,
        display.modules.pool ? section(() => get("/admin/ops/account-availability"), (v) => requireRealtime(v, dto.poolUnion)) : disabled,
      ]);
      return { scope: this.store.scopeId(g.id), label: g.label, quality, traffic, capacityRaw, poolRaw };
    }));
    const capacities = groups.map((g) => g.capacityRaw.data).filter(Boolean);
    const pools = groups.map((g) => g.poolRaw.data).filter(Boolean);
    const traffic = new Map();
    groups.forEach((g) => (g.traffic.data || []).forEach((p) => {
      const point = traffic.get(p.at) || { at: p.at, requests: 0 }; point.requests += p.requests; traffic.set(p.at, point);
    }));
    const selectedModels = filter.model ? [filter.model] : filter.topic === "images" ? display.imageModels : [];
    const modelSection = display.modules.models && !(filter.topic === "images" && !selectedModels.length)
      ? await section(() => client.get("/admin/channel-monitor-v2/models", { range: filter.range, group_id: selected.map((g) => g.id), model: selectedModels }), dto.models)
      : { state: filter.topic === "images" ? "unconfigured" : "hidden", data: null };
    const system = admin ? await section(() => client.get("/admin/ops/dashboard/overview", query), dto.systemMetrics) : undefined;
    const partial = groups.some((g) => [g.quality, g.traffic, g.capacityRaw, g.poolRaw].some((s) => !["ok", "hidden"].includes(s.state)))
      || !["ok", "hidden", "unconfigured"].includes(modelSection.state);
    return { state: partial ? "partial" : "ok", title: display.title, range: filter.range, generatedAt: new Date(end).toISOString(),
      modules: display.modules, poolThreshold: display.poolThreshold, imageModels: display.imageModels,
      scopes: display.groups.map((g) => ({ scope: this.store.scopeId(g.id), label: g.label })),
      summary: { quality: dto.qualitySummary(groups), capacity: capacities.length ? { ...dto.capacityUnion(capacities), partial: capacities.length !== groups.length } : null,
        pool: pools.length ? { ...dto.poolUnion(pools), partial: pools.length !== groups.length } : null },
      groups: groups.map(({ capacityRaw, poolRaw, ...g }) => ({ ...g, capacity: { state: capacityRaw.state, data: capacityRaw.data ? dto.capacityUnion([capacityRaw.data]) : null },
        pool: { state: poolRaw.state, data: poolRaw.data ? dto.poolUnion([poolRaw.data]) : null } })),
      traffic: [...traffic.values()].sort((a, b) => a.at.localeCompare(b.at)), models: modelSection,
      ...(admin ? { system } : {}),
    };
  }
}
