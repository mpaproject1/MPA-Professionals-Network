import { expect, test } from "@playwright/test";

async function readContrastPairs(page) {
  return page.evaluate(() => {
    const tokens = getComputedStyle(document.documentElement);
    const luminance = (hex) => {
      const channels = hex.trim().match(/^#([0-9a-f]{6})$/i)?.[1];
      if (!channels) throw new Error(`Expected a six-digit hex color token, received: ${hex}`);
      const values = channels.match(/../g).map((value) => parseInt(value, 16) / 255);
      const linear = values.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const ratio = (foreground, background) => {
      const a = luminance(foreground);
      const b = luminance(background);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    const text = tokens.getPropertyValue("--text").trim();
    const muted = tokens.getPropertyValue("--muted").trim();
    const surface = tokens.getPropertyValue("--surface").trim();
    const primary = tokens.getPropertyValue("--primary").trim();
    const primaryContrast = tokens.getPropertyValue("--primary-contrast").trim();
    return {
      textOnSurface: ratio(text, surface),
      mutedOnSurface: ratio(muted, surface),
      primaryActionText: ratio(primaryContrast, primary)
    };
  });
}

test.describe("MPA shared visual system", () => {
  test("light and dark themes retain readable contrast and dark preference persists", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("mpa-color-mode", "light"));
    await page.goto("/");
    await expect.poll(() => page.locator("html").evaluate((element) => element.classList.contains("dark"))).toBe(false);

    const light = await readContrastPairs(page);
    expect(light.textOnSurface).toBeGreaterThanOrEqual(4.5);
    expect(light.mutedOnSurface).toBeGreaterThanOrEqual(4.5);
    expect(light.primaryActionText).toBeGreaterThanOrEqual(4.5);

    await page.getByRole("button", { name: "Toggle theme" }).click();
    await expect.poll(() => page.locator("html").evaluate((element) => element.classList.contains("dark"))).toBe(true);

    const dark = await readContrastPairs(page);
    expect(dark.textOnSurface).toBeGreaterThanOrEqual(4.5);
    expect(dark.mutedOnSurface).toBeGreaterThanOrEqual(4.5);
    expect(dark.primaryActionText).toBeGreaterThanOrEqual(4.5);

    await page.reload();
    await expect.poll(() => page.locator("html").evaluate((element) => element.classList.contains("dark"))).toBe(true);
  });

  test("landing workspace fits a narrow mobile viewport without horizontal page overflow", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/");
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth
    }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  });
});
