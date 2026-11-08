import { expect, test } from "@playwright/test";

async function dismissPrivacyChoices(page) {
  const rejectOptional = page.getByRole("button", { name: "Reject optional" });
  await rejectOptional.waitFor({ state: "visible", timeout: 2000 }).catch(() => {});
  if (await rejectOptional.isVisible().catch(() => false)) await rejectOptional.click();
}

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
    else if (path === "/api/v1/me") data = { user_id: "e2e-org-user", email: "org-owner@example.org", roles: ["member"] };
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
    await dismissPrivacyChoices(page);
    await expect(page.getByRole("heading", { name: /Bring your organization into a trusted professional network/ })).toBeVisible();
    await page.getByRole("button", { name: "Register your organization" }).click();
    await expect(page).toHaveURL(/\/login\?next=\/organizations/);
  });

  test("authenticated unregistered account sees benefits and a progressive registration action before operational tools", async ({ page }) => {
    await mockOrganizationApi(page, []);
    await page.goto("/organizations");
    await dismissPrivacyChoices(page);
    await expect(page.getByRole("heading", { name: /Bring your organization into a trusted professional network/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Register your organization" })).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Organization workspace folders" })).toHaveCount(0);
    await page.getByRole("button", { name: "Register your organization" }).click();
    await expect(page.getByRole("heading", { name: "Tell us about your organization" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Organization onboarding" }).getByRole("listitem")).toHaveCount(5);
  });

  test("guided registration advances one step at a time and saves a signed-in account draft", async ({ page }) => {
    await mockOrganizationApi(page, []);
    await page.goto("/organizations");
    await dismissPrivacyChoices(page);
    await page.getByRole("button", { name: "Register your organization" }).click();
    await expect(page.getByRole("heading", { name: "Tell us about your organization" })).toBeVisible();
    await page.getByLabel("Legal name").fill("Example Ethiopian Association");
    await page.getByLabel("Display name").fill("Example Association");
    await page.getByLabel("Organization type").selectOption("professional_association");
    await expect.poll(() => page.evaluate(() => {
      const raw = window.localStorage.getItem("mpa.organization-registration-draft");
      return raw ? JSON.parse(raw).legalName : "";
    })).toBe("Example Ethiopian Association");
    await page.reload();
    await dismissPrivacyChoices(page);
    await expect(page.getByRole("heading", { name: "Tell us about your organization" })).toBeVisible();
    await expect(page.getByLabel("Legal name")).toHaveValue("Example Ethiopian Association");
    await expect(page.getByRole("list", { name: "Organization onboarding" }).getByRole("listitem")).toHaveCount(5);
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByRole("heading", { name: "Add an official institutional contact" })).toBeVisible();
    await expect(page.getByLabel("Institutional email")).toBeVisible();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("heading", { name: "Tell us about your organization" })).toBeVisible();
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
    await dismissPrivacyChoices(page);
    await expect(page.getByRole("heading", { name: "Organization access is not active" })).toBeVisible();
    await expect(page.getByText("suspended", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Register your organization" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Register an organization" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Your organizations" })).toHaveCount(0);
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
    await dismissPrivacyChoices(page);
    await expect(page.getByRole("heading", { name: "Confirming your organization access" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Register your organization" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Register an organization" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Your organizations" })).toHaveCount(0);
    await expect(page.getByRole("tablist", { name: "Organization workspace folders" })).toHaveCount(0);
  });

  test("pending organization sees the authoritative status and no operational folder shelf", async ({ page }) => {
    await mockOrganizationApi(page, [organization({
      verification_status: "pending",
      verification_case_status: "submitted",
    })]);
    await page.goto("/organizations");
    await dismissPrivacyChoices(page);
    await expect(page.getByRole("heading", { name: "Your organization application" })).toBeVisible();
    await expect(page.getByText("Under review").first()).toBeVisible();
    await expect(page.getByText(/awaiting an authorized MPA review/)).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Organization workspace folders" })).toHaveCount(0);
    await page.getByRole("button", { name: "Continue organization setup" }).click();
    await expect(page.getByRole("heading", { name: "Track your MPA verification" })).toBeVisible();
    await expect(page.getByText(/awaiting review/i).first()).toBeVisible();
  });

  test("case actively in review remains locked against resubmission", async ({ page }) => {
    await mockOrganizationApi(page, [organization({
      verification_status: "pending",
      verification_case_status: "in_review",
    })]);
    await page.goto("/organizations");
    await dismissPrivacyChoices(page);
    await expect(page.getByText("Under review").first()).toBeVisible();
    await expect(page.getByText(/awaiting an authorized MPA review/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Update requested evidence" })).toHaveCount(0);
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
    await dismissPrivacyChoices(page);
    await expect(page.getByText("Changes requested").first()).toBeVisible();
    await expect(page.getByText(/Please attach the current trade license/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Complete trust checklist" })).toBeVisible();
    await page.getByRole("button", { name: "Complete trust checklist" }).click();
    await expect(page.locator("#org-evidence")).toBeInViewport();
    await expect(page.getByRole("tablist", { name: "Organization workspace folders" })).toHaveCount(0);
  });

  test("verified organization opens five keyboard-accessible workspace tabs and their existing destinations", async ({ page }) => {
    await mockOrganizationApi(page, [organization(), organization({
      id: "org-e2e-2",
      legal_name: "Second MPA Institution",
      display_name: "Second MPA Institution",
      role_code: "read_only",
      tracking_reference: "ORG-TEST-002",
    }), organization({
      id: "org-e2e-pending",
      legal_name: "Pending MPA Institution",
      display_name: "Pending MPA Institution",
      role_code: "owner",
      verification_status: "pending",
      verification_case_status: "submitted",
      tracking_reference: "ORG-TEST-PENDING",
    })]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/organizations");
    await dismissPrivacyChoices(page);
    await expect(page.getByRole("heading", { name: "Your organization at a glance" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your organizations" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recruitment activity" })).toBeVisible();
    await expect(page.getByText("Applications received")).toBeVisible();
    await expect(page.getByRole("link", { name: /Open task/ })).toHaveAttribute("href", "/recruitment?organizationId=org-e2e-1#candidate-pipeline");
    const organizationSwitcher = page.getByRole("combobox", { name: "Choose active organization" });
    await expect(organizationSwitcher).toBeEnabled();
    await expect(organizationSwitcher).toHaveValue("org-e2e-1");
    const tabs = page.getByRole("tablist", { name: "Organization workspace folders" });
    await expect(tabs.getByRole("tab")).toHaveCount(5);
    await expect(page.getByRole("tabpanel").getByRole("link", { name: /Continue/ })).toHaveAttribute("href", "/recruitment?organizationId=org-e2e-1");
    await organizationSwitcher.selectOption("org-e2e-2");
    await expect(tabs.getByRole("tab")).toHaveCount(2);
    await expect(tabs.getByRole("tab", { name: /Opportunities/ })).toHaveCount(0);
    await organizationSwitcher.selectOption("org-e2e-1");
    await expect(tabs.getByRole("tab")).toHaveCount(5);
    await tabs.getByRole("tab", { name: "Opportunities" }).click();
    await page.getByRole("button", { name: "Professional service" }).click();
    await expect(page.getByRole("link", { name: /Continue/ })).toHaveAttribute("href", "/services?organizationId=org-e2e-1");
    await page.getByRole("button", { name: "Mentorship" }).click();
    await expect(page.getByRole("link", { name: /Continue/ })).toHaveAttribute("href", "/mentorship?organizationId=org-e2e-1");
    await page.getByRole("button", { name: "Job" }).click();
    const publishing = tabs.getByRole("tab", { name: /Opportunities/ });
    const reviewing = tabs.getByRole("tab", { name: /Applications/ });
    await publishing.focus();
    await expect(publishing).toBeFocused();
    await publishing.press("ArrowRight");
    await expect(reviewing).toBeFocused();
    await expect(reviewing).toHaveAttribute("aria-selected", "true");
    const reports = tabs.getByRole("tab", { name: /Impact/ });
    await reports.focus();
    await expect(reports).toBeFocused();
    await reports.press("Enter");
    await expect(reports).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel").getByRole("link", { name: /Impact and outcomes/ })).toHaveAttribute("href", "/organizations/reports?organizationId=org-e2e-1");
    await tabs.getByRole("tab", { name: /Applications/ }).click();
    await page.getByRole("button", { name: "Public inquiries" }).click();
    await expect(page.getByRole("link", { name: /Open review/ })).toHaveAttribute("href", "/organizations#org-inquiries");
    await expect(page.getByRole("heading", { name: "Public job inquiries" })).toBeVisible();
    await tabs.getByRole("tab", { name: /Opportunities/ }).click();
    await expect(page.getByRole("heading", { name: "Public job inquiries" })).toHaveCount(0);
    await tabs.getByRole("tab", { name: /Discover/ }).click();
    const discoverPanel = page.getByRole("tabpanel");
    await expect(discoverPanel.getByRole("link", { name: /Professional network/ })).toHaveAttribute("href", "/network");
    await expect(discoverPanel.getByRole("link", { name: /Network-Plus/ })).toHaveAttribute("href", "/network-plus");
    await expect(discoverPanel.getByRole("link", { name: /Organization directory/ })).toHaveAttribute("href", "/organizations/directory");
    await expect(discoverPanel.getByRole("link", { name: /Serve-Community requests/ })).toHaveAttribute("href", "/service-demand");
    await expect(discoverPanel.getByRole("link", { name: /Mentorship network/ })).toHaveAttribute("href", "/mentorship?organizationId=org-e2e-1");
    await tabs.getByRole("tab", { name: /^Organization/ }).click();
    await expect(page.getByRole("heading", { name: "Organization", exact: true })).toBeVisible();
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
    await dismissPrivacyChoices(page);
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
    await dismissPrivacyChoices(page);
    await expect(page.getByText(/Live recruitment totals are not available/)).toBeVisible();
    await expect(page.getByText("Applications received", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Active pipeline", { exact: true })).toHaveCount(0);
  });

  test("read-only organization members do not see opportunity, application or team-administration workspaces", async ({ page }) => {
    await mockOrganizationApi(page, [organization({ role_code: "read_only" })]);
    await page.goto("/organizations");
    await dismissPrivacyChoices(page);
    const tabs = page.getByRole("tablist", { name: "Organization workspace folders" });
    await expect(tabs.getByRole("tab")).toHaveCount(2);
    await expect(tabs.getByRole("tab", { name: /Opportunities/ })).toHaveCount(0);
    await expect(tabs.getByRole("tab", { name: /Applications/ })).toHaveCount(0);
    await expect(tabs.getByRole("tab", { name: /^Organization\b/ })).toHaveCount(0);
    await expect(tabs.getByRole("tab", { name: /Discover/ })).toBeVisible();
  });

  test("recruiter role sees permitted opportunities and application workspaces but not mentorship offers or team administration", async ({ page }) => {
    await mockOrganizationApi(page, [organization({ role_code: "recruiter" })]);
    await page.goto("/organizations");
    await dismissPrivacyChoices(page);
    await expect(page.getByRole("tab", { name: /Opportunities/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Applications/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /^Organization\b/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Job" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Professional service" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mentorship" })).toHaveCount(0);
  });

  test("finance and event roles retain outcome reporting without publishing or team controls", async ({ page }) => {
    await mockOrganizationApi(page, [organization({ role_code: "finance" })]);
    await page.goto("/organizations");
    await dismissPrivacyChoices(page);
    const tabs = page.getByRole("tablist", { name: "Organization workspace folders" });
    await expect(tabs.getByRole("tab")).toHaveCount(2);
    await expect(tabs.getByRole("tab", { name: /Impact/ })).toBeVisible();
    await expect(tabs.getByRole("tab", { name: /Opportunities/ })).toHaveCount(0);
    await expect(tabs.getByRole("tab", { name: /Applications/ })).toHaveCount(0);
    await expect(tabs.getByRole("tab", { name: /^Organization\b/ })).toHaveCount(0);
  });

  test("legacy workspace URL redirects to the canonical organization entry", async ({ page }) => {
    await mockOrganizationApi(page, [organization()]);
    await page.goto("/organizations/workspace?source=legacy");
    await dismissPrivacyChoices(page);
    await expect(page).toHaveURL(/\/organizations\?source=legacy$/);
    await expect(page.getByRole("heading", { name: "Your organization at a glance" })).toBeVisible();
  });

  test("team and permission administration remains available as a focused destination", async ({ page }) => {
    await mockOrganizationApi(page, [organization()]);
    await page.goto("/organizations/team");
    await dismissPrivacyChoices(page);
    await expect(page.getByRole("heading", { name: "Organization team & access" })).toBeVisible();
    await expect(page.getByText("Member administration")).toBeVisible();
  });
});
