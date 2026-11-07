import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paymentPage = await readFile(new URL("../../web/app/membership/payment/page.tsx", import.meta.url), "utf8");
const invoicePage = await readFile(new URL("../../web/app/membership/invoice/[paymentId]/page.tsx", import.meta.url), "utf8");
const voucherPage = await readFile(new URL("../../web/app/admin/finance/receipts/voucher/page.tsx", import.meta.url), "utf8");

test("a member can open an invoice only for their verified, non-reversed membership payment", () => {
  assert.match(paymentPage, /app\.payment\.status==="succeeded"&&!app\.payment\.reversal/);
  assert.match(paymentPage, /\/membership\/invoice\//);
  assert.match(invoicePage, /\/api\/v1\/membership\/applications\/me/);
  assert.match(invoicePage, /item\.payment\?\.id === params\.paymentId/);
  assert.match(invoicePage, /ownApplication\.payment\.status !== "succeeded"/);
  assert.match(invoicePage, /ownApplication\.payment\.reversal/);
  assert.match(invoicePage, /Sign in to view the invoice for your own membership payment/);
});

test("membership invoice printing isolates the invoice from portal navigation and page chrome", () => {
  assert.match(invoicePage, /@media print/);
  assert.match(invoicePage, /body \* \{ visibility:hidden !important; \}/);
  assert.match(invoicePage, /#membership-invoice, #membership-invoice \* \{ visibility:visible !important; \}/);
  assert.match(invoicePage, /\.invoice-actions \{ display:none !important; \}/);
});

test("finance voucher printing isolates the voucher document from portal page content", () => {
  assert.match(voucherPage, /id="payment-voucher-document"/);
  assert.match(voucherPage, /body \*\{visibility:hidden!important\}/);
  assert.match(voucherPage, /#payment-voucher-document,#payment-voucher-document \*\{visibility:visible!important\}/);
});
