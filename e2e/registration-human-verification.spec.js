import { expect, test } from "@playwright/test";

const challenge = (id = "challenge-1") => ({
  required: true,
  id,
  question: "Confirm you are human: 7 + 4 = ?",
  expiresAt: new Date(Date.now() + 5 * 60_000).toISOString()
});
const json = (data) => ({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });

async function stubChallenge(page, options = {}) {
  await page.addInitScript(() => {
    localStorage.setItem("mpa-privacy-preferences-v1", JSON.stringify({ version: "2026-10-16-v1", necessary: true, analytics: false, personalization: false, updatedAt: new Date().toISOString() }));
  });
  let issued = 0;
  await page.route("**/api/v1/auth/human-challenge", async route => {
    issued += 1;
    await route.fulfill(json(challenge(`challenge-${issued}`)));
  });
  if (options.verify) await page.route("**/api/v1/auth/human-challenge/verify", options.verify);
  return { issued: () => issued };
}

async function completeRegistrationForm(page) {
  await page.getByLabel("First name").fill("Test");
  await page.getByLabel("Last / grandfather name").fill("Applicant");
  await page.getByLabel("Display name").fill("Test Applicant");
  await page.getByLabel("Email").fill("human-check-e2e@example.test");
  await page.getByLabel("Phone").fill("+251900000001");
  await page.getByLabel("Password", { exact: true }).fill("test-password-12345");
  await page.getByLabel("Confirm password").fill("test-password-12345");
  await page.getByRole("checkbox", { name: /I agree to the Terms of Use/i }).check();
}

