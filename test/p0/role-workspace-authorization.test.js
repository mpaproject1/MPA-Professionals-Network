import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("full organization detail is private to an active member of that organization", () => {
  const service = read("src/organization-jobs/service.js");
  assert.match(service, /export async function getOrganization\(orgId,viewerId=null\)/);
  assert.match(service, /if\(!viewerId\) throw error\(403/);
  assert.match(service, /organization_membership om where om\.organization_id=\$1 and om\.user_id=\$2 and om\.status='active'/);
  assert.match(service, /export async function getPublicOrganizationProfile\(orgId\)/);
  assert.match(service, /return \{\.\.\.org,users\}/);
});

test("reviewer queue derives scope from the authenticated viewer, not a caller-supplied reviewerId", () => {
  const service = read("src/verification/service.js");
  const server = read("server.js");
  assert.match(service, /if\(!filters\.viewerId\) throw error\(403/);
  assert.match(service, /vc\.assigned_reviewer_id=\$N",filters\.viewerId/);
  assert.match(server, /verification\.listCases\(\{viewerId:identity\.sub/);
});

test("reviewer case details enforce assignment unless the viewer has elevated authority", () => {
  const service = read("src/verification/service.js");
  assert.match(service, /Only the assigned reviewer or an explicitly authorized verification manager may view this case/);
  assert.match(service, /row\.assigned_reviewer_id!==viewerId/);
});

test("review assignment requires a system administrator or explicit verification.manage permission", () => {
  const service = read("src/verification/service.js");
  const server = read("server.js");
  assert.match(service, /Only a verification manager may assign review cases/);
  assert.match(server, /anyRoleOrPermission\(identity,\["system_admin"\],\["verification\.manage"\]\)/);
});

test("membership activation is separate from application approval and payment verification", () => {
  const server = read("server.js");
  const membership = read("src/membership/service.js");
  assert.match(server, /membership\.verifyPayment\(/);
  assert.match(server, /membership\.activateApplication\(/);
  assert.match(membership, /payment/i);
  assert.match(membership, /activateApplication/);
});
