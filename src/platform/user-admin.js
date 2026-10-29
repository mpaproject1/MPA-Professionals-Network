import crypto from "node:crypto";
import {hashPassword} from "../membership/identity.js";
import {getPool,withTransaction} from "./db.js";
import {createInAppNotification} from "./notifications.js";

function err(status,message,code="BUSINESS_RULE"){const e=new Error(message);e.statusCode=status;e.code=code;return e}
async function allowed(db,userId){const r=await db.query("select r.role_code from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1",[userId]);return r.rows.map(x=>x.role_code)}
function admin(roles,permissions=[],requiredPermission="users.manage"){if(!roles.some(x=>["system_admin","admin"].includes(x))&&!permissions.includes(requiredPermission))throw err(403,"Administrator role or explicit user-administration permission required.","FORBIDDEN")}
const SYSTEM_ROLE="system_admin";
const PRIVILEGED_ROLES=new Set([SYSTEM_ROLE,"super_admin","admin","reviewer","verification_reviewer","ethics_reviewer","appeal_reviewer","finance_officer"]);
const NON_PLATFORM_ROLES={
 organization_admin:{scope:"organization",reason:"Use an organization membership role instead."},
 recruiter:{scope:"organization_or_job",reason:"Use organization membership or job-team scope instead."},
 project_manager:{scope:"organization_or_project",reason:"Use organization or project assignment scope instead."},
 read_only:{scope:"organization",reason:"Use an organization membership role instead."},
 mentor:{scope:"profile",reason:"Mentor eligibility is based on a verified professional profile, not a platform role."}
};


async function requireSystemAdmin(actor){
 const actorRoles=await allowed(getPool(),actor);
 if(!actorRoles.includes(SYSTEM_ROLE))throw err(403,"Only a system administrator may manage per-user permissions.","SYSTEM_ADMIN_REQUIRED");
 return actorRoles;
}
export async function listPermissions(actor){
 await requireSystemAdmin(actor);
 return (await getPool().query("select permission_code,area,label,description,sensitive,system_only from app_permission order by area,label,permission_code")).rows;
}
export async function updateUserPermissions(actor,userId,input,requestId){
 return withTransaction(async tx=>{
  const actorRoles=await allowed(tx,actor);
  if(!actorRoles.includes(SYSTEM_ROLE))throw err(403,"Only a system administrator may manage per-user permissions.","SYSTEM_ADMIN_REQUIRED");
  if(userId===actor)throw err(403,"You cannot change your own direct permissions.","SELF_PERMISSION_CHANGE");
  const target=(await tx.query("select id,status,email_verified_at from app_user where id=$1 for update",[userId])).rows[0];
  if(!target)throw err(404,"User not found.","NOT_FOUND");
  const reason=String(input.reason||"").trim().slice(0,500);
  if(!reason)throw err(400,"An audit reason is required for permission changes.","AUDIT_REASON_REQUIRED");
  if(!Array.isArray(input.permissionCodes))throw err(400,"permissionCodes must be an array.","VALIDATION_ERROR");
  const requested=[...new Set(input.permissionCodes.map(value=>String(value)))];
  if(requested.length>100)throw err(400,"Too many permissions were submitted.","VALIDATION_ERROR");
  const catalog=(await tx.query("select permission_code,system_only from app_permission where permission_code=any($1::text[])",[requested])).rows;
  if(catalog.length!==requested.length)throw err(400,"One or more permission codes are unknown.","INVALID_PERMISSION");
  if(catalog.some(permission=>permission.system_only))throw err(403,"One or more requested permissions are reserved to system administrators.","SYSTEM_ONLY_PERMISSION");
  const previous=(await tx.query("select permission_code from app_user_permission where user_id=$1 order by permission_code",[userId])).rows.map(row=>row.permission_code);
  await tx.query("delete from app_user_permission where user_id=$1",[userId]);
  for(const code of requested)await tx.query("insert into app_user_permission(user_id,permission_code,assigned_by) values($1,$2,$3)",[userId,code,actor]);
  await tx.query("update auth_session set revoked_at=now() where user_id=$1 and revoked_at is null",[userId]);
  await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'admin.user.permissions_updated','app_user',$2,$3,'success',$4)",[actor,userId,requestId,JSON.stringify({previousPermissions:previous,permissions:requested,reason})]);
  return {id:userId,permissions:requested,sessionRevoked:true};
 });
}

