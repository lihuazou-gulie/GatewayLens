import { DomainError } from "../../domain/errors.mjs";
import { UpstreamError } from "../../infrastructure/sub2api/errors.mjs";
export class HttpError extends Error {
  constructor(status, publicMessage) {
    super(publicMessage);
    this.status = status;
    this.publicMessage = publicMessage;
  }
}
const STATUS = {
  validation: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  throttled: 429,
  busy: 503,
  timeout: 504,
};
export function publicError(error) {
  if (error instanceof DomainError)
    return { status: STATUS[error.code] || 500, message: error.message };
  if (error instanceof UpstreamError) return { status: 502, message: "数据源暂时不可用" };
  if (error instanceof HttpError) return { status: error.status, message: error.publicMessage };
  return { status: 500, message: "服务暂时不可用" };
}
