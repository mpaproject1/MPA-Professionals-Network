import { createHash, randomBytes } from "node:crypto";
import { loadConfig } from "./config.js";
import { getPool, withTransaction } from "./db.js";
import { renderVerificationEmail } from "./email-template.js";
import { classifyEmailDeliveryError, emailRetryDelaySeconds } from "./email-retry-policy.js";
import { encryptVerificationToken, decryptVerificationToken } from "./email-verification-crypto.js";

const sha256 = value => createHash("sha256").update(String(value)).digest("hex");
const clean = value => String(value || "").trim();
const emailUrl = (token) => {
  const config = loadConfig();
  const base = clean(process.env.PUBLIC_APP_URL) || (config.nodeEnv === "production" ? "" : "http://localhost:3001");
  if (!base) throw Object.assign(new Error("PUBLIC_APP_URL is required for production email verification."), { statusCode: 503, code: "EMAIL_DELIVERY_NOT_CONFIGURED" });
  const url = new URL("/verify-email", base);
  url.searchParams.set("token", token);
  return url.toString();
};

export function assertEmailDeliveryConfigured() {
  const config = loadConfig();
  if (config.nodeEnv !== "production") return;
  const publicAppUrl = clean(process.env.PUBLIC_APP_URL);
  const resendKey = clean(process.env.RESEND_API_KEY);
  const emailFrom = clean(process.env.EMAIL_FROM);
  const endpoint = clean(process.env.EMAIL_DELIVERY_WEBHOOK_URL);
  const secret = clean(process.env.EMAIL_DELIVERY_WEBHOOK_SECRET);
  const resendConfigured = Boolean(resendKey && emailFrom);
  const webhookConfigured = Boolean(endpoint && secret);
  if (!publicAppUrl || (!resendConfigured && !webhookConfigured)) {
    throw Object.assign(new Error("Configure PUBLIC_APP_URL and either Resend (RESEND_API_KEY + EMAIL_FROM) or the signed email-delivery webhook before enabling production registration."), { statusCode: 503, code: "EMAIL_DELIVERY_NOT_CONFIGURED" });
  }
  let publicUrl;
  try { publicUrl = new URL(publicAppUrl); } catch { throw Object.assign(new Error("PUBLIC_APP_URL must be a valid HTTPS URL."), { statusCode: 503, code: "EMAIL_DELIVERY_NOT_CONFIGURED" }); }
  if (publicUrl.protocol !== "https:" || publicUrl.username || publicUrl.password || publicUrl.pathname !== "/" || publicUrl.search || publicUrl.hash) throw Object.assign(new Error("PUBLIC_APP_URL must be an HTTPS origin without credentials, path, query, or fragment."), { statusCode: 503, code: "EMAIL_DELIVERY_NOT_CONFIGURED" });
  if (resendConfigured && (!emailFrom.includes("@") || emailFrom.length > 320)) throw Object.assign(new Error("EMAIL_FROM must be a verified sender address."), { statusCode: 503, code: "EMAIL_DELIVERY_NOT_CONFIGURED" });
  if (webhookConfigured) {
    let parsed;
    try { parsed = new URL(endpoint); } catch { throw Object.assign(new Error("Email delivery webhook URL is invalid."), { statusCode: 503, code: "EMAIL_DELIVERY_NOT_CONFIGURED" }); }
    if (parsed.protocol !== "https:") throw Object.assign(new Error("Production email delivery webhooks must use HTTPS."), { statusCode: 503, code: "EMAIL_DELIVERY_NOT_CONFIGURED" });
  }
}

export async function createEmailVerification(db, userId, email, registrationReference, firstName = "") {
  assertEmailDeliveryConfigured();
  const token = randomBytes(32).toString("base64url");
  const tokenRow = (await db.query(
    "insert into email_verification_token(user_id,token_hash,expires_at) values($1,$2,now()+interval '24 hours') returning id",
    [userId, sha256(token)]
  )).rows[0];
  const encrypted = encryptVerificationToken(token);
  await db.query(
    "insert into email_verification_delivery(verification_token_id,encrypted_token,encryption_iv,encryption_tag) values($1,$2,$3,$4)",
    [tokenRow.id, encrypted.encryptedToken, encrypted.encryptionIv, encrypted.encryptionTag]
  );
  return { token, tokenId: tokenRow.id, verificationUrl: emailUrl(token), registrationReference, email, firstName };
}

