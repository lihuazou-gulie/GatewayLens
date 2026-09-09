import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApplication } from "../server/bootstrap/application.mjs";
import { loadConfig } from "../server/config.mjs";
import { openPersistence } from "../server/bootstrap/persistence.mjs";
import { ConfigurationRepository } from "../server/modules/configuration/infrastructure/configuration-repository.mjs";
import { ProbeService } from "../server/modules/probing/application/probe-service.mjs";
const PASSWORD = "synthetic-transaction-password";

test("concurrent password changes revalidate credentials within the transaction", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gatewaylens-identity-"));
  const app = await createApplication({ config: loadConfig({ KANBAN_DATA_DIR: dir }) });
  await app.identity.setup({ code: app.identity.setupCode, password: PASSWORD });
  const token = app.sessions.issue();
  const results = await Promise.allSettled([
    app.identity.changePassword({ currentPassword: PASSWORD, password: PASSWORD + "-one" }),
    app.identity.changePassword({ currentPassword: PASSWORD, password: PASSWORD + "-two" }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.find((r) => r.status === "rejected").reason.code, "unauthenticated");
  assert.equal(app.sessions.authenticated(token), false);
  app.dispose();
});
test("an exception rolls back all repository writes in a settings transaction", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gatewaylens-transaction-"));
  const { store, vault } = await openPersistence(dir);
  const repository = new ConfigurationRepository(store, vault);
  await assert.rejects(
    store.transact(0, (tx) => {
      repository.setConnection(tx, {
        baseUrl: "https://example.test/api/v1",
        apiKey: "synthetic-secret",
      });
      throw new Error("abort transaction");
    }),
  );
  assert.equal(store.revision, 0);
  assert.equal(repository.snapshot().connection, null);
  const restored = await openPersistence(dir);
  assert.equal(
    new ConfigurationRepository(restored.store, restored.vault).snapshot().connection,
    null,
  );
});
test("a complete private volume backup restores credentials and display configuration", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gatewaylens-backup-"));
  const { store, vault } = await openPersistence(dir),
    repository = new ConfigurationRepository(store, vault);
  await store.transact(0, (tx) => {
    repository.setConnection(tx, {
      baseUrl: "https://example.test/api/v1",
      apiKey: "synthetic-restore-key",
    });
    repository.setSiteCopy(tx, { ...repository.snapshot(tx).display, title: "Restored" });
  });
  const backup = join(await mkdtemp(join(tmpdir(), "gatewaylens-restore-")), "data");
  await cp(dir, backup, { recursive: true, errorOnExist: true, force: false });
  const restored = await openPersistence(backup),
    values = new ConfigurationRepository(restored.store, restored.vault).snapshot();
  assert.equal(values.connection.apiKey, "synthetic-restore-key");
  assert.equal(values.display.title, "Restored");
  assert.equal(restored.vault.setupCode, vault.setupCode);
});
test("changing a probe target never publishes an in-flight result as the new target", async () => {
  let finish;
  const target = {
    generation: "first",
    apiKey: "synthetic-probe",
    config: { groupId: 1, model: "one", endpoint: "/v1/chat/completions", enabled: false },
  };
  const records = [];
  const service = new ProbeService({
    repository: { read: () => structuredClone(target) },
    configurations: {
      snapshot: () => ({
        connection: { baseUrl: "https://example.test" },
        display: { groups: [{ id: 1, label: "One" }] },
      }),
    },
    resultStore: {
      append: async (record) => records.push(record),
      list: async (generation) => records.filter((r) => r.generation === generation),
    },
    clientFactory: () => ({
      probe: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    }),
  });
  const pending = service.runNow(),
    rejected = assert.rejects(pending, (error) => error.code === "conflict");
  target.generation = "second";
  target.config.model = "two";
  await assert.rejects(service.runNow(), (error) => error.code === "conflict");
  finish({ status: "ok", reason: "ok", latencyMs: 1, upstreamStatus: 200 });
  await rejected;
  assert.equal(records[0].generation, "first");
  assert.equal((await service.status()).latest, null);
});
