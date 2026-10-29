const ALLOWED_TYPES = new Set(["chapa", "telebirr", "bank_transfer", "cash", "manual"]);
function bad(message) { throw Object.assign(new Error(message), { statusCode: 400, code: "VALIDATION_ERROR" }); }
function clean(value, max = 120) {
  const valueText = String(value ?? "").trim();
  if (valueText.length > max) bad("A payment method field is too long.");
  return valueText || null;
}
export function canManageMembershipPaymentMethods(identity = {}) {
  const roles = Array.isArray(identity.roles) ? identity.roles : [];
  const permissions = Array.isArray(identity.permissions) ? identity.permissions : [];
  return roles.includes("system_admin") || roles.includes("finance_officer") ||
    permissions.some(permission => ["members.manage", "finance.manage"].includes(permission));
}
export function assertMembershipPaymentMethodAdmin(identity = {}) {
  if (!canManageMembershipPaymentMethods(identity)) {
    throw Object.assign(new Error("Forbidden."), { statusCode: 403, code: "FORBIDDEN" });
  }
  return identity;
}
export function assertMembershipPaymentMethodAvailable(method, feeCurrency) {
  if (!method || method.enabled !== true) {
    throw Object.assign(new Error("This payment method is not currently available. Refresh the payment page and choose an enabled method."), { statusCode: 400, code: "PAYMENT_METHOD_UNAVAILABLE" });
  }
  if (String(method.currency || "").trim().toUpperCase() !== String(feeCurrency || "").trim().toUpperCase()) {
    throw Object.assign(new Error("This payment method does not support the application fee currency."), { statusCode: 400, code: "PAYMENT_CURRENCY_UNSUPPORTED" });
  }
  return method;
}
export function buildPaymentMethodAuditMetadata({ methodCode, methodType, enabled, currency, changedFields = [] } = {}) {
  const allowed = new Set(["method_type", "display_name", "enabled", "currency", "instructions", "bank_name", "account_name", "account_number", "provider_code", "qr_image_url", "requires_evidence"]);
  return {
    methodCode: String(methodCode || "").slice(0, 40),
    methodType: String(methodType || "").slice(0, 30),
    enabled: enabled === true,
    currency: String(currency || "").slice(0, 3),
    changedFields: [...new Set(changedFields.filter(field => allowed.has(field)))].sort(),
  };
}
export function missingMembershipPaymentMethodFields(input = {}) {
  const type = String(input.methodType ?? input.method_type ?? "").trim().toLowerCase();
  const missing = [];
  const value = (camel, snake) => String(input[camel] ?? input[snake] ?? "").trim();
  if (!value("methodCode", "method_code")) missing.push("methodCode");
  if (!value("displayName", "display_name")) missing.push("displayName");
  if (!/^[A-Z]{3}$/.test(value("currency", "currency").toUpperCase())) missing.push("currency");
  if (type === "bank_transfer") {
    if (!value("bankName", "bank_name")) missing.push("bankName");
    if (!value("accountName", "account_name")) missing.push("accountName");
    if (!value("accountNumber", "account_number")) missing.push("accountNumber");
    if (!value("instructions", "instructions")) missing.push("instructions");
  } else if (type === "telebirr") {
    if (!value("accountName", "account_name")) missing.push("accountName");
    if (!value("accountNumber", "account_number")) missing.push("accountNumber");
    if (!value("instructions", "instructions")) missing.push("instructions");
  } else if (["cash", "manual"].includes(type) && !value("instructions", "instructions")) {
    missing.push("instructions");
  }
  return missing;
}
export function normalizeMembershipPaymentMethodInput(input = {}) {
  const code = String(input.methodCode ?? "").trim().toLowerCase();
  const type = String(input.methodType ?? "").trim().toLowerCase();
  const name = String(input.displayName ?? "").trim();
  const currency = String(input.currency ?? "ETB").trim().toUpperCase();
  const instructions = String(input.instructions ?? "").trim();
  const enabled = input.enabled === true;
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(code) || !ALLOWED_TYPES.has(type) ||
      !name || name.length > 120 || !/^[A-Z]{3}$/.test(currency) || instructions.length > 2000) {
    bad("Enter a valid payment method code, type, display name, currency and instructions.");
  }
  const bankName = type === "bank_transfer" ? clean(input.bankName) : null;
  const accountName = ["bank_transfer", "telebirr"].includes(type) ? clean(input.accountName) : null;
  const accountNumber = ["bank_transfer", "telebirr"].includes(type) ? clean(input.accountNumber) : null;
  const providerCode = type === "telebirr" ? clean(input.providerCode) : null;
  const qr = type === "chapa" ? null : clean(input.qrImageUrl, 500);
  if (qr) {
    let url;
    try { url = new URL(qr); } catch { bad("QR image URL must be HTTPS."); }
    if (url.protocol !== "https:" || url.username || url.password) bad("QR image URL must be HTTPS.");
  }
  const requiresEvidence = type === "chapa" ? false : input.requiresEvidence !== false;
  const normalized = { code, type, name, currency, instructions, enabled, bankName, accountName, accountNumber, providerCode, qr, requiresEvidence };
  if (enabled) {
    const missing = missingMembershipPaymentMethodFields({
      methodCode: code, methodType: type, displayName: name, currency, instructions,
      bankName, accountName, accountNumber,
    });
    if (missing.length) bad("An enabled payment method is incomplete: " + missing.join(", ") + ".");
  }
  return normalized;
}
