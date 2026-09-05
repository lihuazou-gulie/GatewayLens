import { UpstreamError } from "../errors.mjs";
import { servicePerformanceScope } from "../performance-scope.mjs";

export function numeric(value) { return value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value); }
export function sum(items, key) { return items.reduce((total, item) => total + (numeric(item[key]) ?? 0), 0); }
export function ratio(n, d) { return d > 0 && n !== null ? n / d * 100 : null; }
export function catalog(payload) {
  if (!Array.isArray(payload)) throw new UpstreamError(502, "invalid_groups");
  return payload.filter((g) => Number.isSafeInteger(g?.id) && g.id > 0).map((g) => ({ id: g.id, name: String(g.name || ""), platform: String(g.platform || "") }));
}
export function quality(data, clientErrors) {
  const scope = servicePerformanceScope(data, clientErrors);
  return { requests: scope.request_count, successes: scope.success_count, errors: scope.error_count, rate: scope.success_rate,
    limited: numeric(data.business_limited_count), upstream429: numeric(data.upstream_429_count), upstream529: numeric(data.upstream_529_count),
    latency: { p50: numeric(data.duration?.p50_ms), p95: numeric(data.duration?.p95_ms), ttft: numeric(data.ttft?.p50_ms) } };
}
export function qualitySummary(groups) {
  const values = groups.map((g) => g.quality?.data).filter(Boolean);
  if (!values.length) return null;
  const requests = sum(values, "requests"), successes = sum(values, "successes");
  return { requests, successes, errors: sum(values, "errors"), rate: ratio(successes, requests), limited: sum(values, "limited"),
    upstream429: sum(values, "upstream429"), upstream529: sum(values, "upstream529"), partial: values.length !== groups.length };
}
// Upstream per-group account maps are unioned on the server; identifiers never leave this module.
export function capacityUnion(payloads) {
  const accounts = new Map();
  for (const payload of payloads) for (const [id, account] of Object.entries(payload.account || {})) accounts.set(id, account);
  const values = [...accounts.values()];
  if (!values.length) return { used: 0, max: 0, waiting: 0, percent: null };
  if (!values.every((a) => [a?.current_in_use, a?.max_capacity, a?.waiting_in_queue].every((n) => Number.isFinite(n) && n >= 0))) throw new UpstreamError(502, "invalid_capacity");
  const used = sum(values, "current_in_use"), max = sum(values, "max_capacity");
  return { used, max, waiting: sum(values, "waiting_in_queue"), percent: ratio(used, max) };
}
export function poolUnion(payloads) {
  const accounts = new Map();
  for (const payload of payloads) for (const [id, account] of Object.entries(payload.account || {})) accounts.set(id, account);
  const values = [...accounts.values()];
  if (!values.every((a) => typeof a?.is_available === "boolean")) throw new UpstreamError(502, "invalid_pool");
  const available = values.filter((a) => a.is_available).length;
  return { total: values.length, available, limited: values.filter((a) => a.is_rate_limited).length,
    errors: values.filter((a) => a.has_error).length, unavailable: values.length - available, percent: ratio(available, values.length) };
}
export function throughput(data) {
  if (!Array.isArray(data?.points)) throw new UpstreamError(502, "invalid_trend");
  return data.points.map((p) => ({ at: p?.bucket_start, requests: numeric(p?.request_count), tokens: numeric(p?.token_consumed) }))
    .filter((p) => typeof p.at === "string" && Number.isFinite(Date.parse(p.at)) && p.requests !== null);
}
export function modelMetric(m) {
  const requests = numeric(m?.request_count), successes = numeric(m?.success_requests);
  if (requests === null || successes === null || requests < 0 || successes < 0) throw new UpstreamError(502, "invalid_model_metrics");
  return { requests, successes, errors: numeric(m.error_requests), rate: requests > 0 && numeric(m.success_rate) !== null ? m.success_rate * 100 : null,
    latency: { p50: numeric(m.duration?.p50_ms), p95: numeric(m.duration?.p95_ms), ttft: numeric(m.ttft?.p50_ms) },
    tokens: numeric(m.token_count), cacheRate: numeric(m.cache_rate) === null ? null : m.cache_rate * 100, rpm: numeric(m.rpm) };
}
export function models(data) {
  if (!Array.isArray(data?.items)) throw new UpstreamError(502, "invalid_models");
  return { coverage: coverage(data.coverage), rows: data.items.map((m) => {
    if (!m || typeof m.model !== "string" || typeof m.platform !== "string") throw new UpstreamError(502, "invalid_model");
    return { model: m.model, platform: m.platform, ...modelMetric(m.metrics) };
  }) };
}
export function coverage(c) {
  return { complete: c?.coverage_complete === true, through: c?.data_through || null, from: c?.coverage_start || null, lagSeconds: numeric(c?.aggregation_lag_seconds) };
}
export function systemMetrics(data) {
  const m = data?.system_metrics;
  if (!m) return null;
  return { cpu: numeric(m.cpu_usage_percent), memoryUsed: numeric(m.memory_used_mb), memoryTotal: numeric(m.memory_total_mb),
    memoryPercent: numeric(m.memory_usage_percent), database: typeof m.db_ok === "boolean" ? m.db_ok : null,
    redis: typeof m.redis_ok === "boolean" ? m.redis_ok : null, dbActive: numeric(m.db_conn_active), redisConnections: numeric(m.redis_conn_total),
    updatedAt: m.created_at || null };
}
