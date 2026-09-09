import { test } from "node:test";
import assert from "node:assert/strict";
import { captureCompose } from "../scripts/capture-compose.mjs";
test("rollback captures running configuration and references existing data/network", () => {
  const data = captureCompose({
    Id: "container-id",
    Image: "sha256:old-image",
    Config: {
      Labels: {
        "com.docker.compose.project": "kanban-test",
        "com.docker.compose.service": "runtime-command-center",
      },
      Env: ["KANBAN_PUBLIC_ORIGIN=https://old.example.test", "VALUE=contains=equals"],
      User: "node",
      WorkingDir: "/app",
      Entrypoint: ["docker-entrypoint.sh"],
      Cmd: ["node", "server/index.mjs"],
      Healthcheck: {
        Test: ["CMD", "node", "server/healthcheck.mjs"],
        Interval: 15000000000,
        Timeout: 5000000000,
        Retries: 3,
      },
    },
    HostConfig: {
      ReadonlyRootfs: true,
      RestartPolicy: { Name: "unless-stopped" },
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges:true"],
      Tmpfs: { "/tmp": "size=16m,noexec" },
      PortBindings: { "8787/tcp": [{ HostPort: "8443", HostIp: "0.0.0.0" }] },
      LogConfig: { Type: "json-file", Config: {} },
      NanoCpus: 500000000,
      Memory: 402653184,
      PidsLimit: 128,
    },
    Mounts: [
      { Type: "volume", Name: "kanban-private-data", Destination: "/data", RW: true },
      { Type: "bind", Source: "/private/tls", Destination: "/tls", RW: false },
    ],
    NetworkSettings: { Networks: { "kanban-default": { Aliases: ["runtime-command-center"] } } },
  });
  const service = data.services["runtime-command-center"];
  assert.deepEqual(Object.keys(data.services), ["runtime-command-center"]);
  assert.equal(service.environment.KANBAN_PUBLIC_ORIGIN, "https://old.example.test");
  assert.equal(service.environment.VALUE, "contains=equals");
  assert.deepEqual(service.command, ["node", "server/index.mjs"]);
  assert.deepEqual(data.volumes.data_0, { external: true, name: "kanban-private-data" });
  assert.equal(service.volumes[1].read_only, true);
  assert.equal(data.networks.network_0.name, "kanban-default");
  assert.equal(service.healthcheck.interval, "15000000000ns");
});
