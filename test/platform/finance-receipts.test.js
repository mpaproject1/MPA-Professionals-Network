import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { recordManualFinancePayment, decideManualFinancePayment, issueFinancePaymentVoucher, issueVerifiedMembershipPaymentVoucher, verifyFinancePaymentVoucher } from "../../src/platform/finance-receipts.js";

test("manual finance receipts keep verification and voucher issuance as separate decisions",async()=>{
  const source=await readFile(new URL("../../src/platform/finance-receipts.js",import.meta.url),"utf8");
  const migration=await readFile(new URL("../../db/migrations/20261030200000_general_finance_receipts_and_vouchers.sql",import.meta.url),"utf8");
  assert.match(source,/status!=="verified"/);
  assert.match(source,/payment voucher can only be issued for a verified payment/);
  assert.match(source,/verification_token_sha256/);
  assert.match(source,/issueVerifiedMembershipPaymentVoucher/);
  assert.match(source,/timingSafeEqual/);
  assert.match(migration,/payer_user_id uuid references app_user/);
  assert.match(migration,/evidence_file_id uuid references file_object/);
  assert.match(migration,/finance_payment_voucher_one_active_idx/);
  assert.match(migration,/finance_payment_voucher_one_active_membership_idx/);
  assert.match(migration,/payment_transaction_id uuid references payment_transaction/);
  assert.match(migration,/check \(amount > 0\)/);
  assert.equal(typeof recordManualFinancePayment,"function");
  assert.equal(typeof decideManualFinancePayment,"function");
  assert.equal(typeof issueFinancePaymentVoucher,"function");
  assert.equal(typeof issueVerifiedMembershipPaymentVoucher,"function");
  assert.equal(typeof verifyFinancePaymentVoucher,"function");
  assert.match(source,/Only a successfully verified, non-reversed membership payment can receive a payment voucher/);
});
