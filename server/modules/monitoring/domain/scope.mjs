import { DomainError } from "../../../shared/domain/errors.mjs";
export const RANGES = Object.freeze({ "24h": 86400000, "7d": 604800000, "30d": 2592000000 });
export function selectScope(
  display,
  { range = "24h", scope = "all", model = "", topic = "" },
  scopeId,
) {
  if (!Object.hasOwn(RANGES, range))
    throw new DomainError("validation", "请选择 24 小时、7 天或 30 天");
  if (typeof model !== "string" || model.length > 120 || !["", "images"].includes(topic))
    throw new DomainError("validation", "模型筛选无效");
  const groups =
    scope === "all" ? display.groups : display.groups.filter((g) => scopeId(g.id) === scope);
  if (scope !== "all" && !groups.length) throw new DomainError("not_found", "该分组未配置展示");
  if (topic === "images" && model && !display.imageModels.includes(model))
    throw new DomainError("validation", "该模型不在图片专题中");
  return { groups, range, scope, model, topic };
}
