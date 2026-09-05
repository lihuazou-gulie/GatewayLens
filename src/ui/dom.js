export function element(tag, className = "", text = "") {
  const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
}
export function writeText(node, text) {
  const value = String(text ?? "—");
  if (node.textContent !== value) node.textContent = value;
}
export function setText(id, text) { const node = document.getElementById(id); if (node) writeText(node, text); }
export function setVisible(node, visible) { if (node.hidden !== !visible) node.hidden = !visible; }
export function show(id, visible) { setVisible(document.getElementById(id), visible); }
export function setAttribute(node, name, value) {
  const text = String(value);
  if (node.getAttribute(name) !== text) node.setAttribute(name, text);
}
export function setStyle(node, name, value) {
  if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value);
}
export function toggleClass(node, name, active) {
  if (node.classList.contains(name) !== Boolean(active)) node.classList.toggle(name, Boolean(active));
}
export function options(select, items, selected) {
  const signature = JSON.stringify(items);
  if (select.dataset.options !== signature) {
    select.replaceChildren(...items.map(([value, label]) => { const node = element("option", "", label); node.value = value; return node; })); select.dataset.options = signature;
  }
  if (select.value !== selected) select.value = selected;
}
