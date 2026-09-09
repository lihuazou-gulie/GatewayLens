import { readFile } from "node:fs/promises";
import { loadConfig } from "./config.mjs";
import { createGatewayLensServer } from "./app.mjs";
const config = loadConfig();
if (Boolean(config.tlsCertFile) !== Boolean(config.tlsKeyFile))
  throw new Error("Configure both TLS certificate and key");
const tls = config.tlsCertFile
  ? { cert: await readFile(config.tlsCertFile), key: await readFile(config.tlsKeyFile) }
  : null;
const { server, identity } = await createGatewayLensServer({ config: { ...config, tls } });
server.listen(config.port, config.host, () => {
  console.log(`[kanban] listening on ${config.host}:${config.port}`);
  if (!identity.initialized())
    console.log(`[kanban] initialization code file: ${config.dataDir}/setup-code`);
});
function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
