import { HttpError } from "../errors.mjs";
export const MODULES = ["quality", "traffic", "capacity", "pool", "models"];
export const DEFAULT_PROBE = Object.freeze({ enabled: false, intervalSeconds: 300, groupId: null, model: "", endpoint: "/v1/chat/completions" });
export const DEFAULT_DISPLAY = Object.freeze({ title: "Sub2API 监控", public: true, groups: [], imageModels: [],
  modules: Object.fromEntries(MODULES.map((key) => [key, true])), poolThreshold: 35 });
export function validateDisplay(input, catalog) {
  if (!input || typeof input !== "object") throw new HttpError(400, "设置格式无效");
  const title = String(input.title || "").trim();
  if (!title || title.length > 60) throw new HttpError(400, "面板名称需要 1–60 个字符");
  if (!Array.isArray(input.groups) || input.groups.length > 24) throw new HttpError(400, "最多选择 24 个分组");
  const allowed = new Set(catalog.map((g) => g.id)); const seen = new Set();
  const groups = input.groups.map((g) => {
    if (!Number.isSafeInteger(g.id) || !allowed.has(g.id) || seen.has(g.id)) throw new HttpError(400, "分组已变化，请重新读取分组");
    seen.add(g.id); const label = String(g.label || "").trim();
    if (!label || label.length > 80) throw new HttpError(400, "分组展示名称需要 1–80 个字符");
    return { id: g.id, label };
  });
  if (input.public && !groups.length) throw new HttpError(400, "公开面板前请选择分组");
  if (!Array.isArray(input.imageModels) || input.imageModels.length > 40) throw new HttpError(400, "图片模型设置无效");
  const imageModels = [...new Set(input.imageModels.map((name) => String(name).trim()).filter(Boolean))];
  if (imageModels.some((name) => name.length > 120 || /[\r\n,]/.test(name))) throw new HttpError(400, "请填写准确的模型名称，每行一个");
  const poolThreshold = Number(input.poolThreshold);
  if (!Number.isFinite(poolThreshold) || poolThreshold < 0 || poolThreshold > 100) throw new HttpError(400, "可用率阈值应在 0–100 之间");
  return { title, public: input.public === true, groups, imageModels, poolThreshold,
    modules: Object.fromEntries(MODULES.map((key) => [key, input.modules?.[key] === true])) };
}

export function validateProbe(input, catalog, selectedGroups = []) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "主动探测设置格式无效");
  const enabled = input.enabled === true;
  const intervalSeconds = Number(input.intervalSeconds);
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 30 || intervalSeconds > 86400) {
    throw new HttpError(400, "探测间隔应在 30 秒至 24 小时之间");
  }
  const rawGroupId = input.groupId === null || input.groupId === undefined || input.groupId === "" ? null : Number(input.groupId);
  const groupId = rawGroupId === null ? null : rawGroupId;
  if (groupId !== null && (!Number.isSafeInteger(groupId) || !catalog.some((group) => group.id === groupId))) {
    throw new HttpError(400, "探测分组已变化，请重新读取分组");
  }
  if (groupId !== null && !selectedGroups.some((group) => group.id === groupId)) {
    throw new HttpError(400, "探测分组必须是已展示的分组");
  }
  const model = String(input.model || "").trim();
  if (model.length > 120 || /[\r\n]/.test(model)) throw new HttpError(400, "探测模型名称无效");
  const endpoint = String(input.endpoint || "").trim();
  if (!/^\/(?:[^/?#]+\/)*[^/?#]+$/.test(endpoint) || endpoint.includes("..") || endpoint.length > 200) {
    throw new HttpError(400, "探测接口路径无效");
  }
  if (enabled && (groupId === null || !model)) throw new HttpError(400, "启用主动探测前请选择分组并填写模型");
  return { enabled, intervalSeconds, groupId, model, endpoint };
}
