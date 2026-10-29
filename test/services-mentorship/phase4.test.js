import assert from "node:assert/strict";
import test from "node:test";
import {
  allowedMatchTransition,
  allowedMentorshipTransition,
  allowedServiceRequestTransition,
  allowedSessionTransition,
  canAcceptServiceCompletion,
  normalizePublicVideoUrl
} from "../../src/services-mentorship/service.js";

test("service request lifecycle is controlled",()=>{
  assert.equal(allowedServiceRequestTransition("requested","accepted"),true);
  assert.equal(allowedServiceRequestTransition("requested","declined"),true);
  assert.equal(allowedServiceRequestTransition("accepted","in_progress"),true);
  assert.equal(allowedServiceRequestTransition("in_progress","completed"),false,"provider completion submission is not a state transition; requester acceptance performs the completed transition");
  assert.equal(allowedServiceRequestTransition("completed","in_progress"),false);
  assert.equal(allowedServiceRequestTransition("declined","accepted"),false);
});

test("service completion requires provider submission and requester acceptance",()=>{
  assert.equal(canAcceptServiceCompletion({status:"in_progress",providerCompleted:true,paid:false,settled:false}),true);
  assert.equal(canAcceptServiceCompletion({status:"in_progress",providerCompleted:false,paid:false,settled:false}),false);
  assert.equal(canAcceptServiceCompletion({status:"in_progress",providerCompleted:true,paid:true,settled:false}),false);
  assert.equal(canAcceptServiceCompletion({status:"in_progress",providerCompleted:true,paid:true,settled:true}),true);
});

test("mentorship lifecycle supports pause/resume and completion",()=>{
  assert.equal(allowedMentorshipTransition("active","paused"),true);
  assert.equal(allowedMentorshipTransition("paused","active"),true);
  assert.equal(allowedMentorshipTransition("active","completed"),true);
  assert.equal(allowedMentorshipTransition("completed","active"),false);
  assert.equal(allowedMentorshipTransition("cancelled","active"),false);
});

test("mentor matching requires an explicit response lifecycle",()=>{
  assert.equal(allowedMatchTransition("proposed","accepted"),true);
  assert.equal(allowedMatchTransition("proposed","declined"),true);
  assert.equal(allowedMatchTransition("proposed","expired"),true);
  assert.equal(allowedMatchTransition("accepted","declined"),false);
});

test("mentorship sessions cannot be reopened after terminal state",()=>{
  assert.equal(allowedSessionTransition("scheduled","completed"),true);
  assert.equal(allowedSessionTransition("scheduled","cancelled"),true);
  assert.equal(allowedSessionTransition("scheduled","no_show"),true);
  assert.equal(allowedSessionTransition("completed","scheduled"),false);
  assert.equal(allowedSessionTransition("cancelled","completed"),false);
});

test("public video links accept supported HTTPS providers and reject unsafe or unapproved hosts",()=>{
  assert.equal(normalizePublicVideoUrl("https://www.youtube.com/watch?v=abc123"),"https://www.youtube.com/watch?v=abc123");
  assert.equal(normalizePublicVideoUrl("https://youtu.be/abc123"),"https://youtu.be/abc123");
  assert.equal(normalizePublicVideoUrl("https://vimeo.com/123456"),"https://vimeo.com/123456");
  assert.equal(normalizePublicVideoUrl("https://m.youtube.com/watch?v=abc123"),"https://m.youtube.com/watch?v=abc123");
  assert.equal(normalizePublicVideoUrl("https://player.vimeo.com/video/123456"),"https://player.vimeo.com/video/123456");
  assert.equal(normalizePublicVideoUrl(""),null);
  for (const value of [
    "http://youtube.com/watch?v=abc123",
    "https://youtube.com.evil.example/watch?v=abc123",
    "https://evil.example/youtube.com/watch?v=abc123",
    "https://user:password@youtube.com/watch?v=abc123",
    "javascript:alert(1)",
    "https://youtube.com/ (x)",
    "https://youtube.com/",
    "https://notvimeo.com/123"
  ]) assert.throws(()=>normalizePublicVideoUrl(value),{code:"VALIDATION_ERROR"},value);
});
