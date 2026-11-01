import assert from "node:assert/strict";
import {createDecipheriv,createECDH,hkdfSync,randomBytes} from "node:crypto";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {encryptWebPushPayload,validPushEndpoint,getWebPushPublicConfiguration} from "../../src/platform/web-push.js";

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
 const info=Buffer.concat([Buffer.from("WebPush: info\0"),client.getPublicKey(),senderPublic]);
 const ikm=Buffer.from(hkdfSync("sha256",shared,auth,info,32));
 const cek=Buffer.from(hkdfSync("sha256",ikm,salt,Buffer.from("Content-Encoding: aes128gcm\0"),16));
 const nonce=Buffer.from(hkdfSync("sha256",ikm,salt,Buffer.from("Content-Encoding: nonce\0"),12));
 const decipher=createDecipheriv("aes-128-gcm",cek,nonce);
 decipher.setAuthTag(ciphertext.subarray(-16));
 const clear=Buffer.concat([decipher.update(ciphertext.subarray(0,-16)),decipher.final()]);
 assert.equal(clear.at(-1),2);
 assert.deepEqual(JSON.parse(clear.subarray(0,-1).toString("utf8")),input);
});

test("VAPID public configuration exposes only the matching public key",()=>{
 const ecdh=createECDH("prime256v1");ecdh.generateKeys();
 const prior={publicKey:process.env.WEB_PUSH_VAPID_PUBLIC_KEY,privateKey:process.env.WEB_PUSH_VAPID_PRIVATE_KEY,subject:process.env.WEB_PUSH_SUBJECT};
 try{
  process.env.WEB_PUSH_VAPID_PUBLIC_KEY=ecdh.getPublicKey().toString("base64url");
  process.env.WEB_PUSH_VAPID_PRIVATE_KEY=ecdh.getPrivateKey().toString("base64url");
  process.env.WEB_PUSH_SUBJECT="mailto:security@example.invalid";
  assert.deepEqual(getWebPushPublicConfiguration(),{enabled:true,publicKey:ecdh.getPublicKey().toString("base64url")});
 }finally{
  if(prior.publicKey===undefined)delete process.env.WEB_PUSH_VAPID_PUBLIC_KEY;else process.env.WEB_PUSH_VAPID_PUBLIC_KEY=prior.publicKey;
  if(prior.privateKey===undefined)delete process.env.WEB_PUSH_VAPID_PRIVATE_KEY;else process.env.WEB_PUSH_VAPID_PRIVATE_KEY=prior.privateKey;
  if(prior.subject===undefined)delete process.env.WEB_PUSH_SUBJECT;else process.env.WEB_PUSH_SUBJECT=prior.subject;
 }
});

