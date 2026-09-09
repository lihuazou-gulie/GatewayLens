import { expect } from "@playwright/test";
import { DEMO_KEY, DEMO_PROBE_KEY, DEMO_GROUPS } from "../fixtures/sub2api.mjs";
import { DEMO_SITE_COPY, verifyInitialSiteCopy } from "./site-copy.mjs";
export async function verifyAdminJourney(page, demo) {
  await page.goto(demo.dashboard + "/settings");
  await expect(page.locator("#auth-title")).toHaveText("初始化面板");
  await page.locator("#setup-code").fill(demo.app.identity.setupCode);
  await page.locator("#admin-password").fill("synthetic-browser-password");
  await page.locator("#auth-submit").click();
  await expect(page.locator("#admin-section")).toBeVisible();
  await verifyInitialSiteCopy(page, demo.dashboard);
  await page.locator("#site-url").fill(demo.source);
  await page.locator("#site-key").fill(DEMO_KEY);
  await page.locator("#test-connection").click();
  await expect(page.locator("#connection-result")).toContainText("连接成功");
  await page.locator('#connection-form button[type="submit"]').click();
  await expect(page.locator("#display-section")).toBeVisible();
  const groups = page.locator(".group-option");
  await groups.nth(0).locator("[data-group]").check();
  await groups.nth(1).locator("[data-group]").check();
  await groups.nth(2).locator("[data-group]").check();
  await groups.nth(1).locator("button").click();
  await expect(groups.nth(0)).toHaveAttribute("data-id", String(DEMO_GROUPS[1].id));
  await page.locator("#image-models").fill("gpt-image-2");
  await page.locator('#display-form button[type="submit"]').click();
  await expect(page.locator("#settings-message")).toContainText("展示设置已保存");
  await page.locator("#probe-group").selectOption(String(DEMO_GROUPS[0].id));
  await page.locator("#probe-model").fill("gpt-5.6");
  await page.locator("#probe-key").fill(DEMO_PROBE_KEY);
  await page.locator('#probe-form button[type="submit"]').click();
  await expect(page.locator("#settings-message")).toContainText("主动探测设置已保存");
  await expect(page.locator("#probe-key")).toHaveValue("");
  await page.locator("#run-probe").click();
  await expect(page.locator("#probe-status")).toHaveText("最近成功");
}
export async function verifyView(page, origin, path) {
  await page.goto(origin + path);
  await expect(page.locator("#connection-status")).toContainText("已连接");
  await expect(page.locator("#site-name")).toHaveText(DEMO_SITE_COPY.title);
  await expect(page).toHaveTitle(new RegExp(DEMO_SITE_COPY.title));
  await expect(page.locator("#view-title")).toHaveText(
    path.startsWith("/models")
      ? "每个模型，都有迹可循"
      : path.startsWith("/groups")
        ? "分组状态，清晰可见"
        : DEMO_SITE_COPY.overviewTitle,
  );
  if (path === "/")
    await expect(page.locator("#view-description")).toHaveText(DEMO_SITE_COPY.overviewSubtitle);
  if (path.startsWith("/models"))
    await expect(page.locator("#model-grid")).toContainText("gpt-image-2");
  else await expect(page.locator("#group-grid")).toContainText(DEMO_GROUPS[0].name);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflow).toBe(false);
}
