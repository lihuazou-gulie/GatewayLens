import { DomainError } from "../../../shared/domain/errors.mjs";
import { mapConcurrent } from "../../../shared/application/map-concurrent.mjs";
import { RANGES, selectScope } from "../domain/scope.mjs";
import { qualitySummary, capacityUnion, poolUnion } from "../domain/metrics.mjs";

export class MonitoringService {
  constructor({ configurations, sources, cacheFactory, config, now = () => Date.now() }) {
    Object.assign(this, { configurations, sources, cacheFactory, config, now });
    this.version = -1;
  }
  invalidate() {
    this.epoch?.abort(new DomainError("conflict", "设置已更新，请刷新面板"));
    this.version = -1;
  }
  async catalog() {
    return this.sources.open()?.catalog() || [];
  }
  async snapshot(input = {}, admin = false) {
    const settings = this.configurations.snapshot();
    const { display, revision } = settings;
    if (!admin && (!display.public || !settings.connection || !display.groups.length))
      throw new DomainError("unauthenticated", "面板尚未公开，请登录后查看");
    const filter = selectScope(display, input, (id) => this.configurations.scopeId(id));
    if (!settings.connection || !filter.groups.length)
      return { state: "unconfigured", title: display.title, groups: [], modules: display.modules };
    if (this.version !== revision) {
      this.invalidate();
      this.version = revision;
      this.epoch = new AbortController();
      this.cache = this.cacheFactory(this.config.cacheMs, 32);
    }
    const source = this.sources.open(settings),
      epochSignal = this.epoch.signal;
    const key = JSON.stringify([filter.range, filter.scope, filter.model, filter.topic, admin]);
    try {
      const result = await this.cache.get(key, () => {
        const signal = AbortSignal.any([
          epochSignal,
          AbortSignal.timeout(this.config.snapshotTimeoutMs || 40000),
        ]);
        return this.load(source, display, filter.groups, filter, admin, signal);
      });
      if (revision !== this.configurations.snapshot().revision)
        throw new DomainError("conflict", "设置已更新，请刷新面板");
      return result;
    } catch (error) {
      if (revision !== this.configurations.snapshot().revision)
        throw new DomainError("conflict", "设置已更新，请刷新面板");
      if (error?.name === "TimeoutError") throw new DomainError("timeout", "采集超时，请稍后刷新");
      throw error;
    }
  }
  async load(source, display, selected, filter, admin, signal) {
    const end = this.now();
    const period = {
      ...filter,
      start: new Date(end - RANGES[filter.range]).toISOString(),
      end: new Date(end).toISOString(),
    };
    const groups = await mapConcurrent(
      selected,
      4,
      async (group) => ({
        scope: this.configurations.scopeId(group.id),
        label: group.label,
        ...(await source.group(group, period, display.modules, signal)),
      }),
      signal,
    );
    const capacities = groups.map((g) => g.capacity.data).filter(Boolean);
    const pools = groups.map((g) => g.pool.data).filter(Boolean);
    const traffic = new Map();
    for (const group of groups)
      for (const p of group.traffic.data || []) {
        const point = traffic.get(p.at) || { at: p.at, requests: 0 };
        point.requests += p.requests;
        traffic.set(p.at, point);
      }
    const names = filter.model
      ? [filter.model]
      : filter.topic === "images"
        ? display.imageModels
        : [];
    const models =
      display.modules.models && !(filter.topic === "images" && !names.length)
        ? await source.models(
            selected.map((g) => g.id),
            filter.range,
            names,
            signal,
          )
        : { state: filter.topic === "images" ? "unconfigured" : "hidden", data: null };
    const system = admin ? await source.system(period, signal) : undefined;
    signal?.throwIfAborted();
    const partial =
      groups.some((g) =>
        [g.quality, g.traffic, g.capacity, g.pool].some((s) => !["ok", "hidden"].includes(s.state)),
      ) || !["ok", "hidden", "unconfigured"].includes(models.state);
    return {
      state: partial ? "partial" : "ok",
      title: display.title,
      range: filter.range,
      generatedAt: period.end,
      modules: display.modules,
      poolThreshold: display.poolThreshold,
      imageModels: display.imageModels,
      scopes: display.groups.map((g) => ({
        scope: this.configurations.scopeId(g.id),
        label: g.label,
      })),
      summary: {
        quality: qualitySummary(groups),
        capacity: capacities.length
          ? { ...capacityUnion(capacities), partial: capacities.length !== groups.length }
          : null,
        pool: pools.length
          ? { ...poolUnion(pools), partial: pools.length !== groups.length }
          : null,
      },
      groups: groups.map(({ capacity, pool, ...group }) => ({
        ...group,
        capacity: {
          state: capacity.state,
          data: capacity.data ? capacityUnion([capacity.data]) : null,
        },
        pool: { state: pool.state, data: pool.data ? poolUnion([pool.data]) : null },
      })),
      traffic: [...traffic.values()].sort((a, b) => a.at.localeCompare(b.at)),
      models,
      ...(admin ? { system } : {}),
    };
  }
}
