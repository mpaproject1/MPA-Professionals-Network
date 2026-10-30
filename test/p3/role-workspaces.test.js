import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("role workspace navigation is available from the authenticated application shell", () => {
  const shell = read("../../web/components/shell.tsx");
  assert.match(shell, /\["\/workspaces","Role workspaces",ShieldCheck\]/);
});

test("workspace entry reads current server identity and organization relationships", () => {
  const page = read("../../web/app/workspaces/page.tsx");
  assert.match(page, /api<Identity>\("\/api\/v1\/me"/);
  assert.match(page, /api<Organization\[]>\("\/api\/v1\/organizations"/);
  assert.doesNotMatch(page, /task\.orgScope/);
  assert.match(page, /task\.scopeRoles\?\.some/);
  assert.match(page, /organization_admin/);
  assert.match(page, /recruiter/);
  assert.match(page, /project_manager/);
  assert.match(page, /read_only/);
  assert.match(page, /verified professional profile/);
});

test("privileged platform role grants remain system-administrator-only", () => {
  const admin = read("../../src/platform/user-admin.js");
  const declaration = admin.match(/const PRIVILEGED_ROLES=new Set\(\[([^\]]+)\]\)/);
  assert.ok(declaration, "privileged role catalogue must exist");
  for (const role of ["system_admin", "platform_admin", "membership_reviewer", "reviewer", "verification_reviewer", "ethics_reviewer", "appeal_reviewer", "finance_officer"]) {
    assert.ok(declaration[1].includes(JSON.stringify(role)), "missing privileged role: " + role);
  }
  assert.match(admin, /Only a system administrator may modify a privileged account/);
});

test("role workspace overview links to existing workflows rather than creating duplicate queues", () => {
  const page = read("../../web/app/workspaces/page.tsx");
  for (const href of ["/members", "/membership", "/verification", "/organizations", "/jobs", "/admin/finance", "/admin/support", "/admin/accounts", "/mentorship"]) {
    assert.ok(page.includes('href: "' + href + '"'), "missing existing workflow link: " + href);
  }
  assert.match(page, /Queue totals and progress remain in the authoritative workflows/);
});
