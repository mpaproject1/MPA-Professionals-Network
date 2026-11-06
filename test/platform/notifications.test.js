import assert from "node:assert/strict";
import test from "node:test";
import { notificationActionLabel, notificationActionUrl, parseNotificationFilters, safeInternalUrl } from "../../src/platform/notifications.js";

test("notification filters enforce the supported category vocabulary and bounded pagination",()=>{
  assert.deepEqual(parseNotificationFilters({category:"mentorship",unreadOnly:"true",actionRequired:"true",limit:"500",offset:"-4"}),{
    category:"mentorship",limit:100,offset:0,unreadOnly:true,actionRequired:true
  });
  assert.equal(parseNotificationFilters({category:"all",limit:"0"}).limit,30);
  assert.throws(()=>parseNotificationFilters({category:"unknown"}),error=>error.statusCode===400&&error.code==="VALIDATION_ERROR");
});

test("notification deep links accept only safe same-origin relative paths",()=>{
  assert.equal(safeInternalUrl("/membership"),"/membership");
  assert.equal(safeInternalUrl("/jobs?tab=saved"),"/jobs?tab=saved");
  assert.equal(safeInternalUrl("https://example.org/phishing"),null);
  assert.equal(safeInternalUrl("//example.org/phishing"),null);
  assert.equal(safeInternalUrl("/\\\\example.org/phishing"),null);
  assert.equal(safeInternalUrl("javascript:alert(1)"),null);
  assert.equal(safeInternalUrl("/notifications\nattacker"),null);
});

test("action-center migration is additive and preserves notification history",async()=>{
  const {readFile}=await import("node:fs/promises");
  const migration=await readFile(new URL("../../db/migrations/20261015200000_in_app_action_center.sql",import.meta.url),"utf8");
  for(const field of ["category","title","body","priority","action_required","action_url","read_at","archived_at","dedupe_key"])assert.match(migration,new RegExp(`ADD COLUMN IF NOT EXISTS ${field}`));
  assert.match(migration,/CREATE INDEX IF NOT EXISTS ix_notification_event_unread/);
  assert.match(migration,/CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_event_dedupe/);
  assert.doesNotMatch(migration,/DROP TABLE|TRUNCATE|DELETE FROM notification_event/i);
});

test("notification actions resolve to routes present in the current workspace",()=>{
  assert.equal(notificationActionUrl("/network-plus/businesses/123","network_plus","network_plus_business",{}),"/network-plus");
  assert.equal(notificationActionUrl("/admin/network-plus/businesses","network_plus","network_plus_business",{}),"/admin");
  assert.equal(notificationActionUrl(null,"membership","membership_application",{}),"/membership");
  assert.equal(notificationActionUrl(null,"verification","verification_case",{}),"/verification");
  assert.equal(notificationActionLabel("membership","membership_application",{}),"Open membership");
  assert.equal(notificationActionLabel("recruitment","job_application",{}),"View application");
  assert.equal(notificationActionLabel("services","service_request",{}),"Open service request");
});

test("notification category defaults are explicitly enabled without overwriting member opt-outs",async()=>{
  const {readFile}=await import("node:fs/promises");
  const migration=await readFile(new URL("../../db/migrations/20261106190000_notification_preferences_enabled_by_default.sql",import.meta.url),"utf8");
  assert.match(migration,/ALTER COLUMN in_app_categories SET DEFAULT/);
  assert.match(migration,/\|\| COALESCE\(in_app_categories, '\{\}'::jsonb\)/);
  assert.match(migration,/in_app_categories \?& ARRAY/);
});
