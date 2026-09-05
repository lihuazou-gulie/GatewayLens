import { element, show, setText } from "../ui/dom.js";
const moduleLabels = { quality: "服务质量", traffic: "调用趋势", capacity: "并发容量", pool: "号池可用性", models: "模型专题" };
export function renderAuth(status) {
  show("auth-section", !status.authenticated); show("admin-section", status.authenticated); show("logout", status.authenticated);
  show("setup-code-field", !status.initialized); document.getElementById("setup-code").required = !status.initialized;
  setText("auth-title", status.initialized ? "登录管理后台" : "初始化面板");
  setText("auth-submit", status.initialized ? "登录" : "创建管理账户");
  setText("auth-step", status.initialized ? "ADMIN / SIGN IN" : "01 / INITIALIZE");
  setText("auth-description", status.initialized ? "输入面板的管理密码，维护连接与展示设置。" : "使用部署数据目录中的 setup-code 文件确认初始化权限，并设置面板自己的管理密码。");
  document.getElementById("admin-password").autocomplete = status.initialized ? "current-password" : "new-password";
}
export function renderSettings(settings, groups) {
  const d = settings.display;
  document.getElementById("site-url").value = settings.connection?.baseUrl || "";
  document.getElementById("site-key").value = "";
  setText("saved-connection", settings.connection ? "连接已保存" : "尚未连接");
  show("display-section", Boolean(settings.connection));
  document.getElementById("display-title").value = d.title;
  document.getElementById("image-models").value = d.imageModels.join("\n");
  document.getElementById("pool-threshold").value = d.poolThreshold;
  document.getElementById("public-display").checked = d.public;
  const order = [...d.groups.map((g) => g.id), ...groups.map((g) => g.id).filter((id) => !d.groups.some((g) => g.id === id))];
  const rows = order.map((id) => {
    const group = groups.find((g) => g.id === id); if (!group) return null;
    const selected = d.groups.find((g) => g.id === id); const row = element("div", "group-option"); row.dataset.id = String(id);
    const label = element("label", "checkbox-line"); const check = element("input"); check.type = "checkbox"; check.checked = Boolean(selected); check.dataset.group = "true";
    label.append(check, element("span", "", group.name), element("small", "chip", group.platform));
    const alias = element("input"); alias.value = selected?.label || group.name; alias.maxLength = 80; alias.setAttribute("aria-label", `${group.name} 展示名称`); alias.dataset.alias = "true";
    const up = element("button", "button small subtle", "↑"); up.type = "button"; up.setAttribute("aria-label", `${group.name} 上移`); up.addEventListener("click", () => { if (row.previousElementSibling) row.before(row.previousElementSibling); });
    row.append(label, alias, up); return row;
  }).filter(Boolean);
  document.getElementById("group-options").replaceChildren(...rows, ...(!rows.length ? [element("p", "field-note", "站点没有可用分组")] : []));
  document.getElementById("module-options").replaceChildren(...Object.entries(moduleLabels).map(([key, text]) => {
    const label = element("label", "checkbox-line"); const check = element("input"); check.type = "checkbox"; check.dataset.module = key; check.checked = d.modules[key]; label.append(check, element("span", "", text)); return label;
  }));
}
export function readDisplay() {
  return { title: document.getElementById("display-title").value, public: document.getElementById("public-display").checked,
    imageModels: document.getElementById("image-models").value.split("\n").map((v) => v.trim()).filter(Boolean), poolThreshold: Number(document.getElementById("pool-threshold").value),
    groups: [...document.querySelectorAll(".group-option")].filter((row) => row.querySelector("[data-group]").checked).map((row) => ({ id: Number(row.dataset.id), label: row.querySelector("[data-alias]").value })),
    modules: Object.fromEntries([...document.querySelectorAll("[data-module]")].map((c) => [c.dataset.module, c.checked])) };
}
