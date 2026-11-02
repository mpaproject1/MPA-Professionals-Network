import { expect, test } from "@playwright/test";

const organization = (overrides = {}) => ({
  id: "org-e2e-1",
  legal_name: "MPA Test Institution",
  display_name: "MPA Test Institution",
  organization_type: "nonprofit",
  role_code: "owner",
  verification_status: "verified",
  verification_case_status: "verified",
  tracking_reference: "ORG-TEST-001",
  ...overrides,
});

async function mockOrganizationApi(page, organizations, organizationAccess = organizations.map((item) => ({
  id: item.id,
  display_name: item.display_name,
  legal_name: item.legal_name,
  verification_status: item.verification_status,
  role_code: item.role_code || "owner",
  membership_status: "active",
}))) {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("mpa-session-token", "e2e-organization-session");
  });
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/\/+$/, "");
    let data = {};
    if (path === "/api/v1/organizations") data = organizations;
    else if (path === "/api/v1/me/organization-access") data = organizationAccess;
    else if (path === "/api/v1/me") data = { user_id: "e2e-org-user", roles: ["member"] };
    else if (path === "/api/v1/opportunity-inquiries") data = [];
    else if (/^\/api\/v1\/organizations\/[^/]+\/jobs$/.test(path)) data = [];
    else if (/^\/api\/v1\/organizations\/[^/]+\/users$/.test(path)) data = [];
    else if (/^\/api\/v1\/organizations\/[^/]+\/outcomes$/.test(path)) data = {
      jobs: [{ id: "job-e2e", title: "E2E opportunity", status: "published", applications: 5, active_pipeline: 2, offers: 1, accepted_offers: 1, hires: 1, scheduled_interviews: 0 }],
      requisitions: [],
    };
    else if (path === "/api/v1/organizations/org-e2e-1") {
      data = { ...organization(), users: [] };
    } else if (path === "/api/v1/organizations/org-e2e-1/users") data = [];
    else if (path.startsWith("/api/v1/notifications")) data = { items: [], counts: { unread: 0, action_required: 0 } };
    else if (path === "/api/v1/network-plus/access") data = { eligible: true, access: { member: true, organization: true } };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data }),
    });
  });
}

