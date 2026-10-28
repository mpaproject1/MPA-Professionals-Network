import { createHmac, timingSafeEqual } from "node:crypto";

export function isValidChapaWebhookSignature(rawBody,receivedSignature,secret) {
  if(!secret||typeof receivedSignature!=="string"||! /^[a-f0-9]{64}$/i.test(receivedSignature)) return false;
  const expected=createHmac("sha256",secret).update(rawBody).digest("hex");
  const actualBuffer=Buffer.from(receivedSignature,"hex");
  const expectedBuffer=Buffer.from(expected,"hex");
  return actualBuffer.length===expectedBuffer.length&&timingSafeEqual(actualBuffer,expectedBuffer);
}
