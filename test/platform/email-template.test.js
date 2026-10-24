import test from "node:test";
import assert from "node:assert/strict";
import { escapeEmailHtml, renderBrandedEmail, renderVerificationEmail } from "../../src/platform/email-template.js";

test("branded email includes MPA identity and a responsive table-based shell", () => {
  const html = renderBrandedEmail({ subject: "Welcome", htmlBody: "<p>Your account is ready.</p>" });
  assert.match(html, /MPA Professionals Network/);
  assert.match(html, /#0B1630/);
  assert.match(html, /#C7F36B/);
  assert.match(html, /role="presentation"/);
  assert.match(html, /Your account is ready\./);
});

test("text-only messages are escaped and retain paragraph breaks", () => {
  const html = renderBrandedEmail({ subject: "Notice", textBody: "Hello <member>\n\nNext step & details" });
  assert.match(html, /Hello &lt;member&gt;/);
  assert.match(html, /Next step &amp; details/);
  assert.doesNotMatch(html, /Hello <member>/);
});

test("complete HTML documents are reduced to their body before branding", () => {
  const html = renderBrandedEmail({
    subject: "Verify",
    htmlBody: "<!doctype html><html><head><title>Old title</title></head><body><p>Verify now</p></body></html>"
  });
  assert.match(html, /Verify now/);
  assert.match(html, /<title>Verify<\/title>/);
  assert.doesNotMatch(html, /Old title/);
});

test("HTML escaping protects quotes and markup in dynamic values", () => {
  assert.equal(escapeEmailHtml(`<a href="x">It's & safe</a>`), "&lt;a href=&quot;x&quot;&gt;It&#39;s &amp; safe&lt;/a&gt;");
});

test("verification email branding escapes the registration reference and verification URL", () => {
  const html = renderVerificationEmail({
    subject: "Verify your email",
    textBody: "Confirm your MPA Professionals Network account.",
    verificationUrl: "https://portal.muslimprofession.org/verify-email?token=abc&next=<script>",
    registrationReference: "MPA<123>"
  });
  assert.match(html, /MPA&lt;123&gt;/);
  assert.match(html, /token=abc&amp;next=&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Confirm your MPA Professionals Network account\./);
});
