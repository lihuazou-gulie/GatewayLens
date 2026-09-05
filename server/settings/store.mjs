import { mkdir, readFile, writeFile, rename, chmod } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes, createCipheriv, createDecipheriv, createHmac } from "node:crypto";
import { DEFAULT_DISPLAY } from "./schema.mjs";
async function readOrCreate(path, bytes) {
  try { await writeFile(path, bytes, { flag: "wx", mode: 0o600 }); } catch (e) { if (e.code !== "EEXIST") throw e; }
  return readFile(path);
}
export class SettingsStore {
  constructor(dir) { this.dir = dir; this.revision = 0; this.pending = Promise.resolve(); }
  async init() {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") await chmod(this.dir, 0o700);
    this.key = await readOrCreate(join(this.dir, "encryption.key"), randomBytes(32));
    if (this.key.length !== 32) throw new Error("Invalid encryption key file");
    this.setupCode = (await readOrCreate(join(this.dir, "setup-code"), randomBytes(24).toString("hex"))).toString().trim();
    try {
      this.state = JSON.parse(await readFile(join(this.dir, "settings.json"), "utf8"));
      if (this.state.version !== 1) throw new Error("Unsupported settings version");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      this.state = { version: 1, admin: null, connection: null, display: structuredClone(DEFAULT_DISPLAY) };
    }
    return this;
  }
  encrypt(value) {
    const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), value: encrypted.toString("base64") };
  }
  decrypt(value) {
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(value.iv, "base64"));
    decipher.setAuthTag(Buffer.from(value.tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(value.value, "base64")), decipher.final()]).toString("utf8");
  }
  scopeId(id) { return createHmac("sha256", this.key).update(`group:${id}`).digest("hex").slice(0, 16); }
  connection() { const c = this.state.connection; return c ? { baseUrl: c.baseUrl, apiKey: this.decrypt(c.secret) } : null; }
  update(mutator) {
    const operation = this.pending.then(async () => {
      const next = mutator(structuredClone(this.state));
      const temporary = join(this.dir, `settings-${randomBytes(8).toString("hex")}.tmp`);
      await writeFile(temporary, JSON.stringify(next, null, 2), { mode: 0o600, flag: "wx" });
      await rename(temporary, join(this.dir, "settings.json"));
      this.state = next; this.revision++;
    });
    this.pending = operation.catch(() => {}); return operation;
  }
}