test("push endpoint validation rejects insecure, local and non-provider endpoints",()=>{
 assert.ok(validPushEndpoint("https://fcm.googleapis.com/fcm/send/example"));
 assert.ok(validPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/example"));
 assert.equal(validPushEndpoint("http://fcm.googleapis.com/send/example"),null);
 assert.equal(validPushEndpoint("https://127.0.0.1/admin"),null);
 assert.equal(validPushEndpoint("https://localhost/push"),null);
 assert.equal(validPushEndpoint("https://attacker.example/push"),null);
 assert.equal(validPushEndpoint("https://user:pass@fcm.googleapis.com/send/example"),null);
 assert.equal(validPushEndpoint("https://fcm.googleapis.com/"+ "a".repeat(5000)),null);
});

test("PWA install shell registers service worker and exposes a standalone manifest",async()=>{
 const [layout,shell,manifest,worker,checker,api,notifications,pushUi,appleIcon,mobilePage,pushService]=await Promise.all([
  readFile(new URL("../../web/app/layout.tsx",import.meta.url),"utf8"),
  readFile(new URL("../../web/components/shell.tsx",import.meta.url),"utf8"),
  readFile(new URL("../../web/public/manifest.webmanifest",import.meta.url),"utf8"),
  readFile(new URL("../../web/public/sw.js",import.meta.url),"utf8"),
  readFile(new URL("../../scripts/check-new-migration-compatibility.js",import.meta.url),"utf8"),
  readFile(new URL("../../server.js",import.meta.url),"utf8"),
  readFile(new URL("../../src/platform/notifications.js",import.meta.url),"utf8"),
  readFile(new URL("../../web/components/push-notification-settings.tsx",import.meta.url),"utf8"),
  readFile(new URL("../../web/public/brand/apple-touch-icon.png",import.meta.url)),
  readFile(new URL("../../web/app/mobile/page.tsx",import.meta.url),"utf8"),
  readFile(new URL("../../src/platform/web-push.js",import.meta.url),"utf8")
 ]);
 const config=JSON.parse(manifest);
 assert.equal(config.display,"standalone");
 assert.equal(config.scope,"/");
 assert.ok(config.icons.some(icon=>icon.src==="/brand/mpa-pwa-icon.svg"&&icon.sizes==="192x192 512x512"&&icon.purpose==="any maskable"));
 assert.ok(config.icons.some(icon=>icon.src==="/brand/apple-touch-icon.png"&&icon.sizes==="180x180"));
 assert.ok(layout.includes('manifest:"/manifest.webmanifest"'));
 assert.ok(layout.includes('viewportFit:"cover"'));
 assert.ok(layout.includes('apple-touch-icon.png'));
 assert.equal(appleIcon.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
 assert.ok(shell.includes('serviceWorker.register("/sw.js"'));
 assert.ok(shell.includes('className="mobile-nav"'));
 assert.ok(mobilePage.includes("Your MPA, in your pocket."));
 assert.ok(mobilePage.includes('href:"/mentorship"'));
 assert.ok(mobilePage.includes('href:"/notifications"'));
 assert.ok(shell.includes('const mobilePrimaryHrefs=token?["/jobs","/members","/learning"]'));
 assert.ok(shell.includes('const mobileHomeNav:NavItem=["/mobile","Home",Home]'));
 assert.equal(config.start_url,"/mobile");
 assert.ok(worker.includes('addEventListener("push"'));
 assert.ok(worker.includes('addEventListener("notificationclick"'));
 assert.ok(worker.includes("Never intercept APIs"));
 assert.ok(worker.includes('"/mobile"'));
 assert.ok(worker.includes("cachedMobileHome"));
 assert.ok(worker.includes('"/api/"'));
 assert.ok(checker.includes("pushTableBaseline"));
 assert.ok(checker.includes("Web Push table baseline exactly"));
 assert.ok(checker.includes("pushPreferenceDefaultBaseline"));
 assert.ok(checker.includes("notification push preference default exactly"));
 assert.ok(pushService.includes("PUSH_SUPPRESSED"));
 assert.ok(pushService.includes("PUSH_EXPIRED"));
 assert.ok(api.includes("api/v1/notifications/push/subscriptions"));
 assert.ok(api.includes("disablePushForUser(identity.sub)"));
 assert.ok(api.includes("api/v1/notifications/push/subscriptions"));
 assert.ok(pushService.includes("n.user_id=s.user_id"));
 assert.ok(pushService.includes("PUSH_OPT_OUT"));
 assert.ok(shell.includes("api(\"/api/v1/notifications/push/subscriptions\""));
 assert.ok(shell.includes("await subscription.unsubscribe()"));
 assert.ok(notifications.includes("enqueuePushDelivery(db,notification.id,userId)"));
 assert.ok(pushUi.includes("Notification.requestPermission()"));
 assert.ok(pushUi.includes("userVisibleOnly:true"));
});

test("push migration is additive and delivery preferences require explicit opt-in",async()=>{
 const migration=await readFile(new URL("../../db/migrations/20261102110000_web_push_subscriptions_and_delivery.sql",import.meta.url),"utf8");
 assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS notification_push_subscription"));
 assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS notification_push_delivery"));
 assert.ok(migration.includes("ALTER COLUMN push_enabled SET DEFAULT false"));
 assert.ok(migration.includes("UNIQUE(notification_event_id,subscription_id)"));
 assert.doesNotMatch(migration,/DROP TABLE|TRUNCATE|DELETE FROM/i);
});
