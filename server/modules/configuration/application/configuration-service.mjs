import { DomainError } from "../../../shared/domain/errors.mjs";
import { validateDisplay } from "../domain/display.mjs";
import { normalizeSite } from "../domain/connection.mjs";
export class ConfigurationService {
  constructor({ repository, unitOfWork, catalog, testConnection, probeConfiguration, allowHttp }) {
    Object.assign(this, {
      repository,
      unitOfWork,
      catalog,
      testConnection,
      probeConfiguration,
      allowHttp,
    });
  }
  settings() {
    const { revision, display, connection } = this.repository.snapshot();
    return {
      revision,
      display,
      connection: connection ? { baseUrl: connection.baseUrl, configured: true } : null,
    };
  }
  async saveDisplay({ revision, display: input }) {
    const display = validateDisplay(input, await this.catalog());
    this.requireRevision(revision);
    await this.unitOfWork.transact(revision, (tx) => {
      this.repository.setDisplay(tx, display);
      this.probeConfiguration.clearIfOutsideDisplay(tx, display.groups);
    });
    return { ok: true };
  }
  connectionInput(body) {
    const baseUrl = normalizeSite(body.site, { allowHttp: this.allowHttp });
    const current = this.repository.snapshot().connection;
    const apiKey =
      typeof body.apiKey === "string" && body.apiKey.trim()
        ? body.apiKey.trim()
        : current?.baseUrl === baseUrl
          ? current.apiKey
          : "";
    if (!apiKey || apiKey.length > 4096 || /[\r\n]/.test(apiKey))
      throw new DomainError("validation", "请输入有效的管理员 API Key");
    return { baseUrl, apiKey };
  }
  async test(body) {
    return this.testConnection(this.connectionInput(body), true);
  }
  async saveConnection(body) {
    this.requireRevision(body.revision);
    const connection = this.connectionInput(body);
    const result = await this.testConnection(connection, false);
    await this.unitOfWork.transact(body.revision, (tx) => {
      const previous = this.repository.snapshot(tx).connection;
      this.repository.setConnection(tx, connection);
      if (previous?.baseUrl !== connection.baseUrl) {
        this.repository.resetDisplay(tx);
        this.probeConfiguration.reset(tx);
      }
    });
    return { ok: true, groupCount: result.groups.length };
  }
  requireRevision(revision) {
    if (!Number.isSafeInteger(revision) || revision < 0)
      throw new DomainError("validation", "设置版本无效，请重新载入");
  }
}
