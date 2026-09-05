import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DEMO_KEY, DEMO_GROUPS } from "./fixtures/sub2api.mjs";
const origin = "http://runtime-command-center:8787";
const password = "container-test-password-only";
let cookie = "";
async function request(path, { body, method = body ? "POST" : "GET", auth = true, status = 200 } = {}) {
  const res = await fetch(`${origin}/api/${path}`, { method, headers: { ...(auth ? { Cookie: cookie } : {}),
    ...(body ? { "Content-Type": "application/json", Origin: origin } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
  assert.equal(res.status, status, path);
  if (res.headers.has("set-cookie")) cookie = res.headers.get("set-cookie").split(";")[0];
  return res.json();
}
const boot = await request("bootstrap");
if (!boot.initialized) {
  const code = (await readFile("/monitor-data/setup-code", "utf8")).trim();
  await request("setup", { body: { code, password } });
  let settings = await request("admin/settings");
  await request("admin/connection", { body: { revision: settings.revision, site: "http://sub2api-fixture:8080", apiKey: DEMO_KEY } });
  settings = await request("admin/settings");
  await request("admin/display", { method: "PUT", body: { revision: settings.revision, display: { ...settings.display,
    title: "容器验收 · 模拟数据", public: true, groups: DEMO_GROUPS.slice(0, 3).map((g) => ({ id: g.id, label: g.name })), imageModels: ["gpt-image-2"] } } });
} else await request("login", { body: { password } });
const settings = await request("admin/settings");
assert.equal(JSON.stringify(settings).includes(DEMO_KEY), false);
assert.equal(settings.connection.configured, true);
const publicData = await request("monitor", { auth: false });
assert.equal(publicData.state, "ok"); assert.equal(publicData.groups.length, 3);
assert.equal(publicData.summary.pool.total, 5); assert.equal(publicData.summary.capacity.max, 40);
assert.equal(/SENSITIVE|account_id|user_email|baseUrl|secret|system/.test(JSON.stringify(publicData)), false);
const images = await request("monitor?topic=images&range=30d", { auth: false });
assert.deepEqual(images.models.data.rows.map((m) => m.model), ["gpt-image-2"]);
assert.equal(images.models.data.rows[0].rate, 98);
await request("admin/settings", { auth: false, status: 401 });
await request("monitor?scope=999", { auth: false, status: 404 });
const stored = await readFile("/monitor-data/settings.json", "utf8");
assert.equal(stored.includes(DEMO_KEY), false); assert.equal(stored.includes(password), false);
await request("logout", { body: {} });
console.log(JSON.stringify({ status: "passed", restart: boot.initialized, publicGroups: 3, uniqueAccounts: 5, imageRate: 98, credentialLeak: false }));
