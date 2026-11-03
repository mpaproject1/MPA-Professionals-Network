import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const [migration,alignmentMigration,service,server,ui,e2e,compatibility,userAdmin]=await Promise.all([
 read("../../db/migrations/20261031120000_network_plus_request_collaboration.sql"),
 read("../../db/migrations/20261103120000_network_plus_phase0_contract_alignment.sql"),
 read("../../src/network-plus/request-collaboration.js"),
 read("../../server.js"),
 read("../../web/app/network-plus/requests/page.tsx"),
 read("../../e2e/network-plus-requests.spec.js"),
 read("../../scripts/check-new-migration-compatibility.js"),
 read("../../src/platform/user-admin.js")
]);

test("Increment 6 schema adds typed requests, explicit participants, immutable events and optional accepted-only workspaces",()=>{
 for(const table of ["network_plus_request","network_plus_request_participant","network_plus_request_event","network_plus_collaboration_workspace","network_plus_collaboration_milestone","network_plus_collaboration_event"])assert.match(migration,new RegExp("create table if not exists "+table,"i"));
 for(const intent of ["service_request","supplier_inquiry","referral","expertise_request","partnership_proposal","collaboration_request"])assert.ok(migration.includes("'"+intent+"'"));
 assert.match(alignmentMigration,/business_opportunity/);
 assert.match(alignmentMigration,/drop constraint if exists network_plus_request_intent_check/);
 for(const status of ["draft","submitted","under_review","clarification_requested","accepted","declined","withdrawn","in_progress","completed","disputed","closed"])assert.ok(migration.includes("'"+status+"'"));
 assert.match(migration,/references app_user\(id\)/);
 assert.match(migration,/references organization\(id\)/);
 assert.match(migration,/ux_network_plus_request_idempotency/);
 assert.match(migration,/ux_network_plus_request_event_idempotency/);
 assert.match(migration,/trg_network_plus_workspace_requires_acceptance/);
 assert.match(migration,/network_plus_request_support_grant/);
 assert.match(migration,/trg_network_plus_request_event_immutable/);
 assert.match(migration,/trg_network_plus_collaboration_event_immutable/);
 assert.match(migration,/explicitly accepted request/);
 assert.doesNotMatch(migration,/delete from|drop table|truncate table|alter table service_request\b/i);
});

test("request lifecycle requires explicit recipient authority and never creates a workspace on submission",()=>{
 assert.match(service,/RECIPIENT_ACCEPTANCE_REQUIRED/);
 assert.match(service,/recipient_representative/);
 assert.match(service,/RECIPIENT_AUTHORITY_REQUIRED/);
 assert.match(service,/hasBusinessAuthority/);
 assert.match(service,/business.respond_requests/);
 assert.match(service,/business.accept_terms/);
 assert.match(service,/network_plus_business_ownership/);
 assert.match(service,/network_plus_request_participant set consent_status='accepted'/);
 assert.match(service,/if\(to==="accepted"\)/);
 assert.match(service,/createNetworkPlusWorkspace/);
 assert.match(service,/WORKSPACE_ELIGIBLE_INTENTS/);
 assert.doesNotMatch(service,/if\(to==="accepted"\)[\s\S]{0,900}insert into network_plus_collaboration_workspace/);
 assert.match(service,/request\.\$\{to\}/);
 assert.match(service,/IDEMPOTENCY_CONFLICT/);
 assert.match(service,/pg_advisory_xact_lock/);
 assert.match(service,/verification_visibility vv/);
 assert.match(service,/CONTACT_DETAILS_FORBIDDEN/);
});

test("participant privacy, support policy, audit and notifications are explicit",()=>{
 assert.match(service,/consent_status<>'revoked'/);
 assert.match(service,/workspaceAccess/);
 assert.match(service,/PARTICIPANT_CONSENT_REQUIRED/);
 assert.match(service,/SUPPORT_REASON_REQUIRED/);
 assert.match(service,/SUPPORT_GRANT_REQUIRED/);
 assert.match(service,/grantNetworkPlusSupportAccess/);
 assert.match(service,/revokeNetworkPlusSupportAccess/);
 assert.match(service,/SUPPORT_FORBIDDEN/);
 assert.match(service,/network_plus\.request\.support_read/);
 assert.match(service,/network_plus\.request\.support_list/);
 assert.match(service,/createInAppNotification/);
 assert.match(service,/insert into audit_log/);
});

test("API exposes authenticated request, transition, participant and workspace operations",()=>{
 assert.match(server,/network-plus\.request\.create/);
 assert.match(server,/network-plus\.request\.transition/);
 assert.match(server,/networkPlusRequests\.createNetworkPlusRequest/);
 assert.match(server,/networkPlusRequests\.submitNetworkPlusRequest/);
 assert.match(server,/networkPlusRequests\.transitionNetworkPlusRequest/);
 assert.match(server,/networkPlusRequests\.getNetworkPlusWorkspace/);
 assert.match(server,/networkPlusRequests\.createNetworkPlusWorkspace/);
 assert.match(server,/networkPlusRequests\.addNetworkPlusWorkspaceMilestone/);
 assert.match(server,/networkPlusRequests\.addNetworkPlusWorkspaceEvent/);
});

test("browser journey distinguishes draft, submission, recipient acceptance and workspace",()=>{
 assert.match(ui,/Save draft/);
 assert.match(ui,/Submit request/);
 assert.match(ui,/Explicitly accept request/);
 assert.match(ui,/Submission is not a contract/);
 assert.match(ui,/Collaboration workspace/);
 assert.match(ui,/Start optional collaboration workspace/);
 assert.match(ui,/business_opportunity/);
 assert.match(ui,/Published business/);
 assert.match(ui,/Find a verified member recipient/);
 assert.match(ui,/Request clarification/);
 assert.match(ui,/Withdraw request/);
 assert.match(e2e,/creates a draft without submitting/);
 assert.match(e2e,/recipient acceptance does not create a workspace/);
 assert.match(e2e,/canonical business ownership/);
 assert.match(e2e,/document\.documentElement\.scrollWidth<=window\.innerWidth/);
});

test("migration compatibility and support-role governance include Increment 6",()=>{
 assert.match(compatibility,/20261031120000_network_plus_request_collaboration\.sql/);
 assert.match(compatibility,/20261103120000_network_plus_phase0_contract_alignment\.sql/);
 assert.match(compatibility,/business_opportunity/);
 assert.match(compatibility,/network_plus_request_event_idempotency/);
 assert.match(compatibility,/trg_network_plus_workspace_requires_acceptance/);
 assert.match(compatibility,/network_plus_request_support_grant/);
 assert.match(compatibility,/trg_network_plus_request_event_immutable/);
 assert.match(userAdmin,/network_plus_support/);
 assert.match(userAdmin,/PRIVILEGED_ROLES/);
});
