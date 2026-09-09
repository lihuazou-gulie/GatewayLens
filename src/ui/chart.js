import { compactNumber, percent, rangeLabel } from "./formatters.js";
import { setAttribute, writeText } from "./dom.js";
import { currentTheme } from "./theme.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const CHART_WIDTH = 920;
const CHART_HEIGHT = 300;
const MARGIN = { top: 16, right: 26, bottom: 38, left: 48 };
const GRID_STEPS = [0, 0.25, 0.5, 0.75, 1];
const chartStates = new WeakMap();
const chartRoots = new Set();

export function clearTrendChart(svg) {
  chartStates.delete(svg);
  svg.replaceChildren();
}

function node(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function bucketKey(bucket, index, range) {
  return String(bucket?.started_at || `${range}:${index}`);
}

function setEntering(element, delay = 0) {
  element.style.animationDelay = `${delay}ms`;
  element.classList.add("is-entering");
  element.addEventListener("animationend", () => element.classList.remove("is-entering"), { once: true });
}

function restartEntering(element, delay = 0) {
  element.classList.remove("is-entering");
  // Force a single intentional replay when the user explicitly changes range.
  void element.getBoundingClientRect();
  setEntering(element, delay);
}

function createChartState(svg) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const defs = node("defs");
  const gradient = node("linearGradient", { id: "bar-gradient", x1: "0", y1: "0", x2: "0", y2: "1" });
  const theme = currentTheme();
  const start = node("stop", { offset: "0%", "stop-color": theme.chart.gradientStart, "stop-opacity": theme.chart.opacityStart, "data-theme-stop": "start" });
  const end = node("stop", { offset: "100%", "stop-color": theme.chart.gradientEnd, "stop-opacity": theme.chart.opacityEnd, "data-theme-stop": "end" });
  gradient.append(start, end);
  defs.append(gradient);
  svg.append(defs);

  const grid = node("g", { "data-layer": "grid" });
  const gridLabels = GRID_STEPS.map(() => node("text", { class: "chart-axis-label", "text-anchor": "end" }));
  GRID_STEPS.forEach((step, index) => {
    grid.append(node("line", { class: "chart-grid-line", "data-grid-step": step }));
    grid.append(gridLabels[index]);
  });
  svg.append(grid);

  const bars = node("g", { "data-layer": "bars" });
  const labels = node("g", { "data-layer": "labels" });
  const line = node("path", { class: "chart-line", "data-layer": "line" });
  const dots = node("g", { "data-layer": "dots" });
  svg.append(bars, labels, line, dots);

  const state = {
    range: null,
    bars: new Map(),
    labels: new Map(),
    dots: new Map(),
    gridLabels,
    line,
    initialized: false,
    gradient,
  };
  chartStates.set(svg, state);
  chartRoots.add(svg);
  return state;
}

function getChartState(svg) {
  return chartStates.get(svg) || createChartState(svg);
}

function removeStale(elements, keys) {
  elements.forEach((element, key) => {
    if (keys.has(key)) return;
    if (element.rect) element.rect.remove();
    else element.remove();
    elements.delete(key);
  });
}

