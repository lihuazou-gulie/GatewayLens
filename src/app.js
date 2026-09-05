import { KanbanApi } from "./api/client.js";
import { createStore } from "./core/store.js";
import { Poller } from "./core/poller.js";
import { initAmbientEffects } from "./ui/effects.js";
import { createMonitorRenderer } from "./monitor/render.js";
const api = new KanbanApi(); const params = new URLSearchParams(location.search);
const store = createStore({ view: location.pathname === "/models" ? "models" : location.pathname === "/groups" ? "groups" : "overview",
  range: params.get("range") || "24h", scope: params.get("scope") || "all", topic: params.get("topic") || "", model: "", knownModels: [], data: null, error: "", loading: true, admin: false });
let sequence = 0;
async function refresh() {
  const id = ++sequence; store.set({ loading: true, error: "" });
  const state = store.get();
  try {
    const data = await api.request("monitor", { query: { range: state.range, scope: state.scope, topic: state.topic, model: state.model } });
    if (id !== sequence) return;
    const names = state.model ? state.knownModels : [...new Set((data.models?.data?.rows || []).map((m) => m.model))];
    store.set({ data, knownModels: names, loading: false, authRequired: false });
  } catch (e) {
    if (id === sequence) store.set({ loading: false, error: e.message, authRequired: e.status === 401,
      ...(e.status === 401 ? { data: null, admin: false, knownModels: [] } : {}) });
  }
}
const poller = new Poller({ intervalMs: 30000, tick: () => document.visibilityState === "hidden" ? Promise.resolve() : refresh() });
const render = createMonitorRenderer();
store.subscribe(render); render(store.get()); initAmbientEffects();
document.getElementById("refresh-button").addEventListener("click", () => void poller.trigger());
document.querySelectorAll("[data-range]").forEach((button) => button.addEventListener("click", () => { store.set({ range: button.dataset.range }); void refresh(); }));
for (const [id, key] of [["scope-select", "scope"], ["topic-select", "topic"], ["model-select", "model"]]) {
  document.getElementById(id).addEventListener("change", (event) => { store.set({ [key]: event.target.value, ...(key === "topic" ? { model: "", knownModels: [] } : {}) }); void refresh(); });
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void poller.trigger(); });
try {
  const status = await api.request("bootstrap");
  if (!status.initialized) location.replace("/settings"); else { store.set({ admin: status.authenticated }); poller.start(); }
} catch (e) { store.set({ loading: false, error: e.message }); }
