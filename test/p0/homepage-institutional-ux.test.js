import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const home = await readFile(new URL("../../web/app/page.tsx", import.meta.url), "utf8");
const homeStyles = await readFile(new URL("../../web/app/landing-redesign.module.css", import.meta.url), "utf8");
const supportBot = await readFile(new URL("../../web/components/support-bot.tsx", import.meta.url), "utf8");
const serveCommunity = await readFile(new URL("../../web/app/serve-community/page.tsx", import.meta.url), "utf8");

test("homepage presents a split institutional hero and platform announcement without fabricated impact claims", () => {
  assert.match(home, /Your expertise can open/);
  assert.match(home, /Professional participation, with community service in view/);
  assert.match(home, /Where verification, review or sharing consent is required/);
  assert.doesNotMatch(home, /\b\d{2,}%\b|\b\d{3,}\+? professionals\b|“[^”]+”\s*—\s*[A-Z][a-z]+/);
  assert.match(homeStyles, /\.hero\s*\{/);
  assert.match(homeStyles, /\.announcement\s*\{/);
});

test("portal cards use existing destinations and clearly mark planned capabilities", () => {
  assert.match(home, /title: "Professional directory"[\s\S]*href: "\/network"/);
  assert.match(home, /title: "Executive mentorship"[\s\S]*href: "\/mentorship"/);
  assert.match(home, /title: "Islamic Finance"[\s\S]*status: "Planned capability"[\s\S]*href: "\/services"/);
  assert.match(home, /title: "Field audits"[\s\S]*status: "Planned capability"[\s\S]*href: "\/about"/);
  assert.match(serveCommunity, /\/service-demand/);
});

test("institutional dispatch uses the existing consent-based support workflow, not a fake subscription", () => {
  assert.match(home, /does not currently offer an email newsletter subscription/);
  assert.match(home, /mpa:open-support-contact/);
  assert.match(supportBot, /window\.addEventListener\("mpa:open-support-contact",openContact\)/);
  assert.match(supportBot, /setShowContact\(true\)/);
  assert.match(supportBot, /consentToContact/);
  assert.match(supportBot, /MPA will not contact you unless you check the consent box/);
  assert.match(supportBot, /Your message could not be sent\. Please try again\./);
});
