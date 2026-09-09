import { InvalidMetricError } from "../../../shared/domain/errors.mjs";
export function numeric(value) {
  return value === null || value === undefined || value === "" || !Number.isFinite(Number(value))
    ? null
    : Number(value);
}
export function sum(items, key) {
  return items.reduce((total, item) => total + (numeric(item[key]) ?? 0), 0);
}
export function ratio(n, d) {
  return d > 0 && n !== null ? (n / d) * 100 : null;
}
export function qualitySummary(groups) {
  const values = groups.map((g) => g.quality?.data).filter(Boolean);
  if (!values.length) return null;
  const requests = sum(values, "requests"),
    successes = sum(values, "successes");
  return {
    requests,
    successes,
    errors: sum(values, "errors"),
    rate: ratio(successes, requests),
    limited: sum(values, "limited"),
    upstream429: sum(values, "upstream429"),
    upstream529: sum(values, "upstream529"),
    partial: values.length !== groups.length,
  };
}
function union(payloads) {
  const accounts = new Map();
  for (const p of payloads) for (const account of p.accounts) accounts.set(account.id, account);
  return [...accounts.values()];
}
export function capacityUnion(payloads) {
  const values = union(payloads);
  if (!values.length) return { used: 0, max: 0, waiting: 0, percent: null };
  if (!values.every((a) => [a.used, a.max, a.waiting].every((n) => Number.isFinite(n) && n >= 0)))
    throw new InvalidMetricError("invalid_capacity");
  const used = sum(values, "used"),
    max = sum(values, "max");
  return { used, max, waiting: sum(values, "waiting"), percent: ratio(used, max) };
}
export function poolUnion(payloads) {
  const values = union(payloads);
  if (!values.every((a) => typeof a.available === "boolean"))
    throw new InvalidMetricError("invalid_pool");
  const available = values.filter((a) => a.available).length;
  return {
    total: values.length,
    available,
    limited: values.filter((a) => a.limited).length,
    errors: values.filter((a) => a.hasError).length,
    unavailable: values.length - available,
    percent: ratio(available, values.length),
  };
}
