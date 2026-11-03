import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const [migration,alignmentMigration,phase2Migration,service,server,ui,e2e,compatibility,userAdmin,opportunities,notifications,notificationUi]=await Promise.all([
 read("../../db/migrations/20261031120000_network_plus_request_collaboration.sql"),
 read("../../db/migrations/20261103120000_network_plus_phase0_contract_alignment.sql"),
 read("../../db/migrations/20261103140000_network_plus_phase2_connection_handoff.sql"),
 read("../../src/network-plus/request-collaboration.js"),
 read("../../server.js"),
 read("../../web/app/network-plus/requests/page.tsx"),
 read("../../e2e/network-plus-requests.spec.js"),
 read("../../scripts/check-new-migration-compatibility.js"),
 read("../../src/platform/user-admin.js"),
 read("../../web/app/network-plus/opportunities/page.tsx"),
 read("../../src/platform/notifications.js"),
 read("../../web/app/notifications/page.tsx")
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
 assert.ok(service.includes('["supplier_inquiry","referral","interest","question","quote_request","meeting_request"].includes(intent)'));
 assert.match(service,/canHandoff:isPrimaryParticipant/);
 assert.match(service,/proposer_user_id=\$2 or responder_user_id=\$2/);
 assert.match(service,/product_profile"&&!\["supplier_inquiry","referral","interest","question","quote_request","meeting_request"\]/);
 assert.match(service,/product_profile"&&!\["supplier_inquiry","referral","interest","question","quote_request","meeting_request"\]/);
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
 assert.match(ui,/Ask for clarification/);
 assert.match(ui,/Answer the question/);
 assert.match(ui,/Withdraw request/);
 assert.match(e2e,/creates a draft without submitting/);
 assert.match(e2e,/recipient acceptance does not create a workspace/);
 assert.match(e2e,/canonical business ownership/);
 assert.match(e2e,/document\.documentElement\.scrollWidth<=window\.innerWidth/);
});


test("Phase 2 adds lightweight connection intents, encrypted bilateral field consent, structured clarifications and one-time meeting handoff",()=>{
 for(const intent of ["interest","question","quote_request","meeting_request"])assert.ok(phase2Migration.includes("'"+intent+"'"));
 for(const table of ["network_plus_request_contact_consent","network_plus_request_meeting","network_plus_request_clarification"])assert.match(phase2Migration,new RegExp("create table if not exists "+table,"i"));
 assert.match(phase2Migration,/requester_value_ciphertext/);
 assert.match(phase2Migration,/recipient_value_ciphertext/);
 assert.match(phase2Migration,/recipient_response text/);
 assert.match(phase2Migration,/ux_network_plus_request_meeting_active/);
 assert.match(service,/createCipheriv\("aes-256-gcm"/);
 assert.match(service,/NETWORK_PLUS_CONTACT_ENCRYPTION_KEY/);
 assert.match(service,/cipher\.setAAD\(Buffer\.from\(context/);
 assert.match(service,/decipher\.setAAD\(Buffer\.from\(context/);
 assert.match(service,/\["v1",iv\.toString/);
 assert.match(service,/CONTACT_DATA_AUTHENTICATION_FAILED/);
 assert.match(service,/requester_status==="accepted"&&row.recipient_status==="accepted"/);
 assert.match(service,/updateNetworkPlusContactConsent/);
 assert.match(service,/getNetworkPlusContactHandoff/);
 assert.match(service,/askNetworkPlusClarification/);
 assert.match(service,/answerNetworkPlusClarification/);
 assert.match(service,/answerNetworkPlusQuestion/);
 assert.match(service,/createNetworkPlusMeetingProposal/);
 assert.match(service,/respondNetworkPlusMeeting/);
 assert.match(service,/WORKSPACE_ELIGIBLE_INTENTS/);
});
test("Network-Plus notifications have a dedicated preference category and deep-link to private requests",()=>{
 assert.match(notifications,/network_plus\.request\./);
 assert.match(notifications,/type==="network_plus_request"\)return "network_plus"/);
 assert.match(notifications,/network_plus:"\/network-plus\/requests"/);
 assert.match(notifications,/NOTIFICATION_CATEGORIES=new Set\([^\n]*"network_plus"/);
 assert.match(notificationUi,/value:"network_plus",label:"Network-Plus"/);
});
test("Phase 2 API and icon-led opportunity actions use the existing private request foundation",()=>{
 for(const route of ["contact-consent","contact-handoff","meetings","clarifications"])assert.ok(server.includes(route));
 assert.match(server,/updateNetworkPlusContactConsent/);
 assert.match(server,/getNetworkPlusContactHandoff/);
 assert.match(server,/createNetworkPlusMeetingProposal/);
 assert.match(server,/respondNetworkPlusMeeting/);
 assert.match(server,/askNetworkPlusClarification/);
 assert.match(server,/answerNetworkPlusClarification/);
 assert.match(server,/answerNetworkPlusQuestion/);
 for(const intent of ["interest","question","quote_request","meeting_request"])assert.ok(ui.includes('value:"'+intent+'"'));
 assert.match(ui,/Contact sharing · field-by-field consent/);
 assert.match(ui,/First meeting handoff/);
 assert.match(ui,/Step \{requestStep\} of 4/);
 assert.match(ui,/Review your connection request/);
 assert.match(ui,/meetingInstant/);
 assert.match(ui,/Ask for clarification/);
 assert.match(opportunities,/I’m interested/);
 assert.match(opportunities,/Ask a question/);
 assert.match(opportunities,/Request quotation/);
 assert.match(opportunities,/Request meeting/);
 assert.match(opportunities,/lucide-react/);
});

test("migration compatibility and support-role governance include Increment 6",()=>{
 assert.match(compatibility,/20261031120000_network_plus_request_collaboration\.sql/);
 assert.match(compatibility,/20261103120000_network_plus_phase0_contract_alignment\.sql/);
 assert.match(compatibility,/20261103140000_network_plus_phase2_connection_handoff\.sql/);
 assert.match(compatibility,/ux_network_plus_request_meeting_active/);
 assert.match(compatibility,/business_opportunity/);
 assert.match(compatibility,/network_plus_request_event_idempotency/);
 assert.match(compatibility,/trg_network_plus_workspace_requires_acceptance/);
 assert.match(compatibility,/network_plus_request_support_grant/);
 assert.match(compatibility,/trg_network_plus_request_event_immutable/);
 assert.match(userAdmin,/network_plus_support/);
 assert.match(userAdmin,/PRIVILEGED_ROLES/);
});

test("Phase 2 recipient clarification and question answers revalidate current recipient authority",()=>{
 const ask=service.slice(service.indexOf("export async function askNetworkPlusClarification"),service.indexOf("export async function answerNetworkPlusQuestion"));
 const answer=service.slice(service.indexOf("export async function answerNetworkPlusQuestion"),service.indexOf("export async function answerNetworkPlusClarification"));
 const detail=service.slice(service.indexOf("export async function getNetworkPlusRequest"),service.indexOf("export async function addNetworkPlusRequestParticipant"));
 assert.match(ask,/assertRecipientRepresentative\(db,request,userId\)/);
 assert.match(answer,/assertRecipientRepresentative\(db,request,userId\)/);
 assert.match(detail,/hasCurrentRecipientAuthority/);
});

test("Phase 2 migration compatibility covers consent, clarification and one-time response schema",()=>{
 for(const column of ["recipient_response","recipient_response_by","recipient_response_at","requester_value_ciphertext","recipient_value_ciphertext","counter_starts_at","prompt_code","question","answer"])assert.ok(compatibility.includes(column));
 assert.match(compatibility,/network_plus_request_contact_consent_pkey/);
 assert.match(compatibility,/network_plus_request_recipient_response_complete_check/);
});
test("meeting local-time conversion rejects both DST gaps and repeated-hour ambiguity",()=>{
 assert.match(ui,/That local time does not exist in the selected timezone/);
 assert.match(ui,/That local time occurs twice in the selected timezone/);
 assert.match(ui,/const candidates=\[\.\.\.offsets\]/);
});

test("Phase 2 response migration uses a valid PostgreSQL DO block and complete response invariant",()=>{
 assert.match(migration,/do \$phase2\$[\s\S]*?network_plus_request_recipient_response_complete_check[\s\S]*?end \$phase2\$;/);
 assert.doesNotMatch(migration,/do \$\s*\n/);
 assert.match(migration,/intent='question' and recipient_response is not null and recipient_response_by is not null and recipient_response_at is not null/);
});
test("request detail hides private handoff data from former recipient representatives",()=>{
 const detail=service.slice(service.indexOf("export async function getNetworkPlusRequest"),service.indexOf("export async function addNetworkPlusRequestParticipant"));
 assert.match(detail,/recipientRepresentativeParticipant[\s\S]*?hasCurrentRecipientAuthority/);
 assert.match(detail,/const isPrimaryParticipant=.*isRecipientRepresentative/);
 assert.match(detail,/and \$3::boolean and \(proposer_user_id=\$2 or responder_user_id=\$2\)/);
});