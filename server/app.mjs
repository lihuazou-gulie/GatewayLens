import { createServer as httpServer } from "node:http";
import { createServer as httpsServer } from "node:https";
import { Sessions } from "./auth.mjs";
import { SettingsStore } from "./settings/store.mjs";
import { handleSettings } from "./settings/routes.mjs";
import { MonitoringService } from "./monitor/service.mjs";
import { HttpError, UpstreamError } from "./errors.mjs";
import { sendError, sendJson, serveStatic } from "./http.mjs";

export async function createKanbanServer({ config, store: suppliedStore, clientFactory } = {}) {
  const store = suppliedStore || await new SettingsStore(config.dataDir).init();
  const sessions = new Sessions(); const monitor = new MonitoringService({ store, config, clientFactory });
  const handler = async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://kanban.local");
      if (request.method === "GET" && url.pathname === "/api/health") { sendJson(response, 200, { ok: true }, config); return; }
      if (url.pathname === "/api/monitor") {
        if (request.method !== "GET") throw new HttpError(405, "监控接口只支持读取");
        const payload = await monitor.snapshot(Object.fromEntries(["range", "scope", "model", "topic"].map((k) => [k, url.searchParams.get(k) || undefined])), sessions.authenticated(request));
        sendJson(response, 200, payload, config); return;
      }
      if (url.pathname.startsWith("/api/")) {
        const payload = await handleSettings({ request, response, url, store, sessions, monitor, config, clientFactory });
        sendJson(response, 200, payload, config); return;
      }
      if (request.method !== "GET") throw new HttpError(405, "页面只支持读取");
      await serveStatic(response, url.pathname, config);
    } catch (e) { sendError(response, e instanceof UpstreamError ? new HttpError(502, "数据源暂时不可用") : e, config); }
  };
  const server = config.tls ? httpsServer(config.tls, handler) : httpServer(handler);
  server.requestTimeout = 45000; server.headersTimeout = 15000;
  return { server, store, monitor, sessions };
}