export async function deliverEmailVerification(message) {
  const db = getPool();
  const tokenHash = sha256(message.token);
  const tokenRow = (await db.query(
    "select id,user_id,expires_at,consumed_at from email_verification_token where token_hash=$1 limit 1",
    [tokenHash]
  )).rows[0];
  if (!tokenRow || tokenRow.consumed_at || new Date(tokenRow.expires_at).getTime() <= Date.now()) {
    return { sent: false, expired: true };
  }
  const encrypted = encryptVerificationToken(message.token);
  const delivery = (await db.query(
    `insert into email_verification_delivery(verification_token_id,encrypted_token,encryption_iv,encryption_tag)
     values($1,$2,$3,$4)
     on conflict(verification_token_id) do update set updated_at=now()
     returning id,status,attempts`,
    [tokenRow.id, encrypted.encryptedToken, encrypted.encryptionIv, encrypted.encryptionTag]
  )).rows[0];
  const hold = (await db.query(
    "select reason from email_recipient_suppression where email_normalized=lower(trim($1)) and cleared_at is null limit 1",
    [message.email]
  )).rows[0];
  if (hold) {
    await withTransaction(async tx => {
      await tx.query("update email_verification_delivery set status='suppressed',last_error='Recipient is on an outbound email hold',last_error_code='RECIPIENT_SUPPRESSED',locked_at=null,updated_at=now() where id=$1", [delivery.id]);
      await tx.query("update email_verification_token set delivery_attempted_at=now(),delivery_status='failed',delivery_error_code='RECIPIENT_SUPPRESSED' where id=$1 and consumed_at is null", [tokenRow.id]);
      await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,outcome,metadata) values($1,'email.verification.delivery_suppressed','email_verification_token',$2,'suppressed',$3)", [tokenRow.user_id, tokenRow.id, { deliveryId: delivery.id, reason: hold.reason }]);
    });
    return { sent: false, suppressed: true };
  }

  const templateResult = await db.query("select subject_template,text_template,html_template,audience,enabled from email_notification_template where template_code='account.email_verification'");
  const template = templateResult.rows[0];
  if (template?.enabled === false || (template?.audience && template.audience !== "all")) {
    const error = Object.assign(new Error("The security-critical verification template must remain enabled for all recipients."), { code: "VERIFICATION_TEMPLATE_POLICY_VIOLATION", statusCode: 503 });
    await db.query("update email_verification_delivery set status='failed',last_error=$2,last_error_code=$3,locked_at=null,updated_at=now() where id=$1", [delivery.id, error.message, error.code]);
    throw error;
  }
  const vars = { firstName: message.firstName || "", verificationUrl: message.verificationUrl, registrationReference: message.registrationReference || "" };
  const render = (source, html=false) => String(source || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_,key) => {
    const value=String(vars[key] ?? "");
    return html ? value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;") : value;
  });
  const subject = template ? render(template.subject_template) : "Verify your MPA Professionals Network email";
  const textBody = template ? render(template.text_template) : `Verify your email to activate your MPA Professionals Network account. This link expires in 24 hours. Registration reference: ${message.registrationReference}. Link: ${message.verificationUrl}`;
  const htmlBody = renderVerificationEmail({
    subject, textBody,
    htmlTemplate: template ? render(template.html_template, true) : "",
    verificationUrl: message.verificationUrl,
    registrationReference: message.registrationReference
  });
  const config = loadConfig();
  if (config.nodeEnv !== "production" && !process.env.TEST_DELIVERY_MODE && !process.env.RESEND_API_KEY && !process.env.EMAIL_DELIVERY_WEBHOOK_URL) {
    return { sent: false, developmentVerificationUrl: message.verificationUrl };
  }
  const { sendEmailMessage } = await import("./email-operations.js");
  try {
    const sent = await sendEmailMessage({
      recipient: message.email, subject, textBody, htmlBody,
      templateCode: "account.email_verification",
      payload: { registrationReference: message.registrationReference || null },
      idempotencyKey: "verification-" + tokenHash
    });
    const captured = sent.captured === true;
    await withTransaction(async tx => {
      await tx.query(
        "update email_verification_delivery set status=$2,attempts=attempts+1,provider_message_id=$3,provider=$4,last_error=null,last_error_code=null,next_attempt_at=now(),locked_at=null,sent_at=case when $2='sent' then now() else sent_at end,captured_at=case when $2='captured' then now() else captured_at end,updated_at=now() where id=$1",
        [delivery.id, captured ? "captured" : "sent", sent.providerMessageId || null, sent.provider || (captured ? "test-capture" : null)]
      );
      await tx.query("update email_verification_token set delivery_attempted_at=now(),delivery_status=$2,delivery_error_code=null where id=$1 and consumed_at is null", [tokenRow.id, captured ? "captured" : "sent"]);
      await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,outcome,metadata) values($1,$2,'email_verification_token',$3,'success',$4)", [tokenRow.user_id, captured ? "email.verification.delivery_captured" : "email.verification.provider_accepted", tokenRow.id, { deliveryId: delivery.id, providerMessageId: sent.providerMessageId || null, attempt: Number(delivery.attempts || 0) + 1 }]);
    });
    return { sent: true, captured, providerMessageId: sent.providerMessageId || null };
  } catch (error) {
    const classification = classifyEmailDeliveryError(error);
    const attempt = Number(delivery.attempts || 0) + 1;
    const exhausted = attempt >= 8 || !classification.retryable;
    const delay = emailRetryDelaySeconds(attempt);
    await withTransaction(async tx => {
      await tx.query(
        "update email_verification_delivery set status='failed',attempts=attempts+1,next_attempt_at=$2,locked_at=null,last_error=$3,last_error_code=$4,updated_at=now() where id=$1",
        [delivery.id, exhausted ? new Date(Date.now() + 3650 * 86400000) : new Date(Date.now() + delay * 1000), String(error?.message || "Delivery failed").slice(0,500), classification.code]
      );
      await tx.query("update email_verification_token set delivery_attempted_at=now(),delivery_status='failed',delivery_error_code=$2 where id=$1 and consumed_at is null", [tokenRow.id, classification.code]);
      await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,outcome,metadata) values($1,'email.verification.delivery_failed','email_verification_token',$2,$3,$4)", [tokenRow.user_id, tokenRow.id, exhausted ? "failure" : "retry_scheduled", { deliveryId: delivery.id, code: classification.code, attempt, retryable: !exhausted }]);
    });
    return { sent: false, retryScheduled: !exhausted, errorCode: classification.code };
  }
}