test.describe("MPA organization app entry and navigation", () => {
  test("signed-out visitors see the organization benefits before being sent to sign-in", async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.removeItem("mpa-session-token");
    });
    await page.goto("/organizations");
    await expect(page.getByRole("heading", { name: /Bring your organization into a trusted professional network/ })).toBeVisible();
    await page.getByRole("button", { name: "Register your organization" }).click();
    await expect(page).toHaveURL(/\/login\?next=\/organizations/);
  });

  test("authenticated unregistered account sees benefits and a progressive registration action before operational tools", async ({ page }) => {
    await mockOrganizationApi(page, []);
    await page.goto("/organizations");
    await expect(page.getByRole("heading", { name: /Bring your organization into a trusted professional network/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Register your organization" })).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Organization workspace folders" })).toHaveCount(0);
    await page.getByRole("button", { name: "Register your organization" }).click();
    await expect(page.getByRole("heading", { name: "Step 1 — Entity profile" })).toBeVisible();
  });

  test("inactive organization membership is not mistaken for an unregistered account", async ({ page }) => {
    await mockOrganizationApi(page, [], [{
      id: "org-e2e-suspended",
      display_name: "Former Organization",
      legal_name: "Former Organization PLC",
      role_code: "read_only",
      membership_status: "suspended",
      verification_status: "verified",
    }]);
    await page.goto("/organizations");
    await expect(page.getByRole("heading", { name: "Organization access is not active" })).toBeVisible();
    await expect(page.getByText("suspended", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Register your organization" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Register an organization" })).toHaveCount(0);
    await expect(page.getByRole("tablist", { name: "Organization workspace folders" })).toHaveCount(0);
  });

  test("organization access lookup failure does not expose registration or workspace actions", async ({ page }) => {
    await mockOrganizationApi(page, []);
    await page.route("**/api/v1/me/organization-access", (route) => route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "TEMPORARY_UNAVAILABLE", message: "Try again." } }),
    }));
    await page.goto("/organizations");
    await expect(page.getByRole("heading", { name: "Confirming your organization access" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Register your organization" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Register an organization" })).toHaveCount(0);
    await expect(page.getByRole("tablist", { name: "Organization workspace folders" })).toHaveCount(0);
  });

  test("pending organization sees the authoritative status and no operational folder shelf", async ({ page }) => {
    await mockOrganizationApi(page, [organization({
      verification_status: "pending",
      verification_case_status: "submitted",
    })]);
    await page.goto("/organizations");
    await expect(page.getByRole("heading", { name: "Your organization application" })).toBeVisible();
    await expect(page.getByText("Under review").first()).toBeVisible();
    await expect(page.getByText(/awaiting an authorized MPA review/)).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Organization workspace folders" })).toHaveCount(0);
  });

  test("case actively in review remains locked against resubmission", async ({ page }) => {
    await mockOrganizationApi(page, [organization({
      verification_status: "pending",
      verification_case_status: "in_review",
    })]);
    await page.goto("/organizations");
    await expect(page.getByText("Under review").first()).toBeVisible();
    await expect(page.getByText(/awaiting an authorized MPA review/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Continue verification" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Submit for verification" })).toBeDisabled();
  });

  test("correction-required case shows reviewer feedback and the permitted next action", async ({ page }) => {
    await mockOrganizationApi(page, [organization({
      verification_status: "unverified",
      verification_case_status: "correction_required",
      verification_decision_reason: "Please attach the current trade license.",
      missing_evidence: ["trade_license"],
    })]);
    await page.goto("/organizations");
    await expect(page.getByText("Changes requested").first()).toBeVisible();
    await expect(page.getByText(/Please attach the current trade license/).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Continue verification" })).toHaveAttribute("href", "/organizations#org-evidence");
    await expect(page.getByRole("tablist", { name: "Organization workspace folders" })).toHaveCount(0);
  });

  test("verified organization opens six keyboard-accessible folder tabs and their existing destinations", async ({ page }) => {
    await mockOrganizationApi(page, [organization(), organization({
      id: "org-e2e-2",
      legal_name: "Second MPA Institution",
      display_name: "Second MPA Institution",
      role_code: "read_only",
      tracking_reference: "ORG-TEST-002",
    })]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/organizations");
    await expect(page.getByRole("heading", { name: "Your organization at a glance" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recruitment activity" })).toBeVisible();
    await expect(page.getByText("Applications received")).toBeVisible();
    const organizationSwitcher = page.getByRole("combobox", { name: "Choose active organization" });
    await expect(organizationSwitcher).toBeEnabled();
    await expect(organizationSwitcher).toHaveValue("org-e2e-1");
    const tabs = page.getByRole("tablist", { name: "Organization workspace folders" });
    await expect(tabs.getByRole("tab")).toHaveCount(6);
    await expect(page.getByRole("tabpanel").getByRole("link", { name: /Jobs and recruitment/ })).toHaveAttribute("href", "/recruitment?organizationId=org-e2e-1");
    await organizationSwitcher.selectOption("org-e2e-2");
    await expect(tabs.getByRole("tab")).toHaveCount(3);
    await expect(tabs.getByRole("tab", { name: /Publishing/ })).toHaveCount(0);
    await organizationSwitcher.selectOption("org-e2e-1");
    await expect(tabs.getByRole("tab")).toHaveCount(6);
    const publishing = tabs.getByRole("tab", { name: /Publishing/ });
    const reviewing = tabs.getByRole("tab", { name: /Reviewing/ });
    await publishing.focus();
    await expect(publishing).toBeFocused();
    await publishing.press("ArrowRight");
    await expect(reviewing).toBeFocused();
    await expect(reviewing).toHaveAttribute("aria-selected", "true");
    const reports = tabs.getByRole("tab", { name: /Reports/ });
    await reports.focus();
    await expect(reports).toBeFocused();
    await reports.press("Enter");
    await expect(reports).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel").getByRole("link", { name: /Impact and outcomes/ })).toHaveAttribute("href", "/organizations/reports");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("recruitment opens with the organization selected from the dashboard context", async ({ page }) => {
    await mockOrganizationApi(page, [organization(), organization({
      id: "org-e2e-2",
      legal_name: "Second MPA Institution",
      display_name: "Second MPA Institution",
      role_code: "read_only",
      tracking_reference: "ORG-TEST-002",
    })]);
    await page.goto("/recruitment?organizationId=org-e2e-2");
    await expect(page.getByRole("combobox", { name: "Organization workspace" })).toHaveValue("org-e2e-2");
  });

  test("dashboard does not fabricate recruitment totals when the authorized outcome API is unavailable", async ({ page }) => {
    await mockOrganizationApi(page, [organization()]);
    await page.route("**/api/v1/organizations/*/outcomes", (route) => route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "FORBIDDEN", message: "Not permitted." } }),
    }));
    await page.goto("/organizations");
    await expect(page.getByText(/Live recruitment totals are not available/)).toBeVisible();
    await expect(page.getByText("Applications received", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Active pipeline", { exact: true })).toHaveCount(0);
  });

  test("read-only organization members do not see publishing, reviewing or team-administration folders", async ({ page }) => {
    await mockOrganizationApi(page, [organization({ role_code: "read_only" })]);
    await page.goto("/organizations");
    const tabs = page.getByRole("tablist", { name: "Organization workspace folders" });
    await expect(tabs.getByRole("tab")).toHaveCount(3);
    await expect(tabs.getByRole("tab", { name: /Publishing/ })).toHaveCount(0);
    await expect(tabs.getByRole("tab", { name: /Reviewing/ })).toHaveCount(0);
    await expect(tabs.getByRole("tab", { name: /Organization/ })).toHaveCount(0);
    await expect(tabs.getByRole("tab", { name: /Exploring/ })).toBeVisible();
  });

  test("finance and event roles retain outcome reporting without publishing or team controls", async ({ page }) => {
    await mockOrganizationApi(page, [organization({ role_code: "finance" })]);
    await page.goto("/organizations");
    const tabs = page.getByRole("tablist", { name: "Organization workspace folders" });
    await expect(tabs.getByRole("tab")).toHaveCount(3);
    await expect(tabs.getByRole("tab", { name: /Reports/ })).toBeVisible();
    await expect(tabs.getByRole("tab", { name: /Publishing/ })).toHaveCount(0);
    await expect(tabs.getByRole("tab", { name: /Reviewing/ })).toHaveCount(0);
    await expect(tabs.getByRole("tab", { name: /Organization/ })).toHaveCount(0);
  });

  test("legacy workspace URL redirects to the canonical organization entry", async ({ page }) => {
    await mockOrganizationApi(page, [organization()]);
    await page.goto("/organizations/workspace?source=legacy");
    await expect(page).toHaveURL(/\/organizations\?source=legacy$/);
    await expect(page.getByRole("heading", { name: "Your organization at a glance" })).toBeVisible();
  });

  test("team and permission administration remains available as a focused destination", async ({ page }) => {
    await mockOrganizationApi(page, [organization()]);
    await page.goto("/organizations/team");
    await expect(page.getByRole("heading", { name: "Organization team & access" })).toBeVisible();
    await expect(page.getByText("Member administration")).toBeVisible();
  });
});
