import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const [service,server,bulkPage,bulkCss,singlePage,verifyPage,membershipService,membershipWorkspace,eligibility]=await Promise.all([
  read("../../src/membership/card.js"),
  read("../../server.js"),
  read("../../web/app/admin/membership-cards/page.tsx"),
  read("../../web/app/admin/membership-cards/membership-cards.module.css"),
  read("../../web/app/membership/card/page.tsx"),
  read("../../web/app/membership/verify/page.tsx"),
  read("../../src/membership/service.js"),
  read("../../web/app/membership/workspace.tsx"),
  read("../../src/membership/eligibility.js")
]);

test("single card issuance requires an active eligible membership record, not an account role",()=>{
  assert.match(service,/function assertEligible\(row\)/);
  assert.match(service,/if\(status!=="active"\) throw fail\(409/);
  assert.match(service,/assertEligible\(row\)/);
  assert.match(service,/where m\.user_id=\$1 and m\.status<>'pending'/);
  assert.match(service,/Complete membership approval and activation first/);
  assert.doesNotMatch(service.slice(service.indexOf("function cardPayload"),service.indexOf("async function settings")),/membershipRecordId/);
});

test("admin card lookup distinguishes membership number from internal identifiers",()=>{
  assert.match(service,/WRONG_MEMBERSHIP_IDENTIFIER/);
  assert.match(service,/internal account, payment or application reference, not a membership number/);
  assert.match(service,/No membership record matches that membership ID/);
  assert.match(service,/membershipNumber:row\.membership_number/);
  assert.ok(service.includes('verificationPath:"/membership/verify?membershipNumber="+encodeURIComponent(row.membership_number)'));
  assert.doesNotMatch(service,/verificationPath:\x60\/membership\/verify\?record=/);
});

test("bulk issuance is permission-gated, bounded, eligibility-filtered and audited",()=>{
  assert.match(server,/api\/v1\/admin\/membership-cards\/eligible/);
  assert.match(server,/api\/v1\/admin\/membership-cards\/batch/);
  assert.match(server,/anyRoleOrPermission\(identity,\[\x22system_admin\x22,\x22reviewer\x22\],\[\x22members\.view\x22,\x22members\.manage\x22\]\)/);
  assert.match(service,/membershipNumbers\.length>100/);
  assert.ok(service.includes("m.status='active' and m.start_date<=(now() at time zone 'Africa/Addis_Ababa')::date"));
  assert.ok(service.includes("m.end_date is null or m.end_date>=(now() at time zone 'Africa/Addis_Ababa')::date"));
  assert.match(service,/membership\.cards_batch_generated/);
  assert.match(service,/membership\.cards_batch_print_requested/);
  assert.match(service,/metadata->>\x27batchReference\x27=\$2/);
  assert.match(server,/api\/v1\/admin\/membership-cards\/print/);
  assert.match(service,/selectedCount:numbers\.length,generatedCount:cards\.length,skippedCount:skipped\.length/);
  assert.match(service,/No active eligible membership was found/);
});

test("card output contains approved minimal fields and no internal UUID or private evidence",()=>{
  assert.match(service,/function cardPayload\(row,cardSettings\)/);
  const payload=service.slice(service.indexOf("function cardPayload"),service.indexOf("async function settings"));
  assert.match(payload,/membershipNumber:row\.membership_number/);
  assert.match(payload,/memberName:row\.member_name/);
  assert.match(payload,/membershipType:row\.membership_type/);
  assert.doesNotMatch(payload,/membershipRecordId|profilePictureFileId|account_reference|email|phone|payment|recovery/i);
  assert.doesNotMatch(singlePage,/membershipRecordId|profilePictureFileId|productCode/);
});

test("bulk print previews count, provides actionable skipped states and prints one card per A4 page",()=>{
  assert.match(bulkPage,/selected\.length/);
  assert.match(bulkPage,/membership-cards\/batch/);
  assert.match(bulkPage,/Print \/ Save PDF/);
  assert.match(bulkPage,/QRCodeSVG/);
  assert.match(bulkPage,/skipped/);
  assert.match(bulkPage,/window\.print\(\)/);
  assert.match(bulkCss,/@page\{size:A4 portrait;margin:0\}/);
  assert.match(bulkCss,/break-after:page/);
  assert.match(bulkCss,/width:210mm;height:297mm/);
  assert.match(bulkCss,/width:85\.6mm;height:53\.98mm/);
});

test("QR verification accepts canonical membership number and preserves existing record-based QR links",()=>{
  assert.match(server,/verifyMembershipCard\(q\.get\("membershipNumber"\)\|\|q\.get\("record"\),q\.get\("token"\)\)/);
  assert.match(service,/m\.id::text=\$1 or upper\(m\.membership_number\)=upper\(\$1\)/);
  assert.match(verifyPage,/params\.get\("membershipNumber"\)\|\|params\.get\("record"\)/);
});

test("member active flag and every card issuance path share the Addis-date legacy settlement safeguard",()=>{
  assert.match(membershipService,/has_active_membership/);
  assert.match(membershipService,/membershipIsCurrentlyActiveSql\("mr"\)/);\n  assert.match(membershipService,/legacyMembershipPaymentVerificationRequiredSql\("mr"\)/);
  assert.match(membershipService,/from "\.\/eligibility\.js"/);
  assert.match(membershipService,/Africa\/Addis_Ababa/);
  assert.match(service,/function addisAbabaCivilDate/);
  assert.match(service,/timeZone:"Africa\/Addis_Ababa"/);
  assert.match(service,/legacy_fee_settled/);
  assert.match(eligibility,/membership_fee_obligation_balance/);
  assert.match(eligibility,/balance\.outstanding_balance=0/);
  assert.match(eligibility,/balance\.outstanding_balance>0/);
  assert.match(eligibility,/membershipIsCurrentlyActiveSql/);
  const adminLookup=service.slice(service.indexOf("export async function getMembershipCardForAdmin"),service.indexOf("export async function listEligibleMembershipCardsForAdmin"));
  assert.match(adminLookup,/m\.source/);
  assert.match(adminLookup,/legacy_fee_settled/);
  assert.match(adminLookup,/legacyMembershipFeeSettledSql/);
  assert.match(adminLookup,/assertEligible\(row\)/);
  assert.match(service,/membershipIsCurrentlyActiveSql\("m"\)/);
});

test("member membership workspace leads with live status, surfaces card errors and labels activated applications",()=>{
  assert.match(membershipWorkspace,/membership-status-hero/);
  assert.match(membershipWorkspace,/membership-status-checklist/);
  assert.match(membershipWorkspace,/membershipCardError/);
  assert.doesNotMatch(membershipWorkspace,/api<MembershipCardSummary>\("\/api\/v1\/membership\/card",\{\},token\)\.catch\(\(\)=>null\)/);
  assert.match(membershipWorkspace,/Membership application activated\./);
  assert.match(membershipWorkspace,/a\.status==="activated"/);
  assert.match(membershipWorkspace,/openApplication\.terms_acknowledged_at\?"✓":"3"/);
});


test("optional membership card settings cannot block canonical membership card retrieval",()=>{
  const settings=service.slice(service.indexOf("async function settings"),service.indexOf("export async function getMyMembershipCard"));
  assert.match(settings,/error\?\.code==="42P01"/);
  assert.match(settings,/return DEFAULT_SETTINGS/);
});

test("membership products and authenticated member data load independently",()=>{
  const start=membershipWorkspace.indexOf("const load=useCallback");
  const end=membershipWorkspace.indexOf("useEffect(()=>{if(hydrated)",start);
  const load=membershipWorkspace.slice(start,end);
  assert.match(load,/Promise\.all\(\[/);
  assert.match(load,/settle\(api<Product\[]>\("\/api\/v1\/membership\/products"\)\)/);
  assert.match(load,/settle\(api<Me>\("\/api\/v1\/me"/);
  assert.match(load,/settle\(api<MembershipCardSummary>\("\/api\/v1\/membership\/card"/);
  assert.match(load,/const confirmedActiveMembership=Boolean\(me\.has_active_membership\)\|\|cardConfirmsActive/);
  assert.match(load,/membershipCardError/);
  assert.match(load,/failures\.push/);
});


test("membership API failures are shown as unknown status, never as an inactive decision",()=>{
  assert.match(membershipWorkspace,/membershipStatusUnavailable/);\n  assert.match(membershipWorkspace,/membershipPaymentVerificationRequired/);\n  assert.match(membershipWorkspace,/Do not submit a duplicate membership application/);
  assert.match(membershipWorkspace,/Status unavailable/);
  assert.match(membershipWorkspace,/We could not confirm your current membership status/);
  assert.match(membershipWorkspace,/!membershipStatusUnavailable&&!hasActiveMembership/);
});
