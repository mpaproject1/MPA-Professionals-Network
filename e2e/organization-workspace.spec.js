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

  test("verified organization opens six keyboard-accessible folder tabs and their existing destinations", async ({ page }) => {
    await mockOrganizationApi(page, [organization()]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/organizations");
    await expect(page.getByRole("heading", { name: "Your organization at a glance" })).toBeVisible();
    const tabs = page.getByRole("tablist", { name: "Organization workspace folders" });
    await expect(tabs.getByRole("tab")).toHaveCount(6);
    const reports = tabs.getByRole("tab", { name: /Reports/ });
    await reports.focus();
    await expect(reports).toBeFocused();
    await reports.press("Enter");
    await expect(reports).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel").getByRole("link", { name: /Impact and outcomes/ })).toHaveAttribute("href", "/organizations/reports");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("legacy workspace URL redirects to the canonical organization entry", async ({ page }) => {
    await mockOrganizationApi(page, [organization()]);
    await page.goto("/organizations/workspace");
    await expect(page).toHaveURL(/\/organizations$/);
    await expect(page.getByRole("heading", { name: "Your organization at a glance" })).toBeVisible();
  });

  test("team and permission administration remains available as a focused destination", async ({ page }) => {
    await mockOrganizationApi(page, [organization()]);
    await page.goto("/organizations/team");
    await expect(page.getByRole("heading", { name: "Organization team & access" })).toBeVisible();
    await expect(page.getByText("Member administration")).toBeVisible();
  });
});
