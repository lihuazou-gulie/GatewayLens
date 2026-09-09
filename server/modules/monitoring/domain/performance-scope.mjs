import { InvalidMetricError } from "../../../shared/domain/errors.mjs";
export const CLIENT_REQUEST_ERROR_STATUS_CODES = Object.freeze([
  400, 401, 404, 409, 413, 415, 422, 425, 431,
]);
export const CLIENT_REQUEST_ERROR_STATUS_QUERY = CLIENT_REQUEST_ERROR_STATUS_CODES.join(",");
function count(value) {
  if (!Number.isFinite(value) || value < 0) throw new InvalidMetricError("invalid_quality");
  return value;
}
export function servicePerformanceScope(overview, clientRequestErrorCount = 0) {
  const total = count(overview.totalRequests);
  const businessLimited = Math.min(total, count(overview.businessLimited));
  const eligibleRequests = Math.min(count(overview.eligibleRequests), total - businessLimited);
  const eligibleErrors = Math.min(count(overview.eligibleErrors), eligibleRequests);
  const clientErrors = Math.min(eligibleRequests, count(clientRequestErrorCount));
  const requests = Math.max(0, eligibleRequests - clientErrors);
  const errors = Math.max(0, eligibleErrors - clientErrors);
  const successes = Math.min(requests, count(overview.successes));
  return { requests, successes, errors, rate: requests > 0 ? (successes / requests) * 100 : null };
}
