import {createHash,createPrivateKey,createECDH,createCipheriv,createSign,hkdfSync,randomBytes} from "node:crypto";
import {getPool,withTransaction} from "./db.js";

const b64url=value=>Buffer.from(value).toString("base64url");
const fromB64url=value=>Buffer.from(String(value||""),"base64url");
const sha256=value=>createHash("sha256").update(value).digest("hex");
const PUSH_HOSTS=["fcm.googleapis.com","push.services.mozilla.com","notify.windows.com","push.apple.com"];
function fail(status,message,code="VALIDATION_ERROR"){throw Object.assign(new Error(message),{statusCode:status,code});}
function vapidConfig(){
 const publicKey=String(process.env.WEB_PUSH_VAPID_PUBLIC_KEY||"").trim();
 const privateKey=String(process.env.WEB_PUSH_VAPID_PRIVATE_KEY||"").trim();
 const subject=String(process.env.WEB_PUSH_SUBJECT||"").trim();
 if(!publicKey||!privateKey||!subject)return null;
 const publicBytes=fromB64url(publicKey),privateBytes=fromB64url(privateKey);
 if(publicBytes.length!==65||privateBytes.length!==32||publicBytes[0]!==4||!/^mailto:[^\s]+$|^https:\/\//.test(subject))throw new Error("Web Push VAPID configuration is invalid.");
 const ecdh=createECDH("prime256v1");ecdh.setPrivateKey(privateBytes);
 const derived=ecdh.getPublicKey();
 if(!derived.equals(publicBytes))throw new Error("Web Push VAPID public and private keys do not match.");
 return {publicKey,publicBytes,privateBytes,subject};
}
export function getWebPushPublicConfiguration(){
 const config=vapidConfig();
 return {enabled:Boolean(config),publicKey:config?.publicKey||null};
}
function vapidAuthorization(endpoint,config){
 const audience=new URL(endpoint).origin;
 const header=b64url(JSON.stringify({typ:"JWT",alg:"ES256"}));
 const payload=b64url(JSON.stringify({aud:audience,exp:Math.floor(Date.now()/1000)+12*60*60,sub:config.subject}));
 const input=header+"."+payload;
 const x=b64url(config.publicBytes.subarray(1,33)),y=b64url(config.publicBytes.subarray(33,65)),d=b64url(config.privateBytes);
 const key=createPrivateKey({key:{kty:"EC",crv:"P-256",x,y,d},format:"jwk"});
 const signature=createSign("SHA256").update(input).end().sign({key,dsaEncoding:"ieee-p1363"});
 return "vapid t="+input+"."+b64url(signature)+", k="+config.publicKey;
}
export function encryptWebPushPayload(subscription,payload){
 const clientPublic=fromB64url(subscription.p256dh),authSecret=fromB64url(subscription.auth);
 if(clientPublic.length!==65||clientPublic[0]!==4||authSecret.length<16||authSecret.length>32)throw new Error("Push subscription keys are invalid.");
 const sender=createECDH("prime256v1");sender.generateKeys();
 const senderPublic=sender.getPublicKey(),sharedSecret=sender.computeSecret(clientPublic);
 const info=Buffer.concat([Buffer.from("WebPush: info\0"),clientPublic,senderPublic]);
 const ikm=Buffer.from(hkdfSync("sha256",sharedSecret,authSecret,info,32));
 const salt=randomBytes(16);
 const cek=Buffer.from(hkdfSync("sha256",ikm,salt,Buffer.from("Content-Encoding: aes128gcm\0"),16));
 const nonce=Buffer.from(hkdfSync("sha256",ikm,salt,Buffer.from("Content-Encoding: nonce\0"),12));
 const plaintext=Buffer.concat([Buffer.from(JSON.stringify(payload)),Buffer.from([2])]);
 const cipher=createCipheriv("aes-128-gcm",cek,nonce);
 const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final(),cipher.getAuthTag()]);
 const recordSize=Buffer.alloc(4);recordSize.writeUInt32BE(4096);
 return Buffer.concat([salt,recordSize,Buffer.from([senderPublic.length]),senderPublic,ciphertext]);
}
export function validPushEndpoint(value){
 if(typeof value!=="string"||value.length>4096)return null;
 let url;try{url=new URL(String(value||""));}catch{return null;}
 if(url.protocol!=="https:"||url.username||url.password||url.port||url.hash)return null;
 const host=url.hostname.toLowerCase();
 if(!PUSH_HOSTS.some(allowed=>host===allowed||host.endsWith("."+allowed)))return null;
 return url.toString();
}
export async function registerPushSubscription(userId,input){
 const endpoint=validPushEndpoint(input?.endpoint),keys=input?.keys||{};
 const p256dh=String(keys.p256dh||""),auth=String(keys.auth||"");
 if(!endpoint)fail(400,"This browser returned an unsupported push service endpoint.");
 if(fromB64url(p256dh).length!==65||fromB64url(p256dh)[0]!==4||fromB64url(auth).length<16||fromB64url(auth).length>32)fail(400,"The browser push subscription keys are invalid.");
 const expiration=Number.isFinite(input?.expirationTime)?new Date(input.expirationTime):null;
 const endpointHash=sha256(endpoint);
 await withTransaction(async db=>{
  const existing=(await db.query("SELECT id,user_id FROM notification_push_subscription WHERE endpoint_sha256=$1 FOR UPDATE",[endpointHash])).rows[0];
  if(!existing||existing.user_id!==userId){
   const activeCount=await db.query("SELECT count(*)::int count FROM notification_push_subscription WHERE user_id=$1 AND revoked_at IS NULL",[userId]);
   if(Number(activeCount.rows[0]?.count)>=10)fail(429,"This account has reached the limit of 10 registered devices.","RATE_LIMITED");
  }
  if(existing&&existing.user_id!==userId){
   // A browser endpoint belongs to one account at a time. Cancel queued deliveries
   // before transferring it so a later account cannot receive the prior user's alerts.
   await db.query("UPDATE notification_push_delivery SET status='failed',last_error_code='SUBSCRIPTION_REASSIGNED',updated_at=now() WHERE subscription_id=$1 AND status IN ('pending','sending')",[existing.id]);
  }
  await db.query(`INSERT INTO notification_push_subscription(user_id,endpoint,endpoint_sha256,p256dh,auth_secret,expiration_time,revoked_at,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,NULL,now())
    ON CONFLICT(endpoint_sha256) DO UPDATE SET user_id=EXCLUDED.user_id,p256dh=EXCLUDED.p256dh,auth_secret=EXCLUDED.auth_secret,
    expiration_time=EXCLUDED.expiration_time,revoked_at=NULL,updated_at=now()`,
    [userId,endpoint,endpointHash,p256dh,auth,expiration]);
  await db.query("INSERT INTO notification_preference(user_id,push_enabled,updated_at) VALUES($1,true,now()) ON CONFLICT(user_id) DO UPDATE SET push_enabled=true,updated_at=now()",[userId]);
 });
 return getPushSubscriptionStatus(userId);
}
export async function removePushSubscription(userId,endpoint){
 const safe=validPushEndpoint(endpoint);if(!safe)fail(400,"The browser push endpoint is invalid.");
 await withTransaction(async db=>{
  const existing=await db.query("SELECT id FROM notification_push_subscription WHERE user_id=$1 AND endpoint_sha256=$2 AND revoked_at IS NULL FOR UPDATE",[userId,sha256(safe)]);
  if(existing.rowCount)await db.query("UPDATE notification_push_delivery SET status='failed',last_error_code='SUBSCRIPTION_REVOKED',updated_at=now() WHERE subscription_id=ANY($1::uuid[]) AND status IN ('pending','sending')",[existing.rows.map(row=>row.id)]);
  await db.query("UPDATE notification_push_subscription SET revoked_at=coalesce(revoked_at,now()),updated_at=now() WHERE user_id=$1 AND endpoint_sha256=$2",[userId,sha256(safe)]);
  const active=await db.query("SELECT 1 FROM notification_push_subscription WHERE user_id=$1 AND revoked_at IS NULL LIMIT 1",[userId]);
  if(!active.rowCount)await db.query("INSERT INTO notification_preference(user_id,push_enabled,updated_at) VALUES($1,false,now()) ON CONFLICT(user_id) DO UPDATE SET push_enabled=false,updated_at=now()",[userId]);
 });
 return getPushSubscriptionStatus(userId);
}
export async function disablePushForUser(userId){
 await withTransaction(async db=>{
  const active=await db.query("SELECT id FROM notification_push_subscription WHERE user_id=$1 AND revoked_at IS NULL FOR UPDATE",[userId]);
  if(active.rowCount)await db.query("UPDATE notification_push_delivery SET status='failed',last_error_code='PUSH_OPT_OUT',updated_at=now() WHERE subscription_id=ANY($1::uuid[]) AND status IN ('pending','sending')",[active.rows.map(row=>row.id)]);
  await db.query("UPDATE notification_push_subscription SET revoked_at=coalesce(revoked_at,now()),updated_at=now() WHERE user_id=$1",[userId]);
  await db.query("INSERT INTO notification_preference(user_id,push_enabled,updated_at) VALUES($1,false,now()) ON CONFLICT(user_id) DO UPDATE SET push_enabled=false,updated_at=now()",[userId]);
 });
 return getPushSubscriptionStatus(userId);
}
export async function getPushSubscriptionStatus(userId){
 const db=getPool(),config=vapidConfig();
 const result=await db.query("SELECT count(*)::int active_devices FROM notification_push_subscription s JOIN notification_preference p ON p.user_id=s.user_id AND p.push_enabled=true WHERE s.user_id=$1 AND s.revoked_at IS NULL",[userId]);
 return {configured:Boolean(config),enabled:Boolean(config)&&Number(result.rows[0]?.active_devices)>0,activeDevices:Number(result.rows[0]?.active_devices)||0};
}
export async function enqueuePushDelivery(db,notificationId,userId){
 await db.query(`INSERT INTO notification_push_delivery(notification_event_id,subscription_id)
   SELECT $1,s.id FROM notification_push_subscription s
   JOIN notification_preference p ON p.user_id=s.user_id AND p.push_enabled=true
   WHERE s.user_id=$2 AND s.revoked_at IS NULL
   ON CONFLICT(notification_event_id,subscription_id) DO NOTHING`,[notificationId,userId]);
}
async function deliverOne(row,config){
 const endpoint=validPushEndpoint(row.endpoint);if(!endpoint)return {ok:false,expired:true,status:410,code:"INVALID_ENDPOINT"};
 const payload={title:row.priority==="urgent"||row.priority==="high"?"MPA · Action needed":"MPA · New update",
   body:row.priority==="urgent"||row.priority==="high"?"You have an important MPA update. Open the app to review it.":"You have a new MPA update. Open the app to review it.",
   url:row.action_url&&row.action_url.startsWith("/")&&!row.action_url.startsWith("//")?row.action_url:"/notifications",
   notificationId:row.notification_event_id,priority:row.priority};
 const body=encryptWebPushPayload({p256dh:row.p256dh,auth:row.auth_secret},payload);
 try{
  const response=await fetch(endpoint,{method:"POST",headers:{"Authorization":vapidAuthorization(endpoint,config),"TTL":"86400","Urgency":row.priority==="urgent"?"high":row.priority==="high"?"normal":"low","Content-Type":"application/octet-stream","Content-Encoding":"aes128gcm"},body,signal:AbortSignal.timeout(12000)});
  if(response.status>=200&&response.status<300)return {ok:true,status:response.status};
  return {ok:false,expired:response.status===404||response.status===410,retryable:response.status===429||response.status>=500,status:response.status,code:"PUSH_PROVIDER_REJECTED"};
 }catch(error){return {ok:false,retryable:true,code:error?.name==="TimeoutError"?"PUSH_TIMEOUT":"PUSH_NETWORK_ERROR"};}
}
export async function dispatchPendingPushNotifications(limit=50){
 const config=vapidConfig();if(!config)return {sent:0,failed:0,skipped:true,reason:"VAPID_NOT_CONFIGURED"};
 const db=getPool(),batch=Math.min(Math.max(Number(limit)||50,1),200);
 const claimed=await db.query(`WITH candidates AS (
   SELECT id FROM notification_push_delivery WHERE (status='pending' AND available_at<=now()) OR (status='sending' AND updated_at<now()-interval '5 minutes')
   ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT $1
 ), claimed AS (
   UPDATE notification_push_delivery d SET status='sending',attempts=d.attempts+1,updated_at=now()
   FROM candidates c WHERE d.id=c.id RETURNING d.id,d.notification_event_id,d.subscription_id,d.attempts
 )
 SELECT c.id,c.notification_event_id,c.attempts,s.id subscription_id,s.endpoint,s.p256dh,s.auth_secret,s.revoked_at,p.push_enabled,
   n.action_url,n.priority
 FROM claimed c JOIN notification_push_subscription s ON s.id=c.subscription_id
 JOIN notification_preference p ON p.user_id=s.user_id
 JOIN notification_event n ON n.id=c.notification_event_id AND n.user_id=s.user_id`,[batch]);
 let sent=0,failed=0;
 for(const row of claimed.rows){
  if(row.revoked_at||row.push_enabled!==true){await db.query("UPDATE notification_push_delivery SET status='failed',last_error_code='PUSH_OPT_OUT',updated_at=now() WHERE id=$1",[row.id]);failed++;continue;}
  const result=await deliverOne(row,config);
  if(result.ok){
   await db.query("UPDATE notification_push_delivery SET status='sent',delivered_at=now(),last_status_code=$2,last_error_code=NULL,updated_at=now() WHERE id=$1",[row.id,result.status]);
   await db.query("UPDATE notification_push_subscription SET last_used_at=now() WHERE id=$1",[row.subscription_id]);sent++;continue;
  }
  if(result.expired)await db.query("UPDATE notification_push_subscription SET revoked_at=now(),updated_at=now() WHERE id=$1",[row.subscription_id]);
  const terminal=result.expired||!result.retryable||row.attempts>=5;
  await db.query(`UPDATE notification_push_delivery SET status=$2,available_at=CASE WHEN $2='pending' THEN now()+make_interval(secs=>LEAST(3600,power(2,$3-1)*60)::int) ELSE available_at END,
    last_status_code=$4,last_error_code=$5,updated_at=now() WHERE id=$1`,
    [row.id,terminal?"failed":"pending",row.attempts,result.status||null,result.code||"PUSH_DELIVERY_FAILED"]);
  failed++;
 }
 return {sent,failed,skipped:false};
}
