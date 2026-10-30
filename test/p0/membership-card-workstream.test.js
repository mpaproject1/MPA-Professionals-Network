import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const [service,server,bulkPage,bulkCss,singlePage,verifyPage]=await Promise.all([
  read("../../src/membership/card.js"),
  read("../../server.js"),
  read("../../web/app/admin/membership-cards/page.tsx"),
  read("../../web/app/admin/membership-cards/membership-cards.module.css"),
  read("../../web/app/membership/card/page.tsx"),
  read("../../web/app/membership/verify/page.tsx")
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
  assert.match(service,/internal account or record reference, not a membership number/);
  assert.match(service,/No membership record matches that membership ID/);
  assert.match(service,/membershipNumber:row\.membership_number/);
  assert.match(service,/membershipNumber=\+encodeURIComponent\(row\.membership_number\)/);
  assert.doesNotMatch(service,/verificationPath:\x60\/membership\/verify\?record=/);
});

test("bulk issuance is permission-gated, bounded, eligibility-filtered and audited",()=>{
  assert.match(server,/api\/v1\/admin\/membership-cards\/eligible/);
  assert.match(server,/api\/v1\/admin\/membership-cards\/batch/);
  assert.match(server,/anyRoleOrPermission\(identity,\[\x22system_admin\x22,\x22reviewer\x22\],\[\x22members\.view\x22,\x22members\.manage\x22\]\)/);
  assert.match(service,/membershipNumbers\.length>100/);
  assert.match(service,/m\.status='active' and m\.start_date<=current_date and \(m\.end_date is null or m\.end_date>=current_date\)/);
  assert.match(service,/membership\.cards_batch_generated/);
  assert.match(service,/membership\.cards_batch_print_requested/);
  assert.match(service,/metadata->>\x27batchReference\x27=\$2/);
  assert.match(server,/api\\/v1\\/admin\\/membership-cards\\/print/);
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
