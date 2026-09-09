import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createGatewayLensServer } from "../server/app.mjs";
import { loadConfig } from "../server/config.mjs";
import { fixtureSub2Api, listen } from "../tests/fixtures/sub2api.mjs";
export async function startDemo({ port = 0, sourcePort = 0, dataDir } = {}) {
  const source = fixtureSub2Api(),
    upstreamPort = await listen(source, sourcePort);
  const dir = dataDir || (await mkdtemp(join(tmpdir(), "gatewaylens-demo-")));
  const app = await createGatewayLensServer({
    config: { ...loadConfig({ KANBAN_DATA_DIR: dir }), cacheMs: 5000 },
  });
  // Only this explicit synthetic demo uses a public initialization code.
  app.identity.setupCode = "demo-setup-code-local-only";
  const actualPort = await listen(app.server, port);
  return {
    app,
    dashboard: "http://127.0.0.1:" + actualPort,
    source: "http://127.0.0.1:" + upstreamPort,
    dataDir: dir,
    async close() {
      app.server.closeAllConnections();
      source.closeAllConnections();
      await Promise.all([
        new Promise((resolve) => app.server.close(resolve)),
        new Promise((resolve) => source.close(resolve)),
      ]);
    },
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const demo = await startDemo({
    port: Number(process.env.DEMO_PORT || 8787),
    sourcePort: Number(process.env.DEMO_SOURCE_PORT || 0),
    dataDir: process.env.DEMO_DATA_DIR,
  });
  console.log(
    JSON.stringify({
      dashboard: demo.dashboard,
      source: demo.source,
      dataDir: demo.dataDir,
      mode: "synthetic-local-demo",
    }),
  );
  process.on("SIGINT", () => void demo.close());
  process.on("SIGTERM", () => void demo.close());
}
