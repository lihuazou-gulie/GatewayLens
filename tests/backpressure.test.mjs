import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { TimedValueCache } from "../server/shared/infrastructure/cache/timed-cache.mjs";
import { TaskGate } from "../server/shared/infrastructure/concurrency/task-gate.mjs";
import { MonitoringService } from "../server/modules/monitoring/application/monitoring-service.mjs";
import { abortable } from "../server/shared/infrastructure/concurrency/task-gate.mjs";
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

test("a full cache rejects new collections while preserving in-flight coalescing", async () => {
  const gate = deferred(),
    cache = new TimedValueCache(10, 2);
  let calls = 0;
  const one = cache.get("one", () => {
    calls++;
    return gate.promise;
  });
  const two = cache.get("two", () => gate.promise);
  await assert.rejects(
    cache.get("three", () => 3),
    (error) => error.code === "busy",
  );
  const shared = cache.get("one", () => {
    calls++;
    return 99;
  });
  assert.equal(cache.entries.size, 2);
  gate.resolve(7);
  assert.deepEqual(await Promise.all([one, two, shared]), [7, 7, 7]);
  assert.equal(calls, 1);
  assert.equal(await cache.get("three", () => 3), 3);
  assert.equal(cache.entries.size, 2);
});
test("bounded admission removes aborted waiters and recovers after overload", async () => {
  const gate = new TaskGate({ concurrency: 1, maxQueued: 1 }),
    block = deferred();
  const first = gate.run(() => block.promise);
  const controller = new AbortController();
  const queued = gate.run(() => assert.fail("aborted work must never execute"), {
    signal: controller.signal,
  });
  const rejected = assert.rejects(queued, /cancelled/);
  await assert.rejects(
    gate.run(() => 3),
    (error) => error.code === "busy",
  );
  assert.equal(gate.queued, 1);
  controller.abort(new Error("cancelled"));
  await rejected;
  assert.equal(gate.queued, 0);
  const next = gate.run(() => 42);
  block.resolve(1);
  assert.deepEqual(await Promise.all([first, next]), [1, 42]);
  await new Promise(setImmediate);
  assert.equal(gate.active, 0);
});
function monitorHarness({ timeoutMs = 1000 } = {}) {
  const settings = {
    revision: 1,
    connection: { baseUrl: "https://example.test", apiKey: "synthetic" },
    display: {
      title: "Synthetic",
      public: true,
      groups: [{ id: 1, label: "One" }],
      imageModels: [],
      poolThreshold: 35,
      modules: { quality: false, traffic: false, capacity: false, pool: false, models: true },
    },
  };
  const block = deferred();
  let calls = 0;
  const hidden = { state: "hidden", data: null };
  const source = {
    group: async () => ({ quality: hidden, traffic: hidden, capacity: hidden, pool: hidden }),
    models: async (_groups, _range, _names, signal) => {
      calls++;
      await abortable(block.promise, signal);
      return { state: "ok", data: { rows: [] } };
    },
  };
  const monitor = new MonitoringService({
    configurations: { snapshot: () => structuredClone(settings), scopeId: () => "one" },
    sources: { open: () => source },
    cacheFactory: (ttl, limit) => new TimedValueCache(ttl, limit),
    config: { cacheMs: 30000, snapshotTimeoutMs: timeoutMs },
  });
  return { monitor, block, settings, calls: () => calls };
}
test("160 unique guest queries stay within the 32-collection budget", async () => {
  const h = monitorHarness();
  const pending = Array.from({ length: 160 }, (_, i) =>
    h.monitor.snapshot({ model: "unlisted-" + i }, false).then(
      () => "ok",
      (error) => error.code,
    ),
  );
  await new Promise(setImmediate);
  assert.equal(h.monitor.cache.entries.size, 32);
  assert.equal(h.calls(), 32);
  h.block.resolve();
  const results = await Promise.all(pending);
  assert.equal(results.filter((result) => result === "ok").length, 32);
  assert.equal(results.filter((result) => result === "busy").length, 128);
});
test("an overall deadline releases a hung collection and permits a retry", async () => {
  const h = monitorHarness({ timeoutMs: 20 });
  const first = assert.rejects(h.monitor.snapshot({}, false), (error) => error.code === "timeout");
  await delay(35);
  await first;
  assert.equal(h.monitor.cache.entries.size, 0);
  h.block.resolve();
  assert.equal((await h.monitor.snapshot({}, false)).state, "ok");
});
