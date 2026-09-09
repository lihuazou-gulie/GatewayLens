const STORAGE_KEY = "kanban-theme";
const THEMES = new Set(["default", "stardew"]);
const DEFINITIONS = {
  default: { effects: { palette: ["#c7f36b", "#65e6b4", "#62dce7"], particleCount: 26, tilt: true }, chart: { gradientStart: "#62dce7", gradientEnd: "#2a7777", opacityStart: 0.82, opacityEnd: 0.1, radius: 3 } },
  stardew: { effects: { palette: ["#f4d56d", "#c8e49a", "#9fd1d0"], particleCount: 18, tilt: false }, chart: { gradientStart: "#64af50", gradientEnd: "#247443", opacityStart: 1, opacityEnd: 1, radius: 0 } },
};

export function getTheme() {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return THEMES.has(stored) ? stored : "default";
}

export function currentThemeId() { return document.documentElement.dataset.theme || getTheme(); }
export function currentTheme() { return DEFINITIONS[currentThemeId()] || DEFINITIONS.default; }

export function applyTheme(theme = getTheme()) {
  const next = THEMES.has(theme) ? theme : "default";
  document.documentElement.dataset.theme = next;
  window.localStorage.setItem(STORAGE_KEY, next);
  document.querySelectorAll("[data-theme-choice]").forEach((input) => { input.checked = input.value === next; });
  const event = new CustomEvent("kanban-theme-change", { detail: next });
  window.dispatchEvent(event);
  document.dispatchEvent(new CustomEvent("kanban-theme-change", { detail: next }));
  return next;
}

export function initTheme() {
  applyTheme();
  document.querySelectorAll("[data-theme-choice]").forEach((input) => input.addEventListener("change", () => { if (input.checked) applyTheme(input.value); }));
}
