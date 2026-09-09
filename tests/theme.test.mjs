import test from "node:test";
import assert from "node:assert/strict";

const storage = new Map();
const choices = [{ value: "default", checked: false }, { value: "stardew", checked: false }];
const events = [];
globalThis.window = {
  localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  dispatchEvent: (event) => events.push(["window", event.detail]),
  CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
};
globalThis.CustomEvent = window.CustomEvent;
globalThis.document = {
  documentElement: { dataset: {} },
  querySelectorAll: () => choices,
  dispatchEvent: (event) => events.push(["document", event.detail]),
};

const { applyTheme, getTheme } = await import("../src/ui/theme.js");

test("theme preference persists, updates controls, and rejects unknown themes", () => {
  assert.equal(getTheme(), "default");
  assert.equal(applyTheme("stardew"), "stardew");
  assert.equal(document.documentElement.dataset.theme, "stardew");
  assert.equal(storage.get("kanban-theme"), "stardew");
  assert.equal(choices[1].checked, true);
  assert.deepEqual(events, [["window", "stardew"], ["document", "stardew"]]);
  events.length = 0;
  assert.equal(applyTheme("unknown"), "default");
  assert.equal(document.documentElement.dataset.theme, "default");
  assert.equal(choices[0].checked, true);
});
