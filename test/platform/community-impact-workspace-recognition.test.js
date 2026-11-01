import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");
test("Increment 6 member impact workspace uses server-owned verified score and privacy-safe contribution data",async()=>{
 const [service,component,members,score]=await Promise.all([read("../../src/platform/community-impact-score.js"),read("../../web/components/community-impact-workspace-panel.tsx"),read("../../web/app/members/page.tsx"),read("../../web/app/community-impact/score/page.tsx")]);
 assert.match(service,/getMyImpactWorkspace/);assert.match(service,/community_impact_score_ledger/);assert.match(service,/community_impact_detection_candidate/);assert.match(service,/community_impact_claim_evidence/);
 assert.match(component,/policyVersion/);assert.match(component,/categoryBreakdown/);assert.match(component,/reminders/);assert.match(component,/Enable sound/);assert.match(component,/localStorage/);assert.match(component,/detectedContributions/);
 assert.match(members,/CommunityImpactWorkspacePanel/);assert.match(score,/Why these points were awarded/);
});
test("Increment 7 recognition requires independent review, evidence criteria and explicit public consent",async()=>{
 const [service,migration,lifecycle,notificationMigration,programUi,reviewUi,memberUi,profileService,profileUi,server,notifications,notificationUi]=await Promise.all([read("../../src/platform/community-impact-recognition.js"),read("../../db/migrations/20261101240000_community_impact_recognition_and_engagement.sql"),read("../../db/migrations/20261101260000_community_impact_recognition_lifecycle_guards.sql"),read("../../db/migrations/20261101270000_community_impact_notification_category.sql"),read("../../web/app/admin/community-impact/recognition/programs/page.tsx"),read("../../web/app/admin/community-impact/recognition/page.tsx"),read("../../web/app/community-impact/recognition/page.tsx"),read("../../src/talent/service.js"),read("../../web/app/network/[id]/page.tsx"),read("../../server.js"),read("../../src/platform/notifications.js"),read("../../web/app/notifications/page.tsx")]);
 assert.match(service,/community_impact\.recognition\.review/);assert.match(service,/nominator_user_id===user/);assert.match(service,/requires_verified_contribution/);assert.match(service,/setAwardPublicConsent/);assert.match(service,/RECOGNITION_CLAIM_MISMATCH/);assert.match(service,/file URLs or direct links/);
 assert.match(migration,/public_consent_at/);assert.match(migration,/community_impact_recognition_event_immutable/);assert.match(migration,/community_impact_award_guard/);assert.match(lifecycle,/uq_community_impact_member_open_nomination/);assert.match(lifecycle,/recognition_nomination_guard/);
 assert.match(programUi,/Save criteria and opportunity/);assert.match(reviewUi,/Assign to me/);assert.match(memberUi,/non_member/);assert.match(memberUi,/public-consent/);
 assert.match(profileService,/public_opt_in=true/);assert.match(profileUi,/publicAchievements/);
 assert.match(server,/api\/v1\/me\/community-impact\/workspace/);assert.match(server,/api\/v1\/admin\/community-impact\/recognition\/queue/);
});
