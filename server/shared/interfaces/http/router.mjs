import { HttpError } from "./errors.mjs";
export function route(method, path, handler, { auth = true, throttle = false } = {}) {
  return { method, path, handler, auth, throttle };
}
export function assertSameOrigin(request, config) {
  let origin;
  try {
    origin = new URL(request.headers.origin);
  } catch {
    throw new HttpError(403, "请从面板页面提交设置");
  }
  const expected =
    config.publicOrigin ||
    (request.socket.encrypted ? "https" : "http") + "://" + request.headers.host;
  if (origin.origin !== expected) throw new HttpError(403, "请求来源无效");
}
export async function readJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] || ""))
    throw new HttpError(415, "请使用 JSON 请求");
  let bytes = 0;
  const chunks = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 32768) throw new HttpError(413, "设置内容过大");
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString());
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new HttpError(400, "设置格式无效");
  }
}
export function createRouter(routes, { limiter, config }) {
  const table = new Map(routes.map((item) => [item.method + " " + item.path, item]));
  if (table.size !== routes.length) throw new Error("Duplicate HTTP route");
  return async (context) => {
    const { request, url } = context,
      key = request.method + " " + url.pathname;
    const match = table.get(key);
    if (!match)
      throw new HttpError(
        routes.some((item) => item.path === url.pathname) ? 405 : 404,
        "接口不存在或请求方法无效",
      );
    if (request.method !== "GET") assertSameOrigin(request, config);
    if (match.auth && !context.authenticated) throw new HttpError(401, "请先登录面板管理后台");
    if (match.throttle) limiter.check(request.socket.remoteAddress);
    const body = request.method === "GET" ? undefined : await readJson(request);
    return match.handler({ ...context, body });
  };
}
