const MAX_RESPONSE_BYTES = 1024 * 1024;

function gatewayBase(baseUrl) {
  const url = new URL(baseUrl);
  url.pathname = url.pathname.replace(/\/api\/v1\/?$/, "");
  return url;
}

async function readBody(response) {
  if (!response.body) return "";
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error("oversized_response"); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function failure(reason, upstreamStatus = null) { return { status: "failed", reason, upstreamStatus }; }

export class ProbeClient {
  constructor({ baseUrl, apiKey, timeoutMs = 8000, fetchImpl = globalThis.fetch }) {
    this.baseUrl = baseUrl; this.apiKey = apiKey; this.timeoutMs = timeoutMs; this.fetch = fetchImpl;
  }

  async probe({ endpoint, model }) {
    const base = gatewayBase(this.baseUrl); const basePath = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
    const url = new URL(`${basePath}${endpoint.replace(/^\//, "")}`, base);
    const started = Date.now();
    const body = JSON.stringify({ model, messages: [{ role: "user", content: "Reply with exactly OK." }], max_tokens: 1, temperature: 0, stream: false });
    let response;
    try {
      response = await this.fetch(url, { method: "POST", redirect: "error", headers: {
        Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}`, "X-API-Key": this.apiKey,
      }, body, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      return failure(error?.name === "TimeoutError" || error?.name === "AbortError" ? "timeout" : "connection_failed");
    }
    const latencyMs = Math.max(0, Date.now() - started);
    if (!response.ok) { await response.body?.cancel(); return { ...failure(`http_${response.status}`, response.status), latencyMs }; }
    let text;
    try { text = await readBody(response); } catch (error) { return { ...failure(error.message === "oversized_response" ? "oversized_response" : "invalid_response"), latencyMs }; }
    let payload;
    try { payload = JSON.parse(text); } catch { return { ...failure("invalid_json"), latencyMs }; }
    const content = payload?.choices?.[0]?.message?.content ?? payload?.choices?.[0]?.text ?? payload?.output_text;
    if (typeof content !== "string" || !content.trim()) return { ...failure("empty_response"), latencyMs };
    return { status: "ok", reason: "ok", upstreamStatus: response.status, latencyMs };
  }
}
