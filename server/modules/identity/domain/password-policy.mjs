import { DomainError } from "../../../shared/domain/errors.mjs";
export function validatePassword(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 128)
    throw new DomainError("validation", "管理密码需要 12–128 个字符");
}
