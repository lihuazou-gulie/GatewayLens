import { createServer } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createKanbanServer } from "../server/app.mjs";
import { loadConfig } from "../server/config.mjs";
import { serveStatic, sendJson, sendError, securityHeaders } from "../server/http.mjs";
import { fixtureSub2Api, listen, DEMO_KEY, DEMO_GROUPS } from "../tests/fixtures/sub2api.mjs";

// Local browser regression harness. This server and its test routes are never
// part of the production app or image; all monitoring data is synthetic.
const source = fixtureSub2Api(); const upstreamPort = await listen(source);
const dir = await mkdtemp(join(tmpdir(), "kanban-browser-test-"));
const config = loadConfig({ KANBAN_DATA_DIR: dir });
const app = await createKanbanServer({ config });
await app.store.update((state) => ({ ...state,
  connection: { baseUrl: `http://127.0.0.1:${upstreamPort}/api/v1`, secret: app.store.encrypt(DEMO_KEY) },
  display: { ...state.display, title: "增量渲染验收 · 模拟数据", groups: DEMO_GROUPS.slice(0, 3).map((g) => ({ id: g.id, label: g.name })) },
}));
const html = (await readFile(new URL("../index.html", import.meta.url), "utf8"))
  .replace('src="/src/app.js"', 'src="/render.browser.js"')
  .replace("<body>", '<body><pre id="render-test-result" role="status">正在进行增量渲染测试…</pre>');
const testCode = await readFile(new URL("../tests/render.browser.js", import.meta.url));
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, "http://localhost").pathname;
    if (request.method !== "GET") { response.writeHead(405); response.end(); return; }
    if (path === "/snapshot") { sendJson(response, 200, await app.monitor.snapshot({}, true), config); return; }
    if (path === "/" || path === "/render.browser.js") {
      response.writeHead(200, { ...securityHeaders(config), "Content-Type": path === "/" ? "text/html; charset=utf-8" : "text/javascript; charset=utf-8" });
      response.end(path === "/" ? html : testCode); return;
    }
    await serveStatic(response, path, config);
  } catch (error) { sendError(response, error, config); }
});
const port = await listen(server, Number(process.env.BROWSER_TEST_PORT || 8791));
console.log(`Open http://127.0.0.1:${port}/ to run browser rendering regressions with synthetic data.`);
function stop() { server.closeAllConnections(); source.closeAllConnections(); server.close(); source.close(); }
process.on("SIGINT", stop); process.on("SIGTERM", stop);
