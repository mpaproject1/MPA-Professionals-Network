import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

async function mockMentorshipAccount(page) {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("mpa-session-token", "e2e-mentorship-session");
  });
  await page.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/\/+$/, "");
    let data = [];
    if (path === "/api/v1/me") {
      data = { user_id: "e2e-mentee", display_name: "Mentorship Test Member", has_active_membership: true, roles: ["member"] };
    } else if (path === "/api/v1/notifications") {
      data = { items: [], counts: { unread: 0, action_required: 0 } };
    } else if (path === "/api/v1/me/mentor-profile") {
      data = null;
    } else if (path === "/api/v1/me/mentorship-operations") {
      data = {
        pending_invitations: 0, overdue_invitations: 0, average_response_minutes: null,
        active_relationships: 0, session_proposals_awaiting_confirmation: 0,
        confirmed_upcoming_sessions: 0, feedback_submitted: 0, delivered_notifications: 0,
        failed_notifications: 0, notification_delivery_unconfirmed: 0,
      };
    } else if (path === "/api/v1/organizations") {
      data = [];
    } else if (path === "/api/v1/me/mentorships") {
      data = [{ id: "relationship-1", mentor_user_id: "mentor-user", mentee_user_id: "e2e-mentee", mentor_name: "Mentor Example", mentee_name: "Mentorship Test Member", goals: "Build strategic leadership confidence", status: "active" }];
    } else if (path === "/api/v1/mentorship/relationship-1") {
      data = { feedback: [] };
    } else if (path === "/api/v1/mentorship/relationship-1/goals" || path === "/api/v1/mentorship/relationship-1/sessions") {
      data = [];
    } else if (path === "/api/v1/me/progress") {
      data = { summary: { total: 0, active: 0, nextSteps: 0, jobApplications: 0 }, items: [] };
    } else if (path === "/api/v1/membership/history") {
      data = { memberships: [{ status: "active" }] };
    } else if (path === "/api/v1/membership/applications/me") {
      data = [];
    } else if (path === "/api/v1/me/community-impact/workspace") {
      data = {
        score: 0, policyVersion: 1, progressPercent: 0, verifiedClaimCount: 0,
        totalClaimCount: 0, dimensions: [], categoryBreakdown: [], items: [],
        claims: [], pendingClaims: [], detectedContributions: [], reminders: [],
      };
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data }),
    });
  });
}

test.describe("Mentorship Studio workspace navigation", () => {
  test("desktop destinations are exclusive, URL-addressable and keyboard reachable", async ({ page }) => {
    await mockMentorshipAccount(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/mentorship");
    const navigation = page.getByRole("navigation", { name: "Mentorship destinations" });
    await expect(navigation).toBeVisible();

    const destinations = [
      ["Overview", "overview"],
      ["My people", "people"],
      ["Sessions", "sessions"],
      ["Learning", "learning"],
      ["Discover", "discover"],
      ["My practice", "practice"],
      ["Organizations", "organizations"],
    ];

    for (const [label, view] of destinations) {
      const control = navigation.getByRole("button", { name: new RegExp(label, "i") });
      await control.focus();
      await expect(control).toBeFocused();
      await control.press("Enter");
      await expect(page.locator(".mpa-mentorship-page")).toHaveAttribute("data-active-workspace", view);
      await expect(page).toHaveURL(new RegExp("[?&]view=" + view + "(?:&|$)"));
      await expect(control).toHaveAttribute("aria-current", "page");
      if (view === "people") {
        await expect(page.locator("#mentorship-requests")).toBeVisible();
        await expect(page.locator("#mentorship-invitations")).toBeVisible();
      }
      if (view === "sessions") {
        await expect(page.locator("#mentorship-sessions")).toBeVisible();
        await expect(page.getByRole("button", { name: "Propose first session" })).toBeVisible();
      }
      if (view === "learning") {
        await expect(page.locator("#mentorship-learning-goals")).toBeVisible();
        await expect(page.getByText("Agreed goals achieved")).toBeVisible();
      }
      if (view === "discover") await expect(page.getByLabel("Search expertise")).toBeVisible();
      if (view === "practice") await expect(page.locator("#offer-mentorship")).toBeVisible();
      if (view === "organizations") await expect(page.getByText("Mentorship offered by verified organizations")).toBeVisible();
      const visiblePanels = await page.locator(".mpa-mentorship-page [data-workspace-panel]:visible").count();
      expect(visiblePanels).toBeGreaterThan(0);
    }

    await page.goBack();
    await expect(page.locator(".mpa-mentorship-page")).toHaveAttribute("data-active-workspace", "practice");
  });

  test("deep links restore the selected workspace and mobile navigation stays within the viewport", async ({ page }) => {
    await mockMentorshipAccount(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/mentorship?view=organizations");
    await expect(page.locator(".mpa-mentorship-page")).toHaveAttribute("data-active-workspace", "organizations");
    const mobile = page.getByRole("navigation", { name: "Mobile mentorship destinations" });
    await expect(mobile).toBeVisible();
    await expect(mobile.getByRole("button")).toHaveCount(7);
    await mobile.getByRole("button", { name: /Discover/ }).click();
    await expect(page.locator(".mpa-mentorship-page")).toHaveAttribute("data-active-workspace", "discover");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(mobile.getByRole("button", { name: /Discover/ })).toHaveAttribute("aria-current", "page");
  });
});
