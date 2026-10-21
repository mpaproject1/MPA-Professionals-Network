import { test, expect } from "@playwright/test";

const enabled = process.env.MPA_E2E_ROLE_JOURNEYS === "1";

async function signIn(page, email, password) {
  await page.goto("/login");
  await page.getByLabel("Email or username").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /login with password/i }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 20000 });
  await expect(page.locator("body")).not.toContainText(/internal server error|application error/i);
}

async function visitJourney(page, paths) {
  for (const path of paths) {
    await page.goto(path);
    await expect(page.locator("body")).not.toContainText(/internal server error|application error/i);
    await expect(page.locator("main")).toBeVisible();
  }
}

test.describe("P2 real-browser role journeys (environment-backed; no API mocks)", () => {
  test.beforeEach(async () => {
    test.skip(!enabled, "Final-stage only: set MPA_E2E_ROLE_JOURNEYS=1 and configure dedicated non-production role accounts.");
  });

  test("public visitor can discover services, demand topics, mentorship and membership", async ({ page }) => {
    await visitJourney(page, ["/", "/services", "/service-demand", "/mentorship", "/membership"]);
    await expect(page.getByRole("link", { name: /services/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /service requests and unmet needs|service requests/i }).first()).toBeVisible();
  });

  const personas = [
    { key: "NON_MEMBER", name: "non-member", paths: ["/services", "/service-demand", "/mentorship", "/membership", "/jobs"], forbiddenMembershipAdmin: true },
    { key: "ACTIVE_MEMBER", name: "active member", paths: ["/membership", "/services", "/service-demand", "/mentorship", "/jobs", "/track"], forbiddenMembershipAdmin: true },
    { key: "SERVICE_PROVIDER", name: "service provider", paths: ["/services", "/service-demand", "/membership"], forbiddenMembershipAdmin: true },
    { key: "MENTOR", name: "mentor", paths: ["/mentorship", "/services", "/membership"], forbiddenMembershipAdmin: true },
    { key: "ORG_OWNER", name: "organization owner", paths: ["/organizations", "/recruitment", "/mentorship"], forbiddenMembershipAdmin: true },
    { key: "ORG_STAFF", name: "organization staff", paths: ["/organizations", "/recruitment", "/mentorship"], forbiddenMembershipAdmin: true },
    { key: "REVIEWER", name: "reviewer", paths: ["/admin/membership", "/admin/reports", "/admin"], forbiddenMembershipAdmin: false },
    { key: "FINANCE", name: "finance officer", paths: ["/admin/membership", "/admin/reports"], forbiddenMembershipAdmin: false },
    { key: "ADMIN", name: "administrator", paths: ["/admin", "/admin/membership", "/admin/reports", "/admin/marketplace"], forbiddenMembershipAdmin: false },
  ];

  for (const persona of personas) {
    test(persona.name + " can follow permitted routes and receives the expected membership-administration API decision", async ({ page, request }) => {
      const email = process.env["MPA_E2E_" + persona.key + "_EMAIL"];
      const password = process.env["MPA_E2E_" + persona.key + "_PASSWORD"];
      test.skip(!email || !password, "Configure dedicated non-production credentials for " + persona.name + ".");

      await signIn(page, email, password);
      await visitJourney(page, persona.paths);

      const token = await page.evaluate(() => sessionStorage.getItem("mpa-session-token"));
      expect(token, "The signed-in browser session should expose the app session token to the authenticated API client.").toBeTruthy();
      const response = await request.get("/api/v1/review/membership/applications", {
        headers: { Authorization: "Bearer " + token },
      });
      if (persona.forbiddenMembershipAdmin) {
        expect(response.status(), "Member/provider/organization roles must not access reviewer queues through the API.").toBe(403);
      } else if (["REVIEWER", "FINANCE", "ADMIN"].includes(persona.key)) {
        expect(response.status(), "Reviewer, finance or admin test accounts must have an explicit review permission.").toBe(200);
      } else {
        expect([200, 403]).toContain(response.status());
      }
    });
  }
});
