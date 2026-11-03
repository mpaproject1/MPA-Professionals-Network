import { expect, test } from "@playwright/test";

async function dismissPrivacyChoices(page) {
  const rejectOptional = page.getByRole("button", { name: "Reject optional" });
  if (await rejectOptional.isVisible().catch(() => false)) await rejectOptional.click();
}

async function mockSignedInWorkspace(page) {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("mpa-session-token", "e2e-workspace-session");
  });
  await page.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/\/+$/, "");
    let data = {};
    if (path === "/api/v1/me") data = { user_id: "e2e-member", display_name: "Test Member", has_active_membership: true, completion_percent: 72, roles: ["member"] };
    else if (path === "/api/v1/me/progress") data = { summary: { total: 0, active: 0, nextSteps: 0, jobApplications: 0 }, items: [] };
    else if (path === "/api/v1/membership/applications/me") data = [];
    else if (path === "/api/v1/membership/history") data = { memberships: [{ status: "active" }] };
    else if (path === "/api/v1/me/community-impact/workspace") data = {
      score: 0, policyVersion: 1, progressPercent: 0, verifiedClaimCount: 0, totalClaimCount: 0,
      dimensions: [], categoryBreakdown: [], items: [], claims: [], pendingClaims: [],
      detectedContributions: [], reminders: [],
    };
    else if (path.startsWith("/api/v1/notifications")) data = { items: [], counts: { unread: 0, action_required: 0 } };
    else if (path === "/api/v1/organizations") data = [];
    else if (path === "/api/v1/network-plus/access") data = { eligible: true, access: { member: true, organization: false } };
    else if (path.startsWith("/api/v1/jobs")) data = { items: [], hasMore: false, total: 0 };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data }),
    });
  });
}
// These tests use page.route() for deterministic API fixtures. The app shell registers
// /sw.js; block service workers in this suite so a controlled page cannot bypass
// Playwright routing. PWA registration is covered by the dedicated installability tests.
test.use({ serviceWorkers: "block" });

test.describe("MPA application workspace UX", () => {
  test("member workspace is compact, keyboard reachable and responsive", async ({ page }) => {
    await mockSignedInWorkspace(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/members");
    await dismissPrivacyChoices(page);
    await expect(page.getByRole("heading", { name: /Welcome back, Test Member/ })).toBeVisible();
    // The welcome heading renders before the account-backed workspace data. Wait for
    // the progress section as the explicit signal that the workspace has hydrated.
    await expect(page.locator("#progress-title")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Your workspace shortcuts" })).toBeVisible();
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
    await dismissPrivacyChoices(page);
    const desktop = page.getByRole("navigation", { name: "Main navigation" });
    await expect(desktop.getByRole("link", { name: "Job Portal" })).toBeVisible();
    await expect(desktop.getByRole("link", { name: "Mentorship" })).toBeVisible();
    const more = desktop.getByRole("button", { name: "Open all signed-in destinations" });
    await more.focus();
    await expect(more).toBeFocused();
    await more.press("Enter");
    await expect(more).toHaveAttribute("aria-expanded", "true");
    const morePanel = page.locator("#desktop-more-menu");
    await expect(morePanel.getByRole("link", { name: "Membership", exact: true })).toBeVisible();
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
    await dismissPrivacyChoices(page);
    await expect(page.getByRole("heading", { name: "Find your next professional opportunity." })).toBeVisible();
    await expect(page.getByRole("group", { name: "Find opportunities" })).toBeVisible();
    const refine = page.getByText(/Refine results/);
    await expect(refine).toBeVisible();
    await refine.click();
    await expect(page.getByLabel("Location")).toBeVisible();
    await expect(page.getByLabel("Employment type")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: "Find your next professional opportunity." })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("light and dark themes remain readable and reduced-motion preferences are respected", async ({ page }) => {
    await mockSignedInWorkspace(page);
    await page.goto("/members");
    await dismissPrivacyChoices(page);
    // Theme and motion checks target the rendered member cards, not the loading shell.
    await expect(page.locator("#progress-title")).toBeVisible();
    const themeToggle = page.getByRole("button", { name: "Toggle theme" });
    const before = await page.locator("html").evaluate(node => getComputedStyle(node).getPropertyValue("--bg").trim());
    await themeToggle.click();
    await expect.poll(() => page.locator("html").evaluate(node => node.classList.contains("dark"))).toBe(true);
    const after = await page.locator("html").evaluate(node => getComputedStyle(node).getPropertyValue("--bg").trim());
    expect(after).not.toBe(before);
    await themeToggle.click();
    await expect.poll(() => page.locator("html").evaluate(node => node.classList.contains("dark"))).toBe(false);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const card = page.locator(".mpa-members-workspace section.card").first();
    await expect(card).toBeVisible();
    expect(await card.evaluate(node => getComputedStyle(node).transitionDuration)).toBe("0s");
  });

  test("mentorship paths are presented as a compact two-path workspace on mobile", async ({ page }) => {
    await page.route("**/api/v1/**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/mentorship");
    await dismissPrivacyChoices(page);
    await expect(page.getByRole("heading", { name: "My Mentorship" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Seek Executive Mentorship" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Become an MPA Mentor" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
