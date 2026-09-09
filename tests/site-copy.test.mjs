import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_SITE_COPY,
  selectSiteCopy,
  validateSiteCopy,
} from "../server/modules/configuration/domain/site-copy.mjs";
import { DEFAULT_SITE_COPY as browserDefaults } from "../src/data/site-copy.js";
import { initialSettings, openPersistence } from "../server/bootstrap/persistence.mjs";
import { startDemo } from "../scripts/demo.mjs";
import { DEMO_KEY, DEMO_PROBE_KEY, DEMO_GROUPS } from "./fixtures/sub2api.mjs";

const customCopy = {
  title: "示例站点 <b>纯文本</b>",
  overviewTitle: "服务运行，一目了然",
  overviewSubtitle: "所有文案均由部署者设置。",
};

test("site copy enforces text types, required fields and bounded single-line values", () => {
  assert.deepEqual(browserDefaults, DEFAULT_SITE_COPY);
  assert.deepEqual(validateSiteCopy({ ...customCopy, title: ` ${customCopy.title} ` }), customCopy);
  assert.deepEqual(selectSiteCopy({ ...customCopy, secret: "synthetic" }), customCopy);
  for (const [key, limit] of [
    ["title", 60],
    ["overviewTitle", 80],
    ["overviewSubtitle", 160],
  ]) {
    assert.equal(validateSiteCopy({ ...customCopy, [key]: "字".repeat(limit) })[key].length, limit);
    for (const value of [
      null,
      undefined,
      123,
      {},
      [],
      "",
      "   ",
      "a\nb",
      "a\tb",
      "a\0b",
      "字".repeat(limit + 1),
    ])
      assert.throws(() => validateSiteCopy({ ...customCopy, [key]: value }), {
        code: "validation",
      });
  }
  for (const input of [null, [], "text"])
    assert.throws(() => validateSiteCopy(input), { code: "validation" });
});

test("existing v1/v2 settings retain their name and data while acquiring durable copy defaults", async () => {
  for (const version of [1, 2]) {
    const dir = await mkdtemp(join(tmpdir(), "gatewaylens-copy-migration-"));
    const old = initialSettings();
    old.version = version;
    old.display.title = "原有名称";
    old.display.groups = [{ id: 1, label: "原有分组" }];
    old.display.poolThreshold = 12;
    delete old.display.overviewTitle;
    delete old.display.overviewSubtitle;
    if (version === 1) delete old.probe;
    await writeFile(join(dir, "settings.json"), JSON.stringify(old));
    const { store } = await openPersistence(dir);
    assert.deepEqual(store.read().display, { ...initialSettings().display, ...old.display });
    const disk = JSON.parse(await readFile(join(dir, "settings.json"), "utf8"));
    assert.equal(disk.version, 2);
    assert.deepEqual(disk.display, store.read().display);
    await store.transact(0, (tx) => Object.assign(tx.display, customCopy));
    const restored = await openPersistence(dir);
    assert.deepEqual(selectSiteCopy(restored.store.read().display), customCopy);
    assert.deepEqual(restored.store.read().display.groups, old.display.groups);
  }
});

test("site copy saves without an upstream, protects writes and survives other settings and restart", async (t) => {
  const demo = await startDemo();
  t.after(() => demo.close());
  const app = demo.app;
  let cookie = "";
  async function request(
    path,
    { body, auth = true, origin = demo.dashboard, method = body ? "PUT" : "GET" } = {},
  ) {
    const response = await fetch(`${demo.dashboard}/api/${path}`, {
      method,
      headers: {
        ...(auth ? { Cookie: cookie } : {}),
        ...(body ? { Origin: origin, "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.headers.has("set-cookie"))
      cookie = response.headers.get("set-cookie").split(";")[0];
    return { status: response.status, data: await response.json() };
  }
  assert.equal(
    (
      await request("setup", {
        method: "POST",
        body: { code: app.identity.setupCode, password: "synthetic-site-copy-password" },
      })
    ).status,
    200,
  );
  const body = { revision: app.persistence.store.revision, siteCopy: customCopy };
  assert.equal((await request("admin/site-copy", { body, auth: false })).status, 401);
  assert.equal(
    (await request("admin/site-copy", { body, origin: "https://attacker.invalid" })).status,
    403,
  );
  assert.equal(
    (await request("admin/site-copy", { body: { ...body, revision: null } })).status,
    400,
  );
  assert.equal(
    (
      await request("admin/site-copy", {
        body: { ...body, siteCopy: { ...customCopy, title: "" } },
      })
    ).status,
    400,
  );
  const saved = await request("admin/site-copy", { body });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.revision, body.revision + 1);
  assert.deepEqual(saved.data.siteCopy, customCopy);
  assert.equal((await request("admin/site-copy", { body })).status, 409);
  const unconfigured = (await request("monitor")).data;
  assert.equal(unconfigured.state, "unconfigured");
  assert.deepEqual(selectSiteCopy(unconfigured), customCopy);
  assert.equal((await request("monitor", { auth: false })).status, 401);

  await app.configuration.saveConnection({
    revision: app.persistence.store.revision,
    site: demo.source,
    apiKey: DEMO_KEY,
  });
  const display = {
    ...app.configuration.settings().display,
    groups: [{ id: DEMO_GROUPS[0].id, label: "测试分组" }],
  };
  await app.configuration.saveDisplay({
    revision: app.persistence.store.revision,
    display: { ...display, title: "不能通过分组设置覆盖文案" },
  });
  assert.deepEqual(app.configuration.siteCopy(), customCopy);
  await app.configureProbe.save({
    revision: app.persistence.store.revision,
    probe: {
      enabled: false,
      groupId: DEMO_GROUPS[0].id,
      model: "gpt-5.6",
      endpoint: "/v1/chat/completions",
      intervalSeconds: 300,
    },
    apiKey: DEMO_PROBE_KEY,
  });
  const before = app.persistence.store.read();
  app.configuration.catalog = () => {
    throw new Error("upstream offline");
  };
  const revised = { ...customCopy, overviewSubtitle: "数据源离线时仍可独立修改文案。" };
  assert.equal(
    (
      await request("admin/site-copy", {
        body: { revision: app.persistence.store.revision, siteCopy: revised },
      })
    ).status,
    200,
  );
  assert.deepEqual(app.persistence.store.read(), {
    ...before,
    display: { ...before.display, ...revised },
  });
  const publicSnapshot = (await request("monitor", { auth: false })).data;
  assert.deepEqual(selectSiteCopy(publicSnapshot), revised);
  const bootstrap = (await request("bootstrap", { auth: false })).data;
  assert.deepEqual(bootstrap, { initialized: true, authenticated: false, siteCopy: revised });
  const restored = await openPersistence(demo.dataDir);
  assert.deepEqual(selectSiteCopy(restored.store.read().display), revised);

  app.configuration.testConnection = async () => ({ groups: DEMO_GROUPS });
  await app.configuration.saveConnection({
    revision: app.persistence.store.revision,
    site: "https://replacement.example",
    apiKey: DEMO_KEY,
  });
  assert.deepEqual(app.configuration.siteCopy(), revised);
  assert.deepEqual(app.configuration.settings().display.groups, []);
  assert.equal(app.persistence.store.read().probe.secret, null);
});
