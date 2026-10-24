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


  test("desktop header stays minimal and secondary destinations remain keyboard-accessible in More", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");

    await expect(page.getByRole("link", { name: "MPA", exact: true })).toHaveAttribute("href", "/");
    const mainNavigation = page.getByRole("navigation", { name: "Main navigation" });
    await expect(mainNavigation.getByRole("link", { name: "Serve-Community", exact: true })).toBeVisible();
    await expect(mainNavigation.getByRole("link", { name: "Services", exact: true })).toBeVisible();
    await expect(mainNavigation.getByRole("link", { name: "Jobs", exact: true })).toBeVisible();
    await expect(mainNavigation.getByRole("link", { name: "Mentorship", exact: true })).toBeVisible();
    await expect(mainNavigation.getByRole("link")).toHaveCount(4);

    const moreButton = mainNavigation.getByRole("button", { name: "More" });
    await expect(moreButton).toHaveAttribute("aria-expanded", "false");
    await moreButton.click();
    const menu = page.locator("#desktop-more-menu");
    await expect(menu.getByRole("link", { name: "Membership", exact: true })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Saved", exact: true })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Profile", exact: true })).toBeVisible();
    await expect(menu.getByRole("link", { name: "About MPA", exact: true })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Dashboard", exact: true })).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(moreButton).toHaveAttribute("aria-expanded", "true");
    await moreButton.click();
    await expect(menu).toHaveCount(0);
  });

  test("mobile layout has no horizontal overflow and dispatch opens consent-based support", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator(".mobile-nav")).toBeVisible();
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
      const surface = document.querySelector(".min-h-screen");
      if (!surface) throw new Error("The application surface is missing.");
      const style = getComputedStyle(surface);
      const parse = (value) => value.match(/[0-9.]+/g)?.slice(0, 3).map(Number) ?? [];
      const luminance = (rgb) => rgb.reduce((sum, channel, index) => {
        const value = channel / 255;
        return sum + [0.2126, 0.7152, 0.0722][index] * (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      }, 0);
      const background = parse(style.backgroundColor);
      const foreground = parse(style.color);
      const values = [luminance(background), luminance(foreground)].sort((a, b) => b - a);
      return {
        backgroundToken: getComputedStyle(document.documentElement).getPropertyValue("--bg").trim(),
        textToken: getComputedStyle(document.documentElement).getPropertyValue("--text").trim(),
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
    await page.getByRole("link", { name: /Explore Serve-Community/i }).click();
    await expect(page).toHaveURL(/\/serve-community$/);
    await expect(page.getByRole("heading", { name: /Serve-Community\. More ways to contribute/i })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "/serve-community");

    await page.goto("/marketplace");
    await expect(page).toHaveURL(/\/serve-community$/);
  });
});
