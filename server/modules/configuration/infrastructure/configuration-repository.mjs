import { DEFAULT_DISPLAY } from "../domain/display.mjs";
export class ConfigurationRepository {
  constructor(store, vault) {
    this.store = store;
    this.vault = vault;
  }
  snapshot(transaction) {
    const state = this.store.read(transaction);
    return {
      revision: this.store.revision,
      display: state.display,
      connection: state.connection
        ? {
            baseUrl: state.connection.baseUrl,
            apiKey: this.vault.decrypt(state.connection.secret),
          }
        : null,
    };
  }
  scopeId(id) {
    return this.vault.scopeId(id);
  }
  setConnection(transaction, connection) {
    transaction.connection = {
      baseUrl: connection.baseUrl,
      secret: this.vault.encrypt(connection.apiKey),
    };
  }
  setDisplay(transaction, display) {
    transaction.display = structuredClone(display);
  }
  resetDisplay(transaction) {
    transaction.display = structuredClone(DEFAULT_DISPLAY);
  }
}
