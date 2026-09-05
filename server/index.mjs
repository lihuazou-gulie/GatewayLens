import { readFile } from "node:fs/promises";
import { loadConfig } from "./config.mjs";
import { createKanbanServer } from "./app.mjs";
const config = loadConfig();
if (Boolean(config.tlsCertFile) !== Boolean(config.tlsKeyFile)) throw new Error("Configure both TLS certificate and key");
const tls = config.tlsCertFile ? { cert: await readFile(config.tlsCertFile), key: await readFile(config.tlsKeyFile) } : null;
const { server, store } = await createKanbanServer({ config: { ...config, tls } });
server.listen(config.port, config.host, () => {
  console.log(`[kanban] listening on ${config.host}:${config.port}`);
  if (!store.state.admin) console.log(`[kanban] initialization code file: ${config.dataDir}/setup-code`);
});
function shutdown() { server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 10000).unref(); }
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
