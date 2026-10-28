import assert from "node:assert/strict";
import test from "node:test";
import { displayReference } from "../../src/platform/display-reference.js";

test("display-only references are deterministic, typed and based on record creation year",()=>{
  const input={type:"service",id:"6bd7488b-624d-4925-bd91-b9df46cd0773",createdAt:"2026-05-01T10:00:00Z"};
  const first=displayReference(input);
  assert.match(first,/^MPA-SRV-26-[A-F0-9]{12}$/);
  assert.equal(displayReference(input),first);
  assert.notEqual(displayReference({...input,type:"mentorship"}),first);
  assert.notEqual(displayReference({...input,id:"6bd7488b-624d-4925-bd91-b9df46cd0774"}),first);
});

test("existing stored references and membership numbers remain authoritative",()=>{
  assert.equal(displayReference({type:"service",id:"record",trackingReference:"MPA-MEM-26-000123"}),"MPA-MEM-26-000123");
  assert.equal(displayReference({type:"service",id:"record",publicReference:"MPA-JOB-ABCD1234"}),"MPA-JOB-ABCD1234");
  assert.equal(displayReference({type:"membership",id:"record",membershipNumber:"MEMBER-0009"}),"MEMBER-0009");
});

test("display references reject unsupported types and missing identifiers",()=>{
  assert.throws(()=>displayReference({type:"user",id:"user-id"}),/supported record type/);
  assert.throws(()=>displayReference({type:"service"}),/stable record identifier/);
});
