import { DomainError, InvalidMetricError } from "../../../shared/domain/errors.mjs";
import { UpstreamError } from "../../../shared/infrastructure/sub2api/errors.mjs";
import { abortable } from "../../../shared/infrastructure/concurrency/task-gate.mjs";
import { CLIENT_REQUEST_ERROR_STATUS_QUERY } from "../domain/performance-scope.mjs";
import * as dto from "./normalizers.mjs";

export async function section(loader, normalize = (value) => value) {
  try {
    const value = await loader();
    if (value?.enabled === false) return { state: "disabled", data: null };
    return { state: "ok", data: normalize(value) };
  } catch (error) {
    if (error instanceof InvalidMetricError) return { state: "unavailable", data: null };
    if (!(error instanceof UpstreamError)) throw error;
    return {
      state: error.status === 404 ? "unsupported" : error.status === 403 ? "denied" : "unavailable",
      data: null,
    };
  }
}

class Sub2ApiSource {
  constructor(read) {
    this.read = read;
  }
  catalog() {
    return this.read("/admin/groups/all", {}, ["catalog"]).then(dto.catalog);
  }
  async group(group, filter, modules, signal) {
    const query = { start_time: filter.start, end_time: filter.end, group_id: group.id };
    const get = (path, extra = {}) =>
      this.read(path, { ...query, ...extra }, [path, group.id, filter.range, extra], signal);
    const hidden = { state: "hidden", data: null };
    const [quality, traffic, capacity, pool] = await Promise.all([
      modules.quality
        ? section(async () => {
            const [overview, errors] = await Promise.all([
              get("/admin/ops/dashboard/overview"),
              get("/admin/ops/request-errors", {
                page: 1,
                page_size: 1,
                view: "all",
                phase: "request",
                error_owner: "client",
                status_codes: CLIENT_REQUEST_ERROR_STATUS_QUERY,
              }),
            ]);
            return dto.quality(overview, dto.readClientRequestErrorCount(errors));
          })
        : hidden,
      modules.traffic
        ? section(() => get("/admin/ops/dashboard/throughput-trend"), dto.throughput)
        : hidden,
      modules.capacity
        ? section(() => get("/admin/ops/concurrency"), dto.realtimeCapacity)
        : hidden,
      modules.pool
        ? section(() => get("/admin/ops/account-availability"), dto.realtimePool)
        : hidden,
    ]);
    return { quality, traffic, capacity, pool };
  }
  models(groupIds, range, names, signal) {
    const query = { range, group_id: groupIds, model: names };
    return section(
      () => this.read("/admin/channel-monitor-v2/models", query, ["models", query], signal),
      dto.models,
    );
  }
  system(filter, signal) {
    return section(
      () =>
        this.read(
          "/admin/ops/dashboard/overview",
          { start_time: filter.start, end_time: filter.end },
          ["system", filter.range],
          signal,
        ),
      dto.systemMetrics,
    );
  }
}

// This adapter owns upstream field names, endpoints and provider error mapping.
export class MonitoringSources {
  constructor({ configurations, clientFactory, cacheFactory, config }) {
    Object.assign(this, { configurations, clientFactory, cacheFactory, config });
    this.version = -1;
  }
  invalidate() {
    this.epoch?.abort(new DomainError("conflict", "设置已更新，请刷新面板"));
    this.version = -1;
    this.source = null;
  }
  open(snapshot = this.configurations.snapshot()) {
    if (snapshot.revision === this.version) return this.source;
    this.invalidate();
    this.version = snapshot.revision;
    if (!snapshot.connection) return null;
    this.epoch = new AbortController();
    const signal = this.epoch.signal,
      cache = this.cacheFactory(this.config.cacheMs, 128);
    const client = this.clientFactory({
      ...snapshot.connection,
      timeoutMs: this.config.requestTimeoutMs,
    });
    this.source = new Sub2ApiSource((path, query, key, callerSignal) => {
      const result = cache.get(JSON.stringify(key), () => client.get(path, query, { signal }));
      return abortable(result, callerSignal);
    });
    return this.source;
  }
  async testConnection(connection, capabilities) {
    const client = this.clientFactory({ ...connection, timeoutMs: this.config.requestTimeoutMs });
    let groups;
    try {
      groups = dto.catalog(await client.get("/admin/groups/all"));
    } catch (error) {
      if (!(error instanceof UpstreamError)) throw error;
      throw new DomainError(
        "validation",
        error.status === 401 ? "管理员 Key 无效或已失效" : "无法读取分组，请检查站点、权限和网络",
      );
    }
    if (!capabilities) return { groups };
    const [realtime, models] = await Promise.all([
      section(
        () => client.get("/admin/ops/concurrency"),
        () => true,
      ),
      section(
        () => client.get("/admin/channel-monitor-v2/models", { range: "24h" }),
        () => true,
      ),
    ]);
    return { groups, capabilities: { realtime: realtime.state, models: models.state } };
  }
}
