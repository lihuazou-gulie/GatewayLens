import { HttpError, UpstreamError } from "./errors.mjs";
export function normalizeSite(value, { allowHttp = false } = {}) {
  let url;
  try { url = new URL(String(value).trim()); } catch { throw new HttpError(400, "请输入完整的 Sub2API 站点地址"); }
  if (url.username || url.password || url.search || url.hash || !["http:", "https:"].includes(url.protocol)) throw new HttpError(400, "站点地址不能包含凭证、查询参数或片段");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol === "http:" && !local && !allowHttp) throw new HttpError(400, "请使用 HTTPS；内网 HTTP 需在服务器显式启用 KANBAN_ALLOW_HTTP");
  url.pathname = url.pathname.replace(/\/+$/, "").replace(/\/api\/v1$/, "") + "/api/v1";
  return url.toString();
}
export class Sub2ApiClient {
  constructor({ baseUrl, apiKey, timeoutMs = 8000, fetchImpl = globalThis.fetch }) {
    this.baseUrl = baseUrl; this.apiKey = apiKey; this.timeoutMs = timeoutMs; this.fetch = fetchImpl; this.active = 0; this.queue = [];
  }
  async get(path, query = {}) {
    if (this.active >= 4) await new Promise((resolve) => this.queue.push(resolve)); else this.active++;
    try { return await this.request(path, query); }
    finally { const next = this.queue.shift(); if (next) next(); else this.active--; }
  }
  async request(path, query) {
    const url = new URL(`${this.baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`);
    for (const [key, value] of Object.entries(query)) for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined && item !== null && item !== "") url.searchParams.append(key, String(item));
    }
    try {
      const response = await this.fetch(url, { method: "GET", redirect: "error", headers: { Accept: "application/json", "X-API-Key": this.apiKey }, signal: AbortSignal.timeout(this.timeoutMs) });
      if (!response.ok) { await response.body?.cancel(); throw new UpstreamError(response.status); }
      const reader = response.body.getReader(); const chunks = []; let size = 0;
      for (;;) {
        const { done, value } = await reader.read(); if (done) break; size += value.length;
        if (size > 8 * 1024 * 1024) { await reader.cancel(); throw new UpstreamError(502, "oversized_response"); }
        chunks.push(value);
      }
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (payload.code !== 0 || !("data" in payload)) throw new UpstreamError(502, "invalid_contract");
      return payload.data;
    } catch (error) { if (error instanceof UpstreamError) throw error; throw new UpstreamError(0, "connection_failed"); }
  }
}
