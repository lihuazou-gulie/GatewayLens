import { statuses } from "../data/statuses.js";
import {
  setText,
  show,
  element,
  options,
  writeText,
  setVisible,
  setAttribute,
  toggleClass,
} from "../ui/dom.js";
import { percent, timestamp } from "../ui/formatters.js";
import { createKeyedList } from "../ui/keyed-list.js";
import { drawTrendChart, clearTrendChart } from "../ui/chart.js";
import {
  createMetricCard,
  createGroupCard,
  createModelCard,
  createStatRow,
  createNote,
} from "./cards.js";
import { summaryMetrics, poolRows, systemMetrics } from "./metrics.js";
import { renderHeadings } from "./headings.js";

export function createMonitorRenderer() {
  const list = (id, key, create) => createKeyedList(document.getElementById(id), key, create);
  const byKey = (item) => item.key;
  const metrics = list("metrics", byKey, createMetricCard);
  const groups = list("group-grid", (group) => group.scope, createGroupCard);
  const models = list("model-grid", byKey, (item) =>
    item.model ? createModelCard() : createNote("empty-panel"),
  );
  const pool = list("pool-content", byKey, (item) =>
    item.key === "note" ? createNote() : createStatRow(),
  );
  const system = list("system-grid", byKey, (item) =>
    item.key === "note" ? createNote() : createMetricCard(),
  );
  const chart = document.getElementById("trend-chart");
  const notice = document.getElementById("notice"),
    noticeText = element("span"),
    settingsLink = element("a", "inline-link", "前往面板设置 →");
  settingsLink.href = "/settings";
  notice.append(noticeText, settingsLink);

  return function render(state) {
    const { data, error, view, loading } = state;
    const modelsView = view === "models";
    document
      .querySelectorAll("[data-view]")
      .forEach((node) =>
        setAttribute(node, "aria-current", node.dataset.view === view ? "page" : "false"),
      );
    document
      .querySelectorAll("[data-range]")
      .forEach((node) => setAttribute(node, "aria-pressed", node.dataset.range === state.range));
    show("topic-field", modelsView);
    show("model-field", modelsView);
    show("model-section", modelsView);
    show("groups-heading", !modelsView);
    show("group-grid", !modelsView);
    show("overview-panels", view === "overview");
    renderHeadings(state);
    setVisible(
      notice,
      Boolean(error) || data?.state === "unconfigured" || data?.state === "partial",
    );
    writeText(
      noticeText,
      error
        ? `${error}${data ? " · 下方保留上次成功快照" : ""}`
        : data?.state === "unconfigured"
          ? "还没有配置监控分组，请到面板设置完成接入。"
          : data?.state === "partial"
            ? "部分指标不可用，各模块已分别标记状态。"
            : "",
    );
    setVisible(settingsLink, state.authRequired || data?.state === "unconfigured");
    setText(
      "connection-status",
      error
        ? "同步中断"
        : loading
          ? "正在同步"
          : data?.state === "unconfigured"
            ? "等待配置"
            : data?.state === "partial"
              ? "部分数据可用"
              : "已连接 · 自动同步",
    );
    setAttribute(
      document.getElementById("status-dot"),
      "data-state",
      error ? "error" : loading ? "loading" : data?.state || "",
    );
    const refresh = document.getElementById("refresh-button");
    if (refresh.disabled !== loading) refresh.disabled = loading;
    if (!data || data.state === "unconfigured") {
      for (const id of [
        "metrics",
        "overview-panels",
        "groups-heading",
        "group-grid",
        "model-section",
        "system-section",
        "pool-health-alert",
      ])
        show(id, false);
      for (const list of [metrics, groups, models, pool, system]) list.clear();
      clearTrendChart(chart);
      toggleClass(document.body, "pool-health-critical", false);
      setText("updated-at", "等待可用的数据快照");
      options(document.getElementById("scope-select"), [["all", "全部已选分组"]], "all");
      options(document.getElementById("model-select"), [["", "全部"]], "");
      return;
    }
    setText("updated-at", `快照 ${timestamp(data.generatedAt)}`);
    options(
      document.getElementById("scope-select"),
      [["all", "全部已选分组"], ...(data.scopes || data.groups).map((g) => [g.scope, g.label])],
      state.scope,
    );
    options(
      document.getElementById("model-select"),
      [["", "全部"], ...state.knownModels.map((m) => [m, m])],
      state.model,
    );
    const topic = document.getElementById("topic-select");
    if (topic.value !== state.topic) topic.value = state.topic;
    const items = summaryMetrics(data, modelsView),
      p = data.summary.pool;
    show("metrics", (!modelsView || state.topic === "images") && items.length > 0);
    metrics.update(items);
    const critical =
      !error &&
      p?.percent !== null &&
      p?.percent !== undefined &&
      !p.partial &&
      p.percent < data.poolThreshold;
    show("pool-health-alert", critical);
    toggleClass(document.body, "pool-health-critical", critical);
    setText(
      "pool-alert-copy",
      `当前可用率 ${percent(p?.percent)}，低于 ${data.poolThreshold}% 阈值。`,
    );
    show("traffic-panel", data.modules.traffic);
    show("pool-panel", data.modules.pool);
    drawTrendChart(
      chart,
      data.traffic.map((p) => ({ started_at: p.at, total: p.requests, success_rate: null })),
      state.range,
    );
    setText(
      "trend-note",
      data.traffic.length
        ? "请求量为上游统计口径，包含业务限制；与上方服务请求口径不同。"
        : "暂无趋势数据，或上游未提供趋势接口。",
    );
    pool.update(poolRows(p));
    setText("group-count", `${data.groups.length} 个分组`);
    groups.update(data.groups);
    const rows = data.models?.data?.rows || [],
      image = state.topic === "images";
    setText("models-title", image ? "图片模型表现" : "模型表现");
    setText("model-count", `${rows.length} 个模型`);
    const cover = data.models?.data?.coverage;
    setText(
      "model-note",
      data.models.state !== "ok"
        ? data.models.state === "unconfigured"
          ? "请先在设置中填写图片模型名称。"
          : `${statuses[data.models.state]}。模型专题需要 Sub2API 提供并启用渠道监控 V2。`
        : `${cover?.complete ? "所选历史范围已覆盖" : "历史数据尚未覆盖完整范围"} · 数据截至 ${timestamp(cover?.through)} · 成功率使用渠道监控的错误排除规则。`,
    );
    models.update(
      rows.length
        ? rows.map((model) => ({
            key: JSON.stringify([model.platform, model.model]),
            model,
            image,
          }))
        : [
            {
              key: "empty",
              text: data.models.state === "ok" ? "所选范围暂无模型请求样本" : "等待可用的模型统计",
            },
          ],
    );
    show("system-section", state.admin && view === "overview");
    system.update(state.admin ? systemMetrics(data.system?.data) : []);
  };
}
