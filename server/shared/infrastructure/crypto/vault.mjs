import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes, createCipheriv, createDecipheriv, createHmac } from "node:crypto";
async function readOrCreate(path, bytes) {
  try {
    await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  if (process.platform !== "win32") await chmod(path, 0o600);
  return readFile(path);
}
export class FileVault {
  #key;
  constructor(dir) {
    this.dir = dir;
  }
  async init() {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    this.#key = await readOrCreate(join(this.dir, "encryption.key"), randomBytes(32));
    if (this.#key.length !== 32) throw new Error("Invalid encryption key file");
    this.setupCode = (
      await readOrCreate(join(this.dir, "setup-code"), randomBytes(24).toString("hex"))
    )
      .toString()
      .trim();
    return this;
  }
  encrypt(value) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return {
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      value: encrypted.toString("base64"),
    };
  }
  decrypt(value) {
    const decipher = createDecipheriv("aes-256-gcm", this.#key, Buffer.from(value.iv, "base64"));
    decipher.setAuthTag(Buffer.from(value.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(value.value, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }
  scopeId(id) {
    return createHmac("sha256", this.#key)
      .update("group:" + id)
      .digest("hex")
      .slice(0, 16);
  }
}
