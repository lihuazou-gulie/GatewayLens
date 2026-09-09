import { readFile } from "node:fs/promises";
import { expect } from "@playwright/test";

const { version } = JSON.parse(
  await readFile(new URL("../../package.json", import.meta.url), "utf8"),
);

export async function verifyProjectInfo(page) {
  const info = page.getByRole("navigation", { name: "开源项目信息" });
  await expect(info).toBeVisible();
  await expect(info.locator("[data-project-version]")).toHaveText(`v${version}`);
  for (const [name, suffix] of [
    ["GitHub", ""],
    ["更新日志", "/releases"],
  ]) {
    const link = info.getByRole("link", { name, exact: true });
    await expect(link).toHaveAttribute(
      "href",
      `https://github.com/lihuazou-gulie/GatewayLens${suffix}`,
    );
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }
  expect(
    await info.evaluate((node) =>
      [...node.querySelectorAll("a, .project-identity")].every((item) => {
        const box = item.getBoundingClientRect();
        return box.left >= 0 && box.right <= window.innerWidth + 1;
      }),
    ),
  ).toBe(true);
}
