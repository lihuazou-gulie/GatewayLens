import { setText, show, element, options } from "../ui/dom.js";
import { compactNumber, percent, number, timestamp } from "../ui/formatters.js";
import { drawTrendChart, clearTrendChart } from "../ui/chart.js";
import { metric, groupCard, modelCard, stat, statuses } from "./cards.js";

export function render(state) {
  const { data, error, view, loading } = state; const modelsView = view === "models";
  document.querySelectorAll("[data-view]").forEach((node) => node.setAttribute("aria-current", node.dataset.view === view ? "page" : "false"));
  document.querySelectorAll("[data-range]").forEach((node) => node.setAttribute("aria-pressed", String(node.dataset.range === state.range)));
  show("topic-field", modelsView); show("model-field", modelsView); show("model-section", modelsView);
  show("groups-heading", !modelsView); show("group-grid", !modelsView); show("overview-panels", view === "overview");
  setText("view-eyebrow", modelsView ? "MODELS / PERFORMANCE" : view === "groups" ? "GROUPS / OBSERVABILITY" : "LIVE / OVERVIEW");
  setText("view-title", modelsView ? "每个模型，都有迹可循" : view === "groups" ? "分组状态，清晰可见" : "运行态势，一屏掌握");
  setText("view-description", modelsView ? state.topic === "images" ? "图片请求关注完成耗时；并发与号池展示所选分组的整体负载。" : "查看真实请求中的模型表现；图片专题关注完成耗时。" : "关注服务质量、分组负载与模型表现。");
  const notice = document.getElementById("notice");
  notice.hidden = !error && data?.state !== "unconfigured" && data?.state !== "partial";
  notice.textContent = error ? `${error}${data ? " · 下方保留上次成功快照" : ""}` : data?.state === "unconfigured" ? "还没有配置监控分组，请到面板设置完成接入。" : "部分指标不可用，各模块已分别标记状态。";
  if (state.authRequired || data?.state === "unconfigured") { const a = element("a", "inline-link", "前往面板设置 →"); a.href = "/settings"; notice.append(a); }
  setText("connection-status", error ? "同步中断" : loading ? "正在同步" : data?.state === "unconfigured" ? "等待配置" : data?.state === "partial" ? "部分数据可用" : "已连接 · 自动同步");
  document.getElementById("status-dot").dataset.state = error ? "error" : loading ? "loading" : data?.state;
  document.getElementById("refresh-button").disabled = loading;
  if (!data || data.state === "unconfigured") {
    for (const id of ["metrics", "overview-panels", "groups-heading", "group-grid", "model-section", "system-section", "pool-health-alert"]) show(id, false);
    for (const id of ["metrics", "group-grid", "model-grid", "system-grid", "pool-content"]) document.getElementById(id).replaceChildren();
    clearTrendChart(document.getElementById("trend-chart"));
    setText("site-name", data?.title || "SUB2API");
    document.title = "Sub2API 监控";
    document.body.classList.remove("pool-health-critical");
    setText("updated-at", "等待可用的数据快照");
    options(document.getElementById("scope-select"), [["all", "全部已选分组"]], "all");
    options(document.getElementById("model-select"), [["", "全部"]], "");
    return;
  }
  setText("site-name", data.title); document.title = `${data.title} · ${view === "overview" ? "总览" : view === "groups" ? "分组" : "模型专题"}`;
  setText("updated-at", `快照 ${timestamp(data.generatedAt)}`);
  options(document.getElementById("scope-select"), [["all", "全部已选分组"], ...(data.scopes || data.groups).map((g) => [g.scope, g.label])], state.scope);
  options(document.getElementById("model-select"), [["", "全部"], ...state.knownModels.map((m) => [m, m])], state.model);
  document.getElementById("topic-select").value = state.topic;
  const { quality: q, capacity: c, pool: p } = data.summary;
  const items = [];
  if (data.modules.quality && !modelsView) items.push(metric("服务成功率", percent(q?.rate), q ? `${compactNumber(q.successes)} 次成功 · ${compactNumber(q.errors)} 次服务错误${q.partial ? " · 部分分组" : ""}` : "监控未开启或数据不可用", { gauge: q?.rate ?? null }),
    metric("服务请求", compactNumber(q?.requests), "排除业务限制及调用方请求错误", { color: "cyan" }));
  if (data.modules.capacity) items.push(metric("分组并发负载", percent(c?.percent), c ? `${number(c.used)} / ${number(c.max)} 并发 · ${number(c.waiting)} 排队${c.partial ? " · 部分分组" : ""}` : "实时监控未开启或数据不可用", { gauge: c?.percent ?? null, color: "amber" }));
  if (data.modules.pool) items.push(metric("号池可用率", percent(p?.percent), p ? `${number(p.available)} / ${number(p.total)} 可用${p.partial ? " · 部分分组" : ""}` : "实时监控未开启或数据不可用", { gauge: p?.percent ?? null, color: "lime" }));
  show("metrics", (!modelsView || state.topic === "images") && items.length > 0); document.getElementById("metrics").replaceChildren(...items);
  const critical = !error && p?.percent !== null && p?.percent !== undefined && !p.partial && p.percent < data.poolThreshold;
  show("pool-health-alert", critical); document.body.classList.toggle("pool-health-critical", critical);
  setText("pool-alert-copy", `当前可用率 ${percent(p?.percent)}，低于 ${data.poolThreshold}% 阈值。`);
  show("traffic-panel", data.modules.traffic); show("pool-panel", data.modules.pool);
  drawTrendChart(document.getElementById("trend-chart"), data.traffic.map((p) => ({ started_at: p.at, total: p.requests, success_rate: null })), state.range);
  setText("trend-note", data.traffic.length ? "请求量为上游统计口径，包含业务限制；与上方服务请求口径不同。" : "暂无趋势数据，或上游未提供趋势接口。");
  document.getElementById("pool-content").replaceChildren(...(p ? [stat("可用", number(p.available)), stat("限流", number(p.limited)), stat("异常", number(p.errors)), stat("不可用合计", number(p.unavailable)), element("p", "panel-note", "共享账号已去重；限流和异常属于不可用原因。可用状态不代表主动调用测试通过。")]: [element("p", "panel-note", "暂无号池可用性数据")]));
  setText("group-count", `${data.groups.length} 个分组`);
  document.getElementById("group-grid").replaceChildren(...data.groups.map(groupCard));
  const rows = data.models?.data?.rows || []; const image = state.topic === "images";
  setText("models-title", image ? "图片模型表现" : "模型表现"); setText("model-count", `${rows.length} 个模型`);
  const cover = data.models?.data?.coverage;
  setText("model-note", data.models.state !== "ok" ? data.models.state === "unconfigured" ? "请先在设置中填写图片模型名称。" : `${statuses[data.models.state]}。模型专题需要 Sub2API 提供并启用渠道监控 V2。` : `${cover?.complete ? "所选历史范围已覆盖" : "历史数据尚未覆盖完整范围"} · 数据截至 ${timestamp(cover?.through)} · 成功率使用渠道监控的错误排除规则。`);
  document.getElementById("model-grid").replaceChildren(...rows.map((m) => modelCard(m, image)), ...(!rows.length ? [element("div", "empty-panel", data.models.state === "ok" ? "所选范围暂无模型请求样本" : "等待可用的模型统计")] : []));
  const system = data.system?.data; show("system-section", state.admin && view === "overview");
  document.getElementById("system-grid").replaceChildren(...(system ? [metric("CPU 使用率", percent(system.cpu), "上游运行环境采样"), metric("内存", `${number(system.memoryUsed)} MB`, `总量 ${number(system.memoryTotal)} MB`), metric("数据库", system.database === null ? "未知" : system.database ? "正常" : "异常", `${number(system.dbActive)} 活跃连接`), metric("Redis", system.redis === null ? "未知" : system.redis ? "正常" : "异常", `${number(system.redisConnections)} 连接`)]: [element("p", "panel-note", "上游暂未提供系统状态快照")]));
}