export async function dispatchPendingVerificationEmails({ limit = 20, onlyTokenId = null, force = false } = {}) {
  const db = getPool();
  const batch = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const jobs = await withTransaction(async tx => {
    await tx.query("update email_verification_delivery set status='pending',locked_at=null,next_attempt_at=least(next_attempt_at,now()),updated_at=now() where status='processing' and locked_at<now()-interval '5 minutes'");
    const selected = (await tx.query(
      `select d.id,d.verification_token_id,d.encrypted_token,d.encryption_iv,d.encryption_tag,
              t.expires_at,t.consumed_at,u.email,u.registration_reference,p.first_name
       from email_verification_delivery d
       join email_verification_token t on t.id=d.verification_token_id
       join app_user u on u.id=t.user_id
       left join person p on p.user_id=u.id
       where d.status in ('pending','failed') and d.attempts<8
         and t.consumed_at is null and t.expires_at>now()
         and ($1::uuid is null or t.id=$1::uuid)
         and ($2::boolean or d.next_attempt_at<=now())
       order by d.next_attempt_at,d.created_at
       for update of d skip locked limit $3`,
      [onlyTokenId, force, batch]
    )).rows;
    for (const job of selected) {
      await tx.query("update email_verification_delivery set status='processing',locked_at=now(),updated_at=now() where id=$1", [job.id]);
    }
    return selected;
  });
  const results = [];
  for (const job of jobs) {
    try {
      const token = decryptVerificationToken(job);
      const result = await deliverEmailVerification({
        token, tokenId: job.verification_token_id, email: job.email,
        registrationReference: job.registration_reference || "MPA account",
        firstName: job.first_name || "", verificationUrl: emailUrl(token)
      });
      results.push({ tokenId: job.verification_token_id, ...result });
    } catch (error) {
      await db.query("update email_verification_delivery set status='failed',locked_at=null,last_error=$2,last_error_code=$3,updated_at=now() where id=$1 and status='processing'", [job.id, String(error?.message || "Delivery failed").slice(0,500), String(error?.code || "DELIVERY_FAILED").slice(0,100)]);
      results.push({ tokenId: job.verification_token_id, sent: false, errorCode: error?.code || "DELIVERY_FAILED" });
    }
  }
  return { processed: results.length, results };
}

