import assert from "node:assert/strict";
import { test } from "node:test";
import { readClientRequestErrorCount, servicePerformanceScope } from "../server/performance-scope.mjs";

test("service performance scope removes business and client-owned failures", () => {
  const result = servicePerformanceScope({
    request_count_total: 1_000,
    success_count: 800,
    error_count_total: 200,
    business_limited_count: 120,
    request_count_sla: 880,
    error_count_sla: 80,
  }, 20);

  assert.deepEqual(result, {
    request_count: 860,
    success_count: 800,
    error_count: 60,
    success_rate: 800 / 860 * 100,
  });
});

test("client request error count requires a bounded aggregate response", () => {
  assert.equal(readClientRequestErrorCount({ total: 7 }), 7);
  for (const data of [{ items: [] }, { total: null }, { total: "7" }]) assert.throws(() => readClientRequestErrorCount(data), /invalid_client_request_error_count/);
});
