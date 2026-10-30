import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("role workspace navigation is available from the authenticated application shell", () => {
  const shell = read("../../web/components/shell.tsx");
  assert.ok(shell.includes('["/workspaces","Role workspaces",ShieldCheck]'));
});

test("workspace entry reads current server identity and organization relationships", () => {
  const page = read("../../web/app/workspaces/page.tsx");
  assert.ok(page.includes('api<Identity>("/api/v1/me"'));
  assert.ok(page.includes('api<Organization[]>("/api/v1/organizations"'));
  assert.ok(!page.includes("task.orgScope"));
  assert.ok(!page.includes("task.scopeRoles"));
  assert.ok(page.includes("organization_representative"));
  assert.ok(!page.includes('roles: ["verification_reviewer","ethics_reviewer","system_admin"]'));
  assert.ok(page.includes("verified professional profile"));
});

test("privileged platform role grants remain system-administrator-only", () => {
  const admin = read("../../src/platform/user-admin.js");
  assert.ok(admin.includes("const PRIVILEGED_ROLES=new Set"));
  for (const role of ["system_admin", "platform_admin", "membership_reviewer", "reviewer", "verification_reviewer", "ethics_reviewer", "appeal_reviewer", "finance_officer"]) {
    assert.ok(admin.includes(JSON.stringify(role)), "missing privileged role: " + role);
  }
  assert.ok(admin.includes("Only a system administrator may modify a privileged account"));
});

test("role workspace overview links to existing workflows rather than creating duplicate queues", () => {
  const page = read("../../web/app/workspaces/page.tsx");
  for (const href of ["/members", "/membership", "/verification", "/organizations", "/admin/finance", "/admin/support", "/admin/accounts", "/mentorship"]) {
    assert.ok(page.includes('href: "' + href + '"'), "missing existing workflow link: " + href);
  }
  assert.ok(page.includes("Queue totals and progress remain in the authoritative workflows"));
});
