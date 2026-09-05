import { element } from "../ui/dom.js";
import { gaugeSvgMarkup, updateGaugeVisual } from "../ui/gauge.js";
import { compactNumber, percent, duration, number } from "../ui/formatters.js";
export const statuses = { ok: "已连接", hidden: "模块已关闭", disabled: "监控未启用", unsupported: "接口未提供", denied: "功能未开启或权限不足", unavailable: "数据暂不可用", unconfigured: "尚未配置" };
export function tone(value, threshold = 95) { return value === null || value === undefined ? "muted" : value < threshold ? "warning" : "healthy"; }
export function metric(label, value, note, { gauge = null, color = "mint" } = {}) {
  const card = element("article", "panel metric-card"); card.style.setProperty("--card-accent", `var(--${color})`);
  card.append(element("p", "metric-label", label));
  const body = element("div", "metric-body");
  if (gauge !== null) { const arc = element("div", "gpt-gauge"); arc.innerHTML = gaugeSvgMarkup(); updateGaugeVisual(arc, gauge); body.append(arc); }
  body.append(element("strong", "metric-value", value)); card.append(body, element("p", "metric-note", note)); return card;
}
export function stat(label, value) { const row = element("div", "stat-row"); row.append(element("span", "", label), element("strong", "", value)); return row; }
export function groupCard(group) {
  const card = element("article", "panel group-card"); const q = group.quality.data; const capacity = group.capacity.data; const pool = group.pool.data;
  const header = element("div", "card-heading"); const link = element("a", "group-link", group.label); link.href = `/?scope=${group.scope}`;
  header.append(link, element("span", `chip ${tone(q?.rate)}`, q ? q.requests > 0 ? "有请求样本" : "暂无样本" : statuses[group.quality.state]));
  const main = element("div", "group-rate"); main.append(element("strong", "", percent(q?.rate)), element("span", "", "服务成功率"));
  card.append(header);
  if (group.quality.state !== "hidden") card.append(main);
  if (group.quality.state !== "hidden") card.append(stat("请求次数", compactNumber(q?.requests)), stat("服务错误", compactNumber(q?.errors)), stat("首字延迟 P50", duration(q?.latency.ttft)), stat("完成耗时 P95", duration(q?.latency.p95)), stat("上游 429 / 529", `${number(q?.upstream429)} / ${number(q?.upstream529)}`));
  if (group.capacity.state !== "hidden") {
    card.append(stat("并发占用", capacity ? `${number(capacity.used)} / ${number(capacity.max)}` : statuses[group.capacity.state]));
    const track = element("div", "load-track"); const bar = element("span"); bar.style.width = `${Math.min(100, capacity?.percent || 0)}%`; track.append(bar); card.append(track, stat("排队数", number(capacity?.waiting)));
  }
  if (group.pool.state !== "hidden") card.append(stat("号池可用率", pool ? percent(pool.percent) : statuses[group.pool.state]));
  return card;
}
export function modelCard(model, image) {
  const card = element("article", "panel group-card");
  const header = element("div", "card-heading"); header.append(element("h3", "", model.model), element("span", "chip", model.platform));
  card.append(header, stat("请求次数", compactNumber(model.requests)), stat("请求成功率", percent(model.rate)),
    stat("完成耗时 P50", duration(model.latency.p50)), stat("完成耗时 P95", duration(model.latency.p95)));
  if (!image) card.append(stat("首字延迟 P50", duration(model.latency.ttft)), stat("Token 用量", compactNumber(model.tokens)), stat("缓存占比", percent(model.cacheRate)));
  else card.append(element("p", "panel-note", "按模型统计请求，次数不等于生成张数。"));
  return card;
}
