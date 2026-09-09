import { DomainError } from "../../domain/errors.mjs";
import { TaskGate } from "../concurrency/task-gate.mjs";
import { UpstreamError } from "./errors.mjs";
export class Sub2ApiClient {
  constructor({
    baseUrl,
    apiKey,
    timeoutMs = 8000,
    fetchImpl = globalThis.fetch,
    gate = new TaskGate(),
  }) {
    Object.assign(this, { baseUrl, apiKey, timeoutMs, fetch: fetchImpl, gate });
  }
  async get(path, query = {}, { signal } = {}) {
    const deadline = AbortSignal.timeout(this.timeoutMs);
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
    try {
      return await this.gate.run(() => this.request(path, query, combined), { signal: combined });
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (error instanceof DomainError || error instanceof UpstreamError) throw error;
      throw new UpstreamError(0, "connection_failed");
    }
  }
  async request(path, query, signal) {
    const url = new URL(this.baseUrl.replace(/\/$/, "") + "/" + path.replace(/^\//, ""));
    for (const [key, value] of Object.entries(query))
      for (const item of Array.isArray(value) ? value : [value]) {
        if (item !== undefined && item !== null && item !== "")
          url.searchParams.append(key, String(item));
      }
    const response = await this.fetch(url, {
      method: "GET",
      redirect: "error",
      headers: { Accept: "application/json", "X-API-Key": this.apiKey },
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new UpstreamError(response.status);
    }
    if (!response.body) throw new UpstreamError(502, "invalid_contract");
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8 * 1024 * 1024) {
        await reader.cancel();
        throw new UpstreamError(502, "oversized_response");
      }
      chunks.push(value);
    }
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!payload || payload.code !== 0 || !("data" in payload))
      throw new UpstreamError(502, "invalid_contract");
    return payload.data;
  }
}
