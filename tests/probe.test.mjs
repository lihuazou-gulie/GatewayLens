import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProbeClient } from "../server/probe/client.mjs";
import { ProbeResultStore } from "../server/probe/store.mjs";
import { ProbeService } from "../server/probe/service.mjs";
import { validateProbe } from "../server/settings/schema.mjs";
import { SettingsStore } from "../server/settings/store.mjs";

test("probe client sends a bounded OpenAI-compatible request and stores no response text", async () => {
  let request;
  const client = new ProbeClient({ baseUrl: "https://example.test/panel/api/v1", apiKey: "probe-secret", fetchImpl: async (url, options) => {
    request = { url: String(url), options }; return new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), { status: 200 });
  } });
  const result = await client.probe({ endpoint: "/v1/chat/completions", model: "gpt-5.6" });
  const payload = JSON.parse(request.options.body);
  assert.equal(result.status, "ok"); assert.match(request.url, /^https:\/\/example\.test\/panel\/v1\/chat\/completions$/);
  assert.equal(request.options.method, "POST"); assert.equal(request.options.redirect, "error");
  assert.equal(request.options.headers.Authorization, "Bearer probe-secret"); assert.equal(request.options.headers["X-API-Key"], "probe-secret");
  assert.equal(payload.max_tokens, 1); assert.equal(payload.stream, false); assert.equal(payload.model, "gpt-5.6");
  assert.ok(!JSON.stringify(result).includes("OK"));
});

test("probe client distinguishes HTTP, invalid and empty responses", async () => {
  const response = (body, status = 200) => new Response(body, { status });
  const cases = [[response("{}", 429), "http_429"], [response("not-json"), "invalid_json"], [response(JSON.stringify({ choices: [{ message: { content: " " } }] })), "empty_response"]];
  for (const [value, reason] of cases) {
    const client = new ProbeClient({ baseUrl: "https://example.test/api/v1", apiKey: "key", fetchImpl: async () => value });
    const result = await client.probe({ endpoint: "/v1/chat/completions", model: "model" });
    assert.equal(result.status, "failed"); assert.equal(result.reason, reason);
  }
});

test("probe results persist atomically and can be scoped to a configuration generation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "probe-store-")); const store = new ProbeResultStore(dir);
  assert.deepEqual(await store.list("gen-a"), []);
  await store.append({ generation: "gen-a", groupId: 1, model: "model", endpoint: "/v1/chat/completions", status: "ok", reason: "ok", latencyMs: 42, upstreamStatus: 200, checkedAt: new Date().toISOString() });
  await store.append({ generation: "gen-b", groupId: 2, model: "other", endpoint: "/v1/chat/completions", status: "failed", reason: "http_500", latencyMs: 12, upstreamStatus: 500, checkedAt: new Date().toISOString() });
  const values = await store.list("gen-a"); assert.equal(values.length, 1); assert.equal(values[0].status, "ok");
  assert.ok(!JSON.parse(await readFile(join(dir, "probe-results.json"), "utf8")).some((item) => item.apiKey));
});

test("probe service executes a configured target and exposes sanitized history", async () => {
  const records = []; let now = Date.parse("2026-09-07T00:00:00Z");
  const state = { display: { groups: [{ id: 7, label: "文本组" }] } };
  const store = { dir: ".", revision: 1, state, connection: () => ({ baseUrl: "https://example.test/api/v1", apiKey: "admin" }),
    probe: () => ({ generation: "g1", apiKey: "probe", config: { enabled: true, intervalSeconds: 300, groupId: 7, model: "gpt-5.6", endpoint: "/v1/chat/completions" } }) };
  const resultStore = { append: async (value) => records.push(value), list: async () => records.slice().reverse() };
  const service = new ProbeService({ store, config: { requestTimeoutMs: 1000 }, resultStore, now: () => now, schedulerMs: 60000,
    clientFactory: () => ({ probe: async () => ({ status: "ok", reason: "ok", latencyMs: 11, upstreamStatus: 200 }) }) });
  const result = await service.runNow(); assert.equal(result.status, "ok"); assert.equal(records[0].groupId, 7); assert.equal(records[0].model, "gpt-5.6");
  const status = await service.status(10); assert.equal(status.config.groupLabel, "文本组"); assert.equal(status.latest.latencyMs, 11);
  assert.ok(!JSON.stringify(status).includes("probe")); now += 300000;
});

test("probe scheduler waits for the configured interval and reruns the target", async () => {
  let now = Date.parse("2026-09-07T00:00:00Z"); let calls = 0;
  const store = { dir: ".", revision: 1, state: { display: { groups: [{ id: 7, label: "文本组" }] } },
    connection: () => ({ baseUrl: "https://example.test/api/v1", apiKey: "admin" }),
    probe: () => ({ generation: "g1", apiKey: "probe", config: { enabled: true, intervalSeconds: 60, groupId: 7, model: "gpt-5.6", endpoint: "/v1/chat/completions" } }) };
  const service = new ProbeService({ store, config: { requestTimeoutMs: 1000 }, resultStore: { append: async () => {}, list: async () => [] }, now: () => now,
    clientFactory: () => ({ probe: async () => { calls += 1; return { status: "ok", reason: "ok", latencyMs: 1, upstreamStatus: 200 }; } }) });
  await service.tick(); assert.equal(calls, 1);
  await service.tick(); assert.equal(calls, 1);
  now += 59999; await service.tick(); assert.equal(calls, 1);
  now += 1; await service.tick(); assert.equal(calls, 2);
});

test("probe settings require a selected catalog group and a model only when enabled", () => {
  const catalog = [{ id: 7, name: "文本组" }];
  assert.deepEqual(validateProbe({ enabled: false, intervalSeconds: 300, groupId: null, model: "", endpoint: "/v1/chat/completions" }, catalog), { enabled: false, intervalSeconds: 300, groupId: null, model: "", endpoint: "/v1/chat/completions" });
  assert.throws(() => validateProbe({ enabled: true, intervalSeconds: 300, groupId: 7, model: "", endpoint: "/v1/chat/completions" }, catalog));
  assert.throws(() => validateProbe({ enabled: true, intervalSeconds: 300, groupId: 8, model: "m", endpoint: "/v1/chat/completions" }, catalog));
  assert.throws(() => validateProbe({ enabled: true, intervalSeconds: 29, groupId: 7, model: "m", endpoint: "/v1/chat/completions" }, catalog));
});

test("settings version 1 is upgraded with a disabled probe configuration", async () => {
  const dir = await mkdtemp(join(tmpdir(), "probe-migration-")); const first = await new SettingsStore(dir).init();
  await writeFile(join(dir, "settings.json"), JSON.stringify({ version: 1, admin: null, connection: null, display: first.state.display }));
  const upgraded = await new SettingsStore(dir).init();
  assert.equal(upgraded.state.version, 2); assert.equal(upgraded.state.probe.config.enabled, false); assert.equal(upgraded.probe().apiKey, "");
});
