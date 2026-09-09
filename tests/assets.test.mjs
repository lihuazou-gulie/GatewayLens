import { test } from "node:test";
import { readFile, access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { farmArtwork } from "../src/ui/farm-artwork.js";
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

test("published stylesheets include every local texture and imported skin module", async () => {
  const visited = new Set();
  async function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    const code = await readFile(file, "utf8");
    for (const match of code.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) {
      const url = match[1];
      if (/^(?:data:|https?:|#)/.test(url)) continue;
      const resource = url.startsWith("/") ? resolve(url.slice(1)) : resolve(dirname(file), url);
      await access(resource);
      if (resource.endsWith(".css")) await visit(resource);
    }
  }
  await visit(resolve("styles/stardew.css"));
  for (const art of Object.values(farmArtwork)) await access(resolve(art.src.slice(1)));
});
