import { expect, test } from "@playwright/test";

test.describe("MPA support, loading and error experience", () => {
  test("legacy /contact opens the existing assistant and focuses the question field", async ({ page }) => {
    await page.goto("/contact");
    await expect(page).toHaveURL(/\/$/);
    const panel = page.locator('section[aria-label="MPA support assistant"]');
    await expect(panel).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Ask MPA support" })).toBeFocused();
    await expect(page.getByText("Need a person to follow up?")).toBeVisible();
    await expect(page.getByText(/Contact details are optional/)).toBeVisible();
  });

  test("404 support action works with the keyboard and moves focus into the assistant", async ({ page }) => {
    await page.goto("/__mpa_acceptance_missing_page__");
    await expect(page.getByRole("heading", { name: "We couldn’t find that page." })).toBeVisible();
    const support = page.getByRole("button", { name: "Report this to MPA Support" });
    await support.focus();
    await support.press("Enter");
    await expect(page.locator('section[aria-label="MPA support assistant"]')).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Ask MPA support" })).toBeFocused();
  });

  test("workspace loading uses the branded mark and respects reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/api/v1/jobs?*", async route => {
      await new Promise(resolve => setTimeout(resolve, 700));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { items: [], hasMore: false, total: 0 } })
      });
    });
    await page.goto("/jobs");
    const loading = page.locator(".operation-status--loading");
    await expect(loading).toBeVisible();
    const orbit = loading.locator("svg").first();
    await expect.poll(() => orbit.evaluate(node => getComputedStyle(node).animationName)).toBe("none");
    await expect(page.getByRole("heading", { name: "No roles match these filters yet" })).toBeVisible();
  });

  test("server errors remain errors and do not become empty results", async ({ page }) => {
    await page.route("**/api/v1/jobs?*", route => route.fulfill({
      status: 503,
      headers: { "x-request-id": "support-test-503" },
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "SERVICE_UNAVAILABLE", message: "private database stack detail" } })
    }));
    await page.goto("/jobs");
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("server problem");
    await expect(alert).toContainText("support-test-503");
    await expect(alert).not.toContainText("private database stack detail");
    await expect(page.getByRole("heading", { name: "No roles match these filters yet" })).toHaveCount(0);
  });
});
