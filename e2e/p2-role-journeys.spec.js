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

      const privateOrganizationId = process.env.MPA_E2E_UNRELATED_PRIVATE_ORG_ID;
      if (privateOrganizationId && ["NON_MEMBER", "ORG_OWNER", "ORG_STAFF"].includes(persona.key)) {
        const organizationResponse = await request.get("/api/v1/organizations/" + encodeURIComponent(privateOrganizationId), { headers: { Authorization: "Bearer " + token } });
        expect(organizationResponse.status(), "An unrelated private organization profile must not be readable by this account.").toBe(403);
      }
      const privateFileId = process.env.MPA_E2E_UNRELATED_PRIVATE_FILE_ID;
      if (privateFileId && ["NON_MEMBER", "ACTIVE_MEMBER", "SERVICE_PROVIDER", "MENTOR", "ORG_OWNER", "ORG_STAFF"].includes(persona.key)) {
        const fileResponse = await request.get("/api/v1/files/" + encodeURIComponent(privateFileId), { headers: { Authorization: "Bearer " + token } });
        expect(fileResponse.status(), "Private evidence belonging to another account must not be readable without a specific authorization relationship.").toBe(403);
      }
    });
  }

  test("active member double-submit creates only one private demand request", async ({ page }) => {
    test.skip(process.env.MPA_E2E_ALLOW_MUTATIONS !== "1", "Requires explicit opt-in to mutate a dedicated non-production test environment.");
    const email = process.env.MPA_E2E_ACTIVE_MEMBER_EMAIL;
    const password = process.env.MPA_E2E_ACTIVE_MEMBER_PASSWORD;
    test.skip(!email || !password, "Configure the dedicated active-member test account.");
    await signIn(page, email, password);
    await page.goto("/service-demand");
    const title = "E2E private demand " + Date.now();
    await page.getByLabel("Category or field").fill("E2E test category");
    await page.getByLabel("Short title").fill(title);
    await page.getByLabel("Details").fill("This is an isolated browser acceptance request for duplicate-submit protection.");
    const posts = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname === "/api/v1/marketplace-demand") posts.push(request.url());
    });
    await page.locator("#private-demand-intake form").evaluate((form) => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await expect(page.locator('[data-feedback-state="success"]')).toContainText("was received as a private request", { timeout: 20000 });
    expect(posts).toHaveLength(1);
    await expect(page.getByText(title, { exact: true })).toHaveCount(1);
  });

  test("active member double-submit creates only one service request", async ({ page }) => {
    test.skip(process.env.MPA_E2E_ALLOW_MUTATIONS !== "1", "Requires explicit opt-in to mutate a dedicated non-production test environment.");
    const email = process.env.MPA_E2E_ACTIVE_MEMBER_EMAIL;
    const password = process.env.MPA_E2E_ACTIVE_MEMBER_PASSWORD;
    test.skip(!email || !password, "Configure the dedicated active-member test account.");
    await signIn(page, email, password);
    await page.goto("/services");
    const requestButton = page.getByRole("button", { name: /request this service/i }).first();
    await expect(requestButton, "A published, approved test service must be seeded in the non-production environment.").toBeVisible();
    await requestButton.click();
    await page.getByLabel("Message to the provider").fill("Please contact me about the scope and expected outcomes for this service.");
    const posts = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && /\/api\/v1\/services\/[^/]+\/requests$/.test(new URL(request.url()).pathname)) posts.push(request.url());
    });
    await page.locator("#service-request form").evaluate((form) => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await expect(page.locator('[data-feedback-state="success"]')).toContainText(/service request was recorded|already have an active request/i, { timeout: 20000 });
    expect(posts).toHaveLength(1);
  });

  test("active member double-submit creates only one mentorship request", async ({ page }) => {
    test.skip(process.env.MPA_E2E_ALLOW_MUTATIONS !== "1", "Requires explicit opt-in to mutate a dedicated non-production test environment.");
    const email = process.env.MPA_E2E_ACTIVE_MEMBER_EMAIL;
    const password = process.env.MPA_E2E_ACTIVE_MEMBER_PASSWORD;
    test.skip(!email || !password, "Configure the dedicated active-member test account.");
    await signIn(page, email, password);
    await page.goto("/mentorship");
    await page.getByRole("button", { name: /request mentorship without a preferred mentor/i }).click();
    await page.getByLabel("Your mentorship goal").fill("E2E goal: improve project leadership and communication.");
    const posts = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname === "/api/v1/mentorship/requests") posts.push(request.url());
    });
    await page.locator("#mentor-goal form").evaluate((form) => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await expect(page.getByText("Your request is in the system")).toBeVisible({ timeout: 20000 });
    expect(posts).toHaveLength(1);
  });
});
