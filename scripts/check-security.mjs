import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { isUnapprovedDocument } from "./public-documents.mjs";
const history = process.argv.includes("--history");
const rules = {
  private_key: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  credential:
    /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-(?:proj-)?[A-Za-z0-9_-]{24,}|AKIA[A-Z0-9]{16})/,
  real_ssh_target:
    /\b(?:root|admin)@(?!(?:host|server|example|localhost)(?:[.\s:]|$))[a-zA-Z0-9.-]+/,
  credential_url: /https?:\/\/[^\s/@:]+:[^\s/@]+@/,
};
const forbiddenPath =
  /(^|\/)(?:runtime\.env|\.env(?!\.example$)|settings\.json|setup-code|encryption\.key)$|\.(?:p12|pfx|pem|key|log)$/i;
const privateWorkspacePath =
  /^docs(?:\/|$)|(^|\/)(?:AGENTS(?:\.local)?\.md|CLAUDE(?:\.local)?\.md|GEMINI\.md|SKILL\.md|\.cursorrules|\.windsurfrules|\.aider[^/]*|\.(?:codex|claude|cursor|windsurf|agents))(?:\/|$)|^\.github\/(?:copilot-instructions\.md$|(?:instructions|prompts)\/)|\.(?:prompt|instructions)\.md$/i;
const hits = [];
let scanned = 0;
function workspaceFiles() {
  let gitPrefix;
  try {
    gitPrefix = execFileSync("git", ["rev-parse", "--show-prefix"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    /* A source archive has no Git metadata. */
  }
  if (gitPrefix === "") {
    return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
      encoding: "utf8",
    })
      .split("\0")
      .filter(Boolean);
  }
  const excluded = new Set([
    ".git",
    "node_modules",
    "outputs",
    "test-results",
    "playwright-report",
  ]);
  function walk(dir = ".") {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = dir === "." ? entry.name : dir + "/" + entry.name;
      if (entry.isDirectory()) return excluded.has(entry.name) ? [] : walk(path);
      return entry.isFile() ? [path] : [];
    });
  }
  return walk();
}
function scan(path, bytes, revision = "worktree") {
  if (isUnapprovedDocument(path)) hits.push({ path, revision, rule: "unapproved_document" });
  if (forbiddenPath.test(path)) hits.push({ path, revision, rule: "private_file" });
  if (privateWorkspacePath.test(path))
    hits.push({ path, revision, rule: "private_workspace_file" });
  if (bytes.includes(0) || bytes.length > 2 * 1024 * 1024) return;
  scanned++;
  for (const [index, line] of bytes.toString("utf8").split(/\r?\n/).entries()) {
    for (const [rule, pattern] of Object.entries(rules)) {
      if (pattern.test(line)) {
        // Explicit synthetic URL-validation cases are public test fixtures.
        if (
          rule === "credential_url" &&
          path.startsWith("tests/") &&
          line.includes("@example.test")
        )
          continue;
        hits.push({ path, revision, rule, line: index + 1 });
      }
    }
  }
}
if (history) {
  const trees = execFileSync("git", ["log", "--format=%T", "HEAD"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  })
    .trim()
    .split("\n");
  const pathsByBlob = new Map();
  for (const tree of new Set(trees)) {
    const entries = execFileSync("git", ["ls-tree", "-rz", "--full-tree", tree], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    }).split("\0");
    for (const entry of entries.filter(Boolean)) {
      const tab = entry.indexOf("\t"),
        [, type, oid] = entry.slice(0, tab).split(" ");
      if (type !== "blob") continue;
      if (!pathsByBlob.has(oid)) pathsByBlob.set(oid, new Set());
      pathsByBlob.get(oid).add(entry.slice(tab + 1));
    }
  }
  const data = execFileSync("git", ["cat-file", "--batch"], {
    input: [...pathsByBlob.keys()].join("\n") + "\n",
    maxBuffer: 256 * 1024 * 1024,
  });
  let offset = 0;
  for (const paths of pathsByBlob.values()) {
    const end = data.indexOf(10, offset),
      [oid, type, rawSize] = data.subarray(offset, end).toString().split(" ");
    const size = Number(rawSize),
      bytes = data.subarray(end + 1, end + 1 + size);
    offset = end + 1 + size + 1;
    if (type === "blob") for (const path of paths) scan(path, bytes, oid.slice(0, 12));
  }
} else {
  const files = workspaceFiles();
  for (const path of new Set(files)) {
    try {
      scan(path, readFileSync(path));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}
if (hits.length) {
  console.error(JSON.stringify(hits, null, 2));
  process.exitCode = 1;
} else
  console.log(
    "Sensitive-pattern scan passed: " +
      scanned +
      " text files/blobs (" +
      (history ? "candidate history" : "worktree") +
      "). This is a heuristic scan, not a security certification.",
  );
