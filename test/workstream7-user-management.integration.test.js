import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { hashPassword, verifyPassword } from "../src/membership/identity.js";
import { login } from "../src/membership/service.js";
import { updateOwnCredentials, createOneTimeSessionLink, redeemOneTimeSessionLink, requestRecoveryEmailChange, verifyRecoveryEmailChange } from "../src/platform/account-security.js";
import { getPool, closePool } from "../src/platform/db.js";
import { issueOneTimePassword, revokeSessions } from "../src/platform/user-admin.js";

const enabled = process.env.NODE_ENV === "test" && Boolean(process.env.DATABASE_URL);

test("Workstream 7 PostgreSQL security workflows", { skip: !enabled }, async (t) => {
  const db = getPool();
  const database = (await db.query("select current_database() name")).rows[0]?.name;
  assert.equal(database, "mpa_test", "security integration tests may only write to the disposable mpa_test database");
  const suffix = crypto.randomUUID();
  const emails = [];
  const ids = [];
  async function createUser(label) {
    const email = `ws7-${label}-${suffix}@example.test`;
    const username = `ws7-${label}-${suffix.slice(0, 8)}`;
    emails.push(email);
    const user = (await db.query(
      "insert into app_user(username,email,password_hash,status,email_verified_at) values($1,$2,$3,'active',now()) returning id,email,username",
      [username, email, hashPassword("Test-Password-For-WS7-2026!")]
    )).rows[0];
    ids.push(user.id);
    return user;
  }
  async function addSession(userId) {
    const tokenHash = crypto.randomBytes(32).toString("hex");
    return (await db.query(
      "insert into auth_session(user_id,token_hash,expires_at) values($1,$2,now()+interval '7 days') returning id",
      [userId, tokenHash]
    )).rows[0].id;
  }
  async function assignRole(userId, roleCode) {
    const role = (await db.query("select id from app_role where role_code=$1", [roleCode])).rows[0];
    assert.ok(role, `Required test role ${roleCode} must exist after migrations`);
    await db.query("insert into app_user_role(user_id,role_id) values($1,$2) on conflict do nothing", [userId, role.id]);
  }

  try {
    const actor = await createUser("admin");
    const nonAdmin = await createUser("member");
    await assignRole(actor.id, "system_admin");
    await assignRole(nonAdmin.id, "member");
    const privilegedActor = { sub: actor.id, roles: ["system_admin"], permissions: [], auth_method: "passkey" };
    const reason = "Workstream 7 isolated integration test";

    await t.test("unauthorized account actions fail server-side", async () => {
      const target = await createUser("unauthorized-target");
      await assert.rejects(
        () => issueOneTimePassword({ sub: nonAdmin.id, roles: ["member"], permissions: [] }, target.id, crypto.randomUUID(), reason),
        (error) => error.statusCode === 403 && error.code === "FORBIDDEN"
      );
      const state = (await db.query("select credential_setup_required from app_user where id=$1", [target.id])).rows[0];
      assert.equal(state.credential_setup_required, false);
      await assert.rejects(
        () => revokeSessions({ sub: nonAdmin.id, roles: ["member"], permissions: [] }, target.id, crypto.randomUUID(), reason),
        (error) => error.statusCode === 403 && error.code === "FORBIDDEN"
      );
      await assert.rejects(
        () => requestRecoveryEmailChange({ sub: nonAdmin.id, roles: ["member"], permissions: [], auth_method: "passkey" }, target.id, { email: `ws7-denied-${suffix}@example.test`, confirmEmail: `ws7-denied-${suffix}@example.test`, reason }, crypto.randomUUID(), "https://portal.muslimprofession.org"),
        (error) => error.statusCode === 403 && error.code === "FORBIDDEN"
      );
    });

    await t.test("one-time password expires, revokes sessions, and forces password replacement", async () => {
      const target = await createUser("otp");
      const oldSession = await addSession(target.id);
      const issued = await issueOneTimePassword(privilegedActor, target.id, crypto.randomUUID(), reason);
      assert.equal(verifyPassword(issued.oneTimePassword, (await db.query("select password_hash from app_user where id=$1", [target.id])).rows[0].password_hash), true);
      assert.notEqual((await db.query("select password_hash from app_user where id=$1", [target.id])).rows[0].password_hash, issued.oneTimePassword);
      const auditMetadata = (await db.query("select metadata::text metadata from audit_log where action='admin.password.one_time_issued' and resource_id::text=$1 order by occurred_at desc limit 1", [target.id])).rows[0]?.metadata || "";
      assert.equal(auditMetadata.includes(issued.oneTimePassword), false, "one-time password must never appear in audit metadata");
      assert.ok((await db.query("select revoked_at from auth_session where id=$1", [oldSession])).rows[0].revoked_at);
      await db.query("update app_user set credential_setup_expires_at=now()-interval '1 second' where id=$1", [target.id]);
      await assert.rejects(
        () => login(target.email, issued.oneTimePassword, crypto.randomUUID()),
        (error) => error.code === "ONE_TIME_PASSWORD_EXPIRED"
      );

      const renewed = await issueOneTimePassword(privilegedActor, target.id, crypto.randomUUID(), reason);
      const signedIn = await login(target.email, renewed.oneTimePassword, crypto.randomUUID());
      const claims = JSON.parse(Buffer.from(signedIn.token.split(".")[1], "base64url").toString("utf8"));
      let session = (await db.query("select credential_setup_required from auth_session where id=$1 and user_id=$2", [claims.sid, target.id])).rows[0];
      assert.equal(session.credential_setup_required, true);
      await assert.rejects(() => login(target.email, renewed.oneTimePassword, crypto.randomUUID()), (error) => error.code === "ONE_TIME_PASSWORD_ALREADY_USED");
      await updateOwnCredentials({ sub: target.id, sid: claims.sid, credential_setup_required: true }, { newPassword: "Replacement-Password-2026-Strong!" }, crypto.randomUUID());
      session = (await db.query("select credential_setup_required from auth_session where id=$1 and user_id=$2", [claims.sid, target.id])).rows[0];
      assert.equal(session.credential_setup_required, false);
      const userState = (await db.query("select credential_setup_required,credential_setup_expires_at,password_hash from app_user where id=$1", [target.id])).rows[0];
      assert.equal(userState.credential_setup_required, false);
      assert.equal(userState.credential_setup_expires_at, null);
      assert.equal(verifyPassword("Replacement-Password-2026-Strong!", userState.password_hash), true);
    });

    await t.test("recovery email remains pending until a single-use verification succeeds", async () => {
      const target = await createUser("recovery-email");
      const newEmail = `ws7-new-${suffix}@example.test`;
      emails.push(newEmail);
      const accepted = await requestRecoveryEmailChange(privilegedActor, target.id, { email: newEmail, confirmEmail: newEmail, reason }, crypto.randomUUID(), "https://portal.muslimprofession.org");
      assert.equal(accepted.accepted, true);
      let state = (await db.query("select recovery_email,recovery_email_pending,recovery_email_verified_at,recovery_email_change_token_hash from app_user where id=$1", [target.id])).rows[0];
      assert.equal(state.recovery_email, null);
      assert.equal(state.recovery_email_pending, newEmail);
      assert.ok(state.recovery_email_change_token_hash);
      const outbox = (await db.query("select payload from notification_outbox where recipient=$1 and template_code='account.recovery_email_verify' order by created_at desc limit 1", [newEmail])).rows[0];
      const payload = typeof outbox.payload === "string" ? JSON.parse(outbox.payload) : outbox.payload;
      const url = new URL(payload.url);
      const rawToken = new URLSearchParams(url.hash.replace(/^#/, "")).get("token");
      assert.ok(rawToken);
      await verifyRecoveryEmailChange(rawToken, crypto.randomUUID());
      state = (await db.query("select recovery_email,recovery_email_pending,recovery_email_verified_at,recovery_email_change_token_hash from app_user where id=$1", [target.id])).rows[0];
      assert.equal(state.recovery_email, newEmail);
      assert.equal(state.recovery_email_pending, null);
      assert.ok(state.recovery_email_verified_at);
      assert.equal(state.recovery_email_change_token_hash, null);
      const requestedAudit = (await db.query("select action,outcome,request_id,metadata::text metadata from audit_log where action='admin.recovery_email.change_requested' and resource_id::text=$1 order by occurred_at desc limit 1", [target.id])).rows[0];
      assert.equal(requestedAudit.action, "admin.recovery_email.change_requested");
      assert.equal(requestedAudit.outcome, "success");
      assert.ok(requestedAudit.request_id);
      assert.ok(requestedAudit.metadata.includes(newEmail));
      const verifiedAudit = (await db.query("select action from audit_log where action='account.recovery_email.verified' and resource_id::text=$1 order by occurred_at desc limit 1", [target.id])).rows[0];
      assert.equal(verifiedAudit.action, "account.recovery_email.verified");
      await assert.rejects(() => verifyRecoveryEmailChange(rawToken, crypto.randomUUID()), (error) => error.statusCode === 410);
    });

    await t.test("expired recovery-email verification tokens are rejected", async () => {
      const target = await createUser("recovery-email-expired");
      const newEmail = `ws7-expired-${suffix}@example.test`;
      emails.push(newEmail);
      await requestRecoveryEmailChange(privilegedActor, target.id, { email: newEmail, confirmEmail: newEmail, reason }, crypto.randomUUID(), "https://portal.muslimprofession.org");
      const outbox = (await db.query("select payload from notification_outbox where recipient=$1 and template_code='account.recovery_email_verify' order by created_at desc limit 1", [newEmail])).rows[0];
      const payload = typeof outbox.payload === "string" ? JSON.parse(outbox.payload) : outbox.payload;
      const url = new URL(payload.url);
      const rawToken = new URLSearchParams(url.hash.replace(/^#/, "")).get("token");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      await db.query("update app_user set recovery_email_change_expires_at=now()-interval '1 second' where id=$1", [target.id]);
      await assert.rejects(() => verifyRecoveryEmailChange(rawToken, crypto.randomUUID()), (error) => error.statusCode === 410);
      assert.ok((await db.query("select recovery_email from app_user where id=$1", [target.id])).rows[0].recovery_email === null);
      assert.ok(tokenHash.length === 64);
    });

    await t.test("recovery links are single-use and revoke existing sessions", async () => {
      const target = await createUser("recovery-link");
      const oldSession = await addSession(target.id);
      const accepted = await createOneTimeSessionLink(privilegedActor, target.id, crypto.randomUUID(), reason, "https://portal.muslimprofession.org");
      assert.equal(accepted.queued, true);
      const outbox = (await db.query("select payload from notification_outbox where recipient=$1 and template_code='account.one_time_session_link' order by created_at desc limit 1", [target.email])).rows[0];
      const payload = typeof outbox.payload === "string" ? JSON.parse(outbox.payload) : outbox.payload;
      const url = new URL(payload.url);
      const rawToken = new URLSearchParams(url.hash.replace(/^#/, "")).get("token");
      assert.ok(rawToken);
      const redeemed = await redeemOneTimeSessionLink(rawToken, crypto.randomUUID());
      assert.equal(redeemed.credentialSetupRequired, true);
      assert.ok((await db.query("select revoked_at from auth_session where id=$1", [oldSession])).rows[0].revoked_at);
      await assert.rejects(() => redeemOneTimeSessionLink(rawToken, crypto.randomUUID()), (error) => error.statusCode === 410);
    });

    await t.test("expired one-time session links are rejected", async () => {
      const target = await createUser("recovery-link-expired");
      const rawToken = crypto.randomBytes(32).toString("base64url");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      await db.query("insert into one_time_session_link(user_id,token_hash,created_by,expires_at) values($1,$2,$3,now()-interval '1 second')", [target.id, tokenHash, actor.id]);
      await assert.rejects(() => redeemOneTimeSessionLink(rawToken, crypto.randomUUID()), (error) => error.statusCode === 410);
    });
  } finally {
    if (ids.length) {
      const textIds = ids.map(String);
      await db.query("delete from audit_log where actor_user_id=any($1::uuid[]) or resource_id::text=any($2::text[])", [ids, textIds]).catch(() => {});
      await db.query("delete from notification_event where user_id=any($1::uuid[])", [ids]).catch(() => {});
      await db.query("delete from auth_session where user_id=any($1::uuid[])", [ids]).catch(() => {});
      await db.query("delete from one_time_session_link where user_id=any($1::uuid[]) or created_by=any($1::uuid[])", [ids]).catch(() => {});
      await db.query("delete from app_user_role where user_id=any($1::uuid[])", [ids]).catch(() => {});
      await db.query("delete from app_user_permission where user_id=any($1::uuid[])", [ids]).catch(() => {});
      await db.query("delete from notification_preference where user_id=any($1::uuid[])", [ids]).catch(() => {});
      await db.query("delete from app_user where id=any($1::uuid[])", [ids]).catch(() => {});
    }
    if (emails.length) {
      await db.query("delete from notification_outbox where recipient=any($1::text[])", [emails]).catch(() => {});
      await db.query("delete from auth_login_attempt where identity_key=any($1::text[])", [emails]).catch(() => {});
    }
    await closePool();
  }
});
