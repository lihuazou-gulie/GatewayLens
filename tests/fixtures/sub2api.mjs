import { createServer } from "node:http";
export const DEMO_KEY = "demo-admin-key-not-production";
export const DEMO_GROUPS = [ { id: 101, name: "标准文本", platform: "openai" }, { id: 102, name: "优选文本", platform: "anthropic" }, { id: 103, name: "图片创作", platform: "openai" }, { id: 999, name: "不公开分组", platform: "openai" } ];
export function fixtureSub2Api({ failures = new Map(), overrides = new Map(), calls = [], availability = true } = {}) {
  return createServer((req, res) => {
    const url = new URL(req.url, "http://fixture"); const path = url.pathname.replace("/api/v1", ""); const groupId = Number(url.searchParams.get("group_id") || 101);
    calls.push({ path, method: req.method, groupId, query: url.searchParams });
    res.setHeader("Content-Type", "application/json");
    if (req.headers["x-api-key"] !== DEMO_KEY) { res.writeHead(401); res.end(JSON.stringify({ code: 401 })); return; }
    if (failures.has(path)) { res.writeHead(failures.get(path)); res.end(JSON.stringify({ message: "private-upstream-error" })); return; }
    const accountIds = groupId === 101 ? [1, 2, 3] : groupId === 102 ? [2, 4] : [3, 5];
    const account = Object.fromEntries(accountIds.map((id) => [id, { account_id: id, account_name: "SENSITIVE_ACCOUNT", user_email: "SENSITIVE_EMAIL", api_key: "SENSITIVE_KEY", current_in_use: id === 5 ? 5 : 1, max_capacity: 8, waiting_in_queue: id === 5 ? 2 : 0,
      is_available: availability && id !== 4, is_rate_limited: id === 4, has_error: false } ]));
    const multiplier = groupId === 103 ? 0.1 : groupId === 102 ? 0.7 : 1;
    const now = Date.now();
    let data;
    if (path === "/admin/groups/all") data = DEMO_GROUPS;
    else if (path === "/admin/ops/dashboard/overview") data = { request_count_total: 10200 * multiplier, request_count_sla: 10000 * multiplier, success_count: 9820 * multiplier, error_count_sla: 180 * multiplier, error_count_total: 380 * multiplier, business_limited_count: 200 * multiplier,
      upstream_429_count: 42, upstream_529_count: 5, duration: { p50_ms: groupId === 103 ? 38000 : 2200, p95_ms: groupId === 103 ? 92000 : 9400 }, ttft: { p50_ms: 1100 },
      system_metrics: { created_at: new Date(now).toISOString(), cpu_usage_percent: 18.6, memory_used_mb: 483, memory_total_mb: 2048, db_ok: true, redis_ok: true, db_conn_active: 7, redis_conn_total: 12, private_host: "SENSITIVE_HOST" } };
    else if (path === "/admin/ops/request-errors") data = { total: 10 * multiplier, items: [{ user_email: "SENSITIVE_EMAIL" }] };
    else if (path === "/admin/ops/dashboard/throughput-trend") data = { points: Array.from({ length: 24 }, (_, i) => ({ bucket_start: new Date(Math.floor(now / 3600000) * 3600000 - (23 - i) * 3600000).toISOString(), request_count: Math.round((180 + (Math.sin(i * 0.6) + 1) * 160 + i * 9) * multiplier), token_consumed: 100000 })) };
    else if (["/admin/ops/concurrency", "/admin/ops/account-availability"].includes(path)) data = { enabled: true, account, platform: {}, group: {} };
    else if (path === "/admin/channel-monitor-v2/models") {
      const groupIds = url.searchParams.getAll("group_id"); const models = groupIds.includes("103") ? ["gpt-image-2"] : [];
      if (groupIds.includes("101")) models.push("gpt-5.6", "gpt-5.5"); if (groupIds.includes("102")) models.push("claude-sonnet");
      const selected = url.searchParams.getAll("model");
      data = { coverage: { coverage_complete: true, data_through: new Date(now - 30000).toISOString(), coverage_start: new Date(now - 30 * 86400000).toISOString(), aggregation_lag_seconds: 30 }, items: models.filter((m) => !selected.length || selected.includes(m)).map((model) => ({ model, platform: model.startsWith("claude") ? "anthropic" : "openai",
        credentials: "SENSITIVE_KEY", metrics: { request_count: 1250, success_requests: 1225, error_requests: 25, success_rate: 0.98, token_count: 3150200, cache_rate: 0.364, rpm: 18.2, duration: { p50_ms: model.includes("image") ? 45000 : 2500, p95_ms: model.includes("image") ? 84000 : 9700 }, ttft: { p50_ms: 1250 } } })) };
    } else { res.writeHead(404); res.end(JSON.stringify({ code: 404 })); return; }
    if (overrides.has(path)) data = overrides.get(path);
    if (overrides.has(`${path}:${groupId}`)) data = overrides.get(`${path}:${groupId}`);
    res.end(JSON.stringify({ code: 0, data }));
  });
}
export function listen(server, port = 0) { return new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", () => resolve(server.address().port)); }); }
