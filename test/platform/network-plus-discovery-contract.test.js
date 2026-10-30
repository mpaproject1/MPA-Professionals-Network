import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [server, organizationService, migration, networkPage, organizationPage, landing, shell, privateOrganizationPage] = await Promise.all([
  read("../../server.js"),
  read("../../src/organization-jobs/service.js"),
  read("../../db/migrations/20261030220000_network_plus_organization_visibility.sql"),
  read("../../web/app/network/page.tsx"),
  read("../../web/app/network-plus/organizations/page.tsx"),
  read("../../web/app/network-plus/page.tsx"),
  read("../../web/components/shell.tsx"),
  read("../../web/app/organizations/directory/page.tsx"),
]);

test("organization discovery is a separate authenticated route and never reuses the private organization list", () => {
  assert.match(server, /p==="api\/v1\/network-plus\/organizations"[\s\S]*?listNetworkPlusOrganizations\(identity\.sub/);
  assert.doesNotMatch(server, /api\/v1\/network-plus\/organizations[\s\S]{0,500}listMyOrganizations/);
  assert.match(organizationPage, /\/api\/v1\/network-plus\/organizations/);
  assert.doesNotMatch(organizationPage, /\/api\/v1\/organizations(?:["'\x60]|\?)/);
  assert.match(privateOrganizationPage, /redirect\("\/services"\)/);
});

test("organization directory query uses verified canonical records and an explicit Network-Plus opt-in", () => {
  const start = organizationService.indexOf("export async function listNetworkPlusOrganizations");
  const end = organizationService.indexOf("export async function updateNetworkPlusVisibility", start);
  assert.ok(start >= 0 && end > start);
  const query = organizationService.slice(start, end);
  assert.match(query, /resolveNetworkPlusAccess\(db,viewerId\)/);
  assert.match(query, /o\.network_plus_visible=true/);
  assert.match(query, /o\.verification_status='verified'/);
  assert.match(query, /case when o\.website ~\* '\^https:\/\//);
  assert.match(query, /ilike \$\$\{args\.length\}/);
  assert.match(query, /lower\(o\.organization_type\)=lower\(\$\$\{args\.length\}\)/);
  assert.doesNotMatch(query, /o\.legal_name|o\.email|o\.phone|o\.address_text|verification_evidence|organization_membership/);
  assert.match(migration, /alter table organization[\s\S]*network_plus_visible boolean not null default false/);
  assert.doesNotMatch(migration, /create table/i);
});

test("only organization owners and administrators can change the explicit visibility setting", () => {
  const start = organizationService.indexOf("export async function updateNetworkPlusVisibility");
  const end = organizationService.indexOf("export async function getPublicOrganizationProfile", start);
  assert.ok(start >= 0 && end > start);
  const update = organizationService.slice(start, end);
  assert.match(update, /orgRole\(db,orgId,userId,\["owner","administrator"\]\)/);
  assert.match(update, /org\.verification_status!=="verified"/);
  assert.match(update, /audit\(db,userId,"organization\.network_plus_visibility_updated"/);
  assert.match(update, /reason\.length<8/);
});

test("Verified Member Discovery retains the existing talent API and has a Network-Plus return path", () => {
  assert.match(networkPage, /\/api\/v1\/talent/);
  assert.match(networkPage, /Verified Member Discovery/);
  assert.match(networkPage, /href="\/network-plus"/);
  assert.match(networkPage, /\/api\/v1\/talent\/inquiries/);
  assert.match(networkPage, /X-Idempotency-Key/);
});

test("member and organization discovery remain separate experiences with separate filters", () => {
  assert.match(organizationPage, /type OrganizationResult/);
  assert.match(organizationPage, /organizationType/);
  assert.match(organizationPage, /location/);
  assert.match(organizationPage, /read-only/i);
  assert.match(landing, /href="\/network"/);
  assert.match(landing, /href="\/network-plus\/organizations"/);
});

test("conditional Network-Plus navigation is bound to the current authenticated token", () => {
  assert.match(shell, /networkPlusAccessToken!==token/);
  assert.match(shell, /setNetworkPlusAccessToken\(networkPlus\.status==="fulfilled"&&networkPlus\.value\.eligible===true\?token:null\)/);
  assert.doesNotMatch(shell, /hasNetworkPlusAccess/);
});
