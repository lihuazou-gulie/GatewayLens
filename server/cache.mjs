export class TimedValueCache {
  constructor(ttlMs, limit = 128) { this.ttlMs = ttlMs; this.limit = limit; this.entries = new Map(); }
  async get(key, loader) {
    const current = this.entries.get(key);
    if (current && (current.pending || current.expiresAt > Date.now())) return current.value;
    if (this.entries.size >= this.limit) { const evict = [...this.entries].find(([, entry]) => !entry.pending); if (evict) this.entries.delete(evict[0]); }
    const entry = { pending: true, value: Promise.resolve().then(loader), expiresAt: 0 }; this.entries.set(key, entry);
    try {
      const value = await entry.value; Object.assign(entry, { pending: false, value, expiresAt: Date.now() + this.ttlMs }); return value;
    } catch (error) { if (this.entries.get(key) === entry) this.entries.delete(key); throw error; }
  }
}
