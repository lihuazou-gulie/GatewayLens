import { resolve, relative, isAbsolute, sep } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../", import.meta.url));
function integer(env, name, fallback, min, max) {
  const value = Number(env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} is invalid`);
  return value;
}
export function loadConfig(env = process.env) {
  const dataDir = resolve(env.KANBAN_DATA_DIR || resolve(homedir(), ".gpt-kanban"));
  const rel = relative(ROOT, dataDir);
  if (!rel || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))) throw new Error("KANBAN_DATA_DIR must be outside the source directory");
  return Object.freeze({
    host: env.KANBAN_HOST || "127.0.0.1", port: integer(env, "KANBAN_PORT", 8787, 1, 65535),
    staticDir: ROOT, dataDir, publicOrigin: env.KANBAN_PUBLIC_ORIGIN ? new URL(env.KANBAN_PUBLIC_ORIGIN).origin : "",
    allowHttp: env.KANBAN_ALLOW_HTTP === "true",
    requestTimeoutMs: integer(env, "KANBAN_REQUEST_TIMEOUT_MS", 8000, 1000, 30000),
    cacheMs: integer(env, "KANBAN_CACHE_MS", 30000, 1000, 300000),
    tlsCertFile: env.KANBAN_TLS_CERT_FILE || "", tlsKeyFile: env.KANBAN_TLS_KEY_FILE || "", frameAncestors: "'self'",
  });
}
