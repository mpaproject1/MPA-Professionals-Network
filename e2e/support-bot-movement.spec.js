import { expect, test } from "@playwright/test";

test.describe("MPA support assistant movement and viewport safety", () => {
  test("mouse drag and keyboard arrows reposition the launcher", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    const launcher = page.getByRole("button", { name: "Open MPA support" });
    await expect(launcher).toBeVisible();
    await launcher.click();
    await expect(page.locator('section[aria-label="MPA support assistant"]')).toBeVisible();

    const root = page.locator("div[data-panel-below]");
    const handle = page.getByRole("button", { name: /Move support assistant/ });
    const before = await root.boundingBox();
    const handleBox = await handle.boundingBox();
    expect(before).not.toBeNull();
    expect(handleBox).not.toBeNull();

    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + handleBox.width / 2 + 60, handleBox.y + handleBox.height / 2 + 35, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => (await root.boundingBox())?.x).not.toBe(before.x);

    const afterMouse = await root.boundingBox();
    await handle.focus();
    await handle.press("ArrowLeft");
    await expect.poll(async () => (await root.boundingBox())?.x).toBeLessThan(afterMouse.x);

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("mpa-support-position-v1") || "null"));
    expect(saved).toEqual(expect.objectContaining({ left: expect.any(Number), top: expect.any(Number) }));
  });

  test("touch drag keeps the launcher above mobile navigation and quick questions work", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true
    });
    const page = await context.newPage();
    try {
      await page.goto("/");
      const nav = page.locator(".mobile-nav");
      await expect(nav).toBeVisible();

      await page.getByRole("button", { name: "Open MPA support" }).tap();
      await expect(page.locator('section[aria-label="MPA support assistant"]')).toBeVisible();
      await page.getByRole("button", { name: "How do I join MPA?" }).tap();
      await expect(page.getByRole("textbox", { name: "Ask MPA support" })).toHaveValue("How do I join MPA?");

      const root = page.locator("div[data-panel-below]");
      const handle = page.getByRole("button", { name: /Move support assistant/ });
      const before = await root.boundingBox();
      const handleBox = await handle.boundingBox();
      expect(before).not.toBeNull();
      expect(handleBox).not.toBeNull();

      const session = await context.newCDPSession(page);
      const x = Math.round(handleBox.x + handleBox.width / 2);
      const y = Math.round(handleBox.y + handleBox.height / 2);
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y, id: 1 }]
      });
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x - 40, y: y + 35, id: 1 }]
      });
      await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect.poll(async () => (await root.boundingBox())?.x).not.toBe(before.x);

      const launcherBox = await page.getByRole("button", { name: "Close MPA support panel" }).boundingBox();
      const navBox = await nav.boundingBox();
      expect(launcherBox).not.toBeNull();
      expect(navBox).not.toBeNull();
      expect(launcherBox.y + launcherBox.height).toBeLessThanOrEqual(navBox.y);
    } finally {
      await context.close();
    }
  });
});
