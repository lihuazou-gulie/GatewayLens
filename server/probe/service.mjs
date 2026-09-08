import { randomBytes } from "node:crypto";
import { HttpError } from "../errors.mjs";
import { ProbeClient } from "./client.mjs";
import { ProbeResultStore } from "./store.mjs";

function publicResult(result) {
  if (!result) return null;
  return { status: result.status, reason: result.reason, latencyMs: result.latencyMs, checkedAt: result.checkedAt, upstreamStatus: result.upstreamStatus };
}

export class ProbeService {
  constructor({ store, config, clientFactory = (options) => new ProbeClient(options), resultStore = new ProbeResultStore(store.dir), now = () => Date.now(), schedulerMs = 5000 }) {
    Object.assign(this, { store, config, clientFactory, resultStore, now, schedulerMs });
    this.revision = -1; this.timer = null; this.nextRunAt = 0; this.running = null;
  }

  sync() {
    if (this.revision === this.store.revision && this.current) return;
    this.revision = this.store.revision;
    this.nextRunAt = 0;
    const source = this.store.connection(); const probe = this.store.probe();
    const selected = this.store.state.display.groups.find((group) => group.id === probe.config.groupId);
    this.current = { source, ...probe, groupLabel: selected?.label || "" };
  }

  describe() {
    this.sync(); const { config, source, apiKey, groupLabel } = this.current;
    return { ...config, configured: Boolean(source && apiKey && config.groupId !== null && config.model), groupLabel };
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.tick(); }, this.schedulerMs);
    this.timer.unref?.();
    void this.tick();
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  async tick() {
    this.sync(); const { config } = this.current;
    if (!config.enabled || this.running || this.now() < this.nextRunAt) return;
    this.nextRunAt = this.now() + config.intervalSeconds * 1000;
    try { await this.runNow(); } catch { /* Scheduler failures are represented in the result store. */ }
  }

  async runNow() {
    this.sync(); const current = this.current;
    if (!current.source || !current.apiKey || current.config.groupId === null || !current.config.model) throw new HttpError(409, "请先配置主动探测");
    if (this.running) return this.running;
    const generation = current.generation; const checkedAt = new Date(this.now()).toISOString();
    this.running = (async () => {
      const result = await this.clientFactory({ ...current.source, apiKey: current.apiKey, timeoutMs: this.config.requestTimeoutMs }).probe(current.config);
      const record = { generation, groupId: current.config.groupId, model: current.config.model, endpoint: current.config.endpoint,
        status: result.status, reason: result.reason, latencyMs: Number.isFinite(result.latencyMs) ? result.latencyMs : null,
        upstreamStatus: Number.isInteger(result.upstreamStatus) ? result.upstreamStatus : null, checkedAt };
      await this.resultStore.append(record); return publicResult(record);
    })().finally(() => { this.running = null; });
    return this.running;
  }

  async status(limit = 100) {
    this.sync(); const values = await this.resultStore.list(this.current.generation, limit);
    return { config: this.describe(), latest: publicResult(values[0]), history: values.map(publicResult) };
  }

  static nextGeneration() { return randomBytes(12).toString("hex"); }
}
