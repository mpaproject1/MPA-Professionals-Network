import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Keep tests within each spec sequential so stateful journeys retain their
  // intended order, while allowing two independent spec files to run together.
  // Each Playwright test still receives its own isolated browser context.
  fullyParallel: false,
  workers: process.env.CI ? 2 : undefined,
  retries: 0,
  reporter: "list",
  timeout: 60000,
  expect: { timeout: 12000 },
  use: {
    baseURL: process.env.WEB_BASE_URL || "http://127.0.0.1:3001",
    headless: true,
    screenshot: "only-on-failure",
    // Failure traces preserve actionable browser diagnostics without retaining
    // large video files for every failed test.
    video: "off",
    trace: "retain-on-failure"
  }
});
