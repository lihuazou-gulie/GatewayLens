import { KanbanApi } from "../api/client.js";
import { renderAuth, renderSettings, readDisplay, readProbe } from "./render.js";
import { statuses } from "../data/statuses.js";
import { initTheme } from "../ui/theme.js";
import { initFarmScenery } from "../ui/farm-scenery.js";
initTheme();
initFarmScenery();
const api = new KanbanApi();
let status;
let settings;
function message(text, error = false) {
  const box = document.getElementById("settings-message");
  box.hidden = !text;
  box.textContent = text;
  box.classList.toggle("error", error);
}
async function loadSettings() {
  settings = await api.request("admin/settings");
  renderSettings(settings, [], null);
  if (settings.connection) {
    document.getElementById("display-section").hidden = true;
    const catalog = await api.request("admin/catalog");
    const probe = await api.request("admin/probe");
    renderSettings(settings, catalog.groups, probe);
  }
}
async function loadStatus() {
  status = await api.request("bootstrap");
  renderAuth(status);
  if (status.authenticated) await loadSettings();
}
async function run(element, task) {
  const buttons = [
    ...element.querySelectorAll("button"),
    ...(element.matches("button") ? [element] : []),
  ];
  buttons.forEach((b) => (b.disabled = true));
  message("");
  try {
    await task();
  } catch (e) {
    message(e.message, true);
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}
function submit(id, task) {
  const form = document.getElementById(id);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void run(form, task);
  });
}
submit("auth-form", async () => {
  await api.request(status.initialized ? "login" : "setup", {
    method: "POST",
    body: {
      code: document.getElementById("setup-code").value,
      password: document.getElementById("admin-password").value,
    },
  });
  document.getElementById("auth-form").reset();
  await loadStatus();
});
function connectionBody() {
  return {
    site: document.getElementById("site-url").value,
    apiKey: document.getElementById("site-key").value,
    revision: settings.revision,
  };
}
document.getElementById("test-connection").addEventListener(
  "click",
  (event) =>
    void run(event.target, async () => {
      const result = await api.request("admin/connection/test", {
        method: "POST",
        body: connectionBody(),
      });
      document.getElementById("connection-result").textContent =
        `连接成功 · ${result.groups.length} 个分组 · 实时监控：${statuses[result.capabilities.realtime]} · 模型统计：${statuses[result.capabilities.models]}`;
    }),
);
submit("connection-form", async () => {
  await api.request("admin/connection", { method: "POST", body: connectionBody() });
  document.getElementById("site-key").value = "";
  await loadSettings();
  message("连接已保存，请选择监控分组和展示模块。");
});
submit("display-form", async () => {
  await api.request("admin/display", {
    method: "PUT",
    body: { revision: settings.revision, display: readDisplay() },
  });
  await loadSettings();
  message(
    settings.display.public
      ? "展示设置已保存，游客现在可以直接打开面板，无需登录。"
      : "展示设置已保存，当前仅登录后的管理员可查看。",
  );
});
submit("probe-form", async () => {
  await api.request("admin/probe", {
    method: "PUT",
    body: {
      revision: settings.revision,
      probe: readProbe(),
      apiKey: document.getElementById("probe-key").value,
    },
  });
  document.getElementById("probe-key").value = "";
  await loadSettings();
  message("主动探测设置已保存。");
});
document.getElementById("run-probe").addEventListener(
  "click",
  (event) =>
    void run(event.target, async () => {
      const result = await api.request("admin/probe/run", { method: "POST", body: {} });
      await loadSettings();
      message(
        result.status === "ok"
          ? `探测成功 · ${result.latencyMs} ms`
          : `探测失败 · ${result.reason}`,
        result.status !== "ok",
      );
    }),
);
submit("password-form", async () => {
  await api.request("admin/password", {
    method: "POST",
    body: {
      currentPassword: document.getElementById("current-password").value,
      password: document.getElementById("new-password").value,
    },
  });
  document.getElementById("password-form").reset();
  await loadSettings();
  message("管理密码已更新，其他登录会话已退出。");
});
document.getElementById("reload-groups").addEventListener(
  "click",
  (event) =>
    void run(event.target, async () => {
      await loadSettings();
      message("分组已重新读取。");
    }),
);
document.getElementById("logout").addEventListener(
  "click",
  (event) =>
    void run(event.target, async () => {
      await api.request("logout", { method: "POST", body: {} });
      await loadStatus();
    }),
);
try {
  await loadStatus();
} catch (e) {
  message(e.message, true);
}
