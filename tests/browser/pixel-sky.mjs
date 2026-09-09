import { expect } from "@playwright/test";
import { join } from "node:path";
import { verifyView } from "./admin-journey.mjs";

export async function verifyPixelSky(browser, origin, outputDir) {
  // A known browser timezone proves that the sky follows the visitor, not the server clock.
  const context = await browser.newContext({
    timezoneId: "Asia/Tokyo",
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("kanban-theme", "stardew"));
  const at = (hour) => new Date(Date.UTC(2026, 8, 9, hour - 9));
  await page.clock.install({ time: at(6) });
  try {
    for (const [hour, phase] of [
      [6, "dawn"],
      [12, "day"],
      [18, "sunset"],
      [23, "night"],
    ]) {
      await page.clock.setSystemTime(at(hour));
      await verifyView(page, origin, "/");
      await expect(page.locator(".farm-scene--header")).toHaveAttribute("data-sky-phase", phase);
      await page
        .locator(".topbar")
        .screenshot({ path: join(outputDir, "sky-" + phase + ".png"), animations: "disabled" });
      if (hour === 12)
        await page.screenshot({
          path: join(outputDir, "pixel-overview-day.png"),
          fullPage: true,
          animations: "disabled",
        });
    }
    for (const width of [320, 390, 719, 721, 1149, 1151, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const geometry = await page.evaluate(() => {
        const box = (selector) => document.querySelector(selector).getBoundingClientRect();
        const sky = box(".farm-scene--header"),
          house = box(".sky-house");
        return {
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          houseVisible:
            house.left >= 0 &&
            house.right <= window.innerWidth &&
            house.top >= sky.top &&
            house.bottom <= sky.bottom,
          controlsClear: [".brand", ".view-nav"].every(
            (selector) => box(selector).top >= sky.bottom,
          ),
        };
      });
      expect(geometry).toEqual({ overflow: false, houseVisible: true, controlsClear: true });
      if (width === 320 || width === 390)
        await page
          .locator(".topbar")
          .screenshot({ path: join(outputDir, `sky-night-${width}.png`), animations: "disabled" });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    const cloud = page.locator(".sky-cloud").first();
    const transform = () => cloud.evaluate((node) => getComputedStyle(node).transform);
    const initial = await transform();
    await expect.poll(transform).not.toBe(initial);
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await cloud.evaluate((node) => getComputedStyle(node).animationName)).toBe("none");
    expect(
      await page
        .locator(".sky-sun")
        .evaluate((node) => parseFloat(getComputedStyle(node).transitionDuration)),
    ).toBeLessThanOrEqual(0.001);
    await page.emulateMedia({ reducedMotion: "no-preference" });

    const scene = page.locator(".farm-scene--header");
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(scene).toHaveAttribute("data-sky-running", "false");
    await page.clock.setSystemTime(at(12));
    await page.clock.runFor(61000);
    await expect(scene).toHaveAttribute("data-sky-phase", "night");
    expect(await cloud.evaluate((node) => getComputedStyle(node).animationPlayState)).toBe(
      "paused",
    );
    await page.evaluate(() => {
      delete document.visibilityState;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(scene).toHaveAttribute("data-sky-phase", "day");
    await expect(scene).toHaveAttribute("data-sky-running", "true");
    await page.evaluate(async () => {
      const { applyTheme } = await import("/src/ui/theme.js");
      for (let i = 0; i < 6; i++) {
        applyTheme("default");
        applyTheme("stardew");
      }
    });
    await expect(page.locator(".pixel-sky")).toHaveCount(1);
    await expect(page.locator(".sky-cloud")).toHaveCount(5);
    await page.evaluate(async () => (await import("/src/ui/theme.js")).applyTheme("default"));
    await expect(scene).toHaveAttribute("data-sky-running", "false");
    await expect(scene).toBeHidden();
    await page.goto(origin + "/settings");
    await expect(page.locator("#auth-title")).toHaveText("登录管理后台");
    // addInitScript restores the pixel preference on this new document.
    await expect(page.locator(".pixel-sky")).toHaveCount(1);
    await page.setViewportSize({ width: 320, height: 780 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await page.screenshot({
      path: join(outputDir, "pixel-login-320.png"),
      fullPage: true,
      animations: "disabled",
    });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
}
