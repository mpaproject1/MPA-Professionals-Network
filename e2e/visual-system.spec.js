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
      canvas: tokens.getPropertyValue("--bg").trim(),
      surface,
      brandNavy: tokens.getPropertyValue("--brand-navy").trim(),
      brandLemon: tokens.getPropertyValue("--brand-lemon").trim(),
      textOnSurface: ratio(text, surface),
      mutedOnSurface: ratio(muted, surface),
      primaryActionText: ratio(tokens.getPropertyValue("--brand-navy-deep").trim(), tokens.getPropertyValue("--brand-lemon").trim()),
      successStatus: ratio(tokens.getPropertyValue("--success").trim(), tokens.getPropertyValue("--success-bg").trim()),
      warningStatus: ratio(tokens.getPropertyValue("--warning").trim(), tokens.getPropertyValue("--warning-bg").trim()),
      dangerStatus: ratio(tokens.getPropertyValue("--danger").trim(), tokens.getPropertyValue("--danger-bg").trim()),
      infoStatus: ratio(tokens.getPropertyValue("--info").trim(), tokens.getPropertyValue("--info-bg").trim()),
      focusIndicator: ratio(tokens.getPropertyValue("--focus-ring").trim(), surface)
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
    expect(light.successStatus).toBeGreaterThanOrEqual(4.5);
    expect(light.warningStatus).toBeGreaterThanOrEqual(4.5);
    expect(light.dangerStatus).toBeGreaterThanOrEqual(4.5);
    expect(light.infoStatus).toBeGreaterThanOrEqual(4.5);
    expect(light.focusIndicator).toBeGreaterThanOrEqual(4.5);

    await page.getByRole("button", { name: "Toggle theme" }).click();
    await expect.poll(() => page.locator("html").evaluate((element) => element.classList.contains("dark"))).toBe(true);

    const dark = await readContrastPairs(page);
    expect(dark.canvas).toBe("#0a2035");
    expect(dark.surface).toBe("#112d47");
    expect(dark.brandNavy).toBe("#123b5d");
    expect(dark.brandLemon).toBe("#dce94f");
    expect(dark.textOnSurface).toBeGreaterThanOrEqual(4.5);
    expect(dark.mutedOnSurface).toBeGreaterThanOrEqual(4.5);
    expect(dark.primaryActionText).toBeGreaterThanOrEqual(4.5);
    expect(dark.successStatus).toBeGreaterThanOrEqual(4.5);
    expect(dark.warningStatus).toBeGreaterThanOrEqual(4.5);
    expect(dark.dangerStatus).toBeGreaterThanOrEqual(4.5);
    expect(dark.infoStatus).toBeGreaterThanOrEqual(4.5);
    expect(dark.focusIndicator).toBeGreaterThanOrEqual(4.5);

    await page.reload();
    await expect.poll(() => page.locator("html").evaluate((element) => element.classList.contains("dark"))).toBe(true);
  });

  test("workspace pages remain usable at mobile and tablet widths", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("mpa-color-mode", "light"));
    const routes = ["/", "/about", "/jobs", "/mentorship", "/serve-community", "/membership", "/network-plus", "/profile", "/organizations", "/admin"];
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 820 });
      for (const route of routes) {
        await page.goto(route, { waitUntil: "domcontentloaded", timeout: 20000 });
        const dimensions = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          document: document.documentElement.scrollWidth
        }));
        expect(dimensions.document, `${route} overflows at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
      }
    }
  });

  test("mobile navigation and primary controls preserve practical touch targets", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const undersized = await page.locator(".mobile-nav a, .mobile-nav button, .btn, .icon-btn").evaluateAll((elements) =>
      elements.filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return style.display !== "none" && (rect.width > 0 || rect.height > 0) && (rect.width < 40 || rect.height < 40);
      }).map((element) => ({ label: element.getAttribute("aria-label") || element.textContent?.trim(), width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }))
    );
    expect(undersized).toEqual([]);
  });
});
