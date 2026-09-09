import { setText } from "../ui/dom.js";
import { DEFAULT_SITE_COPY, resolveSiteCopy } from "../data/site-copy.js";

export function renderHeadings({ data, siteCopy, view, topic }) {
  const copy = resolveSiteCopy(data || siteCopy);
  const models = view === "models";
  setText("site-name", copy.title);
  const title = `${copy.title} · ${view === "overview" ? "总览" : models ? "模型专题" : "分组"}`;
  if (document.title !== title) document.title = title;
  setText(
    "view-eyebrow",
    models
      ? "MODELS / PERFORMANCE"
      : view === "groups"
        ? "GROUPS / OBSERVABILITY"
        : "LIVE / OVERVIEW",
  );
  setText(
    "view-title",
    models ? "每个模型，都有迹可循" : view === "groups" ? "分组状态，清晰可见" : copy.overviewTitle,
  );
  setText(
    "view-description",
    models
      ? topic === "images"
        ? "图片请求关注完成耗时；并发与号池展示所选分组的整体负载。"
        : "查看真实请求中的模型表现；图片专题关注完成耗时。"
      : view === "groups"
        ? DEFAULT_SITE_COPY.overviewSubtitle
        : copy.overviewSubtitle,
  );
}
