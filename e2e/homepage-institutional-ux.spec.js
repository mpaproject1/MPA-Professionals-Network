import { expect, test } from "@playwright/test";

test.describe("Workstream 5 homepage and navigation acceptance", () => {
  test("desktop presents the focused hero, live login form and pathway slider", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Your expertise can open meaningful doors/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Browse the Job Portal/i })).toHaveAttribute("href", "/jobs");
    await expect(page.getByRole("link", { name: "Explore Serve-Community", exact: true })).toHaveAttribute("href", "/serve-community");
    await expect(page.getByRole("heading", { name: /Professional participation, with community service in view/i })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Clear pathways for professional contribution" })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: /Email/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Mentorship/i })).toBeVisible();
  });

  test("signed-out desktop navigation contains only approved public destinations", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await expect(page.getByRole("link", { name: "MPA", exact: true })).toHaveAttribute("href", "/");
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("link", { name: "About", exact: true })).toHaveAttribute("href", "/about");
    await expect(nav.getByRole("link", { name: "Job Portal", exact: true })).toHaveAttribute("href", "/jobs");
    await expect(nav.getByRole("link", { name: "Serve-Community", exact: true })).toHaveAttribute("href", "/serve-community");
    await expect(nav.getByRole("link")).toHaveCount(3);
    await expect(nav.getByRole("link", { name: /My-Workspace|My-Learning|Admin/i })).toHaveCount(0);
  });

  test("mobile navigation keeps public pathways reachable without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Mobile navigation" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "About", exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Job Portal", exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Serve-Community", exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: /My-Workspace|My-Learning|Admin/i })).toHaveCount(0);
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
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    await expect(focused).toBeVisible();
    const focusStyle = await focused.evaluate(element => {
      const style = getComputedStyle(element);
      return { outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth) };
    });
    expect(focusStyle.outlineStyle).not.toBe("none");
    expect(focusStyle.outlineWidth).toBeGreaterThanOrEqual(2);
    const contrast = async () => page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const parse = (value) => {
        const match = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
        if (!match) throw new Error(`Unsupported theme color token: ${value}`);
        const hex = match[1].length === 3 ? [...match[1]].map(c => c + c).join("") : match[1];
        const rgb = [0,2,4].map(i => Number.parseInt(hex.slice(i,i+2),16)/255).map(c => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4);
        const lum = rgb[0]*.2126 + rgb[1]*.7152 + rgb[2]*.0722;
        return lum;
      });
      const a = parse(root.getPropertyValue("--bg"));
      const b = parse(root.getPropertyValue("--text"));
      return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    });
    expect(await contrast()).toBeGreaterThanOrEqual(4.5);
    await page.getByRole("button", { name: "Toggle theme" }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);
    expect(await contrast()).toBeGreaterThanOrEqual(4.5);
  });

  test("Serve-Community is reachable and the legacy route redirects canonically", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
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
