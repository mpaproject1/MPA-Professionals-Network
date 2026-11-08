import { expect, test } from "@playwright/test";

async function mockMemberWorkspace(page) {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("mpa-session-token", "member-responsive-ci-token");
    window.localStorage.setItem("mpa-privacy-preferences-v1", JSON.stringify({
      version: "2026-10-16-v1",
      necessary: true,
      analytics: false,
      personalization: false,
      updatedAt: new Date().toISOString(),
    }));
  });

  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname.replace(/\\/+$/, "");
    let data = [];
    if (path === "/api/v1/me") {
      data = {
        user_id: "member-responsive-test",
        display_name: "Member Test",
        email: "member@example.test",
        has_active_membership: true,
        completion_percent: 72,
        roles: ["member"],
        permissions: [],
      };
    } else if (path === "/api/v1/me/progress") {
      data = { summary: { total: 4, nextSteps: 1, active: 2 }, items: [] };
    } else if (path === "/api/v1/membership/applications/me") {
      data = [];
    } else if (path === "/api/v1/membership/history") {
      data = { memberships: [{ status: "active" }] };
    } else if (path === "/api/v1/notifications") {
      data = { items: [] };
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data }),
    });
  });
}

async function expectNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    workspace: document.querySelector(".member-command")?.scrollWidth ?? 0,
    workspaceClient: document.querySelector(".member-command")?.clientWidth ?? 0,
  }));
  expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.workspace, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.workspaceClient + 1);
}

test.describe("Members workspace responsive layout", () => {
  test("fits narrow phones and keeps all nine workspace destinations usable", async ({ page }) => {
    await mockMemberWorkspace(page);
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/members");

    const workspace = page.locator(".member-command");
    await expect(workspace).toBeVisible();
    await expect(page.getByRole("heading", { name: "Welcome back, Member Test." })).toBeVisible();

    const shortcuts = page.getByRole("navigation", { name: "Your workspace shortcuts" });
    await expect(shortcuts.getByRole("button")).toHaveCount(9);

    const destinations = [
      ["Overview", "Continue where you left off"],
      ["Membership", "Membership setup"],
      ["Career", "Your professional identity"],
      ["Mentorship", "Guidance and professional learning"],
      ["Services", "Share your professional expertise"],
      ["Network", "Professional connections and community"],
      ["Referrals", "Member referrals"],
      ["Impact", "Your Community Impact"],
      ["Activity", "Your activity centre"],
    ];

    for (const [label, heading] of destinations) {
      await shortcuts.getByRole("button", { name: new RegExp(label, "i") }).click();
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });

  test("reflows cleanly at phone, tablet and compact desktop breakpoints", async ({ page }) => {
    await mockMemberWorkspace(page);
    await page.goto("/members");

    for (const width of [320, 360, 390, 430, 620, 768, 900, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator(".member-command")).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Your workspace shortcuts" })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });
});
