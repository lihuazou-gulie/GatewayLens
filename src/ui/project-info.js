import { setVisible, writeText } from "./dom.js";

export function renderProjectVersion(version) {
  const label = typeof version === "string" && version.trim() ? `v${version}` : "";
  for (const node of document.querySelectorAll("[data-project-version]")) {
    writeText(node, label);
    setVisible(node, Boolean(label));
  }
}
