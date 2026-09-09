import { createServer } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createGatewayLensServer } from "../server/app.mjs";
import { loadConfig } from "../server/config.mjs";
import {
  serveStatic,
  sendJson,
  sendError,
  securityHeaders,
} from "../server/shared/interfaces/http/response.mjs";
import { fixtureSub2Api, listen, DEMO_KEY, DEMO_GROUPS } from "../tests/fixtures/sub2api.mjs";
export async function startRenderingHarness({ port = 0 } = {}) {
  const source = fixtureSub2Api(),
    upstreamPort = await listen(source);
  const dir = await mkdtemp(join(tmpdir(), "gatewaylens-browser-"));
  const config = loadConfig({ KANBAN_DATA_DIR: dir });
  const app = await createGatewayLensServer({ config });
  await app.configuration.saveConnection({
    site: "http://127.0.0.1:" + upstreamPort,
    apiKey: DEMO_KEY,
    revision: app.persistence.store.revision,
  });
  await app.configuration.saveDisplay({
    revision: app.persistence.store.revision,
    display: {
      ...app.configuration.settings().display,
      title: "增量渲染验收 · 模拟数据",
      groups: DEMO_GROUPS.slice(0, 3).map((g) => ({ id: g.id, label: g.name })),
    },
  });
  const html = (await readFile(new URL("../index.html", import.meta.url), "utf8"))
    .replace('src="/src/app.js"', 'src="/render.browser.js"')
    .replace(
      "<body>",
      '<body><pre id="render-test-result" role="status">正在进行增量渲染测试…</pre>',
    );
  const testCode = await readFile(new URL("../tests/render.browser.js", import.meta.url));
  const server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, "http://localhost").pathname;
      if (request.method !== "GET") {
        response.writeHead(405);
        response.end();
        return;
      }
      if (path === "/snapshot") {
        sendJson(response, 200, await app.monitor.snapshot({}, true), config);
        return;
      }
      if (path === "/" || path === "/render.browser.js") {
        response.writeHead(200, {
          ...securityHeaders(config),
          "Content-Type":
            path === "/" ? "text/html; charset=utf-8" : "text/javascript; charset=utf-8",
        });
        response.end(path === "/" ? html : testCode);
        return;
      }
      await serveStatic(response, path, config);
    } catch (error) {
      sendError(response, error, config);
    }
  });
  const actualPort = await listen(server, port);
  return {
    url: "http://127.0.0.1:" + actualPort,
    app,
    async close() {
      app.dispose();
      server.closeAllConnections();
      source.closeAllConnections();
      await Promise.all([
        new Promise((resolve) => server.close(resolve)),
        new Promise((resolve) => source.close(resolve)),
      ]);
    },
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const harness = await startRenderingHarness({
    port: Number(process.env.BROWSER_TEST_PORT || 8791),
  });
  console.log("Open " + harness.url + " to run synthetic browser regressions.");
  process.on("SIGINT", () => void harness.close());
  process.on("SIGTERM", () => void harness.close());
}
