import assert from "node:assert/strict";
import test from "node:test";
import { getMembershipCardStatus } from "../../src/membership/card.js";
import { generateMembershipNumber } from "../../src/membership/service.js";

test("canonical membership IDs use MPA-year-eight-uppercase-hex and remain distinct from tracking references",()=>{
  const date=new Date("2026-10-15T12:00:00.000Z");
  const first=generateMembershipNumber(date);
  const second=generateMembershipNumber(date);
  assert.match(first,/^MPA-2026-[0-9A-F]{8}$/);
  assert.match(second,/^MPA-2026-[0-9A-F]{8}$/);
  assert.notEqual(first,second);
  assert.doesNotMatch(first,/^MPA-MEM-/);
});
test("membership card status reflects current dates and lifecycle status",()=>{
  const now=new Date("2026-10-15T12:00:00.000Z");
  assert.equal(getMembershipCardStatus({status:"active",start_date:"2026-01-01",end_date:"2026-12-31"},now),"active");
  assert.equal(getMembershipCardStatus({status:"active",start_date:"2026-01-01",end_date:"2026-10-14"},now),"expired");
  assert.equal(getMembershipCardStatus({status:"active",start_date:"2026-10-16",end_date:null},now),"expired");
  assert.equal(getMembershipCardStatus({status:"suspended",start_date:"2026-01-01",end_date:null},now),"suspended");
  assert.equal(getMembershipCardStatus({status:"revoked",start_date:"2026-01-01",end_date:null},now),"revoked");
  assert.equal(getMembershipCardStatus({status:"cancelled",start_date:"2026-01-01",end_date:null},now),"revoked");
  assert.equal(getMembershipCardStatus({status:"merged",start_date:"2026-01-01",end_date:null},now),"revoked");
});

test("unverified legacy imports are not treated as active card-eligible memberships",()=>{
  const now=new Date("2026-10-15T12:00:00.000Z");
  assert.equal(getMembershipCardStatus({source:"legacy_import",legacy_payment_verified:false,status:"active",start_date:"2026-01-01",end_date:"2026-12-31"},now),"payment_verification_required");
  assert.equal(getMembershipCardStatus({source:"legacy_import",legacy_payment_verified:true,status:"active",start_date:"2026-01-01",end_date:"2026-12-31"},now),"active");
});

test("membership card dates follow the Addis Ababa civil day at UTC date boundaries",()=>{
  const justAfterMidnightInAddis=new Date("2026-10-15T21:30:00.000Z");
  assert.equal(getMembershipCardStatus({status:"active",start_date:"2026-10-16",end_date:null},justAfterMidnightInAddis),"active");
  assert.equal(getMembershipCardStatus({status:"active",start_date:"2026-01-01",end_date:"2026-10-15"},justAfterMidnightInAddis),"expired");
});
