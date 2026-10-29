import assert from "node:assert/strict";
import test from "node:test";
import {
  assertMembershipPaymentMethodAdmin,
  assertMembershipPaymentMethodAvailable,
  buildMembershipPaymentMethodSnapshot,
  buildPaymentMethodAuditMetadata,
  canManageMembershipPaymentMethods,
  missingMembershipPaymentMethodFields,
  normalizeMembershipPaymentMethodInput,
} from "../../src/membership/payment-method-policy.js";

const bank = {
  methodCode: "bank_primary", methodType: "bank_transfer", displayName: "Primary bank",
  currency: "ETB", instructions: "Transfer the fee and enter the bank reference.",
  bankName: "Example Bank", accountName: "MPA Association", accountNumber: "123456789",
  enabled: true, requiresEvidence: true, qrImageUrl: "https://payments.example.test/qr.png",
};

test("only explicit admin/finance role or permission can manage payment methods", () => {
  for (const identity of [
    { roles: ["system_admin"] }, { roles: ["finance_officer"] },
    { permissions: ["members.manage"] }, { permissions: ["finance.manage"] },
  ]) assert.equal(canManageMembershipPaymentMethods(identity), true);
  for (const identity of [{ roles: ["member"] }, { roles: ["reviewer"] }, {}]) {
    assert.equal(canManageMembershipPaymentMethods(identity), false);
    assert.throws(() => assertMembershipPaymentMethodAdmin(identity), error => error.statusCode === 403 && error.code === "FORBIDDEN");
  }
  assert.doesNotThrow(() => assertMembershipPaymentMethodAdmin({ roles: ["finance_officer"] }));
});

test("enabled bank methods require bank, holder, account identifier and instructions", () => {
  assert.equal(normalizeMembershipPaymentMethodInput(bank).enabled, true);
  for (const field of ["bankName", "accountName", "accountNumber", "instructions"]) {
    const invalid = { ...bank, [field]: "" };
    assert.ok(missingMembershipPaymentMethodFields(invalid).includes(field));
    assert.throws(() => normalizeMembershipPaymentMethodInput(invalid), error => error.code === "VALIDATION_ERROR");
  }
});

test("enabled Telebirr methods require account holder, merchant/account number and instructions", () => {
  const telebirr = { ...bank, methodCode: "telebirr_main", methodType: "telebirr", bankName: "", providerCode: "merchant-01" };
  assert.equal(normalizeMembershipPaymentMethodInput(telebirr).type, "telebirr");
  for (const field of ["accountName", "accountNumber", "instructions"]) {
    assert.throws(() => normalizeMembershipPaymentMethodInput({ ...telebirr, [field]: "" }), error => error.code === "VALIDATION_ERROR");
  }
});

test("cash and other manual methods require member-facing instructions before enabling", () => {
  for (const methodType of ["cash", "manual"]) {
    assert.throws(() => normalizeMembershipPaymentMethodInput({ ...bank, methodType, instructions: "", bankName: "", accountName: "", accountNumber: "" }), error => error.code === "VALIDATION_ERROR");
  }
});

test("incomplete methods may be saved disabled but cannot be enabled", () => {
  const draft = { ...bank, enabled: false, accountNumber: "" };
  assert.equal(normalizeMembershipPaymentMethodInput(draft).enabled, false);
  assert.throws(() => normalizeMembershipPaymentMethodInput({ ...draft, enabled: true }), error => error.code === "VALIDATION_ERROR");
});

test("QR image URLs must be HTTPS and cannot contain embedded credentials", () => {
  for (const qrImageUrl of ["http://example.test/qr.png", "javascript:alert(1)", "https://user:password@example.test/qr.png"]) {
    assert.throws(() => normalizeMembershipPaymentMethodInput({ ...bank, qrImageUrl }), error => error.code === "VALIDATION_ERROR");
  }
  assert.equal(normalizeMembershipPaymentMethodInput({ ...bank, qrImageUrl: "https://cdn.example.test/qr.png" }).qr, "https://cdn.example.test/qr.png");
});

