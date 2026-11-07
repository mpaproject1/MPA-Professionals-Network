import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(new URL("../../web/components/member-referral-workspace.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../../web/components/member-referral-workspace.module.css", import.meta.url), "utf8");
const members = await readFile(new URL("../../web/app/members/page.tsx", import.meta.url), "utf8");
const profile = await readFile(new URL("../../web/app/profile/page.tsx", import.meta.url), "utf8");
const service = await readFile(new URL("../../src/platform/member-referrals.js", import.meta.url), "utf8");

test("member command centre exposes the existing referral workspace", () => {
  assert.match(members, /id:"referrals",label:"Referrals"/);
  assert.match(members, /activeSection==="referrals".*MemberReferralWorkspace/s);
  assert.match(members, /window\.location\.hash === "#referrals"/);
  assert.match(component, /api<ReferralData>\("\/api\/v1\/me\/referrals"/);
});

test("profile includes the same personal referral URL and invitation actions", () => {
  assert.match(profile, /id: "referrals", label: "Referrals"/);
  assert.match(profile, /MemberReferralWorkspace compact/);
  assert.match(component, /navigator\.clipboard\.writeText/);
  assert.match(component, /navigator\.share/);
});

test("referral activity separates membership and employment milestones", () => {
  for (const status of ["registered", "membership_application_submitted", "membership_approved", "membership_declined", "membership_activated"]) {
    assert.ok(component.includes(status), "missing membership milestone " + status);
  }
  for (const status of ["application_submitted", "shortlisted", "interview", "offer_accepted", "employment_reported", "employment_verified"]) {
    assert.ok(component.includes(status), "missing employment milestone " + status);
  }
  assert.match(component, /item\.referral_type === "employment"/);
  assert.match(component, /item\.referral_type === "membership"/);
});

test("member-visible referral identities remain consent-gated by the existing service", () => {
  assert.match(service, /case when a\.status_visibility_consent then coalesce\(nullif\(trim\(p\.display_name\),''\),'MPA member'\) else 'Private referral' end referred_person/);
  assert.match(component, /item\.referred_person \|\| "Private referral"/);
  assert.match(component, /Application details, payments, contact information and evidence are never displayed/);
});

test("referral workspace provides filterable outcomes and narrow-screen layouts", () => {
  assert.match(component, /value=\{kind\} onChange/);
  assert.match(component, /value=\{status\} onChange/);
  assert.match(component, /value=\{search\} onChange/);
  assert.match(styles, /@media\(max-width:760px\)/);
  assert.match(styles, /@media\(max-width:460px\)/);
  assert.match(styles, /overflow-x:auto/);
});
