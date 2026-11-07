import assert from "node:assert/strict";
import test from "node:test";
import {dueMentorshipReminderKinds} from "../../src/services-mentorship/reminders.js";

test("mentorship reminders are only due for future confirmed-session windows",()=>{
 assert.deepEqual(dueMentorshipReminderKinds(-1),[]);
 assert.deepEqual(dueMentorshipReminderKinds(0),[]);
 assert.deepEqual(dueMentorshipReminderKinds(30*60),["one_hour"]);
 assert.deepEqual(dueMentorshipReminderKinds(60*60),["one_hour"]);
 assert.deepEqual(dueMentorshipReminderKinds(60*60+1),["one_day"]);
 assert.deepEqual(dueMentorshipReminderKinds(24*60*60),["one_day"]);
 assert.deepEqual(dueMentorshipReminderKinds(24*60*60+1),[]);
 assert.deepEqual(dueMentorshipReminderKinds(Number.NaN),[]);
});