test("method normalization never accepts or persists provider secret fields", () => {
  const normalized = normalizeMembershipPaymentMethodInput({ ...bank, secretKey: "must-not-persist", webhookSecret: "must-not-persist" });
  assert.equal("secretKey" in normalized, false);
  assert.equal("webhookSecret" in normalized, false);
  assert.equal(normalized.accountNumber, bank.accountNumber);
});

test("Chapa never requests receipt evidence and does not accept manual account details", () => {
  const chapa = normalizeMembershipPaymentMethodInput({
    methodCode: "chapa_primary", methodType: "chapa", displayName: "Chapa checkout",
    currency: "ETB", instructions: "Continue to secure hosted checkout.", enabled: false,
    requiresEvidence: true, bankName: "ignored", accountName: "ignored", accountNumber: "ignored",
  });
  assert.equal(chapa.requiresEvidence, false);
  assert.equal(chapa.bankName, null);
  assert.equal(chapa.accountName, null);
  assert.equal(chapa.accountNumber, null);
});

test("audit metadata records changed field names without account values or secrets", () => {
  const metadata = buildPaymentMethodAuditMetadata({
    methodCode: "bank_primary", methodType: "bank_transfer", enabled: true, currency: "ETB",
    changedFields: ["account_number", "bank_name", "account_number", "accountNumber", "webhook_secret"],
  });
  assert.deepEqual(metadata.changedFields, ["account_number", "bank_name"]);
  assert.equal(metadata.methodCode, "bank_primary");
  assert.equal(metadata.enabled, true);
  assert.equal(JSON.stringify(metadata).includes("123456789"), false);
  assert.equal("accountNumber" in metadata, false);
  assert.equal("secretKey" in metadata, false);
});

test("disabled methods and currency mismatches are rejected by the payment policy", () => {
  assert.throws(() => assertMembershipPaymentMethodAvailable({ enabled: false, currency: "ETB" }, "ETB"), error => error.code === "PAYMENT_METHOD_UNAVAILABLE");
  const mismatched = { method_code: "bank_primary", method_type: "bank_transfer", display_name: "Primary bank", enabled: true, currency: "USD", instructions: "Transfer the fee.", bank_name: "Example Bank", account_name: "MPA", account_number: "123456", requires_evidence: true };
  assert.throws(() => assertMembershipPaymentMethodAvailable(mismatched, "ETB"), error => error.code === "PAYMENT_CURRENCY_UNSUPPORTED");
  const method = { method_code: "bank_primary", method_type: "bank_transfer", display_name: "Primary bank", enabled: true, currency: " etb ", instructions: "Transfer the fee.", bank_name: "Example Bank", account_name: "MPA", account_number: "123456", requires_evidence: true };
  assert.equal(assertMembershipPaymentMethodAvailable(method, "ETB"), method);
});

test("payment snapshots preserve method details without retaining a mutable configuration object", () => {
  const current = { method_code: "bank_primary", method_type: "bank_transfer", display_name: "Main account", currency: " etb ", instructions: "Use the membership reference.", bank_name: "Example Bank", account_name: "MPA", account_number: "123456", provider_code: null, qr_image_url: "https://cdn.example.test/qr.png", requires_evidence: true, secret_key: "never copy" };
  const snapshot = buildMembershipPaymentMethodSnapshot(current);
  current.account_number = "654321";
  current.instructions = "Changed later";
  assert.equal(snapshot.accountNumber, "123456");
  assert.equal(snapshot.instructions, "Use the membership reference.");
  assert.equal(snapshot.currency, "ETB");
  assert.equal("secret_key" in snapshot, false);
});

test("a direct payment submission cannot use an enabled but incomplete configuration", () => {
  assert.throws(() => assertMembershipPaymentMethodAvailable({
    method_code: "bank_primary", method_type: "bank_transfer", display_name: "Primary bank",
    enabled: true, currency: "ETB", instructions: "Transfer the fee.", bank_name: "Example Bank",
    account_name: null, account_number: null, requires_evidence: true,
  }, "ETB"), error => error.code === "PAYMENT_METHOD_INCOMPLETE");
});
