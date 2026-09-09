import { randomBytes } from "node:crypto";
import { DomainError } from "../../../shared/domain/errors.mjs";
export class MemorySessions {
  #tokens = new Map();
  constructor({ now = () => Date.now(), limit = 64, ttlMs = 12 * 3600000 } = {}) {
    Object.assign(this, { now, limit, ttlMs });
  }
  authenticated(token) {
    for (const [key, expires] of this.#tokens) if (expires <= this.now()) this.#tokens.delete(key);
    return this.#tokens.has(token);
  }
  issue() {
    if (this.#tokens.size >= this.limit) this.#tokens.delete(this.#tokens.keys().next().value);
    const token = randomBytes(32).toString("hex");
    this.#tokens.set(token, this.now() + this.ttlMs);
    return token;
  }
  revoke(token) {
    this.#tokens.delete(token);
  }
  revokeAll() {
    this.#tokens.clear();
  }
}
export class AttemptLimiter {
  #attempts = new Map();
  constructor({ now = () => Date.now(), limit = 8, windowMs = 60000, maxKeys = 1000 } = {}) {
    Object.assign(this, { now, limit, windowMs, maxKeys });
  }
  check(key) {
    const now = this.now();
    for (const [id, entry] of this.#attempts) if (entry.until <= now) this.#attempts.delete(id);
    const value = this.#attempts.get(key) || { count: 0, until: now + this.windowMs };
    if (
      (!this.#attempts.has(key) && this.#attempts.size >= this.maxKeys) ||
      ++value.count > this.limit
    )
      throw new DomainError("throttled", "尝试过于频繁，请一分钟后重试");
    this.#attempts.set(key, value);
  }
}
