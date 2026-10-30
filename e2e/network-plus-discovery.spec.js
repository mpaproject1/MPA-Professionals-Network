import { expect, test } from "@playwright/test";

const organization = {
  id: "network-plus-org-1",
  display_name: "Verified Community Health Network",
  organization_type: "nonprofit",
  description: "A verified organization that opted into professional discovery.",
  website: "https://example.test",
  location_label: "Addis Ababa",
};

async function mockNetworkPlus(page, { eligible = true, onSearch } = {}) {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("mpa-session-token", "e2e-network-plus-session");
  });
  await page.route("**/api/v1/me", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ data: { user_id: "e2e-user", roles: ["member"] } }),
  }));
  await page.route("**/api/v1/organizations", route => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }),
  }));
  await page.route("**/api/v1/notifications?*", route => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ data: { counts: { unread: 0 } } }),
  }));
  await page.route("**/api/v1/network-plus/access", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ data: {
      eligible,
      access: { member: eligible, organization: false },
      nextAction: eligible ? "Choose discovery." : "A current active MPA membership is required.",
    } }),
  }));
  await page.route("**/api/v1/network-plus/organizations*", async route => {
    const url = new URL(route.request().url());
    onSearch?.(url.searchParams);
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ data: {
        items: [organization], limit: 21, offset: Number(url.searchParams.get("offset") || 0),
        total: 1, hasMore: false,
      } }),
    });
  });
}

test.describe("Network-Plus discovery acceptance", () => {
  test("desktop organization discovery uses the separate read-only search and safe result projection", async ({ page }) => {
    let submitted = null;
    await mockNetworkPlus(page, { onSearch: params => { submitted = Object.fromEntries(params.entries()); } });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/network-plus/organizations");

    await expect(page.getByRole("heading", { name: "Discover verified organizations." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Verified Community Health Network" })).toBeVisible();
    await expect(page.getByText("MPA verified")).toBeVisible();
    await expect(page.getByText("Private registration details, verification evidence, contacts and member rosters are not disclosed.")).toHaveCount(0);
    await expect(page.getByText("Organization discovery is read-only.")).toBeVisible();

    await page.getByLabel("Organization name or description").fill("Community Health");
    await page.getByLabel("Organization type").fill("nonprofit");
    await page.getByLabel("Location").fill("Addis Ababa");
    await page.getByRole("button", { name: "Search organizations" }).click();
    await expect.poll(() => submitted?.q).toBe("Community Health");
    expect(submitted.organizationType).toBe("nonprofit");
    expect(submitted.location).toBe("Addis Ababa");
    await expect(page.getByRole("link", { name: "Back to Network-Plus" })).toHaveAttribute("href", "/network-plus");
  });

  test("tablet and narrow mobile layouts keep the organization search usable without horizontal overflow", async ({ page }) => {
    await mockNetworkPlus(page);
    for (const viewport of [{ width: 820, height: 1180 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto("/network-plus/organizations");
      await expect(page.getByRole("heading", { name: "Discover verified organizations." })).toBeVisible();
      await expect(page.getByLabel("Organization name or description")).toBeVisible();
      await expect(page.getByLabel("Organization type")).toBeVisible();
      await expect(page.getByLabel("Location")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });

  test("direct URL entry is denied when the server does not confirm eligibility", async ({ page }) => {
    await mockNetworkPlus(page, { eligible: false });
    await page.goto("/network-plus/organizations");
    await expect(page.getByRole("heading", { name: "Network-Plus access is not available" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Discover verified organizations." })).toHaveCount(0);
  });

  test("top-level Network-Plus navigation waits for the current session access response", async ({ page }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem("mpa-session-token", "e2e-network-plus-session");
    });
    let releaseAccess;
    await page.route("**/api/v1/me", route => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ data: { user_id: "e2e-user", roles: ["member"] } }),
    }));
    await page.route("**/api/v1/organizations", route => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }),
    }));
    await page.route("**/api/v1/notifications?*", route => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ data: { counts: { unread: 0 } } }),
    }));
    await page.route("**/api/v1/network-plus/access", async route => {
      await new Promise(resolve => { releaseAccess = () => resolve(); });
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ data: { eligible: true, access: { member: true, organization: false }, nextAction: "Choose discovery." } }),
      });
    });

    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("link", { name: "Network-Plus", exact: true })).toHaveCount(0);
    releaseAccess?.();
    await expect(nav.getByRole("link", { name: "Network-Plus", exact: true })).toBeVisible();
  });
});
