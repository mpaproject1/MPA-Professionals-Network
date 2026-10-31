import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, service, server, compatibility, privateFiles, fixtureText] = await Promise.all([
  read("../../db/migrations/20261031110000_network_plus_business_discovery.sql"),
  read("../../src/network-plus/business-discovery.js"),
  read("../../server.js"),
  read("../../scripts/check-new-migration-compatibility.js"),
  read("../../src/platform/private-file-storage.js"),
  read("../fixtures/network-plus-business-discovery.json"),
]);

test("Increment 5 adds a separate business domain without duplicating canonical identities or rewriting legacy services", () => {
  for (const table of ["network_plus_business","network_plus_business_ownership","network_plus_business_access","network_plus_business_verification_case","network_plus_business_verification_evidence","network_plus_service_listing","network_plus_business_event","network_plus_service_listing_event"]) {
    assert.match(migration, new RegExp("create table if not exists " + table, "i"));
  }
  assert.match(migration, /references app_user\(id\)/);
  assert.match(migration, /references organization\(id\)/);
  assert.doesNotMatch(migration, /create table if not exists (person|app_user|organization|professional_profile)\b/i);
  assert.doesNotMatch(migration, /insert into (network_plus_business|network_plus_business_ownership|network_plus_service_listing)/i);
  assert.doesNotMatch(migration, /delete from|drop table|truncate table|alter table service_listing\b|alter table service_request\b/i);
});

test("ownership requires one canonical owner party, explicit consent and scoped operational delegation", () => {
  assert.match(migration, /owner_type text not null check \(owner_type in \('member','organization'\)\)/);
  assert.match(migration, /owner_user_id uuid references app_user\(id\)/);
  assert.match(migration, /owner_organization_id uuid references organization\(id\)/);
  assert.match(migration, /consent_status text not null default 'pending'/);
  assert.match(migration, /ux_network_plus_business_primary_owner/);
  assert.match(migration, /business\.accept_terms/);
  assert.match(service, /assertBusinessOwner/);
  assert.match(service, /organization_membership om/);
  assert.match(service, /respondBusinessOwnership/);
  assert.match(service, /grantBusinessAccess/);
  assert.match(service, /revokeBusinessAccess/);
  assert.match(service, /DUPLICATE_BUSINESS/);
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /om\.role_code='project_manager'/);
  assert.match(service, /visibleAudiences/);
  assert.match(service, /PUBLIC_CONTACT_DETAILS_FORBIDDEN/);
  assert.match(service, /INVALID_GEOGRAPHY_REFERENCE/);
});

test("commercial listings have separate moderation and publication states with constrained pricing and idempotency", () => {
  assert.match(migration, /create table if not exists network_plus_service_listing/);
  assert.match(migration, /'draft','pending_review','changes_requested','published','paused','suspended','rejected','archived'/);
  assert.match(migration, /pricing_model in \('free','fixed','hourly','quote'\)/);
  assert.match(migration, /ux_network_plus_service_idempotency_hash/);
  assert.match(migration, /business\.verify/);
  assert.match(migration, /business\.moderate/);
  assert.match(migration, /system_only/);
  assert.match(service, /submitProfessionalServiceListing/);
  assert.match(service, /moderateProfessionalServiceListing/);
  assert.match(service, /changeProfessionalServiceStatus/);
  assert.match(service, /status=any\(\$4::text\[\]\)/);
  assert.match(service, /assertBusinessPublishable/);
  assert.match(service, /SELF_REVIEW_FORBIDDEN/);
  assert.match(service, /moderation_submitted_by===userId/);
  assert.match(service, /row\.submitted_by===userId/);
});

test("discovery requires Network-Plus entry and exposes a limited published/verified projection", () => {
  assert.match(service, /resolveNetworkPlusAccess\(db,userId\)/);
  assert.match(service, /publication_status='published'/);
  assert.match(service, /verification_status='verified'/);
  assert.match(service, /moderation_status='approved'/);
  assert.match(service, /export async function listBusinesses/);
  assert.match(service, /export async function getBusiness/);
  assert.match(service, /export async function listProfessionalServices/);
  assert.match(service, /export async function getProfessionalService/);
  assert.match(service, /s\.audience=any/);
  const publicList = service.slice(service.indexOf("export async function listBusinesses"),service.indexOf("export async function getBusiness"));
  assert.doesNotMatch(publicList, /select b\.\*|verification_evidence|owner_user_id|owner_organization_id/);
});

test("API routes are authenticated, rate-limited for discovery and creation, and delegate resource checks to domain services", () => {
  assert.match(server, /const identity=await auth\(req\)/);
  assert.match(server, /network-plus\.business\.search/);
  assert.match(server, /network-plus\.service\.search/);
  assert.match(server, /network-plus\.business\.create/);
  assert.match(server, /network-plus\.service\.create/);
  assert.match(server, /api\/v1\/network-plus\/businesses/);
  assert.match(server, /api\/v1\/network-plus\/services/);
  assert.match(server, /api\/v1\/admin\/network-plus\/businesses/);
  assert.match(server, /api\/v1\/admin\/network-plus\/services/);
});

test("disposable migration compatibility checks include the Increment 5 migration and critical constraints", () => {
  assert.match(compatibility, /20261031110000_network_plus_business_discovery\.sql/);
  assert.match(compatibility, /ux_network_plus_business_idempotency_hash/);
  assert.match(compatibility, /ux_network_plus_service_idempotency_hash/);
  assert.match(compatibility, /network_plus_business_verification_case/);
});

test("private business verification evidence is readable only by an independent authorized reviewer", () => {
  assert.match(service, /file\.visibility!==\"private\"\|\|file\.created_by!==userId/);
  assert.match(service, /listBusinessVerificationEvidence/);
  assert.match(privateFiles, /network_plus_business_verification_evidence e join network_plus_business_verification_case c/);
  assert.match(privateFiles, /c\.submitted_by<>\$2/);
  assert.match(privateFiles, /permissions\.includes\(\"business\.verify\"\)/);
});

test("disposable fixture templates cover all canonical ownership types and negative access cases", () => {
  const fixtures=JSON.parse(fixtureText);
  assert.deepEqual(fixtures.businesses.map(item=>item.case),["individual-member-owned","organization-owned","joint-member-organization"]);
  assert.equal(fixtures.businesses[2].coOwner.expectedConsentStatus,"pending");
  assert.ok(fixtures.negativeCases.includes("duplicate-business-name-same-owner"));
  assert.ok(fixtures.negativeCases.includes("cross-organization-manager"));
  assert.ok(fixtures.negativeCases.includes("unconfirmed-private-evidence-file"));
  assert.equal(fixtures.serviceListing.audience,"both");
});
