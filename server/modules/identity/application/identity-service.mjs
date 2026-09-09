import { DomainError } from "../../../shared/domain/errors.mjs";
import { validatePassword } from "../domain/password-policy.mjs";
export class IdentityService {
  constructor({ repository, unitOfWork, passwords, sessions, setupCode }) {
    Object.assign(this, { repository, unitOfWork, passwords, sessions, setupCode });
  }
  initialized() {
    return Boolean(this.repository.credentials());
  }
  async setup({ code, password }) {
    if (this.initialized()) throw new DomainError("conflict", "面板已经初始化，请登录");
    if (!this.passwords.equal(code || "", this.setupCode))
      throw new DomainError("unauthenticated", "初始化码无效");
    validatePassword(password);
    const credentials = await this.passwords.hash(password);
    await this.unitOfWork.transact(undefined, (tx) => this.repository.initialize(tx, credentials));
  }
  async login(password) {
    const credentials = this.repository.credentials();
    if (
      !(await this.passwords.verify(password, credentials)) ||
      credentials.hash !== this.repository.credentials()?.hash
    )
      throw new DomainError("unauthenticated", "管理密码不正确");
  }
  async changePassword({ currentPassword, password }) {
    validatePassword(password);
    const credentials = await this.passwords.hash(password);
    await this.unitOfWork.transact(undefined, async (tx) => {
      if (!(await this.passwords.verify(currentPassword, this.repository.credentials(tx))))
        throw new DomainError("unauthenticated", "当前密码不正确");
      this.repository.setCredentials(tx, credentials);
    });
    this.sessions.revokeAll();
  }
}
