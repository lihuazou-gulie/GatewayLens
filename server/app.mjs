import { createServer as httpServer } from "node:http";
import { createServer as httpsServer } from "node:https";
import { createApplication } from "./bootstrap/application.mjs";
import { APP_VERSION } from "./bootstrap/version.mjs";
import { createRouter, route } from "./shared/interfaces/http/router.mjs";
import { HttpError, publicError } from "./shared/interfaces/http/errors.mjs";
import { sendError, sendJson, serveStatic } from "./shared/interfaces/http/response.mjs";
import { TaskGate } from "./shared/infrastructure/concurrency/task-gate.mjs";
import { identityRoutes } from "./modules/identity/interfaces/http/routes.mjs";
import { readSessionToken } from "./modules/identity/interfaces/http/cookies.mjs";
import { configurationRoutes } from "./modules/configuration/interfaces/http/routes.mjs";
import { monitoringRoutes } from "./modules/monitoring/interfaces/http/routes.mjs";
import { probeRoutes } from "./modules/probing/interfaces/http/routes.mjs";

export async function createGatewayLensServer({
  config,
  clientFactory,
  probeClientFactory,
  logger = console.error,
} = {}) {
  const report = (error) =>
    logger(
      JSON.stringify({
        event: "operation_failed",
        category: error.name === "DomainError" ? error.code : "internal",
      }),
    );
  const app = await createApplication({
    config,
    clientFactory,
    probeClientFactory,
    onError: report,
  });
  const router = createRouter(
    [
      route("GET", "/api/health", () => ({ ok: true }), { auth: false }),
      ...identityRoutes({ ...app, version: APP_VERSION }),
      ...configurationRoutes(app.configuration),
      ...monitoringRoutes({
        monitor: app.monitor,
        admission: new TaskGate({ concurrency: 64, maxQueued: 0 }),
      }),
      ...probeRoutes({ configure: app.configureProbe, probe: app.probe }),
    ],
    { config, limiter: app.limiter },
  );
  const handler = async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://gatewaylens.local");
      if (url.pathname.startsWith("/api/")) {
        const token = readSessionToken(request);
        const result = await router({
          request,
          response,
          url,
          token,
          authenticated: app.sessions.authenticated(token),
          secure: Boolean(request.socket.encrypted || config.publicOrigin?.startsWith("https:")),
        });
        if (!response.destroyed) sendJson(response, 200, result, config);
      } else {
        if (request.method !== "GET") throw new HttpError(405, "页面只支持读取");
        await serveStatic(response, url.pathname, config);
      }
    } catch (error) {
      if (publicError(error).status >= 500) report(error);
      if (!response.destroyed) sendError(response, error, config);
    }
  };
  const server = config.tls ? httpsServer(config.tls, handler) : httpServer(handler);
  server.requestTimeout = 45000;
  server.headersTimeout = 15000;
  server.on("close", () => app.dispose());
  app.scheduler.start();
  return { server, ...app };
}
