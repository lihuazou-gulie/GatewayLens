import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../server/config.mjs";
import { createKanbanServer } from "../server/app.mjs";
import { SettingsStore } from "../server/settings/store.mjs";
import { TimedValueCache } from "../server/cache.mjs";
import { normalizeSite, Sub2ApiClient } from "../server/upstream-client.mjs";
import { fixtureSub2Api, listen, DEMO_KEY, DEMO_PROBE_KEY, DEMO_GROUPS } from "./fixtures/sub2api.mjs";
import { qualitySummary, capacityUnion } from "../server/monitor/normalize.mjs";
const PASSWORD = "local-test-password-2026";
async function harness(t, fixtureOptions = {}) {
  const dir = await mkdtemp(join(tmpdir(), "kanban-test-"));
  const source = fixtureSub2Api(fixtureOptions); const upstreamPort = await listen(source);
  const app = await createKanbanServer({ config: { ...loadConfig({ KANBAN_DATA_DIR: dir }), cacheMs: 10 } }); const port = await listen(app.server);
  t.after(() => { app.server.closeAllConnections(); source.closeAllConnections(); app.server.close(); source.close(); });
  const origin = `http://127.0.0.1:${port}`; let cookie = "";
  async function request(path, { body, method = body ? "POST" : "GET", auth = true, originHeader = origin } = {}) {
    const res = await fetch(`${origin}/api/${path}`, { method, headers: { ...(auth && cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json", Origin: originHeader } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (res.headers.has("set-cookie")) cookie = res.headers.get("set-cookie").split(";")[0];
    return { status: res.status, data: await res.json(), res };
  }
  async function setup() { return request("setup", { body: { code: app.store.setupCode, password: PASSWORD } }); }
  async function connect() { return request("admin/connection", { body: { site: `http://127.0.0.1:${upstreamPort}`, apiKey: DEMO_KEY, revision: app.store.revision } }); }
  async function display(overrides = {}) {
    return request("admin/display", { method: "PUT", body: { revision: app.store.revision, display: { ...app.store.state.display, title: "测试监控", public: true, groups: DEMO_GROUPS.slice(0, 3).map((g) => ({ id: g.id, label: g.name })), imageModels: ["gpt-image-2"], ...overrides } } });
  }
  return { ...app, request, setup, connect, display, dir, origin, upstreamPort };
}
test("starts without Runtime or Sub2API and protects one-time initialization", async (t) => {
  const h = await harness(t);
  assert.equal((await h.request("health", { auth: false })).status, 200);
  assert.deepEqual((await h.request("bootstrap")).data, { initialized: false, authenticated: false });
  assert.equal((await h.request("admin/settings")).status, 401);
  assert.equal((await h.request("setup", { body: { code: "wrong", password: PASSWORD } })).status, 401);
  assert.equal((await h.request("setup", { body: { code: h.store.setupCode, password: PASSWORD }, originHeader: "https://attacker.invalid" })).status, 403);
  const setup = await h.setup(); assert.equal(setup.status, 200); assert.match(setup.res.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
  assert.equal((await h.setup()).status, 409);
  assert.equal((await h.request("admin/settings")).status, 200);
});
test("setup race has exactly one winner", async (t) => {
  const h = await harness(t); const result = await Promise.all([h.setup(), h.setup()]);
  assert.deepEqual(result.map((r) => r.status).sort(), [200, 409]);
});
test("connection encrypts credentials and survives process restart", async (t) => {
  const h = await harness(t); await h.setup(); assert.equal((await h.connect()).status, 200);
  const persisted = await readFile(join(h.dir, "settings.json"), "utf8");
  assert.ok(!persisted.includes(DEMO_KEY)); assert.ok(!persisted.includes(PASSWORD));
  const restarted = await new SettingsStore(h.dir).init(); assert.equal(restarted.connection().apiKey, DEMO_KEY);
  const admin = await h.request("admin/settings"); assert.ok(!JSON.stringify(admin.data).includes(DEMO_KEY));
  assert.deepEqual((await readdir(h.dir)).sort(), ["encryption.key", "settings.json", "setup-code"]);
});
test("public metrics whitelist fields, deduplicate shared accounts, and bound selected scopes", async (t) => {
  const calls = []; const h = await harness(t, { calls }); await h.setup(); await h.connect(); await h.display();
  const result = await h.request("monitor", { auth: false }); assert.equal(result.status, 200);
  const text = JSON.stringify(result.data);
  for (const forbidden of ["SENSITIVE", "account_id", "account_name", "group_id", "system", "baseUrl", "secret", "127.0.0.1", "不公开分组"]) assert.ok(!text.includes(forbidden), forbidden);
  assert.equal(result.data.summary.capacity.max, 40); assert.equal(result.data.summary.pool.total, 5);
  assert.equal((await h.request("monitor?scope=999", { auth: false })).status, 404);
  assert.equal((await h.request("monitor?range=all", { auth: false })).status, 400);
  assert.ok(calls.every((c) => c.method === "GET" && c.groupId !== 999));
  const group = await h.request(`monitor?scope=${result.data.groups[0].scope}`, { auth: false }); assert.equal(group.data.groups.length, 1);
  assert.equal(group.data.summary.pool.total, 3);
  assert.equal((await h.request("monitor")).data.system.data.database, true);
});
test("private dashboard and hidden modules are enforced on backend", async (t) => {
  const h = await harness(t); await h.setup(); await h.connect(); await h.display({ public: false });
  assert.equal((await h.request("monitor", { auth: false })).status, 401);
  await h.display({ modules: { quality: true, traffic: false, capacity: false, pool: false, models: false } });
  const data = (await h.request("monitor", { auth: false })).data;
  assert.equal(data.summary.capacity, null); assert.equal(data.summary.pool, null); assert.equal(data.models.data, null); assert.deepEqual(data.traffic, []);
});

test("guests can view configured groups by default while setup and administration remain private", async (t) => {
  const h = await harness(t);
  assert.equal((await h.request("monitor", { auth: false })).status, 401);
  await h.setup(); await h.connect();
  const settings = (await h.request("admin/settings")).data;
  assert.equal(settings.display.public, true);
  assert.equal((await h.request("monitor", { auth: false })).status, 401);
  const display = { ...settings.display, groups: [{ id: DEMO_GROUPS[0].id, label: "公开分组" }] };
  assert.equal((await h.request("admin/display", { method: "PUT", body: { revision: settings.revision, display } })).status, 200);
  await h.request("logout", { body: {} });
  const guest = await h.request("monitor", { auth: false });
  assert.equal(guest.status, 200); assert.equal(guest.data.groups.length, 1);
  assert.equal(guest.data.groups[0].label, "公开分组"); assert.equal("system" in guest.data, false);
  assert.equal((await h.request("admin/settings", { auth: false })).status, 401);
  assert.equal((await h.request("admin/display", { auth: false, method: "PUT", body: { revision: h.store.revision, display } })).status, 401);
  assert.equal((await new SettingsStore(h.dir).init()).state.display.public, true);
  await h.request("login", { body: { password: PASSWORD } });
  await h.display({ public: false });
  assert.equal((await h.request("monitor", { auth: false })).status, 401);
  assert.equal((await new SettingsStore(h.dir).init()).state.display.public, false);
});
test("partial endpoints keep healthy sections and do not fabricate zero metrics", async (t) => {
  const failures = new Map([["/admin/ops/concurrency", 403], ["/admin/channel-monitor-v2/models", 404]]);
  const h = await harness(t, { failures }); await h.setup(); await h.connect(); await h.display();
  const { data } = await h.request("monitor", { auth: false });
  assert.equal(data.state, "partial"); assert.equal(data.summary.capacity, null); assert.equal(data.groups[0].capacity.state, "denied");
  assert.equal(data.models.state, "unsupported"); assert.ok(data.summary.quality.requests > 0);
  assert.ok(!JSON.stringify(data).includes("private-upstream-error"));
});
test("image topic only returns exact configured model names", async (t) => {
  const h = await harness(t); await h.setup(); await h.connect(); await h.display();
  const data = (await h.request("monitor?topic=images", { auth: false })).data;
  assert.deepEqual(data.models.data.rows.map((r) => r.model), ["gpt-image-2"]);
  assert.equal(data.models.data.rows[0].rate, 98);
  assert.equal(data.models.data.rows[0].cacheRate, 36.4);
  assert.equal((await h.request("monitor?topic=images&model=unlisted", { auth: false })).status, 400);
});

test("malformed realtime data affects only its group and section", async (t) => {
  const overrides = new Map([
    ["/admin/ops/concurrency:101", { enabled: true, account: { 1: null } }],
    ["/admin/ops/account-availability:102", { enabled: false }],
    ["/admin/channel-monitor-v2/models", { items: [null] }],
  ]);
  const h = await harness(t, { overrides }); await h.setup(); await h.connect(); await h.display();
  const { status, data } = await h.request("monitor", { auth: false });
  assert.equal(status, 200); assert.equal(data.state, "partial");
  assert.equal(data.groups[0].capacity.state, "unavailable");
  assert.equal(data.groups[1].pool.state, "disabled");
  assert.equal(data.models.state, "unavailable");
  assert.equal(data.summary.capacity.partial, true); assert.equal(data.summary.capacity.max, 32);
  assert.equal(data.summary.pool.partial, true); assert.equal(data.summary.pool.total, 4);
  assert.ok(data.summary.quality.requests > 0);
});

test("a settings change discards an in-flight snapshot from its old source", async (t) => {
  const h = await harness(t); await h.setup(); await h.connect(); await h.display();
  let finish; const original = h.monitor.load.bind(h.monitor);
  h.monitor.load = async (...args) => { await new Promise((r) => { finish = r; }); return original(...args); };
  const pending = h.monitor.snapshot({}, false);
  await new Promise((r) => setImmediate(r));
  await h.store.update((s) => ({ ...s, display: { ...s.display, public: false, groups: [] } }));
  finish(); await assert.rejects(pending, (e) => e.status === 409);
  await assert.rejects(h.monitor.snapshot({}, false), (e) => e.status === 401);
});
test("settings changes detect stale revisions and source changes reset published scopes", async (t) => {
  const h = await harness(t); await h.setup(); await h.connect(); await h.display();
  assert.equal((await h.request("admin/display", { method: "PUT", body: { revision: 0, display: h.store.state.display } })).status, 409);
  const source = fixtureSub2Api(); const port = await listen(source); t.after(() => { source.closeAllConnections(); source.close(); });
  const result = await h.request("admin/connection", { body: { site: `http://127.0.0.1:${port}`, apiKey: DEMO_KEY, revision: h.store.revision } });
  assert.equal(result.status, 200); assert.deepEqual(h.store.state.display.groups, []); assert.equal(h.store.state.display.public, true);
  assert.equal((await h.request("monitor", { auth: false })).status, 401);
});
test("static paths deny settings files, source internals, and old Runtime APIs", async (t) => {
  const h = await harness(t);
  for (const path of ["/", "/groups", "/models", "/settings"]) assert.equal((await fetch(h.origin + path)).status, 200);
  const asset = await fetch(h.origin + "/assets/stardew-generated/icon-sprout.png");
  assert.equal(asset.status, 200); assert.equal(asset.headers.get("content-type"), "image/png");
  for (const path of ["/settings.json", "/server/config.mjs", "/runtime.env", "/runtime-api/runtime-status", "/src/../server/config.mjs"]) assert.equal((await fetch(h.origin + path)).status, 404);
});
test("logout invalidates the session and password updates require the current password", async (t) => {
  const h = await harness(t); await h.setup();
  assert.equal((await h.request("admin/password", { body: { currentPassword: "wrong", password: PASSWORD + "x" } })).status, 401);
  assert.equal((await h.request("logout", { body: {} })).status, 200);
  assert.equal((await h.request("admin/settings")).status, 401);
  assert.equal((await h.request("login", { body: { password: PASSWORD } })).status, 200);
});
test("cache shares in-flight collection beyond TTL and removes rejected entries", async () => {
  const cache = new TimedValueCache(1); let finish; let calls = 0;
  const a = cache.get("one", () => { calls++; return new Promise((resolve) => finish = resolve); });
  await new Promise((r) => setTimeout(r, 10)); const b = cache.get("one", () => ++calls); finish(42);
  assert.deepEqual(await Promise.all([a, b]), [42, 42]); assert.equal(calls, 1);
  await assert.rejects(cache.get("error", () => { throw new Error("failure"); })); assert.equal(await cache.get("error", () => 3), 3);
});
test("URL validation accepts sites and API bases and rejects credential-bearing URLs", () => {
  assert.equal(normalizeSite("https://example.test/prefix/"), "https://example.test/prefix/api/v1");
  assert.equal(normalizeSite("https://example.test/api/v1/"), "https://example.test/api/v1");
  for (const site of ["https://user:pass@example.test", "https://example.test/?key=x", "http://example.test", "file:///tmp"]) assert.throws(() => normalizeSite(site));
  assert.throws(() => loadConfig({ KANBAN_DATA_DIR: process.cwd() }));
  assert.throws(() => loadConfig({ KANBAN_DATA_DIR: join(process.cwd(), "..private") }));
});
test("upstream credentials never follow redirects and invalid envelopes fail", async () => {
  let options; const client = new Sub2ApiClient({ baseUrl: "https://example.test/api/v1", apiKey: DEMO_KEY, fetchImpl: async (_url, opts) => { options = opts; return new Response(JSON.stringify({ code: 1, data: {} })); } });
  await assert.rejects(client.get("/admin/groups/all")); assert.equal(options.redirect, "error"); assert.equal(options.method, "GET");
});
test("summary never averages group percentiles and zero capacity remains unknown", () => {
  const summary = qualitySummary([{ quality: { data: { requests: 0, successes: 0, latency: { p95: 10 } } } }]);
  assert.equal(summary.rate, null); assert.equal("latency" in summary, false);
  assert.equal(capacityUnion([{ account: {} }]).percent, null);
});

test("configured probes run through the gateway and remain admin-only", async (t) => {
  const h = await harness(t); await h.setup(); await h.connect(); await h.display();
  const settings = (await h.request("admin/settings")).data;
  const probe = { enabled: false, intervalSeconds: 300, groupId: DEMO_GROUPS[0].id, model: "gpt-5.6", endpoint: "/v1/chat/completions" };
  assert.equal((await h.request("admin/probe", { method: "PUT", body: { revision: settings.revision, probe, apiKey: DEMO_PROBE_KEY } })).status, 200);
  const configured = (await h.request("admin/probe")).data;
  assert.equal(configured.config.configured, true); assert.equal(configured.config.groupLabel, "标准文本"); assert.equal(configured.history.length, 0);
  const run = await h.request("admin/probe/run", { method: "POST", body: {} });
  assert.equal(run.status, 200); assert.equal(run.data.status, "ok"); assert.equal(run.data.reason, "ok");
  const status = (await h.request("admin/probe")).data; assert.equal(status.latest.status, "ok"); assert.equal(status.latest.latencyMs >= 0, true);
  assert.equal((await h.request("admin/probe", { auth: false })).status, 401);
  const persisted = await readFile(join(h.dir, "settings.json"), "utf8"); assert.ok(!persisted.includes(DEMO_PROBE_KEY));
});

test("changing the source or displayed groups invalidates the active probe target", async (t) => {
  const h = await harness(t); await h.setup(); await h.connect(); await h.display();
  let settings = (await h.request("admin/settings")).data;
  const probe = { enabled: true, intervalSeconds: 300, groupId: DEMO_GROUPS[0].id, model: "gpt-5.6", endpoint: "/v1/chat/completions" };
  assert.equal((await h.request("admin/probe", { method: "PUT", body: { revision: settings.revision, probe, apiKey: DEMO_PROBE_KEY } })).status, 200);
  settings = (await h.request("admin/settings")).data;
  const reduced = { ...settings.display, groups: [settings.display.groups[1]] };
  assert.equal((await h.request("admin/display", { method: "PUT", body: { revision: settings.revision, display: reduced } })).status, 200);
  assert.equal(h.store.probe().config.enabled, false); assert.equal(h.store.probe().apiKey, "");
  await h.display(); settings = (await h.request("admin/settings")).data;
  const source = fixtureSub2Api(); const port = await listen(source); t.after(() => { source.closeAllConnections(); source.close(); });
  assert.equal((await h.request("admin/connection", { body: { site: `http://127.0.0.1:${port}`, apiKey: DEMO_KEY, revision: settings.revision } })).status, 200);
  assert.equal(h.store.probe().config.enabled, false); assert.equal(h.store.probe().apiKey, "");
});
