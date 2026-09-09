import { UpstreamError } from "../../../shared/infrastructure/sub2api/errors.mjs";
import { numeric, capacityUnion, poolUnion } from "../domain/metrics.mjs";
import { servicePerformanceScope } from "../domain/performance-scope.mjs";

export function catalog(payload) {
  if (!Array.isArray(payload)) throw new UpstreamError(502, "invalid_groups");
  return payload
    .filter((g) => Number.isSafeInteger(g?.id) && g.id > 0)
    .map((g) => ({ id: g.id, name: String(g.name || ""), platform: String(g.platform || "") }));
}
export function quality(data, clientErrors) {
  const scope = servicePerformanceScope(
    {
      totalRequests: data?.request_count_total,
      businessLimited: data?.business_limited_count,
      eligibleRequests: data?.request_count_sla,
      eligibleErrors: data?.error_count_sla,
      successes: data?.success_count,
    },
    clientErrors,
  );
  return {
    requests: scope.requests,
    successes: scope.successes,
    errors: scope.errors,
    rate: scope.rate,
    limited: numeric(data.business_limited_count),
    upstream429: numeric(data.upstream_429_count),
    upstream529: numeric(data.upstream_529_count),
    latency: {
      p50: numeric(data.duration?.p50_ms),
      p95: numeric(data.duration?.p95_ms),
      ttft: numeric(data.ttft?.p50_ms),
    },
  };
}
export function realtimeCapacity(data) {
  const account = accountMap(data);
  const result = {
    accounts: Object.entries(account).map(([id, a]) => ({
      id,
      used: a?.current_in_use,
      max: a?.max_capacity,
      waiting: a?.waiting_in_queue,
    })),
  };
  capacityUnion([result]);
  return result;
}
export function realtimePool(data) {
  const account = accountMap(data);
  const result = {
    accounts: Object.entries(account).map(([id, a]) => ({
      id,
      available: a?.is_available,
      limited: a?.is_rate_limited,
      hasError: a?.has_error,
    })),
  };
  poolUnion([result]);
  return result;
}
function accountMap(data) {
  if (
    data?.enabled !== true ||
    !data.account ||
    typeof data.account !== "object" ||
    Array.isArray(data.account)
  )
    throw new UpstreamError(502, "invalid_realtime");
  return data.account;
}
export function readClientRequestErrorCount(data) {
  if (!Number.isFinite(data?.total) || data.total < 0)
    throw new UpstreamError(502, "invalid_client_request_error_count");
  return data.total;
}
export function throughput(data) {
  if (!Array.isArray(data?.points)) throw new UpstreamError(502, "invalid_trend");
  return data.points
    .map((p) => ({
      at: p?.bucket_start,
      requests: numeric(p?.request_count),
      tokens: numeric(p?.token_consumed),
    }))
    .filter(
      (p) => typeof p.at === "string" && Number.isFinite(Date.parse(p.at)) && p.requests !== null,
    );
}
export function modelMetric(m) {
  const requests = numeric(m?.request_count),
    successes = numeric(m?.success_requests);
  if (requests === null || successes === null || requests < 0 || successes < 0)
    throw new UpstreamError(502, "invalid_model_metrics");
  return {
    requests,
    successes,
    errors: numeric(m.error_requests),
    rate: requests > 0 && numeric(m.success_rate) !== null ? m.success_rate * 100 : null,
    latency: {
      p50: numeric(m.duration?.p50_ms),
      p95: numeric(m.duration?.p95_ms),
      ttft: numeric(m.ttft?.p50_ms),
    },
    tokens: numeric(m.token_count),
    cacheRate: numeric(m.cache_rate) === null ? null : m.cache_rate * 100,
    rpm: numeric(m.rpm),
  };
}
export function models(data) {
  if (!Array.isArray(data?.items)) throw new UpstreamError(502, "invalid_models");
  return {
    coverage: coverage(data.coverage),
    rows: data.items.map((m) => {
      if (!m || typeof m.model !== "string" || typeof m.platform !== "string")
        throw new UpstreamError(502, "invalid_model");
      return { model: m.model, platform: m.platform, ...modelMetric(m.metrics) };
    }),
  };
}
export function coverage(c) {
  return {
    complete: c?.coverage_complete === true,
    through: c?.data_through || null,
    from: c?.coverage_start || null,
    lagSeconds: numeric(c?.aggregation_lag_seconds),
  };
}
export function systemMetrics(data) {
  const m = data?.system_metrics;
  if (!m) return null;
  return {
    cpu: numeric(m.cpu_usage_percent),
    memoryUsed: numeric(m.memory_used_mb),
    memoryTotal: numeric(m.memory_total_mb),
    memoryPercent: numeric(m.memory_usage_percent),
    database: typeof m.db_ok === "boolean" ? m.db_ok : null,
    redis: typeof m.redis_ok === "boolean" ? m.redis_ok : null,
    dbActive: numeric(m.db_conn_active),
    redisConnections: numeric(m.redis_conn_total),
    updatedAt: m.created_at || null,
  };
}
