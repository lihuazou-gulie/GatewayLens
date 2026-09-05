import { createMonitorRenderer } from "/src/monitor/render.js";
const result = document.getElementById("render-test-result");
const passed = [];
function assert(condition, message) { if (!condition) throw new Error(message); }
const query = (selector) => document.querySelector(selector);
const roots = ["metrics", "group-grid", "model-grid", "pool-content", "system-grid", "trend-chart"];
const allNodes = () => roots.flatMap((id) => [...document.getElementById(id).querySelectorAll("*")]);
const sameNodes = (before) => { const after = allNodes(); return before.length === after.length && before.every((node, i) => node === after[i]); };
const observer = new MutationObserver(() => {});
try {
  const data = await (await fetch("/snapshot")).json();
  const render = createMonitorRenderer();
  let state = { view: "overview", range: "24h", scope: "all", topic: "", model: "", knownModels: data.models.data.rows.map((m) => m.model), data, loading: false, error: "", admin: true };
  render(state);
  const originalNodes = allNodes();
  const qualityCard = query("#metrics .metric-card"), needle = qualityCard.querySelector(".gpt-gauge-needle");
  const gauge = qualityCard.querySelector(".gpt-gauge"), trafficBar = query(".chart-bar"), previousHeight = trafficBar.getAttribute("height");
  const link = query("#group-grid a"); link.focus();
  observer.observe(document.body, { childList: true, attributes: true, characterData: true, subtree: true });
  render({ ...state, data: structuredClone(data) });
  assert(observer.takeRecords().length === 0, "Equal snapshots must produce zero DOM mutations");
  assert(sameNodes(originalNodes), "Equal snapshots replaced existing nodes");
  passed.push("相同快照：零 DOM 变更");

  render({ ...state, loading: true });
  const loadingChanges = observer.takeRecords();
  assert(!loadingChanges.some((change) => roots.some((id) => document.getElementById(id).contains(change.target))), "Loading touched monitoring content");
  assert(sameNodes(originalNodes) && document.activeElement === link, "Loading replaced nodes or lost focus");
  render(state); observer.takeRecords();
  passed.push("请求开始：保留卡片、图表与焦点");

  const next = structuredClone(data);
  next.summary.quality.rate = 91; next.groups[0].quality.data.rate = 91;
  next.summary.capacity.percent += 5; next.groups[0].capacity.data.percent += 5;
  next.models.data.rows[0].requests += 1; next.system.data.cpu += 1;
  next.traffic[0].requests += 10;
  next.generatedAt = new Date(Date.parse(next.generatedAt) + 30000).toISOString();
  state = { ...state, data: next }; render(state);
  assert(sameNodes(originalNodes), "Changed values recreated a card, stat row, gauge or chart node");
  assert(document.activeElement === link, "Data refresh lost keyboard focus");
  assert(qualityCard.querySelector(".metric-value").textContent === "91.0%", "Metric value did not update");
  assert(qualityCard.querySelector(".gpt-gauge-needle") === needle && Math.abs(parseFloat(gauge.style.getPropertyValue("--gauge-angle")) - 73.8) < 0.01, "Gauge did not update in place");
  assert(trafficBar.getAttribute("height") !== previousHeight, "Traffic geometry did not update");
  observer.takeRecords(); render({ ...state, data: structuredClone(next) });
  assert(observer.takeRecords().length === 0, "Repeated new snapshot caused redundant mutations");
  passed.push("数据变化：仅更新数值、指针和图表属性");

  const groups = [...document.getElementById("group-grid").children];
  next.groups.reverse(); render(state);
  assert([...document.getElementById("group-grid").children].every((node, i) => node === groups[groups.length - 1 - i]), "Reordering rebuilt group cards");
  next.groups.pop(); next.groups.push({ ...structuredClone(next.groups[0]), scope: "new-group", label: "新增分组" }); render(state);
  assert(!groups[0].isConnected && groups[1].isConnected && groups[2].isConnected, "Membership change replaced unaffected groups");
  passed.push("分组变化：只增删或移动对应卡片");

  const quality = next.summary.quality;
  next.summary.quality = null; render(state);
  assert(query("#metrics .metric-card") === qualityCard && gauge.hidden, "Unavailable data recreated the metric");
  assert(!qualityCard.querySelector(".metric-body").classList.contains("has-gauge"), "Unavailable metric kept gauge positioning");
  next.summary.quality = quality; render(state);
  assert(!gauge.hidden && qualityCard.querySelector(".gpt-gauge-needle") === needle, "Recovery recreated the gauge");
  next.modules.capacity = false; render(state);
  assert(document.getElementById("metrics").children.length === 3 && qualityCard.isConnected, "Module toggle rebuilt unrelated metrics");
  next.modules.capacity = true; render(state);
  passed.push("模块与可用状态切换：保留无关节点");

  state = { ...state, view: "models" }; render(state);
  const modelCard = query("#model-grid .group-card");
  next.models.data.rows.push({ ...structuredClone(next.models.data.rows[0]), platform: "another-platform" }); render(state);
  assert(query("#model-grid .group-card") === modelCard && document.getElementById("model-grid").children.length === 5, "Models with the same name collided across platforms");
  state = { ...state, topic: "images" }; render(state);
  assert(query("#model-grid .group-card") === modelCard, "Topic change rebuilt retained models");
  next.models.data.rows = []; render(state);
  assert(document.getElementById("model-grid").children.length === 1 && query("#model-grid .empty-panel"), "Empty model state was not reconciled");
  passed.push("模型专题：稳定标识、同名平台和空状态");

  const beforeError = allNodes();
  render({ ...state, error: "模拟网络失败" });
  assert(sameNodes(beforeError) && document.getElementById("notice").textContent.includes("保留上次成功快照"), "Failed refresh discarded existing content");
  passed.push("请求失败：保留上次成功快照");

  render({ ...state, data: null, admin: false, authRequired: true, knownModels: [], error: "请登录" });
  assert(roots.every((id) => document.getElementById(id).children.length === 0), "Authentication loss retained private monitoring nodes");
  assert(!qualityCard.isConnected && !needle.isConnected, "Authentication loss retained stale references in the DOM");
  assert(document.getElementById("scope-select").options.length === 1 && document.getElementById("model-select").options.length === 1, "Authentication loss retained private selectors");
  render({ ...state, view: "overview", topic: "", data });
  assert(query("#metrics .metric-card") !== qualityCard, "Authentication reset reused discarded content");
  passed.push("登录失效：清除全部旧数据并可重新载入");
  observer.disconnect();
  result.dataset.status = "passed";
  result.textContent = `PASS · ${passed.length} 项浏览器回归测试\n${passed.join("\n")}`;
} catch (error) {
  observer.disconnect(); result.dataset.status = "failed";
  result.textContent = `FAIL · ${error.message}\n已通过：${passed.join(" / ")}`;
  console.error(error);
}
