import { chromium, expect } from "@playwright/test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startRenderingHarness } from "./browser-harness.mjs";
import { startDemo } from "./demo.mjs";
import { verifyAdminJourney, verifyView } from "../tests/browser/admin-journey.mjs";
import { verifyPixelSky } from "../tests/browser/pixel-sky.mjs";
import { verifySiteCopy, DEMO_SITE_COPY } from "../tests/browser/site-copy.mjs";

const outputDir =
  process.env.BROWSER_ARTIFACT_DIR ||
  (await mkdtemp(join(tmpdir(), "gatewaylens-browser-evidence-")));
await mkdir(outputDir, { recursive: true });
const harness = await startRenderingHarness(),
  demo = await startDemo();
let browser;
const errors = [],
  checks = [];
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(harness.url);
  await expect(page.locator("#render-test-result")).toContainText("PASS", { timeout: 30000 });
  checks.push(await page.locator("#render-test-result").innerText());
  await verifyAdminJourney(page, demo);
  await verifySiteCopy(page, demo.dashboard, outputDir);
  checks.push(
    "Site copy: independent save before connection/offline, draft preservation, stale revision, plain text, reload, both themes at 7 widths",
  );
  checks.push(
    "Initialization, connection test/save, group selection/order, display save, synthetic probe",
  );
  for (const theme of ["default", "stardew"]) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(demo.dashboard + "/settings");
    await expect(page.locator("#admin-section")).toBeVisible();
    await page.locator('[data-theme-choice][value="' + theme + '"]').check();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.screenshot({
      path: join(outputDir, theme + "-settings.png"),
      fullPage: true,
      animations: "disabled",
    });
    for (const [name, path] of [
      ["overview", "/"],
      ["groups", "/groups"],
      ["models", "/models?topic=images"],
    ]) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await verifyView(page, demo.dashboard, path);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await page.screenshot({
        path: join(outputDir, theme + "-" + name + ".png"),
        fullPage: true,
        animations: "disabled",
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await verifyView(page, demo.dashboard, path);
      await page.screenshot({
        path: join(outputDir, theme + "-" + name + "-mobile.png"),
        fullPage: true,
        animations: "disabled",
      });
    }
    await page.goto(demo.dashboard + "/settings");
    await expect(page.locator("#admin-section")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await page.screenshot({
      path: join(outputDir, theme + "-settings-mobile.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page.locator("#logout").click();
    await expect(page.locator("#auth-section")).toBeVisible();
    await expect(page.locator("#auth-title")).toHaveText("登录管理后台");
    await expect(page.locator("#settings-site-name")).toHaveText(DEMO_SITE_COPY.title);
    await page.screenshot({
      path: join(outputDir, theme + "-login-mobile.png"),
      fullPage: true,
      animations: "disabled",
    });
    expect(await page.locator("#admin-section").isHidden()).toBe(true);
    await page.locator("#admin-password").fill("synthetic-browser-password");
    await page.locator("#auth-submit").click();
    await expect(page.locator("#admin-section")).toBeVisible();
    checks.push(
      theme +
        ": desktop/mobile overview, groups, models, settings, mobile login, persisted preference",
    );
  }
  await verifyPixelSky(browser, demo.dashboard, outputDir);
  checks.push(
    "Pixel sky: visitor timezone, dawn/day/sunset/night, 7 viewport widths, moving clouds, reduced motion, visibility pause/resume, theme reuse, mobile login",
  );
  const guest = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guestPage = await guest.newPage();
  await verifyView(guestPage, demo.dashboard, "/");
  await expect(guestPage.locator("#system-section")).toBeHidden();
  expect((await guest.request.get(demo.dashboard + "/api/admin/settings")).status()).toBe(401);
  await page.goto(demo.dashboard + "/settings");
  await page.locator("#logout").click();
  await expect(page.locator("#auth-title")).toHaveText("登录管理后台");
  await expect(page.locator("#admin-section")).toBeHidden();
  checks.push("Guest visibility, admin API denial, logout");
  expect(errors).toEqual([]);
  await writeFile(
    join(outputDir, "result.json"),
    JSON.stringify({ passed: true, checks, pageErrors: errors }, null, 2),
  );
  console.log("Browser acceptance passed. Evidence: " + outputDir);
} catch (error) {
  await writeFile(
    join(outputDir, "result.json"),
    JSON.stringify({ passed: false, checks, pageErrors: errors, failure: error.message }, null, 2),
  );
  throw error;
} finally {
  await browser?.close();
  await harness.close();
  await demo.close();
}
