import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration,service,requests,server,ui,landing,listingAdmin,businessAdmin,adminNav,compatibility] = await Promise.all([
  read("../../db/migrations/20261103130000_network_plus_phase1_needs_offers.sql"),
  read("../../src/network-plus/business-discovery.js"),
  read("../../src/network-plus/request-collaboration.js"),
  read("../../server.js"),
  read("../../web/app/network-plus/opportunities/page.tsx"),
  read("../../web/app/network-plus/page.tsx"),
  read("../../web/app/admin/network-plus/services/page.tsx"),
  read("../../web/app/admin/network-plus/businesses/page.tsx"),
  read("../../web/app/admin/admin-workspace.tsx"),
  read("../../scripts/check-new-migration-compatibility.js"),
]);

test("Phase 1 extends the canonical listing model and adds governed taxonomy, not a duplicate listing entity",()=>{
  assert.match(migration,/create table if not exists network_plus_listing_taxonomy/);
  assert.match(migration,/alter table network_plus_service_listing[\s\S]*add column if not exists listing_kind/);
  for(const column of ["subcategory_code","structured_attributes","taxonomy_version","wizard_step","draft_saved_at"])assert.match(migration,new RegExp("add column if not exists "+column));
  assert.doesNotMatch(migration,/create table if not exists network_plus_(opportunity|need|offer|product|catalog|listing)\b/i);
  assert.match(migration,/foreign key\(service_category\) references network_plus_listing_taxonomy/);
  assert.match(migration,/create table if not exists network_plus_service_listing_geography/);
  assert.match(migration,/references membership_geography_unit\(version_id,id\)/);
  assert.match(migration,/pricing_model in/);
  assert.match(migration,/listing_kind in \('need','offer','product_profile','service_profile'\)/);
  for(const category of ["professional_services","consulting","technology","design","education","healthcare","legal","finance","construction","products_supply","business_services","creative_media","facilities_operations","agriculture_food","transport_logistics","specialist_regulatory","trade","manufacturing","other"])assert.ok(migration.includes("'"+category+"'"),"taxonomy must include "+category);
  assert.match(migration,/ix_network_plus_listing_drafts/);
});

test("taxonomy-driven drafts are owner-authorized, structured, private and resumable",()=>{
  assert.match(service,/export async function listNetworkPlusListingTaxonomy/);
  assert.match(service,/export async function createOpportunityListingDraft/);
  assert.match(service,/export async function saveOpportunityListingDraft/);
  assert.match(service,/export async function listMyOpportunityListings/);
  assert.match(service,/validateListingTaxonomy/);
  assert.match(service,/normalizeStructuredAttributes/);
  assert.match(service,/assertBusinessOwner\(db,businessId,userId\)/);
  assert.match(service,/draft_saved_at=now\(\)/);
  assert.match(service,/wizard_step/);
  assert.match(service,/PUBLIC_CONTACT_DETAILS_FORBIDDEN/);
  assert.match(service,/LISTING_CATEGORY_FIELD_REQUIRED/);
  assert.match(service,/membership_geography_version/);
  assert.match(service,/network_plus_service_listing_geography/);
  assert.match(service,/validateListingPricing/);
  assert.match(service,/SERVICE_AREA_REQUIRED/);
  assert.match(service,/status=case when status in \('published','paused','rejected'\) then 'draft' else status end/);
});

test("discovery filters use parameterized SQL and require verified, approved, published businesses",()=>{
  const start=service.indexOf("export async function listProfessionalServices");
  const end=service.indexOf("export async function getProfessionalService",start);
  const query=service.slice(start,end);
  assert.match(query,/s\.status='published'/);
  assert.match(query,/b\.verification_status='verified'/);
  assert.match(query,/b\.moderation_status='approved'/);
  assert.match(query,/s\.service_category=\$\$\{args\.length\}/);
  assert.match(query,/s\.subcategory_code=\$\$\{args\.length\}/);
  assert.match(query,/s\.listing_kind=\$\$\{args\.length\}/);
  assert.match(query,/location_label/);
  assert.match(query,/s\.audience=any/);
  assert.match(service,/listing_kind category_code/);
});

test("product profiles remain inquiry-only and respect intake availability",()=>{
  assert.match(requests,/PRODUCT_PROFILE_DISCOVERY_ONLY/);
  assert.match(requests,/LISTING_NOT_ACCEPTING_REQUESTS/);
  assert.match(requests,/supplier_inquiry/);
});

test("authenticated API exposes taxonomy, directory, owned listings and persistent draft actions",()=>{
  for(const route of ["api/v1/network-plus/listing-taxonomy","api/v1/network-plus/listings","api/v1/network-plus/my/listings","listings/drafts","/draft"])assert.ok(server.includes(route),"missing route "+route);
  assert.match(server,/createOpportunityListingDraft/);
  assert.match(server,/saveOpportunityListingDraft/);
  assert.match(server,/listNetworkPlusListingTaxonomy/);
  assert.match(server,/listMyOpportunityListings/);
  assert.match(server,/geography-reference/);
  assert.match(server,/geographyUnitId/);
  assert.match(server,/listingKind:"service_profile"/);
});

test("opportunity mall and wizard preserve the no-commerce boundary and draft resume contract",()=>{
  assert.match(landing,/href: "\/network-plus\/opportunities"/);
  assert.match(ui,/Opportunity mall/);
  assert.match(ui,/Step \{step\} of 7/);
  assert.match(ui,/window\.setTimeout/);
  assert.match(ui,/draft_saved_at/);
  assert.match(ui,/Draft restored\. Continue where you left off/);
  assert.match(ui,/Resume draft/);
  assert.match(ui,/Edit listing/);
  assert.match(ui,/Submit for independent moderation/);
  assert.match(ui,/Pause/);
  assert.match(ui,/Close/);
  assert.match(ui,/Create business profile/);
  assert.match(ui,/Attach evidence & submit/);
  assert.match(ui,/no checkout or transactions here/i);
  assert.match(ui,/does not process orders, payments or delivery/i);
  assert.doesNotMatch(ui,/\/checkout|\/orders|\/payments/);
});

test("independent business and listing moderation queues reuse the existing review services",()=>{
  assert.match(listingAdmin,/moderation-queue/);
  assert.match(listingAdmin,/structured_attributes/);
  assert.match(listingAdmin,/Approve and publish/);
  assert.match(businessAdmin,/verification-queue/);
  assert.match(businessAdmin,/moderation-queue/);
  assert.match(businessAdmin,/View private evidence/);
  assert.match(adminNav,/admin\/network-plus\/businesses/);
  assert.match(adminNav,/admin\/network-plus\/services/);
  assert.match(adminNav,/business_verification_reviewer/);
  assert.match(adminNav,/business_moderator/);
});

test("Phase 1 migration participates in disposable migration compatibility validation",()=>{
  assert.match(compatibility,/20261103130000_network_plus_phase1_needs_offers\.sql/);
});
