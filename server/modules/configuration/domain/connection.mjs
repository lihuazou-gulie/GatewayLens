import { DomainError } from "../../../shared/domain/errors.mjs";
export function normalizeSite(value, { allowHttp = false } = {}) {
  let url;
  try {
    url = new URL(String(value).trim());
  } catch {
    throw new DomainError("validation", "请输入完整的 Sub2API 站点地址");
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["http:", "https:"].includes(url.protocol)
  )
    throw new DomainError("validation", "站点地址不能包含凭证、查询参数或片段");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol === "http:" && !local && !allowHttp)
    throw new DomainError(
      "validation",
      "请使用 HTTPS；内网 HTTP 需在服务器显式启用 KANBAN_ALLOW_HTTP",
    );
  url.pathname = url.pathname.replace(/\/+$/, "").replace(/\/api\/v1$/, "") + "/api/v1";
  return url.toString();
}
