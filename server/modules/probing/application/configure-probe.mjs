import { DomainError } from "../../../shared/domain/errors.mjs";
import { validateProbe } from "../domain/policy.mjs";
export class ConfigureProbe {
  constructor({ repository, configurations, unitOfWork, catalog }) {
    Object.assign(this, { repository, configurations, unitOfWork, catalog });
  }
  reset(tx) {
    this.repository.reset(tx);
  }
  clearIfOutsideDisplay(tx, groups) {
    const { config } = this.repository.read(tx);
    if (config.groupId !== null && !groups.some((group) => group.id === config.groupId))
      this.reset(tx);
  }
  async save(body) {
    if (!Number.isSafeInteger(body.revision) || body.revision < 0)
      throw new DomainError("validation", "设置版本无效，请重新载入");
    const groups = await this.catalog();
    const config = validateProbe(body.probe, groups, this.configurations.snapshot().display.groups);
    const current = this.repository.read();
    const apiKey =
      typeof body.apiKey === "string" && body.apiKey.trim() ? body.apiKey.trim() : current.apiKey;
    if (apiKey.length > 4096 || /[\r\n]/.test(apiKey))
      throw new DomainError("validation", "请输入有效的探测 API Key");
    if (config.enabled && !apiKey)
      throw new DomainError("validation", "启用主动探测前请输入探测 API Key");
    await this.unitOfWork.transact(body.revision, (tx) => this.repository.save(tx, config, apiKey));
    return { ok: true };
  }
}
