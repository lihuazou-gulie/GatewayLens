import assert from "node:assert/strict";
import { test } from "node:test";
import { servicePerformanceScope } from "../server/modules/monitoring/domain/performance-scope.mjs";
import { readClientRequestErrorCount } from "../server/modules/monitoring/infrastructure/normalizers.mjs";

test("service performance scope removes business and client-owned failures", () => {
  const result = servicePerformanceScope(
    {
      totalRequests: 1_000,
      successes: 800,
      totalErrors: 200,
      businessLimited: 120,
      eligibleRequests: 880,
      eligibleErrors: 80,
    },
    20,
  );

  assert.deepEqual(result, {
    requests: 860,
    successes: 800,
    errors: 60,
    rate: (800 / 860) * 100,
  });
});

test("client request error count requires a bounded aggregate response", () => {
  assert.equal(readClientRequestErrorCount({ total: 7 }), 7);
  for (const data of [{ items: [] }, { total: null }, { total: "7" }])
    assert.throws(() => readClientRequestErrorCount(data), /invalid_client_request_error_count/);
});
