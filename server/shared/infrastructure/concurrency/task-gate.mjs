import { DomainError } from "../../domain/errors.mjs";
export class TaskGate {
  #active = 0;
  #queue = [];
  constructor({ concurrency = 4, maxQueued = 64 } = {}) {
    if (
      !Number.isInteger(concurrency) ||
      concurrency < 1 ||
      !Number.isInteger(maxQueued) ||
      maxQueued < 0
    )
      throw new Error("Invalid task gate limits");
    Object.assign(this, { concurrency, maxQueued });
  }
  get active() {
    return this.#active;
  }
  get queued() {
    return this.#queue.length;
  }
  run(task, { signal } = {}) {
    if (signal?.aborted) return Promise.reject(signal.reason);
    return new Promise((resolve, reject) => {
      const entry = { task, signal, resolve, reject };
      if (this.#active < this.concurrency) {
        this.#start(entry);
        return;
      }
      if (this.#queue.length >= this.maxQueued) {
        reject(new DomainError("busy", "采集请求较多，请稍后重试"));
        return;
      }
      entry.abort = () => {
        const index = this.#queue.indexOf(entry);
        if (index !== -1) this.#queue.splice(index, 1);
        reject(signal.reason);
      };
      signal?.addEventListener("abort", entry.abort, { once: true });
      this.#queue.push(entry);
    });
  }
  #start(entry) {
    entry.signal?.removeEventListener("abort", entry.abort);
    this.#active++;
    Promise.resolve()
      .then(() => {
        entry.signal?.throwIfAborted();
        return entry.task();
      })
      .then(entry.resolve, entry.reject)
      .finally(() => {
        this.#active--;
        const next = this.#queue.shift();
        if (next) this.#start(next);
      });
  }
}
export function abortable(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) {
    Promise.resolve(promise).catch(() => {});
    return Promise.reject(signal.reason);
  }
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
