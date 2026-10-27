import { expect, test } from "@playwright/test";

test.describe("institutional homepage responsive acceptance", () => {
  test("desktop presents verified destinations and labels future capabilities", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Your expertise can open meaningful doors/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Professional participation, with community service in view/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Clear pathways for professional contribution/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Professional directory" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Executive mentorship" })).toBeVisible();
    await expect(page.getByText("Planned capability", { exact: true })).toHaveCount(2);
    await expect(page.getByRole("heading", { name: "Islamic Finance" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Field audits" })).toBeVisible();
  });


  test("public desktop header exposes only approved primary destinations", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");

    await expect(page.getByRole("link", { name: "MPA", exact: true })).toHaveAttribute("href", "/");
    const mainNavigation = page.getByRole("navigation", { name: "Main navigation" });
    await expect(mainNavigation.getByRole("link", { name: "Serve-Community", exact: true })).toBeVisible();
    await expect(mainNavigation.getByRole("link", { name: "Jobs", exact: true })).toBeVisible();
    await expect(mainNavigation.getByRole("link")).toHaveCount(2);
    await expect(mainNavigation.getByRole("button", { name: "More" })).toHaveCount(0);
  });

  test("mobile layout has no horizontal overflow and dispatch opens consent-based support", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator(".mobile-nav")).toBeHidden();
    await expect(page.locator(".topbar .brand")).toBeVisible();
    await expect(page.getByRole("link", { name: /Serve-Community/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Jobs/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Stay close to the work that matters/i })).toBeVisible();
    const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(noHorizontalOverflow).toBe(true);

    await page.getByRole("button", { name: "Ask MPA support" }).click();
    await expect(page.locator('section[aria-label="MPA support assistant"]')).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Ask MPA support" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /I ask MPA support to contact me about this inquiry/i })).toBeVisible();
  });

  test("tablet layout, keyboard focus and theme contrast remain usable", async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto("/");
    const noTabletOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(noTabletOverflow).toBe(true);

    await page.keyboard.press("Tab");
    const focusedControl = page.locator(":focus");
    await expect(focusedControl).toBeVisible();
    const focusStyle = await focusedControl.evaluate(element => {
      const style = getComputedStyle(element);
      return { outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth) };
    });
    expect(focusStyle.outlineStyle).not.toBe("none");
    expect(focusStyle.outlineWidth).toBeGreaterThanOrEqual(2);

    const readTheme = () => page.evaluate(() => {
      // The .min-h-screen layout wrapper is intentionally transparent. Measure
      // the actual theme tokens instead of treating transparent black as a
      // rendered background, which produced a false contrast failure.
      const rootStyle = getComputedStyle(document.documentElement);
      const backgroundToken = rootStyle.getPropertyValue("--bg").trim();
      const textToken = rootStyle.getPropertyValue("--text").trim();
      const parseColor = (value) => {
        const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
        if (hex) {
          const digits = hex[1].length === 3
            ? [...hex[1]].map((digit) => digit + digit).join("")
            : hex[1];
          return [0, 2, 4].map((index) => Number.parseInt(digits.slice(index, index + 2), 16));
        }
        const channels = value.match(/[0-9.]+/g)?.slice(0, 3).map(Number);
        if (!channels || channels.length !== 3) throw new Error(`Unsupported theme color token: ${value}`);
        return channels;
      };
      const luminance = (rgb) => rgb.reduce((sum, channel, index) => {
        const value = channel / 255;
        return sum + [0.2126, 0.7152, 0.0722][index] * (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      }, 0);
      const values = [luminance(parseColor(backgroundToken)), luminance(parseColor(textToken))].sort((a, b) => b - a);
      return {
        backgroundToken,
        textToken,
        contrast: (values[0] + 0.05) / (values[1] + 0.05)
      };
    });
    const light = await readTheme();
    expect(light.contrast).toBeGreaterThanOrEqual(4.5);
    await page.getByRole("button", { name: "Toggle theme" }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);
    const dark = await readTheme();
    expect(dark.backgroundToken).not.toBe(light.backgroundToken);
    expect(dark.textToken).not.toBe(light.textToken);
    expect(dark.contrast).toBeGreaterThanOrEqual(4.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("Serve-Community discovery remains reachable and the legacy route redirects canonically", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Home", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Network", exact: true })).toHaveCount(0);
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Serve-Community", exact: true }).click();
    await expect(page).toHaveURL(/\/serve-community$/);
    await expect(page.getByRole("heading", { name: /Serve-Community\. More ways to contribute/i })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "/serve-community");

    await page.goto("/marketplace");
    await expect(page).toHaveURL(/\/serve-community$/);
  });
});
