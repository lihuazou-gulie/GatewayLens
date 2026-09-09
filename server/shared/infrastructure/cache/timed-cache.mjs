import { DomainError } from "../../domain/errors.mjs";
export class TimedValueCache {
  constructor(ttlMs, limit = 128) {
    if (!Number.isFinite(ttlMs) || ttlMs < 0 || !Number.isInteger(limit) || limit < 1)
      throw new Error("Invalid cache limits");
    this.ttlMs = ttlMs;
    this.limit = limit;
    this.entries = new Map();
  }
  async get(key, loader) {
    const current = this.entries.get(key);
    if (current && (current.pending || current.expiresAt > Date.now())) return current.value;
    if (current) this.entries.delete(key);
    if (this.entries.size >= this.limit) {
      const evict = [...this.entries].find(([, entry]) => !entry.pending);
      if (!evict) throw new DomainError("busy", "采集请求较多，请稍后重试");
      this.entries.delete(evict[0]);
    }
    const entry = { pending: true, value: Promise.resolve().then(loader), expiresAt: 0 };
    this.entries.set(key, entry);
    try {
      const value = await entry.value;
      Object.assign(entry, { pending: false, value, expiresAt: Date.now() + this.ttlMs });
      return value;
    } catch (error) {
      if (this.entries.get(key) === entry) this.entries.delete(key);
      throw error;
    }
  }
  clear() {
    this.entries.clear();
  }
}
