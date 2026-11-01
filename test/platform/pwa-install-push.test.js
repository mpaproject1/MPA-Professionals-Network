import assert from "node:assert/strict";
import {createDecipheriv,createECDH,hkdfSync,randomBytes} from "node:crypto";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {encryptWebPushPayload,validPushEndpoint} from "../../src/platform/web-push.js";

test("Web Push payload uses RFC 8291 aes128gcm framing and decrypts with the subscriber key",()=>{
 const client=createECDH("prime256v1");client.generateKeys();
 const auth=randomBytes(16);
 const input={title:"MPA update",body:"Open the app",url:"/notifications"};
 const envelope=encryptWebPushPayload({p256dh:client.getPublicKey().toString("base64url"),auth:auth.toString("base64url")},input);
 const salt=envelope.subarray(0,16),recordSize=envelope.readUInt32BE(16),keyLength=envelope[20];
 const senderPublic=envelope.subarray(21,21+keyLength),ciphertext=envelope.subarray(21+keyLength);
 assert.equal(recordSize,4096);
 assert.equal(keyLength,65);
 const shared=client.computeSecret(senderPublic);
 const info=Buffer.concat([Buffer.from("WebPush: info\\0"),client.getPublicKey(),senderPublic]);
 const ikm=Buffer.from(hkdfSync("sha256",shared,auth,info,32));
 const cek=Buffer.from(hkdfSync("sha256",ikm,salt,Buffer.from("Content-Encoding: aes128gcm\\0"),16));
 const nonce=Buffer.from(hkdfSync("sha256",ikm,salt,Buffer.from("Content-Encoding: nonce\\0"),12));
 const decipher=createDecipheriv("aes-128-gcm",cek,nonce);
 decipher.setAuthTag(ciphertext.subarray(-16));
 const clear=Buffer.concat([decipher.update(ciphertext.subarray(0,-16)),decipher.final()]);
 assert.equal(clear.at(-1),2);
 assert.deepEqual(JSON.parse(clear.subarray(0,-1).toString("utf8")),input);
});

test("push endpoint validation rejects insecure, local and non-provider endpoints",()=>{
 assert.equal(validPushEndpoint("https://fcm.googleapis.com/fcm/send/example")!==null,true);
 assert.equal(validPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/example")!==null,true);
 assert.equal(validPushEndpoint("http://fcm.googleapis.com/send/example"),null);
 assert.equal(validPushEndpoint("https://127.0.0.1/admin"),null);
 assert.equal(validPushEndpoint("https://localhost/push"),null);
 assert.equal(validPushEndpoint("https://attacker.example/push"),null);
 assert.equal(validPushEndpoint("https://user:pass@fcm.googleapis.com/send/example"),null);
});

test("PWA install shell registers service worker and exposes a standalone manifest",async()=>{
 const [layout,shell,manifest,worker]=await Promise.all([
  readFile(new URL("../../web/app/layout.tsx",import.meta.url),"utf8"),
  readFile(new URL("../../web/components/shell.tsx",import.meta.url),"utf8"),
  readFile(new URL("../../web/public/manifest.webmanifest",import.meta.url),"utf8"),
  readFile(new URL("../../web/public/sw.js",import.meta.url),"utf8")
 ]);
 const config=JSON.parse(manifest);
 assert.equal(config.display,"standalone");
 assert.equal(config.scope,"/");
 assert.match(layout,/manifest:"\\/manifest\\.webmanifest"/);
 assert.match(shell,/serviceWorker\.register\("\/sw\.js"/);
 assert.match(shell,/className="mobile-nav"/);
 assert.match(worker,/addEventListener\("push"/);
 assert.match(worker,/addEventListener\("notificationclick"/);
 assert.match(worker,/Never intercept APIs/);
 assert.match(worker,/\/api\//);
});

test("push migration is additive and delivery preferences require explicit opt-in",async()=>{
 const migration=await readFile(new URL("../../db/migrations/20261102110000_web_push_subscriptions_and_delivery.sql",import.meta.url),"utf8");
 assert.match(migration,/CREATE TABLE IF NOT EXISTS notification_push_subscription/);
 assert.match(migration,/CREATE TABLE IF NOT EXISTS notification_push_delivery/);
 assert.match(migration,/ALTER COLUMN push_enabled SET DEFAULT false/);
 assert.match(migration,/UNIQUE\(notification_event_id,subscription_id\)/);
 assert.doesNotMatch(migration,/DROP TABLE|TRUNCATE|DELETE FROM/i);
});
