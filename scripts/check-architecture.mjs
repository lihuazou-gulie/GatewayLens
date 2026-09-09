import { readdir, readFile } from "node:fs/promises";
import { resolve, relative, dirname, sep } from "node:path";
const root = process.cwd();
async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (/\.(mjs|js)$/.test(entry.name)) files.push(path);
  }
  return files;
}
const files = [...(await walk(resolve("server"))), ...(await walk(resolve("src")))];
const graph = new Map(),
  failures = [];
const portable = (file) => relative(root, file).split(sep).join("/");
for (const file of files) {
  const name = portable(file),
    code = await readFile(file, "utf8");
  const specifiers = [...code.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)].map(
    (match) => match[1],
  );
  const dependencies = [];
  const module = name.match(
    /^server\/modules\/([^/]+)\/(domain|application|infrastructure|interfaces)\//,
  );
  for (const specifier of specifiers) {
    if (!specifier.startsWith(".")) {
      if (module && ["domain", "application"].includes(module[2]))
        failures.push(name + ": platform import in inner layer: " + specifier);
      continue;
    }
    const target = resolve(dirname(file), specifier),
      dependency = portable(target);
    if (!files.includes(target)) failures.push(name + ": missing module " + dependency);
    dependencies.push(target);
    if (module) {
      const [_, owner, layer] = module;
      const own = "server/modules/" + owner + "/";
      const common = "server/shared/";
      const allowed =
        layer === "domain"
          ? [own + "domain/", common + "domain/"]
          : layer === "application"
            ? [own + "application/", own + "domain/", common + "application/", common + "domain/"]
            : null;
      if (allowed && !allowed.some((prefix) => dependency.startsWith(prefix)))
        failures.push(name + ": forbidden dependency " + dependency);
      if (
        layer === "infrastructure" &&
        (dependency.includes("/interfaces/") || dependency.includes("/bootstrap/"))
      )
        failures.push(name + ": adapter depends on delivery/composition layer");
    }
    if (name.startsWith("server/shared/") && dependency.startsWith("server/modules/"))
      failures.push(name + ": shared code depends on a feature module");
    if (name.startsWith("src/settings/") && dependency.startsWith("src/monitor/"))
      failures.push(name + ": settings depends on monitoring UI");
    if (name.startsWith("src/") && dependency.startsWith("server/"))
      failures.push(name + ": browser imports server internals");
  }
  graph.set(file, dependencies);
}
const done = new Set(),
  active = new Set(),
  stack = [];
function visit(file) {
  if (active.has(file)) {
    failures.push(
      "Cycle: " + [...stack.slice(stack.indexOf(file)), file].map(portable).join(" -> "),
    );
    return;
  }
  if (done.has(file)) return;
  active.add(file);
  stack.push(file);
  for (const dependency of graph.get(file) || []) visit(dependency);
  stack.pop();
  active.delete(file);
  done.add(file);
}
for (const file of files) visit(file);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    "Architecture passed: " + files.length + " modules, inward dependencies, no static cycles.",
  );
