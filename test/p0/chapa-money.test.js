import assert from "node:assert/strict";
import test from "node:test";
import { toChapaMinorUnits } from "../../src/platform/chapa-money.js";

test("Chapa converts ETB amounts to integer cents before checkout",()=>{
  assert.equal(toChapaMinorUnits(50000,"ETB"),5000000);
  assert.equal(toChapaMinorUnits("125.50","ETB"),12550);
  assert.equal(toChapaMinorUnits(100,"USD"),10000);
});

test("Chapa rejects unsupported currency precision and amounts below the provider minimum",()=>{
  assert.throws(()=>toChapaMinorUnits(50000,"UGX"),/does not document minor-unit handling/);
  assert.throws(()=>toChapaMinorUnits(0.99,"ETB"),/below the minimum/);
  assert.throws(()=>toChapaMinorUnits(1.001,"ETB"),/unsupported fractional precision/);
});
