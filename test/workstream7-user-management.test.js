import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const admin = source("../src/platform/user-admin.js");
const security = source("../src/platform/account-security.js");
const membership = source("../src/membership/service.js");
const server = source("../server.js");
const dispatcher = source("../scripts/dispatch-account-recovery.js");
const migration = source("../db/migrations/202610300001_workstream7_secure_user_management.sql");
const ui = source("../web/app/admin/users-table.tsx");

test("one-time password is random, hash-only at rest, short-lived, and session-revoking", () => {
  const start = admin.indexOf("export async function issueOneTimePassword");
  const end = admin.indexOf("export async function resetPassword", start);
  const fn = admin.slice(start, end);
  assert.ok(start >= 0 && end > start, "one-time password operation exists");
  assert.match(fn, /admin\(actorRoles,actorPermissions,"users\.manage"\)/);
  assert.match(fn, /crypto\.randomBytes\(24\)/);
  assert.match(fn, /hashPassword\(oneTimePassword\)/);
  assert.match(fn, /credential_setup_required=true,credential_setup_expires_at=now\(\)\+interval '24 hours'/);
  assert.match(fn, /update auth_session set revoked_at=now\(\)/);
  assert.match(fn, /update one_time_session_link set revoked_at=now\(\)/);
  assert.match(fn, /admin\.password\.one_time_issued/);
  assert.doesNotMatch(fn, /JSON\.stringify\(\{[^}]*oneTimePassword/);
  assert.match(fn, /return \{id:userId,sessionsRevoked:revoked\.rowCount,credentialSetupRequired:true,oneTimePassword/);
});

test("first sign-in with a one-time password is blocked after expiry and forces credential setup", () => {
  assert.match(membership, /credential_setup_required,credential_setup_expires_at from app_user/);
  assert.match(membership, /ONE_TIME_PASSWORD_EXPIRED/);
  assert.match(membership, /credential_setup_required\) values\(\$1,\$2,now\(\)\+make_interval\(days=>\$3\),\$4,\$5,\$6\)/);
  assert.match(server, /if\(identity\.credential_setup_required\)\{/);
  assert.match(server, /api\/v1\/me\/account/);
  assert.match(security, /credential_setup_required\) values/);
});

test("recovery links are single-use, expire, revoke sessions, and never store the raw token verifier", () => {
  assert.match(security, /createHash\("sha256"\)\.update\(raw\)\.digest\("hex"\)/);
  assert.match(security, /expires_at\) values\(\$1,\$2,\$3,now\(\)\+interval '20 minutes'\)/);
  assert.match(security, /if\(!link\|\|link\.used_at\|\|link\.revoked_at\|\|new Date\(link\.expires_at\)\.getTime\(\)<=Date\.now\(\)\)/);
  assert.match(security, /set used_at=now\(\) where id=\$1/);
  assert.match(security, /update auth_session set revoked_at=now\(\) where user_id=\$1 and revoked_at is null/);
  assert.match(security, /credential_setup_required\) values/);
  assert.match(security, /token_hash/);
});

test("recovery email edits require step-up, ownership checks, expiry, and verification before trust", () => {
  assert.match(security, /actor\?\.auth_method!=="passkey"/);
  assert.match(security, /normalizeRecoveryEmail/);
  assert.match(security, /recovery_email:\$\{email\}/);
  assert.match(security, /lower\(recovery_email_pending\)=lower\(\$2\)/);
  assert.match(security, /recovery_email_change_expires_at=now\(\)\+interval '30 minutes'/);
  assert.match(security, /admin\.recovery_email\.change_requested/);
  assert.match(security, /newEmail:email/);
  assert.match(security, /recovery_email_verified_at=now\(\)/);
  assert.match(security, /recovery_email_change_token_hash=null/);
  assert.match(migration, /add column if not exists recovery_email_verified_at timestamptz/);
  assert.match(migration, /add column if not exists credential_setup_expires_at timestamptz/);
});

test("secret-bearing responses are rate-limited and non-cacheable; no repeat-download route exists", () => {
  assert.match(server, /admin-one-time-password",5,3600000/);
  assert.match(server, /cache-control","no-store, private, max-age=0/);
  assert.match(server, /pragma","no-cache/);
  assert.match(server, /api\/v1\/auth\/recovery-email\/verify/);
  assert.match(server, /one-time-password/);
  assert.doesNotMatch(server, /GET"\s*&&\s*parts\.length===6[^\n]*one-time-password/);
  assert.match(ui, /Issue one-time password/);
  assert.match(ui, /Close and clear credential/);
  assert.match(ui, /Change recovery email/);
});

test("recovery dispatcher reads fragment tokens and removes token URLs from queued payloads after processing", () => {
  assert.match(dispatcher, /url\.hash\.replace\(\/\^#\//);
  assert.match(dispatcher, /account\.recovery_email_verify/);
  assert.match(dispatcher, /account\.recovery_email_change_notice/);
  assert.match(dispatcher, /payload=payload-'url'/);
  assert.match(dispatcher, /Keep dispatcher logs free of secret link material/);
});
