import assert from "node:assert/strict";
import test from "node:test";
import { reverseLegacyMembershipPayment, verifyLegacyMembershipPayment } from "../../src/membership/legacy-payment-verification.js";

test("system administrator role alone cannot verify historical member dues", async () => {
  const admin = { sub: "system-admin", roles: ["system_admin"], permissions: [] };
  await assert.rejects(
    verifyLegacyMembershipPayment(admin, "00000000-0000-4000-8000-000000000001", {}, "00000000-0000-4000-8000-000000000002"),
    error => error.statusCode === 403
  );
});

test("Finance payment verification validates evidence fields before recording", async () => {
  const finance = { sub: "finance-officer", roles: ["finance_officer"], permissions: [] };
  await assert.rejects(
    verifyLegacyMembershipPayment(finance, "00000000-0000-4000-8000-000000000001", { amount: "0" }, "00000000-0000-4000-8000-000000000002"),
    error => error.statusCode === 400 && error.code === "INVALID_AMOUNT"
  );
});

test("system administrator role alone cannot reverse a historical member payment", async () => {
  const admin = { sub: "system-admin", roles: ["system_admin"], permissions: [] };
  await assert.rejects(
    reverseLegacyMembershipPayment(admin, "00000000-0000-4000-8000-000000000001", { reason: "test reversal" }, "00000000-0000-4000-8000-000000000002"),
    error => error.statusCode === 403
  );
});

test("Finance reversal requires a documented reason before database mutation", async () => {
  const finance = { sub: "finance-officer", roles: ["finance_officer"], permissions: [] };
  await assert.rejects(
    reverseLegacyMembershipPayment(finance, "00000000-0000-4000-8000-000000000001", { reason: "short" }, "00000000-0000-4000-8000-000000000002"),
    error => error.statusCode === 400 && error.code === "REVERSAL_REASON_REQUIRED"
  );
});
