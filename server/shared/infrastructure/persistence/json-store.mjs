import { mkdir, readFile, writeFile, rename, chmod } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { DomainError } from "../../domain/errors.mjs";

// One process owns the data directory. Repositories share a transaction boundary.
export class JsonStateStore {
  #state;
  #revision = 0;
  #pending = Promise.resolve();
  #listeners = new Set();
  constructor({ dir, initialState, migrate }) {
    Object.assign(this, { dir, initialState, migrate });
    this.file = join(dir, "settings.json");
  }
  get revision() {
    return this.#revision;
  }
  async init() {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") await chmod(this.dir, 0o700);
    try {
      const original = JSON.parse(await readFile(this.file, "utf8"));
      this.#state = this.migrate(original);
      if (JSON.stringify(original) !== JSON.stringify(this.#state))
        await this.#persist(this.#state);
      if (process.platform !== "win32") await chmod(this.file, 0o600);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      this.#state = this.initialState();
    }
    return this;
  }
  read(transaction) {
    return structuredClone(transaction || this.#state);
  }
  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  transact(expectedRevision, operation) {
    const pending = this.#pending.then(async () => {
      if (expectedRevision !== undefined && expectedRevision !== this.#revision)
        throw new DomainError("conflict", "设置已被更新，请重新载入");
      const transaction = structuredClone(this.#state);
      const result = await operation(transaction);
      await this.#persist(transaction);
      this.#state = transaction;
      this.#revision++;
      for (const listener of this.#listeners) listener(this.#revision);
      return result;
    });
    this.#pending = pending.catch(() => {});
    return pending;
  }
  async #persist(state) {
    const temporary = join(this.dir, "settings-" + randomBytes(8).toString("hex") + ".tmp");
    await writeFile(temporary, JSON.stringify(state, null, 2), { mode: 0o600, flag: "wx" });
    await rename(temporary, this.file);
  }
}
