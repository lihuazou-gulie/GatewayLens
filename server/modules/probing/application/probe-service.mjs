import { DomainError } from "../../../shared/domain/errors.mjs";
function publicResult(result) {
  if (!result) return null;
  return {
    status: result.status,
    reason: result.reason,
    latencyMs: result.latencyMs,
    checkedAt: result.checkedAt,
    upstreamStatus: result.upstreamStatus,
  };
}
export class ProbeService {
  constructor({
    repository,
    configurations,
    resultStore,
    clientFactory,
    timeoutMs,
    now = () => Date.now(),
  }) {
    Object.assign(this, { repository, configurations, resultStore, clientFactory, timeoutMs, now });
    this.running = null;
    this.nextRunAt = 0;
    this.scheduledGeneration = null;
  }
  target() {
    const settings = this.configurations.snapshot(),
      probe = this.repository.read();
    const selected = settings.display.groups.find((group) => group.id === probe.config.groupId);
    return { ...probe, source: settings.connection, groupLabel: selected?.label || "" };
  }
  describe(target = this.target()) {
    const { config, source, apiKey, groupLabel } = target;
    return {
      ...config,
      configured: Boolean(source && apiKey && config.groupId !== null && config.model),
      groupLabel,
    };
  }
  async tick() {
    const target = this.target();
    if (this.scheduledGeneration !== target.generation) {
      this.scheduledGeneration = target.generation;
      this.nextRunAt = 0;
    }
    if (!target.config.enabled || this.running || this.now() < this.nextRunAt) return;
    this.nextRunAt = this.now() + target.config.intervalSeconds * 1000;
    await this.runNow();
  }
  async runNow() {
    const current = this.target();
    if (!this.describe(current).configured) throw new DomainError("conflict", "请先配置主动探测");
    if (this.running) {
      if (this.running.generation !== current.generation)
        throw new DomainError("conflict", "上一次探测正在结束，请稍后重试");
      return this.running.promise;
    }
    const checkedAt = new Date(this.now()).toISOString();
    const promise = (async () => {
      const result = await this.clientFactory({
        baseUrl: current.source.baseUrl,
        apiKey: current.apiKey,
        timeoutMs: this.timeoutMs,
      }).probe(current.config);
      const record = {
        generation: current.generation,
        groupId: current.config.groupId,
        model: current.config.model,
        endpoint: current.config.endpoint,
        status: result.status,
        reason: result.reason,
        latencyMs: Number.isFinite(result.latencyMs) ? result.latencyMs : null,
        upstreamStatus: Number.isInteger(result.upstreamStatus) ? result.upstreamStatus : null,
        checkedAt,
      };
      await this.resultStore.append(record);
      if (current.generation !== this.repository.read().generation)
        throw new DomainError("conflict", "探测设置已更新，请重新载入");
      return publicResult(record);
    })().finally(() => {
      this.running = null;
    });
    this.running = { generation: current.generation, promise };
    return promise;
  }
  async status(limit = 100) {
    const target = this.target();
    const records = await this.resultStore.list(target.generation, limit);
    if (target.generation !== this.repository.read().generation)
      throw new DomainError("conflict", "探测设置已更新，请重新载入");
    return {
      config: this.describe(target),
      latest: publicResult(records[0]),
      history: records.map(publicResult),
    };
  }
}
