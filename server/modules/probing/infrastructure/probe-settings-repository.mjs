import { randomBytes } from "node:crypto";
import { DEFAULT_PROBE } from "../domain/policy.mjs";
export class ProbeSettingsRepository {
  constructor(store, vault) {
    this.store = store;
    this.vault = vault;
  }
  read(transaction) {
    const p = this.store.read(transaction).probe;
    return {
      config: p.config,
      generation: p.generation,
      apiKey: p.secret ? this.vault.decrypt(p.secret) : "",
    };
  }
  save(transaction, config, apiKey) {
    transaction.probe = {
      config: structuredClone(config),
      secret: apiKey ? this.vault.encrypt(apiKey) : null,
      generation: randomBytes(12).toString("hex"),
    };
  }
  reset(transaction) {
    this.save(transaction, DEFAULT_PROBE, "");
  }
}
