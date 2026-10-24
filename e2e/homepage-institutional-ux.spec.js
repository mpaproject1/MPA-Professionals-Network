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
