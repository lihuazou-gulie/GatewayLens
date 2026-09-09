import { DomainError } from "../../../shared/domain/errors.mjs";
import { DEFAULT_SITE_COPY } from "./site-copy.mjs";
export const MODULES = ["quality", "traffic", "capacity", "pool", "models"];
export const DEFAULT_DISPLAY = Object.freeze({
  ...DEFAULT_SITE_COPY,
  public: true,
  groups: [],
  imageModels: [],
  modules: Object.fromEntries(MODULES.map((key) => [key, true])),
  poolThreshold: 35,
});
export function validateDisplay(input, catalog) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new DomainError("validation", "设置格式无效");
  if (!Array.isArray(input.groups) || input.groups.length > 24)
    throw new DomainError("validation", "最多选择 24 个分组");
  const allowed = new Set(catalog.map((g) => g.id));
  const seen = new Set();
  const groups = input.groups.map((g) => {
    if (!g || !Number.isSafeInteger(g.id) || !allowed.has(g.id) || seen.has(g.id))
      throw new DomainError("validation", "分组已变化，请重新读取分组");
    seen.add(g.id);
    const label = String(g.label || "").trim();
    if (!label || label.length > 80)
      throw new DomainError("validation", "分组展示名称需要 1–80 个字符");
    return { id: g.id, label };
  });
  if (input.public && !groups.length) throw new DomainError("validation", "公开面板前请选择分组");
  if (!Array.isArray(input.imageModels) || input.imageModels.length > 40)
    throw new DomainError("validation", "图片模型设置无效");
  const imageModels = [
    ...new Set(input.imageModels.map((name) => String(name).trim()).filter(Boolean)),
  ];
  if (imageModels.some((name) => name.length > 120 || /[\r\n,]/.test(name)))
    throw new DomainError("validation", "请填写准确的模型名称，每行一个");
  const poolThreshold = Number(input.poolThreshold);
  if (!Number.isFinite(poolThreshold) || poolThreshold < 0 || poolThreshold > 100)
    throw new DomainError("validation", "可用率阈值应在 0–100 之间");
  return {
    public: input.public === true,
    groups,
    imageModels,
    poolThreshold,
    modules: Object.fromEntries(MODULES.map((key) => [key, input.modules?.[key] === true])),
  };
}
