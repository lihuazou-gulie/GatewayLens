import { equalSecret, hashPassword, checkPassword } from "../auth.mjs";
import { HttpError, UpstreamError } from "../errors.mjs";
import { Sub2ApiClient, normalizeSite } from "../upstream-client.mjs";
import { catalog } from "../monitor/normalize.mjs";
import { section } from "../monitor/service.mjs";
import { DEFAULT_DISPLAY, validateDisplay } from "./schema.mjs";

export function assertSameOrigin(request, config) {
  let origin;
  try { origin = new URL(request.headers.origin); } catch { throw new HttpError(403, "请从面板页面提交设置"); }
  const expected = config.publicOrigin || `${request.socket.encrypted ? "https" : "http"}://${request.headers.host}`;
  if (origin.origin !== expected) throw new HttpError(403, "请求来源无效");
}
export async function readJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] || "")) throw new HttpError(415, "请使用 JSON 请求");
  let bytes = 0; const chunks = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 32768) throw new HttpError(413, "设置内容过大");
    chunks.push(chunk);
  }
  try { const value = JSON.parse(Buffer.concat(chunks).toString()); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); return value; }
  catch { throw new HttpError(400, "设置格式无效"); }
}
export async function handleSettings({ request, response, url, store, sessions, monitor, config, clientFactory = (c) => new Sub2ApiClient(c) }) {
  const path = url.pathname; const method = request.method;
  const secure = Boolean(request.socket.encrypted || config.publicOrigin?.startsWith("https:"));
  if (method === "GET" && path === "/api/bootstrap") return { initialized: Boolean(store.state.admin), authenticated: sessions.authenticated(request) };
  if (method !== "GET") assertSameOrigin(request, config);
  if (method === "POST" && ["/api/setup", "/api/login"].includes(path)) {
    sessions.throttle(request); const body = await readJson(request);
    if (path === "/api/setup") {
      if (store.state.admin) throw new HttpError(409, "面板已经初始化，请登录");
      if (!equalSecret(body.code || "", store.setupCode)) throw new HttpError(401, "初始化码无效");
      const admin = await hashPassword(body.password);
      await store.update((s) => { if (s.admin) throw new HttpError(409, "面板已经初始化"); return { ...s, admin }; });
    } else if (!(await checkPassword(body.password, store.state.admin))) throw new HttpError(401, "管理密码不正确");
    sessions.login(response, secure); return { ok: true };
  }
  sessions.require(request);
  if (method === "POST" && path === "/api/logout") { sessions.logout(request, response, secure); return { ok: true }; }
  if (method === "GET" && path === "/api/admin/settings") return { revision: store.revision, display: store.state.display,
    connection: store.state.connection ? { baseUrl: store.state.connection.baseUrl, configured: true } : null };
  if (method === "GET" && path === "/api/admin/catalog") return { groups: await monitor.catalog() };
  if (method === "PUT" && path === "/api/admin/display") {
    const body = await readJson(request); const display = validateDisplay(body.display, await monitor.catalog());
    await store.update((s) => { if (body.revision !== store.revision) throw new HttpError(409, "设置已被更新，请重新载入"); return { ...s, display }; });
    return { ok: true };
  }
  if (method === "POST" && ["/api/admin/connection/test", "/api/admin/connection"].includes(path)) {
    sessions.throttle(request);
    const body = await readJson(request); const baseUrl = normalizeSite(body.site, config);
    const current = store.connection();
    const apiKey = typeof body.apiKey === "string" && body.apiKey.trim() ? body.apiKey.trim() : current?.baseUrl === baseUrl ? current.apiKey : "";
    if (!apiKey || apiKey.length > 4096 || /[\r\n]/.test(apiKey)) throw new HttpError(400, "请输入有效的管理员 API Key");
    const client = clientFactory({ baseUrl, apiKey, timeoutMs: config.requestTimeoutMs });
    let groups;
    try { groups = catalog(await client.get("/admin/groups/all")); }
    catch (e) { if (e instanceof UpstreamError) throw new HttpError(400, e.status === 401 ? "管理员 Key 无效或已失效" : "无法读取分组，请检查站点、权限和网络"); throw e; }
    if (path.endsWith("/test")) {
      const [realtime, models] = await Promise.all([
        section(() => client.get("/admin/ops/concurrency"), () => true),
        section(() => client.get("/admin/channel-monitor-v2/models", { range: "24h" }), () => true),
      ]);
      return { groups, capabilities: { realtime: realtime.state, models: models.state } };
    }
    const secret = store.encrypt(apiKey);
    await store.update((s) => {
      if (body.revision !== store.revision) throw new HttpError(409, "设置已被更新，请重新载入");
      return { ...s, connection: { baseUrl, secret }, display: s.connection?.baseUrl === baseUrl ? s.display : structuredClone(DEFAULT_DISPLAY) };
    });
    return { ok: true, groupCount: groups.length };
  }
  if (method === "POST" && path === "/api/admin/password") {
    sessions.throttle(request); const body = await readJson(request);
    if (!(await checkPassword(body.currentPassword, store.state.admin))) throw new HttpError(401, "当前密码不正确");
    const admin = await hashPassword(body.password);
    await store.update((s) => ({ ...s, admin })); sessions.sessions.clear(); sessions.login(response, secure); return { ok: true };
  }
  throw new HttpError(404, "接口不存在");
}