export async function logout(userId,sessionId,requestId){
 return withTransaction(async tx=>{
  const result=await tx.query("update auth_session set revoked_at=now() where id=$1 and user_id=$2 and revoked_at is null returning id",[sessionId,userId]);
  if(result.rowCount){
   await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'account.logout','auth_session',$2,$3,'success',$4)",[userId,sessionId,requestId,JSON.stringify({})]);
  }
  return {loggedOut:true,sessionRevoked:result.rowCount===1};
 });
}

export async function listUsers(actor,input={}) {
 const db=getPool(), actorId=typeof actor==="string"?actor:actor?.sub, actorPermissions=Array.isArray(actor?.permissions)?actor.permissions:[];
 const actorRoles=await allowed(db,actorId); admin(actorRoles,actorPermissions,"users.view");
 const q=String(input.q||"").trim().slice(0,120), status=input.status||null;
 const canViewOrganizations=actorRoles.some(role=>["system_admin","admin","platform_admin"].includes(role))||actorPermissions.includes("organizations.manage");
 const organizationNames=canViewOrganizations?"coalesce((select json_agg(distinct o.display_name order by o.display_name) from organization_membership om join organization o on o.id=om.organization_id where om.user_id=u.id and om.status='active'),'[]'::json)":"null::json";
 const sql=`select u.id,u.account_reference,u.email,u.username,u.status,u.created_at,u.updated_at,
 coalesce(json_agg(distinct r.role_code) filter(where r.role_code is not null),'[]') roles,
 coalesce((select json_agg(up.permission_code order by up.permission_code) from app_user_permission up where up.user_id=u.id),'[]'::json) permissions,
 case when not exists(select 1 from membership_record mr where mr.user_id=u.id) then 'not_enrolled'
 when exists(select 1 from membership_record mr where mr.user_id=u.id and mr.status='active' and mr.start_date is not null and mr.start_date<=current_date and (mr.end_date is null or mr.end_date>=current_date)) then 'active'
 when exists(select 1 from membership_record mr where mr.user_id=u.id and mr.status='pending') then 'pending'
 when exists(select 1 from membership_record mr where mr.user_id=u.id and mr.status='suspended') then 'suspended'
 when exists(select 1 from membership_record mr where mr.user_id=u.id and (mr.status='expired' or (mr.status='active' and mr.end_date<current_date))) then 'expired'
 when exists(select 1 from membership_record mr where mr.user_id=u.id and mr.status='cancelled') then 'cancelled' else 'unknown' end membership_status,
 ${organizationNames} organization_names, ${canViewOrganizations} organization_relationships_authorized
 from app_user u left join app_user_role ur on ur.user_id=u.id left join app_role r on r.id=ur.role_id
 where ($1='' or lower(coalesce(u.email,'')) like lower('%'||$1||'%') or lower(coalesce(u.username,'')) like lower('%'||$1||'%') or lower(coalesce(u.account_reference,'')) like lower('%'||$1||'%'))
 and ($2::text is null or u.status=$2) group by u.id order by u.created_at desc limit 200`;
 return (await db.query(sql,[q,status])).rows;
}

