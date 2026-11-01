import { expect, test } from "@playwright/test";

async function mockSignedInWorkspace(page) {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("mpa-session-token", "e2e-workspace-session");
  });
  await page.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let data = {};
    if (path === "/api/v1/me") data = { user_id: "e2e-member", display_name: "Test Member", has_active_membership: true, completion_percent: 72, roles: ["member"] };
    else if (path.includes("application-tracking")) data = { summary: { total: 0, active: 0, nextSteps: 0, jobApplications: 0 }, items: [] };
    else if (path === "/api/v1/membership/applications/me") data = [];
    else if (path === "/api/v1/membership/history") data = { memberships: [{ status: "active" }] };
    else if (path.startsWith("/api/v1/notifications")) data = { items: [], counts: { unread: 0, action_required: 0 } };
    else if (path === "/api/v1/organizations") data = [];
    else if (path === "/api/v1/network-plus/access") data = { eligible: true, access: { member: true, organization: false } };
    else if (path.startsWith("/api/v1/jobs")) data = { items: [], hasMore: false, total: 0 };
    else data = {};
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });
  });
}

test.describe("MPA application workspace UX", () => {
  test("member workspace is compact, keyboard reachable and responsive", async ({ page }) => {
    await mockSignedInWorkspace(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/members");
    await expect(page.getByRole("heading", { name: /Welcome back, Test Member/ })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Your workspace shortcuts" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Membership progress" })).toBeVisible();
    const refresh = page.getByRole("button", { name: "Refresh your workspace status" });
    await refresh.focus();
    await expect(refresh).toBeFocused();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: /Welcome back, Test Member/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  });

  test("desktop navigation groups secondary destinations and mobile navigation exposes More", async ({ page }) => {
    await mockSignedInWorkspace(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/members");
    const desktop = page.getByRole("navigation", { name: "Main navigation" });
    await expect(desktop.getByRole("link", { name: "Jobs" })).toBeVisible();
    await expect(desktop.getByRole("link", { name: "Mentorship" })).toBeVisible();
    const more = desktop.getByRole("button", { name: "Open all signed-in destinations" });
    await more.focus();
    await expect(more).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(desktop.getByRole("link", { name: "Membership" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(more).toHaveAttribute("aria-expanded", "false");

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = page.getByRole("navigation", { name: "Mobile navigation" });
    await expect(mobile).toBeVisible();
    const mobileMore = mobile.getByRole("button", { name: "Open more signed-in destinations" });
    await mobileMore.click();
    await expect(page.getByRole("link", { name: "Membership" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("jobs workspace keeps filters compact and details progressively disclosed", async ({ page }) => {
    await mockSignedInWorkspace(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/jobs");
    await expect(page.getByRole("heading", { name: "Find your next professional opportunity." })).toBeVisible();
    await expect(page.getByRole("group", { name: "Find opportunities" })).toBeVisible();
    const refine = page.getByText(/Refine results/);
    await expect(refine).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: "Find your next professional opportunity." })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("light and dark themes remain readable and reduced-motion preferences are respected", async ({ page }) => {
    await mockSignedInWorkspace(page);
    await page.goto("/members");
    const themeToggle = page.getByRole("button", { name: "Toggle theme" });
    const before = await page.locator("body").evaluate(node => getComputedStyle(node).backgroundColor);
    await themeToggle.click();
    await expect.poll(() => page.locator("html").evaluate(node => node.classList.contains("dark"))).toBe(true);
    const after = await page.locator("body").evaluate(node => getComputedStyle(node).backgroundColor);
    expect(after).not.toBe(before);
    await themeToggle.click();
    await expect.poll(() => page.locator("html").evaluate(node => node.classList.contains("dark"))).toBe(false);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const card = page.locator(".mpa-members-workspace .card").first();
    await expect(card).toBeVisible();
    expect(await card.evaluate(node => getComputedStyle(node).transitionDuration)).toBe("0s");
  });

  test("mentorship paths are presented as a compact two-path workspace on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/mentorship");
    await expect(page.getByRole("heading", { name: "Guidance with purpose. Leadership with integrity." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Seek Executive Mentorship" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Become an MPA Mentor" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
