import { DomainError } from "../../../shared/domain/errors.mjs";
export class IdentityRepository {
  constructor(store) {
    this.store = store;
  }
  credentials(transaction) {
    return this.store.read(transaction).admin;
  }
  initialize(transaction, credentials) {
    if (transaction.admin) throw new DomainError("conflict", "面板已经初始化，请登录");
    this.setCredentials(transaction, credentials);
  }
  setCredentials(transaction, credentials) {
    transaction.admin = structuredClone(credentials);
  }
}
