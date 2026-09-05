import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { HttpError } from "./errors.mjs";
const scrypt = promisify(scryptCallback);
export function equalSecret(a, b) {
  const left = Buffer.from(String(a)); const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}
export async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 128) throw new HttpError(400, "管理密码需要 12–128 个字符");
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: (await scrypt(password, salt, 64)).toString("hex") };
}
export async function checkPassword(password, admin) {
  if (typeof password !== "string" || password.length > 128 || !admin) return false;
  return equalSecret((await scrypt(password, admin.salt, 64)).toString("hex"), admin.hash);
}
export class Sessions {
  constructor() { this.sessions = new Map(); this.attempts = new Map(); }
  throttle(request) {
    const now = Date.now();
    for (const [key, value] of this.attempts) if (value.until < now) this.attempts.delete(key);
    const key = request.socket.remoteAddress; const value = this.attempts.get(key) || { count: 0, until: now + 60000 };
    if (++value.count > 8 || this.attempts.size > 1000) throw new HttpError(429, "尝试过于频繁，请一分钟后重试");
    this.attempts.set(key, value);
  }
  token(request) { return String(request.headers.cookie || "").split(";").map((c) => c.trim()).find((c) => c.startsWith("kanban_session="))?.slice(15) || ""; }
  authenticated(request) {
    const now = Date.now(); for (const [key, expires] of this.sessions) if (expires <= now) this.sessions.delete(key);
    return this.sessions.has(this.token(request));
  }
  require(request) { if (!this.authenticated(request)) throw new HttpError(401, "请先登录面板管理后台"); }
  login(response, secure) {
    if (this.sessions.size >= 64) this.sessions.delete(this.sessions.keys().next().value);
    const token = randomBytes(32).toString("hex"); this.sessions.set(token, Date.now() + 12 * 3600000);
    response.setHeader("Set-Cookie", `kanban_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure ? "; Secure" : ""}`);
  }
  logout(request, response, secure) {
    this.sessions.delete(this.token(request));
    response.setHeader("Set-Cookie", `kanban_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure ? "; Secure" : ""}`);
  }
}
