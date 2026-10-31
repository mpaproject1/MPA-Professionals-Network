import { expect, test } from "@playwright/test";

test.describe("Serve-Community public UX separation", () => {
  test("presents a distinct community-impact destination and clearly labels sample concepts", async ({ page }) => {
    await page.goto("/serve-community");

    await expect(page.getByRole("heading", { name: /Good work grows when we do it together/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Explore community initiatives" })).toBeVisible();
    await expect(page.getByText(/Preview content — not live opportunities/i)).toBeVisible();
    await expect(page.getByText(/not currently being advertised or accepting registrations/i)).toBeVisible();

    await expect(page.getByRole("heading", { name: "Neighbourhood learning circles" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Community care and wellbeing" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Digital skills for community groups" })).toBeVisible();

    await expect(page.getByRole("link", { name: /Explore Network-Plus/i })).toHaveAttribute("href", "/network-plus");
    await expect(page.getByRole("link", { name: /Explore initiatives/i })).toHaveAttribute("href", "#discover");
    const experience = page.locator("main.serve-community-page");
    await expect(experience.getByRole("link", { name: /Careers|Mentorship|Professional services|Organization workspace/i })).toHaveCount(0);
  });

  test("search and category filters update the sample concept list", async ({ page }) => {
    await page.goto("/serve-community");
    await page.getByRole("group", { name: "Filter initiatives by category" }).getByRole("button", { name: "Education" }).click();

    await expect(page.getByRole("heading", { name: "Neighbourhood learning circles" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Community care and wellbeing" })).toHaveCount(0);
    await expect(page.getByText("1 sample concept")).toBeVisible();

    await page.getByRole("button", { name: "All", exact: true }).click();
    await page.getByRole("textbox", { name: "Search sample initiatives" }).fill("digital");
    await expect(page.getByRole("heading", { name: "Digital skills for community groups" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Neighbourhood learning circles" })).toHaveCount(0);
    await expect(page.getByText("1 sample concept")).toBeVisible();
  });

  test("concept details dialog is keyboard dismissible and repeats preview-only status", async ({ page }) => {
    await page.goto("/serve-community");
    await page.getByRole("button", { name: "View concept" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Neighbourhood learning circles" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/not an approved initiative, a live vacancy or an invitation to register/i)).toBeVisible();
    const close = dialog.getByRole("button", { name: "Close concept details" });
    await expect(close).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Close preview" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(close).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("mobile and tablet layouts remain usable without horizontal overflow", async ({ page }) => {
    for (const viewport of [{ width: 820, height: 1180 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto("/serve-community");
      await expect(page.getByRole("heading", { name: "Explore community initiatives" })).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Search sample initiatives" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });
});
