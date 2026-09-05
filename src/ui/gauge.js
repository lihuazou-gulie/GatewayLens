import { finite } from "../data/numbers.js";

const CENTER_X = 110;
const CENTER_Y = 122;
const ARC_RADIUS = 86;
const TICK_COUNT = 40;

function pointAt(value, radius) {
  const angle = (180 + value * 1.8) * Math.PI / 180;
  return {
    x: CENTER_X + Math.cos(angle) * radius,
    y: CENTER_Y + Math.sin(angle) * radius,
  };
}

function tickMarkup(index) {
  const value = index / TICK_COUNT * 100;
  const major = index % 4 === 0;
  const outer = pointAt(value, 88);
  const inner = pointAt(value, major ? 76 : 81);
  return `<line class="gpt-gauge-tick${major ? " is-major" : ""}" data-tick-index="${index}" x1="${outer.x.toFixed(2)}" y1="${outer.y.toFixed(2)}" x2="${inner.x.toFixed(2)}" y2="${inner.y.toFixed(2)}"></line>`;
}

function labelMarkup(value, label) {
  const point = pointAt(value, 66);
  return `<text class="gpt-gauge-scale-label" x="${point.x.toFixed(2)}" y="${(point.y + 3).toFixed(2)}" text-anchor="middle">${label}</text>`;
}

export function gaugeSvgMarkup() {
  const ticks = Array.from({ length: TICK_COUNT + 1 }, (_, index) => tickMarkup(index)).join("");
  const labels = [0, 25, 50, 75, 100].map((value) => labelMarkup(value, value)).join("");
  return `<svg class="gpt-gauge-svg" viewBox="0 0 220 150" aria-hidden="true">
    <path class="gpt-gauge-track" d="M 24 122 A 86 86 0 0 1 196 122" pathLength="1"></path>
    <path class="gpt-gauge-progress" d="M 24 122 A 86 86 0 0 1 196 122" pathLength="1"></path>
    <g class="gpt-gauge-scale">${ticks}${labels}</g>
    <path class="gpt-gauge-sweep" d="M 24 122 A 86 86 0 0 1 196 122" pathLength="1"></path>
    <circle class="gpt-gauge-point-glow" cx="24" cy="122" r="9"></circle>
    <circle class="gpt-gauge-point" cx="24" cy="122" r="4.5"></circle>
    <line class="gpt-gauge-needle" x1="110" y1="122" x2="110" y2="53"></line>
    <circle class="gpt-gauge-hub" cx="110" cy="122" r="7"></circle>
  </svg>`;
}

export function updateGaugeVisual(card, value) {
  const normalized = Math.max(0, Math.min(100, finite(value, 0)));
  card.style.setProperty("--gauge-value", String(normalized / 100));
  card.style.setProperty("--gauge-angle", `${-90 + normalized * 1.8}deg`);

  const point = pointAt(normalized, ARC_RADIUS);
  const glow = card.querySelector(".gpt-gauge-point-glow");
  const marker = card.querySelector(".gpt-gauge-point");
  [glow, marker].forEach((element) => {
    if (!element) return;
    element.setAttribute("cx", point.x.toFixed(2));
    element.setAttribute("cy", point.y.toFixed(2));
  });

  const activeIndex = Math.round(normalized / 100 * TICK_COUNT);
  card.querySelectorAll(".gpt-gauge-tick").forEach((tick) => {
    tick.classList.toggle("is-active", Number(tick.dataset.tickIndex) <= activeIndex);
  });
}