export async function retryVerificationDelivery(tokenId) {
  const db = getPool();
  const row = (await db.query(
    "update email_verification_delivery d set status='pending',next_attempt_at=now(),locked_at=null,updated_at=now() from email_verification_token t where d.verification_token_id=t.id and t.id=$1 and t.consumed_at is null and t.expires_at>now() and d.status='failed' and d.attempts<8 returning d.id",
    [tokenId]
  )).rows[0];
  if (!row) return { requested: false };
  const result = await dispatchPendingVerificationEmails({ limit: 1, onlyTokenId: tokenId, force: true });
  return { requested: true, ...result };
}

export async function verifyEmailToken(rawToken, requestId) {
  if (typeof rawToken !== "string" || rawToken.length < 32 || rawToken.length > 256) {
    throw Object.assign(new Error("The verification link is invalid or expired. Request a new link."), { statusCode: 400, code: "EMAIL_VERIFICATION_INVALID" });
  }
  return withTransaction(async db => {
    const row = (await db.query(
      "select id,user_id from email_verification_token where token_hash=$1 and consumed_at is null and expires_at>now() for update",
      [sha256(rawToken)]
    )).rows[0];
    if (!row) throw Object.assign(new Error("The verification link is invalid, expired, or already used. Request a new link."), { statusCode: 400, code: "EMAIL_VERIFICATION_INVALID" });
    await db.query("update email_verification_token set consumed_at=now() where user_id=$1 and consumed_at is null", [row.user_id]);
    const verifiedUser = (await db.query("update app_user set email_verified_at=coalesce(email_verified_at,now()),updated_at=now() where id=$1 returning registration_reference", [row.user_id])).rows[0];
    await db.query(
      "insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'account.email_verified','account',$2,$3,'success',$4)",
      [row.user_id, row.user_id, requestId || null, { method: "single_use_email_link" }]
    );
    return { verified: true, registrationReference: verifiedUser?.registration_reference || null };
  });
}

export async function resendEmailVerification(emailInput, requestId) {
  const email = clean(emailInput).toLowerCase();
  if (!email || email.length > 320) return { accepted: true };
  assertEmailDeliveryConfigured();
  const db = getPool();
  const user = (await db.query("select id,email,registration_reference,email_verified_at from app_user where lower(email)=lower($1) limit 1", [email])).rows[0];
  // Keep responses indistinguishable for unknown and already-verified addresses.
  if (!user || user.email_verified_at) return { accepted: true };
  const token = randomBytes(32).toString("base64url");
  await withTransaction(async tx => {
    await tx.query("update email_verification_token set consumed_at=now() where user_id=$1 and consumed_at is null", [user.id]);
    const tokenRow = (await tx.query("insert into email_verification_token(user_id,token_hash,expires_at) values($1,$2,now()+interval '24 hours') returning id", [user.id, sha256(token)])).rows[0];
    const encrypted = encryptVerificationToken(token);
    await tx.query("insert into email_verification_delivery(verification_token_id,encrypted_token,encryption_iv,encryption_tag) values($1,$2,$3,$4)", [tokenRow.id, encrypted.encryptedToken, encrypted.encryptionIv, encrypted.encryptionTag]);
    await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'account.email_verification_resent','account',$2,$3,'success',$4)", [user.id, user.id, requestId || null, { method: "email_link" }]);
  });
  const message = { token, verificationUrl: emailUrl(token), registrationReference: user.registration_reference || "MPA account", email: user.email };
  const delivery = await deliverEmailVerification(message);
  return loadConfig().nodeEnv === "production" ? { accepted: true } : { accepted: true, developmentVerificationUrl: delivery.developmentVerificationUrl || message.verificationUrl };
}
