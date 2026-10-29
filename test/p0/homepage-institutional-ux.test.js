import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const home = await readFile(new URL("../../web/app/page.tsx", import.meta.url), "utf8");
const homeStyles = await readFile(new URL("../../web/app/landing-redesign.module.css", import.meta.url), "utf8");
const supportBot = await readFile(new URL("../../web/components/support-bot.tsx", import.meta.url), "utf8");
const serveCommunity = await readFile(new URL("../../web/app/serve-community/page.tsx", import.meta.url), "utf8");
const loginForm = await readFile(new URL("../../web/components/landing-login-form.tsx", import.meta.url), "utf8");
const pathways = await readFile(new URL("../../web/components/portal-pathways-slider.tsx", import.meta.url), "utf8");

test("homepage is limited to the branded hero and accessible pathway slider", () => {
  assert.match(home, /Your expertise can open/);
  assert.match(home, /Browse the Job Portal/);
  assert.match(home, /Explore Serve-Community/);
  assert.match(home, /<PortalPathwaysSlider\s*\/>/);
  assert.doesNotMatch(home, /LiveNetworkFeeds|live-network-feeds|Stay close to the work that matters/);
  assert.doesNotMatch(home, /\b\d{2,}%\b|\b\d{3,}\+? professionals\b|“[^”]+”\s*—\s*[A-Z][a-z]+/);
  assert.match(homeStyles, /\.hero\s*\{/);
  assert.match(homeStyles, /prefers-reduced-motion:reduce/);
});

test("pathway slider uses supported destinations and accessible manual controls", () => {
  assert.match(pathways, /\/jobs/);
  assert.match(pathways, /\/serve-community/);
  assert.match(pathways, /\/mentorship/);
  assert.match(pathways, /aria-label/);
  assert.match(pathways, /aria-pressed/);
  assert.match(pathways, /prefers-reduced-motion/);
  assert.match(serveCommunity, /\/service-demand/);
});

test("signed-out hero uses the real login workflow rather than a fake subscription", () => {
  assert.match(home, /<LandingLoginForm\s*\/>/);
  assert.match(loginForm, /\/api\/v1\/auth\/login/);
  assert.match(loginForm, /\/login/);
  assert.match(loginForm, /\/register/);
  assert.doesNotMatch(loginForm, /newsletter|subscribe/i);
});

test("support contact remains consent-based and retries failed delivery", () => {
  assert.match(supportBot, /window\.addEventListener\("mpa:open-support-contact",openContact\)/);
  assert.match(supportBot, /setShowContact\(true\)/);
  assert.match(supportBot, /consentToContact/);
  assert.match(supportBot, /MPA will not contact you unless you check the consent box/);
  assert.match(supportBot, /Your message could not be sent\. Please try again\./);
});
