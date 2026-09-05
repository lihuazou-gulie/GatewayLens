import { element, writeText, setAttribute, setStyle, setVisible, toggleClass } from "../ui/dom.js";
import { gaugeSvgMarkup, updateGaugeVisual } from "../ui/gauge.js";
import { compactNumber, percent, duration, number } from "../ui/formatters.js";
export const statuses = { ok: "已连接", hidden: "模块已关闭", disabled: "监控未启用", unsupported: "接口未提供", denied: "功能未开启或权限不足", unavailable: "数据暂不可用", unconfigured: "尚未配置" };
export function tone(value, threshold = 95) { return value === null || value === undefined ? "muted" : value < threshold ? "warning" : "healthy"; }

export function createMetricCard() {
  const node = element("article", "panel metric-card");
  const label = element("p", "metric-label"), body = element("div", "metric-body");
  const value = element("strong", "metric-value"), note = element("p", "metric-note");
  let arc;
  body.append(value); node.append(label, body, note);
  return { node, update(data) {
    const gauge = data.gauge ?? null;
    setStyle(node, "--card-accent", `var(--${data.color || "mint"})`);
    writeText(label, data.label); writeText(value, data.value); writeText(note, data.note);
    if (gauge !== null && !arc) {
      arc = element("div", "gpt-gauge"); arc.innerHTML = gaugeSvgMarkup(); body.prepend(arc);
    }
    if (arc) {
      setVisible(arc, gauge !== null);
      if (gauge !== null) updateGaugeVisual(arc, gauge);
    }
    toggleClass(body, "has-gauge", gauge !== null);
  } };
}

export function createStatRow() {
  const node = element("div", "stat-row");
  const label = element("span"), value = element("strong"); node.append(label, value);
  return { node, update(data) { writeText(label, data.label); writeText(value, data.value); } };
}

export function createNote(className = "panel-note") {
  const node = element("p", className);
  return { node, update(data) { writeText(node, data.text); } };
}

function statRows(parent, labels) {
  const rows = labels.map(() => createStatRow()); parent.append(...rows.map((row) => row.node));
  return (values) => rows.forEach((row, i) => row.update({ label: labels[i], value: values[i] }));
}

export function createGroupCard() {
  const node = element("article", "panel group-card");
  const header = element("div", "card-heading"), link = element("a", "group-link"), chip = element("span", "chip");
  header.append(link, chip);
  const quality = element("div"), main = element("div", "group-rate"), rate = element("strong");
  main.append(rate, element("span", "", "服务成功率")); quality.append(main);
  const updateQuality = statRows(quality, ["请求次数", "服务错误", "首字延迟 P50", "完成耗时 P95", "上游 429 / 529"]);
  const capacity = element("div"), capacityRow = createStatRow(), waitingRow = createStatRow();
  const track = element("div", "load-track"), bar = element("span"); track.append(bar);
  capacity.append(capacityRow.node, track, waitingRow.node);
  const poolRow = createStatRow(); node.append(header, quality, capacity, poolRow.node);
  return { node, update(group) {
    const q = group.quality.data, c = group.capacity.data, p = group.pool.data;
    writeText(link, group.label); setAttribute(link, "href", `/?scope=${group.scope}`);
    setAttribute(chip, "class", `chip ${tone(q?.rate)}`);
    writeText(chip, q ? q.requests > 0 ? "有请求样本" : "暂无样本" : statuses[group.quality.state]);
    setVisible(quality, group.quality.state !== "hidden"); writeText(rate, percent(q?.rate));
    updateQuality([compactNumber(q?.requests), compactNumber(q?.errors), duration(q?.latency.ttft), duration(q?.latency.p95), `${number(q?.upstream429)} / ${number(q?.upstream529)}`]);
    setVisible(capacity, group.capacity.state !== "hidden");
    capacityRow.update({ label: "并发占用", value: c ? `${number(c.used)} / ${number(c.max)}` : statuses[group.capacity.state] });
    setStyle(bar, "width", `${Math.min(100, c?.percent || 0)}%`);
    waitingRow.update({ label: "排队数", value: number(c?.waiting) });
    setVisible(poolRow.node, group.pool.state !== "hidden");
    poolRow.update({ label: "号池可用率", value: p ? percent(p.percent) : statuses[group.pool.state] });
  } };
}

export function createModelCard() {
  const node = element("article", "panel group-card");
  const header = element("div", "card-heading"), name = element("h3"), platform = element("span", "chip");
  header.append(name, platform); node.append(header);
  const updateCommon = statRows(node, ["请求次数", "请求成功率", "完成耗时 P50", "完成耗时 P95"]);
  const textStats = element("div");
  const updateText = statRows(textStats, ["首字延迟 P50", "Token 用量", "缓存占比"]);
  const note = element("p", "panel-note", "按模型统计请求，次数不等于生成张数。"); node.append(textStats, note);
  return { node, update({ model, image }) {
    writeText(name, model.model); writeText(platform, model.platform);
    updateCommon([compactNumber(model.requests), percent(model.rate), duration(model.latency.p50), duration(model.latency.p95)]);
    updateText([duration(model.latency.ttft), compactNumber(model.tokens), percent(model.cacheRate)]);
    setVisible(textStats, !image); setVisible(note, image);
  } };
}
