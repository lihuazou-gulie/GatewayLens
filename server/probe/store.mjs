import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const MAX_RESULTS = 10000;

function validResult(value) {
  return value && typeof value === "object" && typeof value.generation === "string" &&
    typeof value.checkedAt === "string" && ["ok", "failed"].includes(value.status) &&
    typeof value.reason === "string" && (value.latencyMs === null || Number.isFinite(value.latencyMs));
}

export class ProbeResultStore {
  constructor(dir) { this.dir = dir; this.file = join(dir, "probe-results.json"); this.pending = Promise.resolve(); }

  async list(generation, limit = 100) {
    const records = await this.read();
    return records.filter((item) => item.generation === generation).slice(-Math.min(Math.max(Number(limit) || 100, 1), 500)).reverse();
  }

  append(result) {
    const operation = this.pending.then(async () => {
      const records = await this.read(); records.push(result); const kept = records.slice(-MAX_RESULTS);
      await mkdir(this.dir, { recursive: true });
      const temporary = join(this.dir, `probe-results-${randomBytes(8).toString("hex")}.tmp`);
      await writeFile(temporary, JSON.stringify(kept, null, 2), { mode: 0o600, flag: "wx" });
      await rename(temporary, this.file);
    });
    this.pending = operation.catch(() => {}); return operation;
  }

  async read() {
    try {
      const values = JSON.parse(await readFile(this.file, "utf8"));
      return Array.isArray(values) ? values.filter(validResult) : [];
    } catch (error) { if (error.code === "ENOENT") return []; throw error; }
  }
}