export async function getAccountGovernance(actor,accountReference) {
 const db=getPool(), actorId=typeof actor==="string"?actor:actor?.sub, actorPermissions=Array.isArray(actor?.permissions)?actor.permissions:[];
 const actorRoles=await allowed(db,actorId);
 if(!actorRoles.some(role=>["system_admin","admin","platform_admin"].includes(role))&&!actorPermissions.includes("users.manage")) throw err(403,"Account governance requires authorized platform-administration access.","FORBIDDEN");
 const reference=String(accountReference||"").trim();
 if(!/^MPA-\d{8}-\d{6,}$/.test(reference)) throw err(400,"Provide a valid Account ID reference.","INVALID_ACCOUNT_REFERENCE");
 const user=(await db.query(`select u.id,u.account_reference,u.email,u.username,u.status,u.created_at,u.updated_at,coalesce((select json_agg(r.role_code order by r.role_code) from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=u.id),'[]'::json) roles from app_user u where u.account_reference=$1`,[reference])).rows[0];
 if(!user)throw err(404,"No account was found for that Account ID.","NOT_FOUND");
 const memberships=(await db.query(`select mr.membership_number,mr.status,mr.start_date,mr.end_date,mr.source,mr.legacy_member_id,mr.created_at,mi.source_system,mi.status import_status,mi.created_at import_created_at,mr.legacy_payload->>'status' historical_source_status,(mr.status='active' and mr.start_date<=current_date and (mr.end_date is null or mr.end_date>=current_date)) is_current from membership_record mr left join membership_import mi on mi.id=mr.source_import_id where mr.user_id=$1 order by mr.created_at desc,mr.id`,[user.id])).rows;
 let membershipStatus="not_enrolled";
 if(memberships.length){if(memberships.some(m=>m.is_current===true))membershipStatus="active";else if(memberships.some(m=>m.status==="pending"))membershipStatus="pending";else if(memberships.some(m=>m.status==="suspended"))membershipStatus="suspended";else if(memberships.some(m=>m.status==="expired"||(m.status==="active"&&m.end_date&&new Date(m.end_date)<new Date())))membershipStatus="expired";else if(memberships.every(m=>["cancelled","merged"].includes(m.status)))membershipStatus="cancelled";else membershipStatus="unknown";}
 const canViewOrganizations=actorRoles.some(role=>["system_admin","admin","platform_admin"].includes(role))||actorPermissions.includes("organizations.manage");
 const organizations=canViewOrganizations?(await db.query(`select o.display_name organization_name,om.role_code,om.status,om.joined_at from organization_membership om join organization o on o.id=om.organization_id where om.user_id=$1 order by o.display_name,om.created_at`,[user.id])).rows:null;
 return {account:{account_reference:user.account_reference,email:user.email,username:user.username,status:user.status,created_at:user.created_at,updated_at:user.updated_at,roles:user.roles},membership:{status:membershipStatus,records:memberships},organizations:{authorized:canViewOrganizations,items:organizations}};
}

export async function listRoles(actor){
 const actorRoles=await allowed(getPool(),actor); admin(actorRoles);
 const rows=(await getPool().query("select role_code,name,description from app_role order by name,role_code")).rows;
 return rows.map(row=>{
  const nonPlatform=NON_PLATFORM_ROLES[row.role_code];
  const privileged=PRIVILEGED_ROLES.has(row.role_code);
  return {...row,scope:nonPlatform?.scope||"platform",assignable:!nonPlatform&&(!privileged||actorRoles.includes(SYSTEM_ROLE)),privileged,assignmentNote:nonPlatform?.reason||null};
 });
}

