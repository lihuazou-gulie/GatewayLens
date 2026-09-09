import { DomainError } from "../../../shared/domain/errors.mjs";
export const DEFAULT_PROBE = Object.freeze({
  enabled: false,
  intervalSeconds: 300,
  groupId: null,
  model: "",
  endpoint: "/v1/chat/completions",
});
export function validateProbe(input, catalog, selectedGroups = []) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new DomainError("validation", "主动探测设置格式无效");
  const enabled = input.enabled === true;
  const intervalSeconds = Number(input.intervalSeconds);
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 30 || intervalSeconds > 86400) {
    throw new DomainError("validation", "探测间隔应在 30 秒至 24 小时之间");
  }
  const rawGroupId =
    input.groupId === null || input.groupId === undefined || input.groupId === ""
      ? null
      : Number(input.groupId);
  const groupId = rawGroupId === null ? null : rawGroupId;
  if (
    groupId !== null &&
    (!Number.isSafeInteger(groupId) || !catalog.some((group) => group.id === groupId))
  ) {
    throw new DomainError("validation", "探测分组已变化，请重新读取分组");
  }
  if (groupId !== null && !selectedGroups.some((group) => group.id === groupId)) {
    throw new DomainError("validation", "探测分组必须是已展示的分组");
  }
  const model = String(input.model || "").trim();
  if (model.length > 120 || /[\r\n]/.test(model))
    throw new DomainError("validation", "探测模型名称无效");
  const endpoint = String(input.endpoint || "").trim();
  if (
    !/^\/(?:[^/?#]+\/)*[^/?#]+$/.test(endpoint) ||
    endpoint.includes("..") ||
    /\\|%2e|%2f|%5c/i.test(endpoint) ||
    endpoint.length > 200
  ) {
    throw new DomainError("validation", "探测接口路径无效");
  }
  if (enabled && (groupId === null || !model))
    throw new DomainError("validation", "启用主动探测前请选择分组并填写模型");
  return { enabled, intervalSeconds, groupId, model, endpoint };
}
