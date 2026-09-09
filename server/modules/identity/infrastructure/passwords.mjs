import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);
export function equalSecret(a, b) {
  const left = Buffer.from(String(a)),
    right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}
export const passwords = {
  equal: equalSecret,
  async hash(password) {
    const salt = randomBytes(16).toString("hex");
    return { salt, hash: (await scrypt(password, salt, 64)).toString("hex") };
  },
  async verify(password, credentials) {
    if (typeof password !== "string" || password.length > 128 || !credentials) return false;
    return equalSecret(
      (await scrypt(password, credentials.salt, 64)).toString("hex"),
      credentials.hash,
    );
  },
};