export function drawTrendChart(svg, buckets, range) {
  if (!svg) return;
  const state = getChartState(svg);
  const safeBuckets = Array.isArray(buckets) ? buckets : [];
  const signature = JSON.stringify([range, safeBuckets]);
  if (state.signature === signature) return;
  state.signature = signature;
  const rangeChanged = state.range !== null && state.range !== range;
  state.range = range;

  if (!safeBuckets.length) {
    state.bars.forEach(({ rect }) => rect.remove());
    state.labels.forEach((label) => label.remove());
    state.dots.forEach((dot) => dot.remove());
    state.bars.clear();
    state.labels.clear();
    state.dots.clear();
    setAttribute(state.line, "d", "");
    state.line.classList.remove("is-entering");
    state.initialized = false;
    return;
  }

  const plotWidth = CHART_WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
  const maxTotal = Math.max(1, ...safeBuckets.map((bucket) => Number(bucket.total) || 0));
  const barWidth = Math.max(4, Math.min(23, (plotWidth / safeBuckets.length) * 0.58));
  const visibleLabelStep = Math.max(1, Math.ceil(safeBuckets.length / 6));
  const activeKeys = new Set();
  const points = [];

  GRID_STEPS.forEach((step, index) => {
    const y = MARGIN.top + plotHeight - plotHeight * step;
    const gridLine = svg.querySelector(`[data-grid-step="${step}"]`);
    if (gridLine) {
      setAttribute(gridLine, "x1", MARGIN.left);
      setAttribute(gridLine, "x2", CHART_WIDTH - MARGIN.right);
      setAttribute(gridLine, "y1", y);
      setAttribute(gridLine, "y2", y);
    }
    const label = state.gridLabels[index];
    setAttribute(label, "x", MARGIN.left - 10);
    setAttribute(label, "y", y + 4);
    writeText(label, compactNumber(maxTotal * step));
  });

  safeBuckets.forEach((bucket, index) => {
    const key = bucketKey(bucket, index, range);
    activeKeys.add(key);
    const x = MARGIN.left + (plotWidth * index) / Math.max(1, safeBuckets.length - 1);
    const total = Number(bucket.total) || 0;
    const barHeight = (total / maxTotal) * plotHeight;
    const y = MARGIN.top + plotHeight - barHeight;
    let entry = state.bars.get(key);
    if (!entry) {
      const rect = node("rect", { class: "chart-bar", rx: currentTheme().chart.radius });
      const title = node("title");
      rect.append(title);
      svg.querySelector('[data-layer="bars"]').append(rect);
      entry = { rect, title };
      state.bars.set(key, entry);
      setEntering(rect, Math.min(index * 18, 420));
    } else if (rangeChanged) {
      restartEntering(entry.rect, Math.min(index * 18, 420));
    }
    setAttribute(entry.rect, "x", x - barWidth / 2);
    setAttribute(entry.rect, "y", y);
    setAttribute(entry.rect, "width", barWidth);
    setAttribute(entry.rect, "height", Math.max(2, barHeight));
    setAttribute(entry.rect, "opacity", total ? 0.86 : 0.22);
    writeText(entry.title, `${rangeLabel(bucket.started_at, range)} · ${compactNumber(total)} 请求${bucket.success_rate == null ? "" : ` · ${percent(bucket.success_rate)}`}`);

    const rate = bucket.success_rate == null ? null : Number(bucket.success_rate);
    const point = rate !== null && Number.isFinite(rate) ? { key, x, y: MARGIN.top + plotHeight - (rate / 100) * plotHeight } : null;
    points.push(point);

    const shouldLabel = index === 0 || index === safeBuckets.length - 1 || index % visibleLabelStep === 0;
    const oldLabel = state.labels.get(key);
    if (shouldLabel) {
      const label = oldLabel || node("text", { class: "chart-axis-label", "text-anchor": "middle" });
      setAttribute(label, "x", x);
      setAttribute(label, "y", CHART_HEIGHT - 12);
      writeText(label, rangeLabel(bucket.started_at, range));
      if (!oldLabel) svg.querySelector('[data-layer="labels"]').append(label);
      state.labels.set(key, label);
    } else if (oldLabel) {
      oldLabel.remove();
      state.labels.delete(key);
    }

    if (!point) { state.dots.get(key)?.remove(); state.dots.delete(key); return; }
    let dot = state.dots.get(key);
    if (!dot) {
      dot = node("circle", { class: "chart-dot", r: 2.8 });
      svg.querySelector('[data-layer="dots"]').append(dot);
      state.dots.set(key, dot);
      setEntering(dot, 760 + Math.min(index * 18, 420));
    } else if (rangeChanged) {
      restartEntering(dot, 760 + Math.min(index * 18, 420));
    }
    setAttribute(dot, "cx", point.x);
    setAttribute(dot, "cy", point.y);
  });

  removeStale(state.bars, activeKeys);
  removeStale(state.labels, activeKeys);
  removeStale(state.dots, activeKeys);

  let connected = false;
  setAttribute(state.line, "d", points.map((point) => { if (!point) { connected = false; return ""; } const command = connected ? "L" : "M"; connected = true; return `${command} ${point.x} ${point.y}`; }).join(" "));
  if (!state.initialized) {
    setEntering(state.line, 160);
  } else if (rangeChanged) {
    restartEntering(state.line, 160);
  } else {
    state.line.classList.remove("is-entering");
  }
  state.initialized = true;
}

document.addEventListener("kanban-theme-change", () => {
  const theme = currentTheme();
  chartRoots.forEach((svg) => {
    const state = chartStates.get(svg);
    if (!state) return;
    const start = state.gradient.querySelector('[data-theme-stop="start"]');
    const end = state.gradient.querySelector('[data-theme-stop="end"]');
    if (start) { setAttribute(start, "stop-color", theme.chart.gradientStart); setAttribute(start, "stop-opacity", theme.chart.opacityStart); }
    if (end) { setAttribute(end, "stop-color", theme.chart.gradientEnd); setAttribute(end, "stop-opacity", theme.chart.opacityEnd); }
    state.bars.forEach(({ rect }) => setAttribute(rect, "rx", theme.chart.radius));
  });
});
