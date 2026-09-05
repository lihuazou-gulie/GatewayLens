import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createKanbanServer } from "../server/app.mjs";
import { loadConfig } from "../server/config.mjs";
import { fixtureSub2Api, listen } from "../tests/fixtures/sub2api.mjs";
const source = fixtureSub2Api(); const upstreamPort = await listen(source, Number(process.env.DEMO_SOURCE_PORT || 0));
const dir = process.env.DEMO_DATA_DIR || await mkdtemp(join(tmpdir(), "kanban-demo-"));
const app = await createKanbanServer({ config: { ...loadConfig({ KANBAN_DATA_DIR: dir }), cacheMs: 5000 } });
// Only this explicit local demo uses a public, synthetic bootstrap code.
app.store.setupCode = "demo-setup-code-local-only";
const port = await listen(app.server, Number(process.env.DEMO_PORT || 8787));
console.log(JSON.stringify({ dashboard: `http://127.0.0.1:${port}`, source: `http://127.0.0.1:${upstreamPort}`, dataDir: dir, mode: "synthetic-local-demo" }));
function stop() { app.server.close(); source.close(); setTimeout(() => process.exit(), 500).unref(); }
process.on("SIGINT", stop); process.on("SIGTERM", stop);