export async function updateUser(actor,userId,input,requestId){
 const _db=getPool();
 const actorId=typeof actor==="string"?actor:actor?.sub;
 const actorPermissions=Array.isArray(actor?.permissions)?actor.permissions:[];
 return withTransaction(async tx=>{
  // Resolve authority from the current database state inside the same transaction as the mutation.
  const actorRoles=await allowed(tx,actorId); admin(actorRoles,actorPermissions,"users.manage");
  const u=(await tx.query("select id,status from app_user where id=$1 for update",[userId])).rows[0];
  if(!u)throw err(404,"User not found.","NOT_FOUND");
  const status=input.status, roleCode=input.roleCode, removeRoleCode=input.removeRoleCode;
  if(status!==undefined && !["active","suspended","disabled"].includes(status))throw err(400,"Invalid user status.","VALIDATION_ERROR");
  if(status && userId===actorId && status!=="active")throw err(400,"You cannot suspend or disable your own account.","SELF_LOCKOUT");
  if((roleCode!==undefined||removeRoleCode!==undefined)&&userId===actorId)throw err(403,"Administrators cannot change their own roles. Use a separately authorized administrator account.","SELF_ROLE_CHANGE");
  const reason=String(input.reason||"").trim().slice(0,500)||null;
  if((status!==undefined||roleCode!==undefined||removeRoleCode!==undefined)&&!reason)throw err(400,"An audit reason is required for account status and role changes.","AUDIT_REASON_REQUIRED");

  const currentRoles=await allowed(tx,userId);
  const requestedRoles=[roleCode,removeRoleCode].filter(v=>v!==undefined);
  for(const requested of requestedRoles){
   const rr=(await tx.query("select id from app_role where role_code=$1",[requested])).rows[0];
   if(!rr)throw err(400,"Unknown role.","INVALID_ROLE");
   if(PRIVILEGED_ROLES.has(requested)&&!actorRoles.includes(SYSTEM_ROLE))
    throw err(403,"Only a system administrator may grant or remove privileged roles.","PRIVILEGED_ROLE_CHANGE");
  }
  const targetIsPrivileged=currentRoles.some(r=>PRIVILEGED_ROLES.has(r));
  if(targetIsPrivileged&&!actorRoles.includes(SYSTEM_ROLE))
   throw err(403,"Only a system administrator may modify a privileged account.","PRIVILEGED_ACCOUNT_CHANGE");

  if(status)await tx.query("update app_user set status=$1,updated_at=now() where id=$2",[status,userId]);
  if(roleCode!==undefined){
   const rr=(await tx.query("select id from app_role where role_code=$1",[roleCode])).rows[0];
   if(roleCode===SYSTEM_ROLE){
    await tx.query("select pg_advisory_xact_lock(hashtext('system_admin_role_membership'))");
   }
   await tx.query("insert into app_user_role(user_id,role_id,assigned_by) values($1,$2,$3) on conflict do nothing",[userId,rr.id,actorId]);
  }
  if(removeRoleCode!==undefined){
   const rr=(await tx.query("select id from app_role where role_code=$1",[removeRoleCode])).rows[0];
   if(removeRoleCode===SYSTEM_ROLE){
    await tx.query("select pg_advisory_xact_lock(hashtext('system_admin_role_membership'))");
    const n=(await tx.query("select count(*)::int count from app_user_role ur join app_role r on r.id=ur.role_id where r.role_code=$1",[SYSTEM_ROLE])).rows[0].count;
    if(n<=1)throw err(400,"The last system administrator role cannot be removed.","LAST_ADMIN");
   }
   await tx.query("delete from app_user_role where user_id=$1 and role_id=$2",[userId,rr.id]);
  }
  // Any identity, status, or role change invalidates existing sessions, even when the role set is unchanged.
  if(roleCode!==undefined||removeRoleCode!==undefined||status!==undefined)
   await tx.query("update auth_session set revoked_at=now() where user_id=$1 and revoked_at is null",[userId]);
  const newRoles=await allowed(tx,userId);
  await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'admin.user.updated','app_user',$2,$3,'success',$4)",[
   actorId,userId,requestId,JSON.stringify({scope:"platform",previousStatus:u.status,currentStatus:status??u.status,status:status??null,previousRoles:currentRoles,currentRoles:newRoles,roleCode:roleCode??null,removeRoleCode:removeRoleCode??null,reason})
  ]);
  if(roleCode!==undefined||removeRoleCode!==undefined||status!==undefined)await createInAppNotification(tx,userId,"security.account_access_changed","security_event",userId,{category:"security",critical:true,priority:"high",message:"An MPA administrator changed your account status or access roles and active sessions were revoked.",nextAction:"Sign in again to refresh your access. If you did not expect this change, contact MPA Support.",actionUrl:"/profile",actionRequired:true,eventVersion:requestId});
  return {id:userId,status:status||u.status,roles:newRoles};
 });
}

