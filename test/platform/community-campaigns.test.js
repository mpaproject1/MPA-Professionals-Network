import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {assertIndependentApprover,campaignContentDigest,campaignDeliveryKey,isApprovedContent,isValidLocalTime,slotOccurrence,validateCampaignActionUrl,zonedLocalToUtc} from "../../src/platform/community-campaigns.js";
import {validPushEndpoint} from "../../src/platform/web-push.js";

test("campaign author and approver must be different people",()=>{
 assert.throws(()=>assertIndependentApprover("author-1","author-1"),error=>error.code==="AUTHOR_CANNOT_APPROVE");
 assert.equal(assertIndependentApprover("author-1","reviewer-2"),true);
 assert.equal(assertIndependentApprover(null,"reviewer-2"),true);
});

test("editing any approved content invalidates its approval digest",()=>{
 const version={status:"approved",internal_title:"A",notification_title:"B",body:"C",quran_text:"Q",hadith_text:"H",action_label:"Go",action_url:"/serve-community",audience:"all_opted_in"};
 const approval={decision:"approved",approved_content_sha256:campaignContentDigest(version)};
 assert.equal(isApprovedContent(version,approval),true);
 assert.equal(isApprovedContent({...version,body:"Edited"},approval),false);
 assert.equal(isApprovedContent({...version,status:"draft"},approval),false);
});

test("campaign destinations are restricted to verified same-origin MPA routes",()=>{
 assert.equal(validateCampaignActionUrl("/serve-community"),"/serve-community");
 assert.equal(validateCampaignActionUrl("/mentorship/opportunities"),"/mentorship/opportunities");
 assert.equal(validateCampaignActionUrl("//evil.example/path"),null);
 assert.equal(validateCampaignActionUrl("https://evil.example"),null);
 assert.equal(validateCampaignActionUrl("/admin/users"),null);
 assert.equal(validateCampaignActionUrl("/jobs\\\\evil"),null);\n assert.equal(validateCampaignActionUrl("/serve-community/%2e%2e/admin"),null);
});

test("local schedule times accept only valid 24-hour HH:mm values",()=>{\n assert.equal(isValidLocalTime("15:00"),true);\n assert.equal(isValidLocalTime("09:00"),true);\n assert.equal(isValidLocalTime("25:00"),false);\n assert.equal(isValidLocalTime("9:00"),false);\n});\n\ntest("Africa/Addis_Ababa Friday 15:00 resolves to 12:00 UTC",()=>{
 const date=zonedLocalToUtc({year:2026,month:11,day:6,hour:15,minute:0},"Africa/Addis_Ababa");
 assert.equal(date.toISOString(),"2026-11-06T12:00:00.000Z");
});

test("Africa/Addis_Ababa Sunday 09:00 resolves to 06:00 UTC",()=>{
 const date=zonedLocalToUtc({year:2026,month:11,day:8,hour:9,minute:0},"Africa/Addis_Ababa");
 assert.equal(date.toISOString(),"2026-11-08T06:00:00.000Z");
});

test("slot boundaries do not fire before local wall-clock time",()=>{
 const before=new Date("2026-11-06T11:59:59.000Z");
 const at=new Date("2026-11-06T12:00:00.000Z");
 const prior=slotOccurrence(before,5,"15:00","Africa/Addis_Ababa");
 const current=slotOccurrence(at,5,"15:00","Africa/Addis_Ababa");
 assert.equal(prior.toISOString(),"2026-10-30T12:00:00.000Z");
 assert.equal(current.toISOString(),"2026-11-06T12:00:00.000Z");
});

test("idempotency key scopes a delivery to slot, version, occurrence and recipient",()=>{
 const key=campaignDeliveryKey("slot-1","version-1","2026-11-06T12:00:00Z","member","user-1");
 assert.equal(key,campaignDeliveryKey("slot-1","version-1","2026-11-06T12:00:00.000Z","member","user-1"));
 assert.notEqual(key,campaignDeliveryKey("slot-2","version-1","2026-11-06T12:00:00Z","member","user-1"));
 assert.notEqual(key,campaignDeliveryKey("slot-1","version-2","2026-11-06T12:00:00Z","member","user-1"));
});

test("migration seeds only draft content and leaves both weekly slots disabled",async()=>{
 const sql=await readFile(new URL("../../db/migrations/999_community_contribution_campaigns.sql",import.meta.url),"utf8");
 assert.match(sql,/default false/);
 assert.match(sql,/community_campaign_enabled boolean not null default false/);
 assert.match(sql,/friday_afternoon',5,'15:00'::time,'Africa\/Addis_Ababa',false/);
 assert.match(sql,/sunday_morning',0,'09:00'::time,'Africa\/Addis_Ababa',false/);
 assert.match(sql,/unique\(schedule_id,message_version_id,slot_occurrence,recipient_type,recipient_id\)/);
 assert.match(sql,/status\)\s*select c\.id,v\.message_number,1/);
 assert.equal((sql.match(/gen_random_uuid\(\),'[^']+',\d+,1,/g)||[]).length,30);
});

test("invalid and non-HTTPS push endpoints are rejected",()=>{
 assert.equal(validPushEndpoint("http://fcm.googleapis.com/push/id"),null);
 assert.equal(validPushEndpoint("https://attacker.example/push/id"),null);
 assert.equal(validPushEndpoint("https://user:pass@fcm.googleapis.com/push/id"),null);
 assert.ok(validPushEndpoint("https://fcm.googleapis.com/fcm/send/example"));
});

test("public opt-in and push dispatcher enforce explicit consent, permission and retries",async()=>{
 const service=await readFile(new URL("../../src/platform/community-campaigns.js",import.meta.url),"utf8");
 const sender=await readFile(new URL("../../src/platform/web-push.js",import.meta.url),"utf8");
 assert.match(service,/input\.permission!=="granted"\|\|input\.consent!==true/);
 assert.match(service,/permission_granted=true/);
 assert.match(service,/row\.attempts>=5/);
 assert.match(service,/PUBLIC_OPT_OUT/);
 assert.match(sender,/row\.category==="community_campaign"&&row\.community_campaign_enabled!==true/);
 assert.match(sender,/row\.attempts>=5/);
});

test("service worker rejects non-allow-listed click-through routes",async()=>{
 const worker=await readFile(new URL("../../web/public/sw.js",import.meta.url),"utf8");
 assert.match(worker,/const allowed = \["\/notifications", "\/serve-community", "\/mentorship", "\/jobs"/);
 assert.match(worker,/return "\/notifications";/);
 assert.match(worker,/clients\.navigate\(target\)/);
});

test("campaign delivery never includes member identifiers in public push payload",async()=>{
 const service=await readFile(new URL("../../src/platform/community-campaigns.js",import.meta.url),"utf8");
 assert.match(service,/notificationId:row\.delivery_id/);
 assert.match(service,/title:row\.notification_title/);
 assert.doesNotMatch(service,/email:\s*row\.|memberName:\s*row\.|phone:\s*row\./);
});
