import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import * as membership from "../../src/membership/service.js";
import * as userAdmin from "../../src/platform/user-admin.js";
import { getPool } from "../../src/platform/db.js";

async function registerAccount(label) {
  const suffix=randomUUID();
  const digits=[...suffix.replace(/-/g,"")].map(character=>String(Number.parseInt(character,16)%10)).join("").slice(0,8);
  const result=await membership.register({
    email:`account-governance-${label}-${suffix}@example.test`,
    password:"AccountGovernanceP1Password!2026",
    firstName:"Account",
    lastName:`Governance${suffix.slice(0,8)}`,
    phone:`07${digits}`,
  },`account-governance-${label}-${suffix}`);
  return result.user;
}

test("database-generated account references are unique-format, immutable, and independent of membership roles",async t=>{
  if(!process.env.DATABASE_URL){t.skip("requires the disposable PostgreSQL database configured by PR Quality");return;}
  const db=getPool();
  const member=await registerAccount("member");
  const saved=(await db.query("select id,account_reference,account_reference_source from app_user where id=$1",[member.id])).rows[0];
  assert.equal(saved.id,member.id,"database UUID must remain unchanged");
  assert.match(saved.account_reference,/^MPA-\d{8}-\d{6,}$/);
  assert.equal(saved.account_reference_source,"database_generated");
  await assert.rejects(
    db.query("update app_user set account_reference=$2 where id=$1",[member.id,"MPA-20990101-999999"]),
    error=>error.code==="23514"
  );
  const after=(await db.query("select id,account_reference from app_user where id=$1",[member.id])).rows[0];
  assert.equal(after.id,member.id);
  assert.equal(after.account_reference,saved.account_reference);
  const roles=(await db.query("select r.role_code from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1",[member.id])).rows.map(row=>row.role_code);
  assert.ok(roles.includes("member"),"test account should have the platform Member role");
  const governance=await userAdmin.getAccountGovernance({sub:member.id,roles:["system_admin"],permissions:[]},saved.account_reference).catch(error=>({error}));
  // The service re-reads authority from the database; a role claim alone cannot grant governance access.
  assert.equal(governance.error?.statusCode,403);
});

test("authorized account governance returns confirmed not-enrolled state and denies unauthorized readers",async t=>{
  if(!process.env.DATABASE_URL){t.skip("requires the disposable PostgreSQL database configured by PR Quality");return;}
  const db=getPool();
  const administrator=await registerAccount("admin");
  const member=await registerAccount("target");
  const adminRole=(await db.query("select id from app_role where role_code='system_admin'")).rows[0];
  assert.ok(adminRole,"system_admin role must exist");
  await db.query("insert into app_user_role(user_id,role_id,assigned_by) values($1,$2,$1) on conflict do nothing",[administrator.id,adminRole.id]);
  const reference=(await db.query("select account_reference from app_user where id=$1",[member.id])).rows[0].account_reference;
  await assert.rejects(userAdmin.getAccountGovernance({sub:member.id,roles:["member"],permissions:[]},reference),error=>error.statusCode===403);
  const result=await userAdmin.getAccountGovernance({sub:administrator.id,roles:["system_admin"],permissions:[]},reference);
  assert.equal(result.account.account_reference,reference);
  assert.equal(result.membership.status,"not_enrolled");
  assert.deepEqual(result.membership.records,[]);
  assert.equal(result.organizations.authorized,true);
});