export async function revokeSessions(actor,userId,requestId,reasonInput){
 const db=getPool(); const actorId=typeof actor==="string"?actor:actor?.sub; const actorPermissions=Array.isArray(actor?.permissions)?actor.permissions:[]; const actorRoles=await allowed(db,actorId); admin(actorRoles,actorPermissions,"users.manage");
 const reason=String(reasonInput||"").trim().slice(0,500);
 if(!reason)throw err(400,"An audit reason is required to revoke sessions.","AUDIT_REASON_REQUIRED");
 return withTransaction(async tx=>{
  const target=(await tx.query("select id from app_user where id=$1 for update",[userId])).rows[0];
  if(!target)throw err(404,"User not found.","NOT_FOUND");
  const targetRoles=await allowed(tx,userId);
  if(targetRoles.some(r=>PRIVILEGED_ROLES.has(r))&&!actorRoles.includes(SYSTEM_ROLE))throw err(403,"Only a system administrator may revoke sessions for a privileged account.","PRIVILEGED_ACCOUNT_CHANGE");
  const r=await tx.query("update auth_session set revoked_at=now() where user_id=$1 and revoked_at is null",[userId]);
  await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'admin.sessions.revoked','app_user',$2,$3,'success',$4)",[actorId,userId,requestId,JSON.stringify({count:r.rowCount,reason})]);
  if(r.rowCount)await createInAppNotification(tx,userId,"security.sessions_revoked","security_event",userId,{category:"security",critical:true,priority:"high",message:"Your active sessions were revoked by MPA account support.",nextAction:"Sign in again if this was expected. If you did not request this, contact MPA support.",actionUrl:"/profile",actionRequired:true});
  return {revoked:r.rowCount};
 });
}
export async function issueOneTimePassword(actor,userId,requestId,reasonInput){
 const db=getPool(); const actorId=typeof actor==="string"?actor:actor?.sub; const actorPermissions=Array.isArray(actor?.permissions)?actor.permissions:[]; const actorRoles=await allowed(db,actorId); admin(actorRoles,actorPermissions,"users.manage");
 const reason=String(reasonInput||"").trim().slice(0,500);
 if(!reason)throw err(400,"An audit reason is required to issue a one-time password.","AUDIT_REASON_REQUIRED");
 if(userId===actorId)throw err(400,"For your own account, use Account & Security or ask another authorized administrator.","SELF_RECOVERY_LINK");
 // The credential is returned only in this successful response; only its password hash is persisted.
 const oneTimePassword=`Mpa-${crypto.randomBytes(24).toString("base64url")}!9`;
 return withTransaction(async tx=>{
  const target=(await tx.query("select id,status from app_user where id=$1 for update",[userId])).rows[0];
  if(!target)throw err(404,"User not found.","NOT_FOUND");
  if(target.status!=="active")throw err(409,"Only active accounts can receive a one-time password.","ACCOUNT_NOT_ACTIVE");
  if(!target.email_verified_at)throw err(409,"This account must verify its sign-in email before a one-time password can be issued. Use the approved recovery-link workflow if appropriate.","EMAIL_VERIFICATION_REQUIRED");
  const targetRoles=await allowed(tx,userId);
  if(targetRoles.some(r=>PRIVILEGED_ROLES.has(r))&&!actorRoles.includes(SYSTEM_ROLE))throw err(403,"Only a system administrator may issue a one-time password for a privileged account.","PRIVILEGED_ACCOUNT_CHANGE");
  await tx.query("update app_user set password_hash=$1,credential_setup_required=true,credential_setup_expires_at=now()+interval '24 hours',updated_at=now() where id=$2",[hashPassword(oneTimePassword),userId]);
  const revoked=await tx.query("update auth_session set revoked_at=now() where user_id=$1 and revoked_at is null",[userId]);
  await tx.query("update one_time_session_link set revoked_at=now() where user_id=$1 and used_at is null and revoked_at is null",[userId]);
  await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'admin.password.one_time_issued','app_user',$2,$3,'success',$4)",[actorId,userId,requestId,JSON.stringify({reason,sessionsRevoked:revoked.rowCount,credentialSetupRequired:true,delivery:"authorized_admin_one_time_response"})]);
  await createInAppNotification(tx,userId,"security.admin_password_reset","security_event",userId,{category:"security",critical:true,priority:"urgent",message:"MPA account support issued a one-time password and revoked active sessions.",nextAction:"Use the credential only to sign in once, then set a new password before continuing. Contact support if this was unexpected.",actionUrl:"/profile",actionRequired:true});
  return {id:userId,sessionsRevoked:revoked.rowCount,credentialSetupRequired:true,oneTimePassword,warning:"Sensitive one-time credential. Copy or securely deliver it now; it cannot be retrieved again."};
 });
}
export async function resetPassword(actor,userId,_newPassword,requestId,reasonInput){
 // Backwards-compatible route: never accept an administrator-selected reusable password.
 return issueOneTimePassword(actor,userId,requestId,reasonInput);
}
