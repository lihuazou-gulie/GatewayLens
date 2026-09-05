import { fixtureSub2Api } from "./sub2api.mjs";
const server = fixtureSub2Api();
server.listen(8080, "0.0.0.0", () => console.log("Synthetic Sub2API fixture ready"));
process.on("SIGTERM", () => server.close());
