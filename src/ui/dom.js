export function element(tag, className = "", text = "") {
  const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
}
export function setText(id, text) { const node = document.getElementById(id); if (node) node.textContent = text ?? "—"; }
export function show(id, visible) { document.getElementById(id).hidden = !visible; }
export function options(select, items, selected) {
  const signature = JSON.stringify(items);
  if (select.dataset.options !== signature) {
    select.replaceChildren(...items.map(([value, label]) => { const node = element("option", "", label); node.value = value; return node; })); select.dataset.options = signature;
  }
  select.value = selected;
}
