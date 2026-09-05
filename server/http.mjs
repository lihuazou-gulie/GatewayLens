import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { HttpError } from "./errors.mjs";

const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
});

export function securityHeaders(config, { api = false } = {}) {
  const headers = {
    "Content-Security-Policy": [
      "default-src 'self'",
      "connect-src 'self'",
      "img-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      `frame-ancestors ${config.frameAncestors}`,
    ].join("; "),
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
  // CSP frame-ancestors supports an explicit cross-origin allow-list. Sending
  // SAMEORIGIN at the same time would incorrectly block the intended iframe.
  if (config.frameAncestors === "'self'") headers["X-Frame-Options"] = "SAMEORIGIN";
  if (api) headers["Cache-Control"] = "no-store";
  else headers["Cache-Control"] = "no-cache";
  return headers;
}

export function sendJson(response, status, payload, config) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    ...securityHeaders(config, { api: true }),
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

export function sendError(response, error, config) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const message = error?.publicMessage || (status >= 500 ? "服务暂时不可用" : "请求无法处理");
  sendJson(response, status, { error: message }, config);
}

function isAllowedStaticPath(pathname) {
  return ["/", "/index.html", "/groups", "/models", "/settings", "/settings/"].includes(pathname) || pathname.startsWith("/src/") || pathname.startsWith("/styles/");
}

export async function serveStatic(response, pathname, config) {
  if (!isAllowedStaticPath(pathname)) throw new HttpError(404, "页面不存在");
  const relativePath = ["/", "/groups", "/models"].includes(pathname) ? "index.html" : pathname.startsWith("/settings") ? "settings/index.html" : pathname.slice(1);
  const filePath = resolve(config.staticDir, relativePath);
  const rootRelative = relative(config.staticDir, filePath);
  if (!rootRelative || rootRelative.startsWith("..") || rootRelative.includes("..\\") || rootRelative.includes("../")) {
    throw new HttpError(404, "页面不存在");
  }
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    throw new HttpError(404, "页面不存在");
  }
  if (!fileStat.isFile()) throw new HttpError(404, "页面不存在");
  response.writeHead(200, {
    ...securityHeaders(config),
    "Content-Type": MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream",
    "Content-Length": fileStat.size,
  });
  createReadStream(filePath).pipe(response);
}
