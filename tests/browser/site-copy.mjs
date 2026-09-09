import { expect } from "@playwright/test";
import { join } from "node:path";

export const DEMO_SITE_COPY = {
  title: "GatewayLens · 模拟数据",
  overviewTitle: "服务表现，一眼看清",
  overviewSubtitle: "从服务质量到模型表现，掌握每一次请求。",
};

export async function fillSiteCopy(page, copy) {
  await page.getByRole("textbox", { name: "站点名称", exact: true }).fill(copy.title);
  await page.getByRole("textbox", { name: "总览主标题", exact: true }).fill(copy.overviewTitle);
  await page.getByRole("textbox", { name: "总览副标题", exact: true }).fill(copy.overviewSubtitle);
}

export async function saveSiteCopy(page, copy) {
  await fillSiteCopy(page, copy);
  await page.getByRole("button", { name: "保存站点文案", exact: true }).click();
  await expect(page.locator("#settings-message")).toContainText("站点文案已保存");
  await expect(page.locator("#settings-site-name")).toHaveText(copy.title);
}

export async function verifyInitialSiteCopy(page, origin) {
  await expect(page.locator("#display-section")).toBeHidden();
  await expect(page.locator("#site-title")).toHaveValue("Sub2API 监控");
  await saveSiteCopy(page, DEMO_SITE_COPY);
  await page.reload();
  await expect(page.locator("#site-title")).toHaveValue(DEMO_SITE_COPY.title);
  await page.goto(origin + "/");
  await expect(page.locator("#connection-status")).toHaveText("等待配置");
  await expect(page.locator("#view-title")).toHaveText(DEMO_SITE_COPY.overviewTitle);
  await expect(page.locator("#view-description")).toHaveText(DEMO_SITE_COPY.overviewSubtitle);
  await expect(page.locator("#metrics")).toBeHidden();
  await page.goto(origin + "/settings");
  await expect(page.locator("#site-copy-section")).toBeVisible();
}

export async function verifySiteCopy(page, origin, outputDir) {
  await page.goto(origin + "/settings");
  await expect(page.locator("#display-section")).toBeVisible();
  await page.locator("#image-models").fill("unsaved-synthetic-model");
  await saveSiteCopy(page, DEMO_SITE_COPY);
  await expect(page.locator("#image-models")).toHaveValue("unsaved-synthetic-model");

  await page.route("**/api/admin/catalog", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "模拟数据源离线" }),
    }),
  );
  await page.reload();
  await expect(page.locator("#settings-message")).toHaveText("模拟数据源离线");
  await expect(page.locator("#display-section")).toBeHidden();
  await saveSiteCopy(page, DEMO_SITE_COPY);
  await page.unroute("**/api/admin/catalog");
  await page.reload();
  await expect(page.locator("#display-section")).toBeVisible();

  const other = await page.context().newPage();
  try {
    await other.goto(origin + "/settings");
    await expect(other.locator("#display-section")).toBeVisible();
    await saveSiteCopy(other, { ...DEMO_SITE_COPY, overviewTitle: "来自另一个管理页面" });
    await fillSiteCopy(page, { ...DEMO_SITE_COPY, overviewTitle: "未保存的草稿" });
    await page.getByRole("button", { name: "保存站点文案", exact: true }).click();
    await expect(page.locator("#settings-message")).toContainText("设置已被更新，请重新载入");
    await expect(page.locator("#overview-title")).toHaveValue("未保存的草稿");
    await page.reload();
    await expect(page.locator("#overview-title")).toHaveValue("来自另一个管理页面");
  } finally {
    await other.close();
  }

  const plainText = {
    title: "<img src=x onerror=alert(1)>",
    overviewTitle: "<b>这是纯文本标题</b>",
    overviewSubtitle: "<svg onload=alert(1)>不执行 HTML</svg>",
  };
  await saveSiteCopy(page, plainText);
  await page.goto(origin + "/");
  for (const [id, key] of [
    ["site-name", "title"],
    ["view-title", "overviewTitle"],
    ["view-description", "overviewSubtitle"],
  ]) {
    await expect(page.locator("#" + id)).toHaveText(plainText[key]);
    expect(await page.locator("#" + id + " > *").count()).toBe(0);
  }

  await page.goto(origin + "/settings");
  await saveSiteCopy(page, {
    title: "N".repeat(60),
    overviewTitle: "T".repeat(80),
    overviewSubtitle: "D".repeat(160),
  });
  for (const theme of ["default", "stardew"]) {
    await page.goto(origin + "/settings");
    await page.locator('[data-theme-choice][value="' + theme + '"]').check();
    for (const path of ["/", "/settings"]) {
      await page.goto(origin + path);
      await expect(page.locator(path === "/" ? "#site-name" : "#settings-site-name")).toHaveText(
        "N".repeat(60),
      );
      for (const width of [1440, 1151, 1149, 721, 719, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          `${theme} ${path} ${width}px`,
        ).toBe(true);
      }
      await page.screenshot({
        path: join(outputDir, `${theme}-long-copy-${path === "/" ? "overview" : "settings"}.png`),
        fullPage: true,
        animations: "disabled",
      });
    }
  }
  await saveSiteCopy(page, DEMO_SITE_COPY);
  await page.setViewportSize({ width: 1440, height: 1000 });
}
