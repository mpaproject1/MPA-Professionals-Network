import { expect, test } from "@playwright/test";

test.describe("MPA installable mobile workspace", () => {
  test("mobile home is a touch-first entry point with no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/mobile");

    await expect(page.getByRole("heading", { name: "Your MPA, in your pocket." })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Mobile navigation" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("href", "/mobile");
    await expect(nav.getByRole("link", { name: "Job Portal", exact: true })).toHaveAttribute("href", "/jobs");
    await expect(nav.getByRole("link", { name: "Serve-Community", exact: true })).toHaveAttribute("href", "/serve-community");
    await expect(nav.getByRole("link", { name: "Login", exact: true })).toHaveAttribute("href", "/login");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("PWA manifest, native install icon and service worker are available", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/mobile");

    const manifestResponse = await page.request.get("/manifest.webmanifest");
    expect(manifestResponse.ok()).toBe(true);
    const manifest = await manifestResponse.json();
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/mobile");
    expect(manifest.icons.some((icon) => icon.src === "/brand/apple-touch-icon.png")).toBe(true);
    expect(manifest.icons.some((icon) => icon.src === "/brand/mpa-pwa-icon.svg")).toBe(true);

    const iconResponse = await page.request.get("/brand/apple-touch-icon.png");
    expect(iconResponse.ok()).toBe(true);
    expect(iconResponse.headers()["content-type"]).toContain("image/png");

    const workerResponse = await page.request.get("/sw.js");
    expect(workerResponse.ok()).toBe(true);
    expect(await workerResponse.text()).toContain('addEventListener("push"');

    const registration = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return null;
      const ready = await navigator.serviceWorker.ready;
      return { scope: ready.scope, active: Boolean(ready.active) };
    });
    expect(registration?.active).toBe(true);
    expect(registration?.scope).toBe(new URL("/", page.url()).href);
  });

  test("desktop retains its primary navigation and hides the mobile dock", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/mobile");
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