test.describe("registration human verification", () => {
  test("loads a challenge and exposes its question and answer field", async ({ page }) => {
    await stubChallenge(page);
    await page.goto("/register");
    await expect(page.getByRole("region", { name: "Human verification" })).toBeVisible();
    await expect(page.getByText("Confirm you are human: 7 + 4 = ?")).toBeVisible();
    await expect(page.getByRole("textbox", { name: /Confirm you are human/ })).toBeVisible();
  });

  test("a correct answer returns a short-lived proof token", async ({ page }) => {
    await stubChallenge(page, {
      verify: route => route.fulfill(json({ token: "correct-answer-proof-token-012345678901234567890123456789" }))
    });
    await page.goto("/register");
    const result = await page.evaluate(() => fetch("/api/v1/auth/human-challenge/verify", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "challenge-1", answer: "11" })
    }).then(response => response.json()));
    expect(result.data.token).toMatch(/^correct-answer-proof-token-/);
  });

  test("registration proceeds after successful human verification", async ({ page }) => {
    await stubChallenge(page, {
      verify: route => route.fulfill(json({ token: "verified-proof-token-012345678901234567890123456789" }))
    });
    await page.route("**/api/v1/auth/register", route => route.fulfill(json({
      verificationRequired: true,
      verificationSent: true,
      user: { email: "human-check-e2e@example.test" }
    })));
    await page.goto("/register");
    await completeRegistrationForm(page);
    await page.getByRole("textbox", { name: /Confirm you are human/ }).fill("11");
    await page.getByRole("button", { name: /Create professional account/i }).click();
    await expect(page.getByText(/account was created/i)).toBeVisible();
    await expect(page.getByText(/verify the representative's email/i)).toBeVisible();
  });

  test("incorrect answers are rejected and a fresh challenge is loaded", async ({ page }) => {
    let verifications = 0;
    const issued = await stubChallenge(page, {
      verify: async route => {
        verifications += 1;
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "CHALLENGE_INCORRECT", message: "incorrect" } })
        });
      }
    });
    await page.goto("/register");
    await completeRegistrationForm(page);
    await page.getByRole("textbox", { name: /Confirm you are human/ }).fill("10");
    await page.getByRole("button", { name: /Create professional account/i }).click();
    await expect.poll(() => verifications).toBe(1);
    await expect.poll(() => issued.issued()).toBe(2);
    await expect(page.getByText("Confirm you are human: 7 + 4 = ?")).toBeVisible();
  });

  test("expired challenges are rejected and can be replaced", async ({ page }) => {
    let verifications = 0;
    const issued = await stubChallenge(page, {
      verify: async route => {
        verifications += 1;
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "CHALLENGE_INVALID", message: "expired" } })
        });
      }
    });
    await page.goto("/register");
    await completeRegistrationForm(page);
    await page.getByRole("textbox", { name: /Confirm you are human/ }).fill("11");
    await page.getByRole("button", { name: /Create professional account/i }).click();
    await expect.poll(() => verifications).toBe(1);
    await expect.poll(() => issued.issued()).toBe(2);
    await expect(page.getByRole("textbox", { name: /Confirm you are human/ })).toBeVisible();
  });

  test("a verified challenge token cannot be consumed twice", async ({ page }) => {
    let consumed = false;
    await stubChallenge(page, {
      verify: route => route.fulfill(json({ token: "single-use-proof-token-012345678901234567890123456789" }))
    });
    await page.route("**/api/v1/auth/register", async route => {
      const body = route.request().postDataJSON();
      if (!body.humanCheckToken || consumed) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "CHALLENGE_INVALID", message: "invalid or already used" } })
        });
        return;
      }
      consumed = true;
      await route.fulfill(json({ verificationRequired: true, verificationSent: true }));
    });
    await page.goto("/register");
    const first = await page.evaluate(async () => {
      const verified = await fetch("/api/v1/auth/human-challenge/verify", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "challenge-1", answer: "11" })
      }).then(response => response.json());
      return fetch("/api/v1/auth/register", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "single-use@example.test", password: "test-password-12345", humanCheckToken: verified.data.token })
      }).then(response => response.status);
    });
    const second = await page.evaluate(async () => fetch("/api/v1/auth/register", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "single-use@example.test", password: "test-password-12345", humanCheckToken: "single-use-proof-token-012345678901234567890123456789" })
    }).then(async response => ({ status: response.status, body: await response.json() })));
    expect(first).toBe(200);
    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe("CHALLENGE_INVALID");
  });

  test("the failed-answer limit permits ten attempts and rejects the eleventh", async ({ page }) => {
    let attempts = 0;
    await stubChallenge(page, {
      verify: async route => {
        attempts += 1;
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: attempts <= 10 ? "CHALLENGE_INCORRECT" : "CHALLENGE_ATTEMPTS_EXCEEDED" } })
        });
      }
    });
    await page.goto("/register");
    const results = await page.evaluate(async () => {
      const responses = [];
      for (let i = 0; i < 11; i += 1) {
        const response = await fetch("/api/v1/auth/human-challenge/verify", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: "same-challenge", answer: "0" })
        });
        responses.push({ status: response.status, body: await response.json() });
      }
      return responses;
    });
    expect(attempts).toBe(11);
    expect(results.slice(0, 10).every(result => result.status === 400 && result.body.error.code === "CHALLENGE_INCORRECT")).toBe(true);
    expect(results[10].body.error.code).toBe("CHALLENGE_ATTEMPTS_EXCEEDED");
  });

  test("the refresh action supports at least ten consecutive challenge refreshes", async ({ page }) => {
    const issued = await stubChallenge(page);
    await page.goto("/register");
    const verification = page.getByRole("region", { name: "Human verification" });
    const refresh = verification.locator("button").first();
    await expect(verification).toBeVisible();
    await expect(refresh).toBeVisible();
    await expect(refresh).toBeEnabled();
    for (let retry = 0; retry < 10; retry += 1) {
      const before = issued.issued();
      await refresh.click();
      await expect.poll(() => issued.issued()).toBe(before + 1);
      await expect(refresh).toBeEnabled();
    }
    expect(issued.issued()).toBe(11);
  });

  test("explicit server-side opt-out allows registration without requesting a challenge token", async ({ page }) => {
    let verifyRequests = 0;
    await page.route("**/api/v1/auth/human-challenge", route => route.fulfill(json({ required: false })));
    await page.route("**/api/v1/auth/human-challenge/verify", route => {
      verifyRequests += 1;
      return route.fulfill(json({ token: "unexpected" }));
    });
    await page.route("**/api/v1/auth/register", route => route.fulfill(json({
      verificationRequired: true,
      verificationSent: true,
      user: { email: "human-check-disabled@example.test" }
    })));
    await page.goto("/register");
    await expect(page.getByRole("region", { name: "Human verification" })).toHaveCount(0);
    await completeRegistrationForm(page);
    await page.getByRole("button", { name: /Create professional account/i }).click();
    await expect(page.getByText(/account was created/i)).toBeVisible();
    expect(verifyRequests).toBe(0);
  });

  test("registration without a valid token is rejected by the registration contract", async ({ page }) => {
    await stubChallenge(page);
    await page.route("**/api/v1/auth/register", route => route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "CHALLENGE_REQUIRED", message: "Complete the human check." } })
    }));
    await page.goto("/register");
    const response = await page.evaluate(() => fetch("/api/v1/auth/register", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "missing-token@example.test", password: "test-password-12345" })
    }).then(async result => ({ status: result.status, body: await result.json() })));
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("CHALLENGE_REQUIRED");
  });
});
