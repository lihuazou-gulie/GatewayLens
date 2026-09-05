import { UpstreamError } from "./errors.mjs";

// These are request-validation failures owned by the caller. Business-limited
// failures (403/429, quota and concurrency gates) are already removed by the
// upstream SLA counters; this list removes the remaining client request errors
// without hiding provider-side 4xx responses.
export const CLIENT_REQUEST_ERROR_STATUS_CODES = Object.freeze([
  400,
  401,
  404,
  409,
  413,
  415,
  422,
  425,
  431,
]);

export const CLIENT_REQUEST_ERROR_STATUS_QUERY = CLIENT_REQUEST_ERROR_STATUS_CODES.join(",");

function count(value, reason = "invalid_quality") {
  if (!Number.isFinite(value) || value < 0) throw new UpstreamError(502, reason);
  return value;
}

export function readClientRequestErrorCount(data) {
  return count(data?.total, "invalid_client_request_error_count");
}

export function servicePerformanceScope(overview, clientRequestErrorCount = 0) {
  const total = count(overview?.request_count_total);
  const businessLimited = Math.min(total, count(overview.business_limited_count));
  const slaRequests = Math.min(count(overview.request_count_sla), total - businessLimited);
  const slaErrors = Math.min(count(overview.error_count_sla), slaRequests);
  const clientErrors = Math.min(slaRequests, count(clientRequestErrorCount));
  const requestCount = Math.max(0, slaRequests - clientErrors);
  const errorCount = Math.max(0, slaErrors - clientErrors);
  const successCount = Math.min(requestCount, count(overview.success_count));

  return {
    request_count: requestCount,
    success_count: successCount,
    error_count: errorCount,
    success_rate: requestCount > 0 ? (successCount / requestCount) * 100 : null,
  };
}
