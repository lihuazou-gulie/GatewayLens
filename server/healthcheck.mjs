import http from "node:http";
import https from "node:https";
import { pathToFileURL } from "node:url";

// A local process probe. TLS still verifies the configured public hostname.
export function checkHealth(env = process.env) {
  const tls = Boolean(env.KANBAN_TLS_CERT_FILE);
  const publicHost = env.KANBAN_PUBLIC_ORIGIN ? new URL(env.KANBAN_PUBLIC_ORIGIN).hostname : "localhost";
  const transport = tls ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.get({ hostname: "127.0.0.1", port: Number(env.KANBAN_PORT || 8787), path: "/api/health",
      ...(tls ? { servername: publicHost } : {}), timeout: 4000 }, (response) => {
      let text = "";
      response.on("data", (chunk) => { text += chunk; if (text.length > 1024) response.destroy(new Error("oversized_health_response")); });
      response.on("error", reject);
      response.on("end", () => {
        try { if (response.statusCode !== 200 || JSON.parse(text).ok !== true) throw new Error("unhealthy"); resolve(); }
        catch (error) { reject(error); }
      });
    });
    request.on("timeout", () => request.destroy(new Error("health_timeout")));
    request.on("error", reject);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await checkHealth(); } catch { process.stderr.write("Monitor health probe failed\n"); process.exitCode = 1; }
}
