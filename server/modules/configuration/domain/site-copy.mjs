import { DomainError } from "../../../shared/domain/errors.mjs";

export const DEFAULT_SITE_COPY = Object.freeze({
  title: "Sub2API 监控",
  overviewTitle: "运行态势，一屏掌握",
  overviewSubtitle: "关注服务质量、分组负载与模型表现。",
});

const fields = [
  ["title", "站点名称", 60],
  ["overviewTitle", "总览主标题", 80],
  ["overviewSubtitle", "总览副标题", 160],
];

export function selectSiteCopy(display) {
  return Object.fromEntries(fields.map(([key]) => [key, display[key]]));
}

export function validateSiteCopy(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new DomainError("validation", "站点文案格式无效");
  return Object.fromEntries(
    fields.map(([key, label, limit]) => {
      const value = typeof input[key] === "string" ? input[key].trim() : "";
      if (!value || value.length > limit || /[\u0000-\u001f\u007f]/.test(value))
        throw new DomainError(
          "validation",
          `${label}需要 1–${limit} 个字符，且不能包含换行或控制字符`,
        );
      return [key, value];
    }),
  );
}
