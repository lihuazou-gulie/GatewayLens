import { setText, show } from "../ui/dom.js";
import { resolveSiteCopy } from "../data/site-copy.js";

const fields = [
  ["title", "site-title"],
  ["overviewTitle", "overview-title"],
  ["overviewSubtitle", "overview-subtitle"],
];

export function renderSiteBranding(input) {
  const { title } = resolveSiteCopy(input);
  setText("settings-site-name", title);
  document.title = `面板设置 · ${title}`;
}

export function renderSiteCopy(input) {
  const copy = resolveSiteCopy(input);
  for (const [key, id] of fields) document.getElementById(id).value = copy[key];
  show("site-copy-section", true);
  renderSiteBranding(copy);
}

export function readSiteCopy() {
  return Object.fromEntries(fields.map(([key, id]) => [key, document.getElementById(id).value]));
}
