import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
test("published browser entrypoints include every imported local module", async () => {
  const visited = new Set();
  async function visit(path) {
    if (visited.has(path)) return;
    visited.add(path);
    const code = await readFile(path, "utf8");
    const imports = [...code.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)].map((m) => m[1]);
    for (const imported of imports) await visit(resolve(dirname(path), imported));
  }
  await visit(resolve("src/app.js"));
  await visit(resolve("src/settings/app.js"));
});
