// A decorative local-time cycle; no location, weather, or astronomy service is needed.
const stops = [
  [0, "night", ["#101a35", "#253653", "#56677c", "#52627c", "#394860", "#34475c", "#293e49"], 0, 1],
  [
    5,
    "night",
    ["#182441", "#4b5776", "#a29198", "#a6a0b4", "#666e8b", "#56667a", "#405a60"],
    0.12,
    0.7,
  ],
  [
    6,
    "dawn",
    ["#696eaa", "#e5a5a4", "#ffdcaa", "#ffe4d0", "#c49db8", "#858299", "#607c79"],
    0.4,
    0.1,
  ],
  [8, "day", ["#398bd3", "#77c9eb", "#c7ecdf", "#fff9e8", "#a9d7e4", "#85b7b6", "#5c9a88"], 1, 0],
  [12, "day", ["#298fda", "#72c9ef", "#c1eddf", "#fffdf2", "#a8d6e7", "#7eb9b0", "#519c7d"], 1, 0],
  [
    16,
    "day",
    ["#598fc2", "#a2c9d9", "#f6dcaf", "#fff0d4", "#bfd0d8", "#92b5ab", "#6c9a7a"],
    0.95,
    0,
  ],
  [
    18,
    "sunset",
    ["#6a598e", "#df8b92", "#ffca8a", "#ffd5bb", "#b588a5", "#827c96", "#596f76"],
    0.35,
    0.08,
  ],
  [
    19.5,
    "dusk",
    ["#242c54", "#595579", "#bd8699", "#ad9aad", "#6b6587", "#545b79", "#3b5262"],
    0.05,
    0.65,
  ],
  [
    21,
    "night",
    ["#101a35", "#253653", "#56677c", "#52627c", "#394860", "#34475c", "#293e49"],
    0,
    1,
  ],
  [
    24,
    "night",
    ["#101a35", "#253653", "#56677c", "#52627c", "#394860", "#34475c", "#293e49"],
    0,
    1,
  ],
];
const names = ["top", "middle", "horizon", "cloud-light", "cloud-shadow", "hill-far", "hill-near"];
const clamp = (value) => Math.max(0, Math.min(1, value));
const wrap = (hour) => ((hour % 24) + 24) % 24;
const smooth = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;

function color(a, b, t) {
  const channel = (hex, index) => parseInt(hex.slice(index, index + 2), 16);
  return `rgb(${[1, 3, 5].map((i) => Math.round(mix(channel(a, i), channel(b, i), t))).join(" ")})`;
}

function orbit(hour, rise) {
  const age = wrap(hour - rise + 1) - 1;
  const progress = clamp(age / 12);
  return {
    x: mix(6, 94, progress),
    y: 70 - 48 * Math.sin(progress * Math.PI),
    opacity: smooth(age + 0.5) * (1 - smooth(age - 11.5)),
  };
}

export function localHour(date = new Date()) {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

export function skyAtHour(value) {
  if (!Number.isFinite(value)) throw new TypeError("Sky hour must be finite");
  const hour = wrap(value);
  const index = stops.findIndex((stop) => stop[0] > hour);
  const start = stops[index - 1],
    end = stops[index];
  const t = smooth((hour - start[0]) / (end[0] - start[0]));
  const daylight = mix(start[3], end[3], t);
  return {
    hour,
    phase: start[1],
    colors: Object.fromEntries(names.map((name, i) => [name, color(start[2][i], end[2][i], t)])),
    daylight,
    stars: mix(start[4], end[4], t),
    windowLight: 1 - daylight,
    sun: orbit(hour, 6),
    moon: orbit(hour, 18),
  };
}
