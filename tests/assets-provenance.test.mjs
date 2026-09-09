import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve, relative, sep } from "node:path";
const root = fileURLToPath(new URL("../assets/", import.meta.url));
test("every shipped PNG has a matching licensed provenance record", async () => {
  const inventory = JSON.parse(await readFile(resolve(root, "provenance.json"), "utf8"));
  const actual = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith(".png")) actual.push(relative(root, path).split(sep).join("/"));
    }
  }
  await walk(root);
  assert.deepEqual(inventory.files.map((file) => file.path).sort(), actual.sort());
  for (const file of inventory.files) {
    const bytes = await readFile(resolve(root, file.path));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256, file.path);
    assert.equal(bytes.readUInt32BE(16), file.width, file.path);
    assert.equal(bytes.readUInt32BE(20), file.height, file.path);
    assert.equal(file.license, "MIT");
    assert.ok(inventory.statements[file.sourceStatement], file.path);
  }
});
