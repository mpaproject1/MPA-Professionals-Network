import assert from "node:assert/strict";
import test from "node:test";
import { legacyMembershipFeeSettledSql, membershipIsCurrentlyActiveSql } from "../../src/membership/eligibility.js";

test("legacy settlement requires at least one linked obligation and no outstanding linked balance",()=>{
  const sql=legacyMembershipFeeSettledSql("mr");
  assert.match(sql,/membership_fee_obligation_balance/);
  assert.match(sql,/ob\.membership_record_id=mr\.id/);
  assert.match(sql,/ob\.application_id=mr\.application_id/);
  assert.match(sql,/balance\.outstanding_balance=0/);
  assert.match(sql,/balance\.outstanding_balance>0/);
  assert.match(sql,/exists/);
  assert.match(sql,/not exists/);
});

test("membership active predicate applies Addis Ababa inclusive dates and legacy settlement",()=>{
  const sql=membershipIsCurrentlyActiveSql("membership_row");
  assert.match(sql,/membership_row\.status='active'/);
  assert.match(sql,/membership_row\.start_date<=\(now\(\) at time zone 'Africa\/Addis_Ababa'\)::date/);
  assert.match(sql,/membership_row\.end_date is null or membership_row\.end_date>=/);
  assert.match(sql,/coalesce\(membership_row\.source,''\)<>'legacy_import'/);
  assert.match(sql,/balance\.outstanding_balance=0/);
});

test("eligibility SQL only accepts trusted simple table aliases",()=>{
  assert.throws(()=>legacyMembershipFeeSettledSql("m; drop table membership_record"),TypeError);
  assert.throws(()=>membershipIsCurrentlyActiveSql("m --"),TypeError);
});
