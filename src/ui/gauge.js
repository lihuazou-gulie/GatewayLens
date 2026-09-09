import { finite } from "../data/numbers.js";
import { setAttribute, setStyle, toggleClass } from "./dom.js";
import { currentThemeId } from "./theme.js";

const CENTER_X = 110;
const CENTER_Y = 122;
const ARC_RADIUS = 86;
const TICK_COUNT = 40;
const gaugeValues = new WeakMap();
const gaugeRoots = new Set();

function pointAt(value, radius) {
  const angle = ((180 + value * 1.8) * Math.PI) / 180;
  return {
    x: CENTER_X + Math.cos(angle) * radius,
    y: CENTER_Y + Math.sin(angle) * radius,
  };
}

function tickMarkup(index) {
  const value = (index / TICK_COUNT) * 100;
  const major = index % 4 === 0;
  const outer = pointAt(value, 88);
  const inner = pointAt(value, major ? 76 : 81);
  return `<line class="gpt-gauge-tick${major ? " is-major" : ""}" data-tick-index="${index}" x1="${outer.x.toFixed(2)}" y1="${outer.y.toFixed(2)}" x2="${inner.x.toFixed(2)}" y2="${inner.y.toFixed(2)}"></line>`;
}

function labelMarkup(value, label) {
  const point = pointAt(value, 66);
  return `<text class="gpt-gauge-scale-label" data-scale-value="${value}" x="${point.x.toFixed(2)}" y="${(point.y + 3).toFixed(2)}" text-anchor="middle">${label}</text>`;
}

export function gaugeSvgMarkup() {
  const ticks = Array.from({ length: TICK_COUNT + 1 }, (_, index) => tickMarkup(index)).join("");
  const labels = [0, 25, 50, 75, 100].map((value) => labelMarkup(value, value)).join("");
  const stardew = currentThemeId() === "stardew";
  const variant = stardew ? " gpt-gauge-svg--stardew" : "";
  return `<svg class="gpt-gauge-svg${variant}" viewBox="${stardew ? "0 20 220 132" : "0 0 220 150"}" aria-hidden="true">
    <path class="gpt-gauge-track" d="M 24 122 A 86 86 0 0 1 196 122" pathLength="1"></path>
    <path class="gpt-gauge-progress" d="M 24 122 A 86 86 0 0 1 196 122" pathLength="1"></path>
    <g class="gpt-gauge-scale">${ticks}${labels}</g>
    <path class="gpt-gauge-sweep" d="M 24 122 A 86 86 0 0 1 196 122" pathLength="1"></path>
    <path class="gpt-gauge-season-mark" d="M 110 11 l 4 8 9 1-7 6 2 9-8-4-8 4 2-9-7-6 9-1z"></path>
    <circle class="gpt-gauge-point-glow" cx="24" cy="122" r="9"></circle>
    <circle class="gpt-gauge-point" cx="24" cy="122" r="4.5"></circle>
    <line class="gpt-gauge-needle" x1="110" y1="122" x2="110" y2="53"></line>
    <path class="gpt-gauge-wood-needle" d="M 108 57 L 108 45 L 110 38 L 112 45 L 112 57 Z"></path>
    <circle class="gpt-gauge-hub" cx="110" cy="122" r="7"></circle>
  </svg>`;
}

export function updateGaugeVisual(card, value) {
  gaugeRoots.add(card);
  const svg = card.querySelector(".gpt-gauge-svg");
  if (svg) {
    const stardew = currentThemeId() === "stardew";
    svg.classList.toggle("gpt-gauge-svg--stardew", stardew);
    setAttribute(svg, "viewBox", stardew ? "0 20 220 132" : "0 0 220 150");
  }
  const normalized = Math.max(0, Math.min(100, finite(value, 0)));
  if (gaugeValues.get(card) === normalized) return;
  gaugeValues.set(card, normalized);
  setStyle(card, "--gauge-value", String(normalized / 100));
  setStyle(card, "--gauge-angle", `${-90 + normalized * 1.8}deg`);

  const point = pointAt(normalized, ARC_RADIUS);
  const glow = card.querySelector(".gpt-gauge-point-glow");
  const marker = card.querySelector(".gpt-gauge-point");
  [glow, marker].forEach((element) => {
    if (!element) return;
    setAttribute(element, "cx", point.x.toFixed(2));
    setAttribute(element, "cy", point.y.toFixed(2));
  });

  const activeIndex = Math.round((normalized / 100) * TICK_COUNT);
  card.querySelectorAll(".gpt-gauge-tick").forEach((tick) => {
    toggleClass(tick, "is-active", Number(tick.dataset.tickIndex) <= activeIndex);
  });
}

document.addEventListener("kanban-theme-change", () => {
  const stardew = currentThemeId() === "stardew";
  gaugeRoots.forEach((card) => {
    const svg = card.querySelector(".gpt-gauge-svg");
    if (!svg) return;
    svg.classList.toggle("gpt-gauge-svg--stardew", stardew);
    setAttribute(svg, "viewBox", stardew ? "0 20 220 132" : "0 0 220 150");
  });
});
