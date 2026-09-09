export const DEFAULT_SITE_COPY = Object.freeze({
  title: "Sub2API 监控",
  overviewTitle: "运行态势，一屏掌握",
  overviewSubtitle: "关注服务质量、分组负载与模型表现。",
});

export function resolveSiteCopy(input) {
  return Object.fromEntries(
    Object.entries(DEFAULT_SITE_COPY).map(([key, fallback]) => [key, input?.[key] || fallback]),
  );
}
