import { expect, test } from "@playwright/test";

async function dismissPrivacyChoices(page) {
  const reject = page.getByRole("button", { name: "Reject optional" });
  await reject.waitFor({ state: "visible", timeout: 2000 }).catch(() => {});
  if (await reject.isVisible().catch(() => false)) await reject.click();
}

test.describe("Mobile MPA destination hub", () => {
  test("public navigation exposes Network-Plus and Serve-Community", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/mobile");
    await dismissPrivacyChoices(page);
    await expect(page.getByRole("heading", { name: /Your MPA,/ })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Explore MPA destinations" });
    await expect(nav.getByRole("link", { name: /Network-Plus/ })).toHaveAttribute("href", "/network-plus");
    await expect(nav.getByRole("link", { name: /Serve-Community/ })).toHaveAttribute("href", "/serve-community");
    await expect(page.getByRole("heading", { name: "Start exploring" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("signed-in navigation keeps discovery destinations and all member shortcuts", async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("mpa-session-token", "mobile-hub-member-token"));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/mobile");
    await dismissPrivacyChoices(page);
    await expect(page.getByRole("heading", { name: "Your workspace" })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Explore MPA destinations" });
    await expect(nav.getByRole("link", { name: /Network-Plus/ })).toHaveAttribute("href", "/network-plus");
    await expect(nav.getByRole("link", { name: /Serve-Community/ })).toHaveAttribute("href", "/serve-community");
    const destinations = page.getByRole("region", { name: "Member destinations" });
    for (const href of ["/members", "/jobs", "/mentorship", "/learning", "/services", "/membership", "/notifications", "/profile"]) {
      await expect(destinations.locator(`a[href="${href}"]`).first()).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("navigation remains keyboard reachable and fits narrow, tablet and desktop viewports", async ({ page }) => {
    await page.goto("/mobile");
    await dismissPrivacyChoices(page);
    const network = page.getByRole("link", { name: /Network-Plus/ });
    await network.focus();
    await expect(network).toBeFocused();
    for (const width of [320, 360, 390, 620, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `horizontal overflow at ${width}px`).toBe(true);
      await expect(page.getByRole("navigation", { name: "Explore MPA destinations" })).toBeVisible();
    }
  });
});
