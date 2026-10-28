import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { isValidChapaWebhookSignature } from "../../src/platform/chapa-signature.js";

test("Chapa webhook signature verifies the exact raw body",()=>{
  const body=Buffer.from('{"webhook_type":"payment","event":"payment.success"}');
  const secret="test-only-webhook-secret";
  const signature=createHmac("sha256",secret).update(body).digest("hex");
  assert.equal(isValidChapaWebhookSignature(body,signature,secret),true);
  assert.equal(isValidChapaWebhookSignature(Buffer.from(body.toString()+" "),signature,secret),false);
  assert.equal(isValidChapaWebhookSignature(body,signature,"wrong-secret"),false);
  assert.equal(isValidChapaWebhookSignature(body,"",secret),false);
  assert.equal(isValidChapaWebhookSignature(body,"not-a-signature",secret),false);
});
