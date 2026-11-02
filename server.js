import "./src/platform/load-env.js";
import {randomUUID} from "node:crypto";
import http from "node:http";
import * as ethics from "./src/ethics/service.js";
import * as membershipAdminBulk from "./src/membership/admin-bulk.js";
import * as membershipCard from "./src/membership/card.js";
import { assertMembershipPaymentMethodAdmin } from "./src/membership/payment-method-policy.js";
import * as membership from "./src/membership/service.js";
import * as networkPlusBusiness from "./src/network-plus/business-discovery.js";
import * as networkPlusRequests from "./src/network-plus/request-collaboration.js";
import * as organizationJobs from "./src/organization-jobs/service.js";
import * as accountSecurity from "./src/platform/account-security.js";
import * as adminAudit from "./src/platform/admin-audit.js";
import * as applicationTracking from "./src/platform/application-tracking.js";
import {requireRole, verifyToken, withCurrentRoles} from "./src/platform/auth.js";
import * as communityCampaigns from "./src/platform/community-campaigns.js";
import * as communityImpactClaims from "./src/platform/community-impact-claims.js";
import * as communityImpactDetection from "./src/platform/community-impact-detection.js";
import * as communityImpactGovernance from "./src/platform/community-impact-governance.js";
import * as communityImpactRecognition from "./src/platform/community-impact-recognition.js";
import * as communityImpactRetention from "./src/platform/community-impact-retention.js";
import * as communityImpactScore from "./src/platform/community-impact-score.js";
import {loadConfig, resolveAllowedOrigin} from "./src/platform/config.js";
import {getPool} from "./src/platform/db.js";
import * as directoryExports from "./src/platform/directory-exports.js";
import * as emailOperations from "./src/platform/email-operations.js";
import {resendEmailVerification, verifyEmailToken} from "./src/platform/email-verification.js";
import * as experience from "./src/platform/experience.js";
import * as financeReceipts from "./src/platform/finance-receipts.js";
import {createLogger} from "./src/platform/logger.js";
import * as memberReferrals from "./src/platform/member-referrals.js";
import {resolveNetworkPlusAccess} from "./src/platform/network-plus-access.js";
import * as notifications from "./src/platform/notifications.js";
import {authorizePrivateUpload, confirmPrivateUpload, MAX_PRIVATE_UPLOAD_BYTES, readAuthorizedPrivateFile, receivePrivateUpload} from "./src/platform/private-file-storage.js";
import * as publicOpportunity from "./src/platform/public-opportunity.js";
import * as referencePortfolio from "./src/platform/reference-portfolio.js";
import * as reports from "./src/platform/reports.js";
import * as savedDiscoveryItems from "./src/platform/saved-discovery-items.js";
import {enforcePersistentRateLimit, issueHumanChallenge, verifyHumanChallenge} from "./src/platform/security-controls.js";
import * as serveCommunityImpactReports from "./src/platform/serve-community-impact-reports.js";
import * as serveCommunityInitiatives from "./src/platform/serve-community-initiatives.js";
import * as serveCommunityOfflineProjects from "./src/platform/serve-community-offline-projects.js";
import * as stakeholderOutcomes from "./src/platform/stakeholder-outcomes.js";
import * as supportBot from "./src/platform/support-bot.js";
import * as testLab from "./src/platform/test-lab.js";
import * as userAdmin from "./src/platform/user-admin.js";
import * as volunteerPledges from "./src/platform/volunteer-pledges.js";
import {disablePushForUser, getPushSubscriptionStatus, getWebPushPublicConfiguration, registerPushSubscription, removePushSubscription} from "./src/platform/web-push.js";
import {beginAdminPasskeyAuthentication, beginAdminPasskeyRegistration, finishAdminPasskeyAuthentication, finishAdminPasskeyRegistration, listAdminPasskeys, recoverAdminPasskey, revokeAdminPasskey} from "./src/platform/webauthn.js";
import {assertFinancePaymentQueueAccess,assertMembershipActivationAccess,assertMembershipReviewAccess,assertMembershipReviewQueueAccess,assertPaymentReversalAccess,assertPaymentVerificationAccess} from "./src/platform/workspace-authorization.js";
import * as marketplaceDemand from "./src/services-mentorship/demand.js";
import * as mentorshipOperations from "./src/services-mentorship/operations.js";
import * as organizationMentorshipOffers from "./src/services-mentorship/organization-offers.js";
import * as servicesMentorship from "./src/services-mentorship/service.js";
import * as serviceMentorshipSupportCases from "./src/services-mentorship/support-cases.js";
import * as talent from "./src/talent/service.js";
import * as verification from "./src/verification/service.js";

const config=loadConfig();
const logger=createLogger({level:config.logLevel});

function json(res,status,body,requestId){
  res.writeHead(status,{"content-type":"application/json; charset=utf-8","x-request-id":requestId,"cache-control":"no-store"});
  res.end(JSON.stringify(body));
}
function pathParts(url){ return new URL(url,"http://localhost").pathname.split("/").filter(Boolean); }
function query(url){ return new URL(url,"http://localhost").searchParams; }
async function rawBody(req,limit=MAX_PRIVATE_UPLOAD_BYTES){
  const chunks=[];let size=0;
  for await (const chunk of req) { size+=chunk.length; if(size>limit) throw Object.assign(new Error("Uploaded file is too large."),{statusCode:413,code:"PAYLOAD_TOO_LARGE"}); chunks.push(chunk); }
  return Buffer.concat(chunks,size);
}
async function body(req,limit=1024*1024){
  let raw="";
  for await (const chunk of req) {
    raw+=chunk;
    if(Buffer.byteLength(raw)>limit) throw Object.assign(new Error("Request body too large."),{statusCode:413,code:"PAYLOAD_TOO_LARGE"});
  }
  if(!raw) return {};
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error("Request body must be valid JSON."),{statusCode:400,code:"INVALID_JSON"}); }
}
function clientIp(req){ return String(req.headers["x-forwarded-for"]||req.socket.remoteAddress||"").split(",")[0].trim() || null; }
async function auth(req){
  if(!config.jwtSecret) throw Object.assign(new Error("Authentication secret is not configured."),{statusCode:503,code:"AUTH_NOT_CONFIGURED"});
  const header=req.headers.authorization||"";
  if(!header.startsWith("Bearer ")) throw Object.assign(new Error("Bearer authentication required."),{statusCode:401,code:"UNAUTHENTICATED"});
  try {
    const identity=verifyToken(header.slice(7),config.jwtSecret);
    if(!identity.sid) throw Object.assign(new Error("Session-bound authentication required."),{statusCode:401});
    const db=getPool();
    const r=await db.query(`select s.user_id,u.status,u.email_verified_at,s.credential_setup_required,s.auth_method,u.admin_passkey_enforced_at,
      coalesce(json_agg(distinct role.role_code) filter(where role.role_code is not null),'[]'::json) as roles
      from auth_session s join app_user u on u.id=s.user_id
      left join app_user_role ur on ur.user_id=u.id left join app_role role on role.id=ur.role_id
      where s.id=$1 and s.revoked_at is null and s.expires_at>now()
      group by s.id,u.id,u.status,s.credential_setup_required,s.auth_method,u.admin_passkey_enforced_at`,[identity.sid]);
    if(!r.rows[0]||r.rows[0].status!=="active"||r.rows[0].user_id!==identity.sub) throw Object.assign(new Error("Session expired or revoked."),{statusCode:401});
    if(!r.rows[0].email_verified_at) throw Object.assign(new Error("Verify your email before continuing."),{statusCode:403,code:"EMAIL_VERIFICATION_REQUIRED"});
    // Authorization must use current database roles, never stale role claims from a signed token.
    identity.roles=withCurrentRoles(identity,Array.isArray(r.rows[0].roles)?r.rows[0].roles:JSON.parse(r.rows[0].roles||"[]")).roles;
    identity.permissions=(await db.query("select permission_code from app_user_permission where user_id=$1",[identity.sub])).rows.map(row=>row.permission_code);
    const path=new URL(req.url,"http://localhost").pathname.replace(/^\/+/, "");
    const passkeySetupRoute=req.method==="POST"&&["api/v1/admin/passkeys/registration/options","api/v1/admin/passkeys/registration/verify"].includes(path);
    const logoutRoute=req.method==="POST"&&path==="api/v1/auth/logout";
    const isAdministrator=identity.roles.some(role=>["system_admin","admin"].includes(role));
    if(r.rows[0].auth_method==="recovery"&&!passkeySetupRoute&&!logoutRoute) throw Object.assign(new Error("Recovery sessions may only register a replacement passkey or sign out."),{statusCode:401,code:"UNAUTHENTICATED"});
    if(r.rows[0].admin_passkey_enforced_at&&isAdministrator&&r.rows[0].auth_method!=="passkey"&&!passkeySetupRoute&&!logoutRoute) throw Object.assign(new Error("Administrator passkey authentication is required."),{statusCode:401,code:"UNAUTHENTICATED"});
    identity.auth_method=r.rows[0].auth_method;
    identity.credential_setup_required=Boolean(r.rows[0].credential_setup_required);
    if(identity.credential_setup_required){
      const allowedRecoveryRoute=(req.method==="GET"&&path==="api/v1/me")||(req.method==="PATCH"&&path==="api/v1/me/account")||(req.method==="POST"&&path==="api/v1/auth/logout");
      if(!allowedRecoveryRoute)throw Object.assign(new Error("Please set a new password before continuing to the rest of your account."),{statusCode:403,code:"PASSWORD_RESET_REQUIRED"});
    }
    await db.query("update auth_session set last_seen_at=now() where id=$1",[identity.sid]);
    return identity;
  } catch(e){ throw Object.assign(new Error(e.message),{statusCode:e.statusCode===403?403:401,code:e.statusCode===403&&e.code?e.code:"UNAUTHENTICATED"}); }
}
function optionalIdentity(req){
  if(!req.headers.authorization?.startsWith("Bearer ")) return null;
  try { return verifyToken(req.headers.authorization.slice(7),config.jwtSecret); } catch { return null; }
}
const ROLE_PERMISSION={verification_reviewer:"verification.manage",appeal_reviewer:"verification.appeal.review",supporting_staff:"reviews.view",platform_admin:"users.manage",admin:"users.manage"};
function anyRole(identity,allowed){
  const roles=Array.isArray(identity.roles)?identity.roles:[];
  const permissions=Array.isArray(identity.permissions)?identity.permissions:[];
  if(!allowed.some(role=>roles.includes(role)||(ROLE_PERMISSION[role]&&permissions.includes(ROLE_PERMISSION[role])))) throw Object.assign(new Error("Forbidden."),{statusCode:403,code:"FORBIDDEN"});
  return identity;
}
function anyRoleOrPermission(identity,allowed,permissionCodes=[]){
  const roles=Array.isArray(identity.roles)?identity.roles:[];
  const permissions=Array.isArray(identity.permissions)?identity.permissions:[];
  if(!allowed.some(role=>roles.includes(role)||(ROLE_PERMISSION[role]&&permissions.includes(ROLE_PERMISSION[role])))&&!permissions.some(permission=>permissionCodes.includes(permission))) throw Object.assign(new Error("Forbidden."),{statusCode:403,code:"FORBIDDEN"});
  return identity;
}
function ok(res,data,requestId,status=200){ return json(res,status,{data},requestId); }
const rateBuckets=new Map();
function publicRateLimit(req,key,limit=30,windowMs=60000){ const now=Date.now(), k=`${key}:${clientIp(req)}`; const b=rateBuckets.get(k)||{start:now,count:0}; if(now-b.start>=windowMs){b.start=now;b.count=0} b.count++; rateBuckets.set(k,b); if(b.count>limit) throw Object.assign(new Error("Too many requests. Please try again later."),{statusCode:429,code:"RATE_LIMITED"}); }
async function bootstrapAdmin(){ if(!config.bootstrapAdminEmail&&!config.bootstrapAdminPassword){logger.info("bootstrap.admin.skipped",{reason:"environment_credentials_not_configured",checked:["BOOTSTRAP_SUPER_ADMIN_EMAIL","BOOTSTRAP_SUPER_ADMIN_PASSWORD","BOOTSTRAP_ADMIN_EMAIL","BOOTSTRAP_ADMIN_PASSWORD"]});return null;} if(!config.bootstrapAdminEmail||!config.bootstrapAdminPassword) throw Object.assign(new Error("Bootstrap credentials are only partially configured. Set both BOOTSTRAP_SUPER_ADMIN_EMAIL and BOOTSTRAP_SUPER_ADMIN_PASSWORD (or both BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD) in the repository-root .env or host environment."),{code:"BOOTSTRAP_ENV_INCOMPLETE"}); const m=await import("./src/membership/service.js"); const result=await m.bootstrapAdmin({email:config.bootstrapAdminEmail,password:config.bootstrapAdminPassword,name:config.bootstrapAdminName}); logger.info("bootstrap.admin.ready",{email:result.email,userId:result.userId}); return result; }

const server=http.createServer(async (req,res)=>{
  const requestId=req.headers["x-request-id"]||randomUUID();
  const allowOrigin = resolveAllowedOrigin(req.headers.origin, config.corsOrigin);
  if(req.method==="OPTIONS"){
    const headers={"access-control-allow-methods":"GET,POST,PUT,PATCH,DELETE,OPTIONS","access-control-allow-headers":"Authorization,Content-Type,X-Request-Id,X-Idempotency-Key,X-Upload-Token","access-control-max-age":"600"};
    if(allowOrigin) headers["access-control-allow-origin"]=allowOrigin;
    res.writeHead(204,headers);return res.end();
  }
  if(allowOrigin) res.setHeader("access-control-allow-origin",allowOrigin);
  res.setHeader("vary","Origin"); res.setHeader("x-content-type-options","nosniff"); res.setHeader("x-frame-options","DENY"); res.setHeader("referrer-policy","strict-origin-when-cross-origin"); res.setHeader("permissions-policy","camera=(),microphone=(),geolocation=()"); if(config.nodeEnv==="production") res.setHeader("strict-transport-security","max-age=31536000; includeSubDomains");
  res.on("finish",()=>logger.info("http.request",{requestId,method:req.method,path:req.url,status:res.statusCode}));
  try {
    if(req.method==="GET" && req.url==="/healthz") return ok(res,{status:"ok"},requestId);
    if(req.method==="GET" && req.url==="/readyz") return ok(res,{status:"ready",databaseConfigured:Boolean(config.databaseUrl)},requestId);
    const parts=pathParts(req.url);
    const p=parts.join("/");
    if(p==="api/v1/admin/test-lab" && req.method==="GET"){const identity=await auth(req);anyRole(identity,["system_admin"]);return ok(res,{configuration:testLab.testLabConfiguration(),portfolios:await testLab.listTestPortfolios(identity)},requestId);}
    if(p==="api/v1/admin/test-lab" && req.method==="POST"){const identity=await auth(req);anyRole(identity,["system_admin"]);if(testLab.testLabConfiguration().deliveryMode!=="capture")throw Object.assign(new Error("Set TEST_DELIVERY_MODE=capture before creating test portfolios. No outbound email, push or payment calls are permitted."),{statusCode:503,code:"TEST_DELIVERY_CAPTURE_REQUIRED"});return ok(res,await testLab.createTestPortfolio(identity,await body(req),requestId),requestId,201);}
    if(parts.length===6 && p.startsWith("api/v1/admin/test-lab/") && parts[5]==="credentials.xlsx" && req.method==="GET"){const identity=await auth(req);anyRole(identity,["system_admin"]);const file=await testLab.exportTestPortfolioAccounts(identity,parts[4]);res.writeHead(200,{"content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","content-disposition":'attachment; filename="'+file.filename+'"',"cache-control":"no-store, private, max-age=0","pragma":"no-cache","expires":"0","x-request-id":requestId});return res.end(file.buffer);}
    if(parts.length===6 && p.startsWith("api/v1/admin/test-lab/") && parts[5]==="reset-preview" && req.method==="GET"){const identity=await auth(req);anyRole(identity,["system_admin"]);return ok(res,await testLab.previewTestPortfolioReset(identity,parts[4]),requestId);}
    if(parts.length===6 && p.startsWith("api/v1/admin/test-lab/") && parts[5]==="operations" && req.method==="GET"){const identity=await auth(req);anyRole(identity,["system_admin"]);return ok(res,await testLab.getTestPortfolioOperations(identity,parts[4]),requestId);}
    if(parts.length===8 && p.startsWith("api/v1/admin/test-lab/") && parts[5]==="payments" && parts[7]==="simulate" && req.method==="POST"){const identity=await auth(req);anyRole(identity,["system_admin"]);return ok(res,await testLab.simulateTestPayment(identity,parts[4],parts[6],await body(req),requestId),requestId);}
    if(parts.length===5 && p.startsWith("api/v1/admin/test-lab/") && req.method==="DELETE"){const identity=await auth(req);anyRole(identity,["system_admin"]);return ok(res,await testLab.resetTestPortfolio(identity,parts[4],await body(req),requestId),requestId);}
    if(req.method==="POST" && p==="api/v1/public/community-campaigns/opt-in") { await enforcePersistentRateLimit(req,"community-campaign-opt-in",10,3600000); return ok(res,await communityCampaigns.createPublicCampaignOptIn(await body(req)),requestId,201); }
    if(req.method==="POST" && p==="api/v1/public/community-campaigns/manage") { await enforcePersistentRateLimit(req,"community-campaign-manage",20,3600000); const b=await body(req); return ok(res,await communityCampaigns.managePublicCampaignOptIn(b.manageToken,b.enabled===true),requestId); }
    if(req.method==="POST" && p==="api/v1/payments/chapa/webhook") { const raw=await rawBody(req,1024*1024); return ok(res,await membership.handleChapaMembershipWebhook(raw,String(req.headers["x-chapa-signature"]||""),requestId),requestId); }
     if(req.method==="GET" && p==="api/v1/public/membership-verification") { await enforcePersistentRateLimit(req,"membership-card-verify",60,60000); const q=query(req.url); return ok(res,await membershipCard.verifyMembershipCard(q.get("membershipNumber")||q.get("record"),q.get("token")),requestId); }
    if(req.method==="POST" && p==="api/v1/public/support-bot/message") { await enforcePersistentRateLimit(req,"public-support-bot",20,60000); const b=await body(req); let userId=null; if(req.headers.authorization?.startsWith("Bearer ")) { try { userId=(await auth(req)).sub; } catch {} } return ok(res,await supportBot.answerPublicQuestion(b,{visitorKey:b.visitorKey,pagePath:b.pagePath||"/",userId}),requestId,201); }
    if(req.method==="GET" && p==="api/v1/auth/human-challenge") { await enforcePersistentRateLimit(req,"human-challenge",20,60000); return ok(res,config.humanChallengeRequired?{required:true,...await issueHumanChallenge()}:{required:false},requestId); }
    if(req.method==="POST" && p==="api/v1/auth/human-challenge/verify") { const b=await body(req); await enforcePersistentRateLimit(req,"human-challenge-verify",10,60000); return ok(res,await verifyHumanChallenge(b.id,b.answer),requestId); }
    if(req.method==="POST" && p==="api/v1/auth/email-verification/resend") { const b=await body(req); await enforcePersistentRateLimit(req,"email-verification-resend",3,3600000,String(b.email||"").trim().toLowerCase()); return ok(res,await resendEmailVerification(b.email,requestId),requestId,202); }
    if(req.method==="POST" && p==="api/v1/auth/email-verification/verify") { const b=await body(req); await enforcePersistentRateLimit(req,"email-verification-verify",10,60000); return ok(res,await verifyEmailToken(b.token,requestId),requestId); }
    if(req.method==="POST" && p==="api/v1/auth/passkeys/options") { const b=await body(req); await enforcePersistentRateLimit(req,"passkey-options",10,60000,String(b.email||"").trim().toLowerCase()); return ok(res,await beginAdminPasskeyAuthentication(b.email),requestId); }
    if(req.method==="POST" && p==="api/v1/auth/passkeys/verify") { const b=await body(req); await enforcePersistentRateLimit(req,"passkey-verify",10,60000,String(b.email||"").trim().toLowerCase()); return ok(res,await finishAdminPasskeyAuthentication(b.email,b.credential||b.payload||b,{ip:clientIp(req),userAgent:req.headers["user-agent"]||null},requestId),requestId); }
    if(req.method==="POST" && p==="api/v1/auth/passkeys/recovery") { const b=await body(req); await enforcePersistentRateLimit(req,"passkey-recovery",5,3600000,String(b.email||"").trim().toLowerCase()); return ok(res,await recoverAdminPasskey(b.email,b.code,{ip:clientIp(req),userAgent:req.headers["user-agent"]||null},requestId),requestId); }
    if(req.method==="POST" && p==="api/v1/admin/passkeys/registration/options") { const identity=await auth(req); anyRole(identity,["system_admin","admin","platform_admin"]); return ok(res,await beginAdminPasskeyRegistration(identity),requestId); }
    if(req.method==="POST" && p==="api/v1/admin/passkeys/registration/verify") { const identity=await auth(req); anyRole(identity,["system_admin","admin","platform_admin"]); return ok(res,await finishAdminPasskeyRegistration(identity,await body(req),requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/passkeys") { const identity=await auth(req); anyRole(identity,["system_admin","admin","platform_admin"]); return ok(res,await listAdminPasskeys(identity.sub),requestId); }
    if(req.method==="DELETE" && parts.length===5 && p.startsWith("api/v1/admin/passkeys/")) { const identity=await auth(req); anyRole(identity,["system_admin","admin","platform_admin"]); return ok(res,await revokeAdminPasskey(identity.sub,parts[4],requestId),requestId); }
    if(req.method==="POST" && p==="api/v1/email/delivery-webhook") return ok(res,await emailOperations.receiveDeliveryWebhook(await body(req),String(req.headers["x-email-delivery-webhook-secret"]||"")),requestId,202);
    if(req.method==="POST" && p==="api/v1/email/inbound-webhook") {
      return ok(res,await emailOperations.receiveInboundEmail(await body(req),String(req.headers["x-email-webhook-secret"]||"")),requestId,201);
    }
    if(req.method==="GET" && p==="api/v1/admin/email/operations") { const identity=await auth(req); anyRole(identity,["system_admin"]); return ok(res,await emailOperations.getEmailOperations(identity.sub),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/email/messages") { const identity=await auth(req); anyRole(identity,["system_admin"]); return ok(res,await emailOperations.listEmailOutbox(identity.sub,{folder:query(req.url).get("folder")||"outbox",limit:query(req.url).get("limit")||100}),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/email/templates") { const identity=await auth(req); anyRole(identity,["system_admin"]); return ok(res,await emailOperations.listEmailTemplates(identity.sub),requestId); }
    if(req.method==="PUT" && parts.length===6 && p.startsWith("api/v1/admin/email/templates/")) { const identity=await auth(req); anyRole(identity,["system_admin"]); return ok(res,await emailOperations.saveEmailTemplate(identity.sub,parts[5],await body(req),requestId),requestId); }
    if(req.method==="POST" && p==="api/v1/admin/email/drafts") { const identity=await auth(req); anyRole(identity,["system_admin"]); return ok(res,await emailOperations.saveEmailDraft(identity.sub,await body(req)),requestId,201); }
    if(req.method==="POST" && parts.length===7 && p.startsWith("api/v1/admin/email/drafts/") && parts[6]==="queue") { const identity=await auth(req); anyRole(identity,["system_admin"]); return ok(res,await emailOperations.queueEmailDraft(identity.sub,parts[5],requestId),requestId,202); }
    if(req.method==="POST" && p==="api/v1/admin/email/test") { const identity=await auth(req); anyRole(identity,["system_admin"]); return ok(res,await emailOperations.sendTestEmail(identity.sub,requestId),requestId); }
    if(req.method==="POST" && p==="api/v1/admin/email/dispatch") { const identity=await auth(req); anyRole(identity,["system_admin"]); const b=await body(req); return ok(res,await emailOperations.dispatchEmailOutbox(identity.sub,{limit:b.limit||20}),requestId); }
    if(req.method==="POST" && parts.length===7 && p.startsWith("api/v1/admin/email/messages/") && parts[6]==="retry") { const identity=await auth(req); anyRole(identity,["system_admin"]); return ok(res,await emailOperations.retryFailedEmail(identity.sub,parts[5]),requestId); }
    if(req.method==="POST" && parts.length===7 && p.startsWith("api/v1/admin/email/verification-failures/") && parts[6]==="retry") { const identity=await auth(req); anyRole(identity,["system_admin"]); return ok(res,await emailOperations.retryVerificationEmail(identity.sub,parts[5],requestId),requestId); }
    if(req.method==="PATCH" && parts.length===6 && p.startsWith("api/v1/admin/email/inbox/")) { const identity=await auth(req); anyRole(identity,["system_admin"]); return ok(res,await emailOperations.updateInbox(identity.sub,parts[5],(await body(req)).action),requestId); }
    if(req.method==="POST" && p==="api/v1/public/opportunity-inquiries") { await enforcePersistentRateLimit(req,"public-inquiry",10,60000); publicRateLimit(req,"public-inquiry",10,60000); return ok(res,await publicOpportunity.createPublicInquiry(await body(req),requestId,optionalIdentity(req),req.headers["x-idempotency-key"]),requestId,201); }
    if(req.method==="GET" && p==="api/v1/public/opportunity-sharing-organizations") { await enforcePersistentRateLimit(req,"sharing-audience",10,60000); publicRateLimit(req,"sharing-audience",10,60000); const searchTerm=query(req.url).get("q")||""; return ok(res,await publicOpportunity.searchPublicSharingOrganizations(searchTerm),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/public/opportunity-inquiries/") && parts[5]==="access") { await enforcePersistentRateLimit(req,"job-seeker-access",10,60000); publicRateLimit(req,"job-seeker-access",10,60000); const b=await body(req); return ok(res,await publicOpportunity.getPublicInquiry(parts[4],b.token||""),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/public/opportunity-inquiries/") && parts[5]==="sharing-history") { await enforcePersistentRateLimit(req,"job-seeker-sharing-history",10,60000,parts[4]); const b=await body(req); return ok(res,await publicOpportunity.getSharingHistory(parts[4],b.token||""),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/public/opportunity-inquiries/") && parts[5]==="sharing-consent") { await enforcePersistentRateLimit(req,"job-seeker-consent",10,60000); publicRateLimit(req,"job-seeker-consent",10,60000); const b=await body(req); return ok(res,await publicOpportunity.updateSharingConsent(parts[4],b.token||"",b,requestId),requestId); }
    if(req.method==="GET" && parts.length===6 && p.startsWith("api/v1/public/opportunity-inquiries/") && parts[5]==="details") { await enforcePersistentRateLimit(req,"public-inquiry-details",10,60000,parts[4]); const q=query(req.url); return ok(res,await publicOpportunity.getPublicInquiry(parts[4],q.get("token")||""),requestId); }
    if(req.method==="PATCH" && parts.length===6 && p.startsWith("api/v1/public/opportunity-inquiries/") && parts[5]==="details") { await enforcePersistentRateLimit(req,"public-inquiry-details-update",10,60000,parts[4]); const b=await body(req); return ok(res,await publicOpportunity.updatePublicInquiryDetails(parts[4],b.token||"",b,requestId),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/public/opportunity-inquiries/") && parts[5]==="link") { await enforcePersistentRateLimit(req,"public-inquiry-link",10,60000,parts[4]); const identity=await auth(req); const b=await body(req); return ok(res,await publicOpportunity.linkInquiryToAccount(parts[4],b.token||"",identity.sub,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/jobs") { const q=query(req.url); const v=optionalIdentity(req); return ok(res,await organizationJobs.listJobs({visibility:q.get("visibility"),postingScope:q.get("postingScope"),q:q.get("q"),employmentType:q.get("employmentType"),workMode:q.get("workMode"),seniority:q.get("seniority"),department:q.get("department"),location:q.get("location"),industryReferenceItemId:q.get("industryReferenceItemId"),occupationReferenceItemId:q.get("occupationReferenceItemId"),limit:q.get("limit"),offset:q.get("offset")},v?.sub||null),requestId); }
    if(req.method==="GET" && parts.length===4 && p.startsWith("api/v1/jobs/")) { const v=optionalIdentity(req); return ok(res,await organizationJobs.getJob(parts[3],v?.sub||null),requestId); }
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="applications") { const identity=await auth(req); return ok(res,await organizationJobs.listJobApplications(parts[3],identity.sub),requestId); }

    if(req.method==="GET" && parts.length===5 && parts[0]==="api" && parts[1]==="v1" && parts[2]==="public" && parts[3]==="finance-vouchers") { const q=query(req.url); return ok(res,await financeReceipts.verifyFinancePaymentVoucher(parts[4],q.get("token")||""),requestId); }

    if(req.method==="GET" && p==="api/v1/me/community-impact/detected") { const identity=await auth(req); return ok(res,await communityImpactDetection.listMyDetectedContributions(identity.sub,{limit:query(req.url).get("limit")}),requestId); }
    if(req.method==="POST" && parts.length===7 && parts[6]==="confirm" && p.startsWith("api/v1/me/community-impact/detected/")) { const identity=await auth(req); return ok(res,await communityImpactDetection.confirmMyDetectedAttribution(parts[5],identity.sub,requestId),requestId); }
    if(req.method==="POST" && parts.length===7 && parts[6]==="dispute" && p.startsWith("api/v1/me/community-impact/detected/")) { const identity=await auth(req); const b=await body(req); return ok(res,await communityImpactDetection.disputeMyDetectedAttribution(parts[5],identity.sub,b.reason,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/community-impact/detection/candidates") { const identity=await auth(req); return ok(res,await communityImpactDetection.listDetectionCandidates(identity.sub,{limit:query(req.url).get("limit"),offset:query(req.url).get("offset")}),requestId); }
    if(req.method==="GET" && p==="api/v1/me/community-impact/score/policy") { const identity=await auth(req); return ok(res,await communityImpactScore.getActiveScorePolicy(),requestId); }
    if(req.method==="GET" && p==="api/v1/me/community-impact/score") { const identity=await auth(req); return ok(res,await communityImpactScore.getMyScore(identity.sub),requestId); }
    if(req.method==="GET" && p==="api/v1/me/community-impact/workspace") { const identity=await auth(req); return ok(res,await communityImpactScore.getMyImpactWorkspace(identity.sub),requestId); }
    if(req.method==="GET" && p==="api/v1/me/community-impact/recognition") { const identity=await auth(req); return ok(res,await communityImpactRecognition.listMyRecognition(identity.sub),requestId); }
    if(req.method==="GET" && p==="api/v1/community-impact/recognition/programs") { return ok(res,await communityImpactRecognition.listRecognitionPrograms(),requestId); }
    if(req.method==="POST" && p==="api/v1/me/community-impact/recognition/nominations") { const identity=await auth(req); return ok(res,await communityImpactRecognition.submitRecognitionNomination(identity.sub,await body(req)),requestId,201); }
    if(req.method==="POST" && parts.length===8 && parts.slice(0,6).join("/") === "api/v1/me/community-impact/recognition/awards" && parts[7]==="public-consent") { const identity=await auth(req); const input=await body(req); return ok(res,await communityImpactRecognition.setAwardPublicConsent(identity.sub,parts[6],input.enabled===true),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/community-impact/recognition/programs") { const identity=await auth(req); return ok(res,await communityImpactRecognition.listRecognitionAdminPrograms(identity.sub),requestId); }
    if(req.method==="POST" && p==="api/v1/admin/community-impact/recognition/programs") { const identity=await auth(req); return ok(res,await communityImpactRecognition.saveRecognitionProgram(identity.sub,await body(req)),requestId,201); }
    if(req.method==="GET" && p==="api/v1/admin/community-impact/recognition/queue") { const identity=await auth(req); return ok(res,await communityImpactRecognition.listRecognitionQueue(identity.sub),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/community-impact/recognition/summary") { const identity=await auth(req); return ok(res,await communityImpactRecognition.getRecognitionAdminSummary(identity.sub),requestId); }
    if(req.method==="POST" && parts.length===8 && parts.slice(0,6).join("/") === "api/v1/admin/community-impact/recognition/nominations" && parts[7]==="assign") { const identity=await auth(req); const input=await body(req); return ok(res,await communityImpactRecognition.assignRecognitionNomination(identity.sub,parts[6],input.reviewerUserId,input.rationale),requestId); }
    if(req.method==="POST" && parts.length===8 && parts.slice(0,6).join("/") === "api/v1/admin/community-impact/recognition/nominations" && parts[7]==="decision") { const identity=await auth(req); return ok(res,await communityImpactRecognition.decideRecognitionNomination(identity.sub,parts[6],await body(req)),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/community-impact/score/policies") { const identity=await auth(req); return ok(res,await communityImpactScore.listScorePolicies(identity.sub),requestId); }
    if(req.method==="POST" && p==="api/v1/admin/community-impact/score/policies") { const identity=await auth(req); return ok(res,await communityImpactScore.proposeScorePolicy(identity.sub,await body(req)),requestId,201); }
    if(req.method==="POST" && parts.length===8 && parts.slice(0,6).join("/") === "api/v1/admin/community-impact/score/policies" && parts[7]==="approve") { const identity=await auth(req); return ok(res,await communityImpactScore.approveScorePolicy(identity.sub,parts[6],await body(req)),requestId); }
    if(req.method==="POST" && parts.length===8 && parts.slice(0,6).join("/") === "api/v1/admin/community-impact/score/policies" && parts[7]==="activate") { const identity=await auth(req); const input=await body(req); return ok(res,await communityImpactScore.activateScorePolicy(identity.sub,parts[6],input.rationale),requestId); }
    if(req.method==="POST" && parts.length===8 && parts.slice(0,6).join("/") === "api/v1/admin/community-impact/score/claims" && parts[7]==="source-link") { const identity=await auth(req); return ok(res,await communityImpactScore.linkVerifiedSource(identity.sub,parts[6],await body(req)),requestId,201); }
    if(req.method==="POST" && parts.length===8 && parts.slice(0,6).join("/") === "api/v1/admin/community-impact/score/claims" && parts[7]==="calculate") { const identity=await auth(req); const input=await body(req); return ok(res,await communityImpactScore.scoreVerifiedClaim(identity.sub,parts[6],input.rationale),requestId,201); }
    if(req.method==="POST" && parts.length===8 && parts.slice(0,6).join("/") === "api/v1/admin/community-impact/score/claims" && parts[7]==="recalculate") { const identity=await auth(req); return ok(res,await communityImpactScore.recalculateVerifiedClaim(identity.sub,parts[6],await body(req)),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/community-impact/score/recalculations") { const identity=await auth(req); return ok(res,await communityImpactScore.listScoreRecalculations(identity.sub),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/community-impact/score/ledger") { const identity=await auth(req); return ok(res,await communityImpactScore.listScoreLedger(identity.sub,{userId:query(req.url).get("userId"),sourceType:query(req.url).get("sourceType")}),requestId); }
    if(req.method==="POST" && parts.length===8 && parts.slice(0,6).join("/") === "api/v1/admin/community-impact/score/ledger" && parts[7]==="reverse") { const identity=await auth(req); return ok(res,await communityImpactScore.reverseScoreEntry(identity.sub,parts[6],await body(req)),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/community-impact/identity-assurance") { const identity=await auth(req); return ok(res,await communityImpactGovernance.listIdentityAssuranceQueue(identity.sub),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/community-impact/offline-attributions") { const identity=await auth(req); return ok(res,await communityImpactGovernance.listOfflineAttributions(identity.sub),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/community-impact/detection/policies") { const identity=await auth(req); return ok(res,await communityImpactGovernance.listDetectionPolicies(identity.sub),requestId); }
    if(req.method==="POST" && p==="api/v1/admin/community-impact/detection/scan") { const identity=await auth(req); return ok(res,await communityImpactDetection.scanDetectionSources(identity.sub,requestId,{limit:(await body(req)).limit}),requestId); }
    if(req.method==="GET" && p==="api/v1/me/community-impact/claims") { const identity=await auth(req); return ok(res,await communityImpactClaims.listMyClaims(identity.sub),requestId); }
    if(req.method==="POST" && p==="api/v1/me/community-impact/claims") { const identity=await auth(req); return ok(res,await communityImpactClaims.createClaim(identity.sub,await body(req),requestId,String(req.headers["x-idempotency-key"]||"")),requestId,201); }
    if(req.method==="GET" && parts.length===6 && parts.slice(0,5).join("/") === "api/v1/me/community-impact/claims") { const identity=await auth(req); return ok(res,await communityImpactClaims.getMyClaim(identity.sub,parts[5]),requestId); }
    if(req.method==="PATCH" && parts.length===6 && parts.slice(0,5).join("/") === "api/v1/me/community-impact/claims") { const identity=await auth(req); return ok(res,await communityImpactClaims.updateMyClaim(identity.sub,parts[5],await body(req),requestId),requestId); }
    if(req.method==="POST" && parts.length===8 && parts.slice(0,5).join("/") === "api/v1/me/community-impact/claims" && parts[6]==="evidence" && parts[7]==="link") { const identity=await auth(req); return ok(res,await communityImpactClaims.attachClaimEvidenceUrl(identity.sub,parts[5],await body(req),requestId),requestId,201); }
    if(req.method==="POST" && parts.length===7 && parts.slice(0,5).join("/") === "api/v1/me/community-impact/claims" && parts[6]==="evidence") { const identity=await auth(req); return ok(res,await communityImpactClaims.attachClaimEvidence(identity.sub,parts[5],await body(req),requestId),requestId,201); }
    if(req.method==="POST" && parts.length===9 && parts.slice(0,5).join("/") === "api/v1/me/community-impact/claims" && parts[6]==="evidence" && parts[8]==="remove") { const identity=await auth(req); return ok(res,await communityImpactClaims.removeClaimEvidence(identity.sub,parts[5],parts[7],(await body(req)).reason,requestId),requestId); }
    if(req.method==="POST" && parts.length===7 && parts.slice(0,5).join("/") === "api/v1/me/community-impact/claims" && parts[6]==="submit") { const identity=await auth(req); return ok(res,await communityImpactClaims.submitMyClaim(identity.sub,parts[5],requestId),requestId); }
    if(req.method==="POST" && parts.length===7 && parts.slice(0,5).join("/") === "api/v1/me/community-impact/claims" && parts[6]==="withdraw") { const identity=await auth(req); return ok(res,await communityImpactClaims.withdrawMyClaim(identity.sub,parts[5],(await body(req)).reason,requestId),requestId); }
    if(req.method==="POST" && parts.length===7 && parts.slice(0,5).join("/") === "api/v1/me/community-impact/claims" && parts[6]==="clarification-response") { const identity=await auth(req); return ok(res,await communityImpactClaims.respondToClarification(identity.sub,parts[5],(await body(req)).response,requestId),requestId); }
    if(req.method==="POST" && parts.length===7 && parts.slice(0,5).join("/") === "api/v1/me/community-impact/claims" && parts[6]==="appeals") { const identity=await auth(req); return ok(res,await communityImpactClaims.submitClaimAppeal(identity.sub,parts[5],await body(req),requestId),requestId,201); }
    if(req.method==="GET" && p==="api/v1/admin/community-impact/claim-reviewers") { const identity=await auth(req); return ok(res,await communityImpactClaims.listClaimReviewers(identity.sub),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/community-impact/claims") { const identity=await auth(req); const q=query(req.url); return ok(res,await communityImpactClaims.listReviewQueue(identity.sub,{status:q.get("status"),limit:q.get("limit")}),requestId); }
    if(req.method==="POST" && parts.length===7 && parts.slice(0,5).join("/") === "api/v1/admin/community-impact/claims" && parts[6]==="assign") { const identity=await auth(req); const b=await body(req); return ok(res,await communityImpactClaims.assignClaim(identity.sub,parts[5],b.reviewerUserId,b.reason,requestId),requestId); }
    if(req.method==="POST" && parts.length===7 && parts.slice(0,5).join("/") === "api/v1/admin/community-impact/claims" && parts[6]==="decision") { const identity=await auth(req); return ok(res,await communityImpactClaims.decideClaim(identity.sub,parts[5],await body(req),requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/community-impact/claim-appeals") { const identity=await auth(req); return ok(res,await communityImpactClaims.listClaimAppeals(identity.sub),requestId); }
    if(req.method==="POST" && parts.length===7 && parts.slice(0,5).join("/") === "api/v1/admin/community-impact/claim-appeals" && parts[6]==="assign") { const identity=await auth(req); const b=await body(req); return ok(res,await communityImpactClaims.assignClaimAppeal(identity.sub,parts[5],b.reviewerUserId,b.reason,requestId),requestId); }
    if(req.method==="POST" && parts.length===7 && parts.slice(0,5).join("/") === "api/v1/admin/community-impact/claim-appeals" && parts[6]==="decision") { const identity=await auth(req); return ok(res,await communityImpactClaims.decideClaimAppeal(identity.sub,parts[5],await body(req),requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/me/community-impact/identity-assurance") { const identity=await auth(req); return ok(res,await communityImpactGovernance.getMyIdentityAssurance(identity.sub),requestId); }
    if(req.method==="POST" && p==="api/v1/me/community-impact/identity-assurance") { const identity=await auth(req); return ok(res,await communityImpactGovernance.submitIdentityAssurance(identity.sub,await body(req),requestId),requestId,201); }
    if(req.method==="POST" && parts.length===7 && parts.slice(0,5).join("/") === "api/v1/me/community-impact/identity-assurance" && parts[6]==="submit") { const identity=await auth(req); return ok(res,await communityImpactGovernance.submitIdentityAssuranceCase(identity.sub,parts[5],requestId),requestId); }
    if(req.method==="POST" && parts.length===7 && parts.slice(0,5).join("/") === "api/v1/me/community-impact/identity-assurance" && parts[6]==="evidence") { const identity=await auth(req); return ok(res,await communityImpactGovernance.attachIdentityEvidence(identity.sub,parts[5],await body(req),requestId),requestId,201); }
    if(req.method==="POST" && parts.length===7 && parts.slice(0,5).join("/") === "api/v1/admin/community-impact/identity-assurance" && parts[6]==="decision") { const identity=await auth(req); return ok(res,await communityImpactGovernance.decideIdentityAssurance(identity.sub,parts[5],await body(req),requestId),requestId); }
    if(req.method==="POST" && p==="api/v1/admin/community-impact/detection/policies") { const identity=await auth(req); return ok(res,await communityImpactGovernance.proposeDetectionPolicy(identity.sub,await body(req),requestId),requestId,201); }
    if(req.method==="POST" && parts.length===8 && parts.slice(0,6).join("/") === "api/v1/admin/community-impact/detection/policies" && parts[7]==="approve") { const identity=await auth(req); return ok(res,await communityImpactGovernance.approveDetectionPolicy(identity.sub,parts[6],await body(req),requestId),requestId); }
    if(req.method==="POST" && parts.length===8 && parts.slice(0,5).join("/") === "api/v1/admin/community-impact/detection/policies" && parts[7]==="activate") { const identity=await auth(req); return ok(res,await communityImpactGovernance.activateDetectionPolicy(identity.sub,parts[6],(await body(req)).rationale,requestId),requestId); }
    if(req.method==="POST" && parts.length===8 && parts.slice(0,6).join("/") === "api/v1/admin/community-impact/detection/candidates" && parts[7]==="offline-attributions") { const identity=await auth(req); return ok(res,await communityImpactGovernance.proposeOfflineAttribution(identity.sub,parts[6],await body(req),requestId),requestId,201); }
    if(req.method==="POST" && parts.length===7 && parts.slice(0,5).join("/") === "api/v1/me/community-impact/offline-attributions" && parts[6]==="confirm") { const identity=await auth(req); return ok(res,await communityImpactGovernance.confirmOfflineAttribution(identity.sub,parts[5],await body(req),requestId),requestId); }
    if(req.method==="POST" && parts.length===7 && parts.slice(0,5).join("/") === "api/v1/admin/community-impact/offline-attributions" && parts[6]==="assign") { const identity=await auth(req); const b=await body(req); return ok(res,await communityImpactGovernance.assignOfflineAttribution(identity.sub,parts[5],b.reviewerUserId,b.rationale,requestId),requestId); }
    if(req.method==="POST" && parts.length===7 && parts.slice(0,5).join("/") === "api/v1/admin/community-impact/offline-attributions" && parts[6]==="decision") { const identity=await auth(req); return ok(res,await communityImpactGovernance.decideOfflineAttribution(identity.sub,parts[5],await body(req),requestId),requestId); }
    if(req.method==="POST" && parts.length===7 && parts.slice(0,5).join("/") === "api/v1/admin/community-impact/claims" && parts[6]==="reconcile") { const identity=await auth(req); const b=await body(req); return ok(res,await communityImpactGovernance.reconcileClaimCandidate(identity.sub,parts[5],b.candidateId,b.rationale,requestId),requestId); }
    if(req.method==="POST" && parts.length===7 && parts.slice(0,5).join("/") === "api/v1/admin/community-impact/claims" && parts[6]==="conflicts") { const identity=await auth(req); return ok(res,await communityImpactGovernance.declareReviewerConflict(identity.sub,parts[5],await body(req),requestId),requestId,201); }
    if(req.method==="POST" && parts.length===7 && parts.slice(0,5).join("/") === "api/v1/admin/community-impact/claims" && parts[6]==="assessment") { const identity=await auth(req); return ok(res,await communityImpactGovernance.proposeContributionAssessment(identity.sub,parts[5],await body(req),requestId),requestId,201); }
    if(req.method==="GET" && p==="api/v1/admin/community-impact/assessments") { const identity=await auth(req); return ok(res,await communityImpactGovernance.listPendingContributionAssessments(identity.sub),requestId); }
    if(req.method==="POST" && parts.length===7 && parts.slice(0,5).join("/") === "api/v1/admin/community-impact/assessments" && parts[6]==="second-review") { const identity=await auth(req); return ok(res,await communityImpactGovernance.secondReviewAssessment(identity.sub,parts[5],await body(req),requestId),requestId); }
    if(req.method==="POST" && p==="api/v1/admin/community-impact/retention/evaluate") { const identity=await auth(req); return ok(res,await communityImpactGovernance.evaluateRetention(identity.sub,await body(req)),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/community-impact/retention-policy") { const identity=await auth(req); return ok(res,await communityImpactRetention.getRetentionPolicyGovernance(identity.sub),requestId); }
    if(req.method==="POST" && p==="api/v1/admin/community-impact/retention-policy") { const identity=await auth(req); return ok(res,await communityImpactRetention.proposeRetentionPolicy(identity.sub,await body(req),requestId),requestId,201); }
    if(req.method==="POST" && parts.length===7 && parts[6]==="approve" && p.startsWith("api/v1/admin/community-impact/retention-policy/")) { const identity=await auth(req); return ok(res,await communityImpactRetention.approveRetentionPolicy(identity.sub,parts[5],await body(req),requestId),requestId); }
    if(req.method==="POST" && parts.length===7 && parts[6]==="activate" && p.startsWith("api/v1/admin/community-impact/retention-policy/")) { const identity=await auth(req); return ok(res,await communityImpactRetention.activateRetentionPolicy(identity.sub,parts[5],(await body(req)).reason,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/public/serve-community/completed-projects") { await enforcePersistentRateLimit(req,"serve-community-completed-portfolio",30,60000); publicRateLimit(req,"serve-community-completed-portfolio",30,60000); const platform=await serveCommunityInitiatives.listPublicCompletedProjects(); const offline=await serveCommunityOfflineProjects.listPublicOfflineProjects(); return ok(res,{...platform,items:[...platform.items,...offline].sort((a,b)=>new Date(b.completedAt)-new Date(a.completedAt)).slice(0,12),measurementNote:platform.measurementNote+" Offline projects are staff-entered records; beneficiary and outcome figures appear only when supplied with methodology/evidence and independently approved. Offline records are not platform participation records."},requestId); }
    if(req.method==="GET" && p==="api/v1/admin/serve-community/offline-projects") { const identity=await auth(req); return ok(res,await serveCommunityOfflineProjects.listStaffProjects(identity.sub,{limit:query(req.url).get("limit"),offset:query(req.url).get("offset")}),requestId); }
    if(req.method==="POST" && p==="api/v1/admin/serve-community/offline-projects") { const identity=await auth(req); return ok(res,await serveCommunityOfflineProjects.createStaffProject(identity.sub,await body(req),requestId),requestId,201); }
    if(req.method==="PATCH" && parts.length===7 && parts[6]==="submit" && p.startsWith("api/v1/admin/serve-community/offline-projects/")) { const identity=await auth(req); return ok(res,await serveCommunityOfflineProjects.submitStaffProject(parts[5],identity.sub,requestId),requestId); }
    if(req.method==="PATCH" && parts.length===6 && p.startsWith("api/v1/admin/serve-community/offline-projects/")) { const identity=await auth(req); return ok(res,await serveCommunityOfflineProjects.updateStaffProject(parts[5],identity.sub,await body(req),requestId),requestId); }
    if(req.method==="PATCH" && parts.length===7 && parts[6]==="review" && p.startsWith("api/v1/admin/serve-community/offline-projects/")) { const identity=await auth(req); return ok(res,await serveCommunityOfflineProjects.reviewStaffProject(parts[5],identity.sub,await body(req),requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/serve-community/initiatives") { await enforcePersistentRateLimit(req,"serve-community-discovery",60,60000); publicRateLimit(req,"serve-community-discovery",60,60000); const q=query(req.url); return ok(res,await serveCommunityInitiatives.listPublicInitiatives({q:q.get("q"),category:q.get("category"),location:q.get("location"),deliveryMode:q.get("deliveryMode"),limit:q.get("limit"),offset:q.get("offset")}),requestId); }
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/serve-community/initiatives/")) { await enforcePersistentRateLimit(req,"serve-community-detail",60,60000); return ok(res,await serveCommunityInitiatives.getPublicInitiative(parts[4]),requestId); }
    if(req.method==="POST" && p==="api/v1/serve-community/initiatives") { const identity=await auth(req); return ok(res,await serveCommunityInitiatives.createInitiative(identity.sub,await body(req),requestId,req.headers["x-idempotency-key"]),requestId,201); }
    if(req.method==="PATCH" && parts.length===5 && p.startsWith("api/v1/serve-community/initiatives/")) { const identity=await auth(req); return ok(res,await serveCommunityInitiatives.updateInitiative(parts[4],identity.sub,await body(req),requestId),requestId); }
    if(req.method==="POST" && parts.length===6 && parts[5]==="submit" && p.startsWith("api/v1/serve-community/initiatives/")) { const identity=await auth(req); return ok(res,await serveCommunityInitiatives.submitInitiative(parts[4],identity.sub,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/me/serve-community/initiatives") { const identity=await auth(req); return ok(res,await serveCommunityInitiatives.listMyInitiatives(identity.sub),requestId); }
    if(req.method==="GET" && p==="api/v1/me/serve-community/participations") { const identity=await auth(req); return ok(res,await serveCommunityInitiatives.listMyParticipations(identity.sub),requestId); }
    if(req.method==="POST" && parts.length===6 && parts[5]==="participations" && p.startsWith("api/v1/serve-community/initiatives/")) { const identity=await auth(req); return ok(res,await serveCommunityInitiatives.applyToInitiative(parts[4],identity.sub,await body(req),requestId,req.headers["x-idempotency-key"]),requestId,201); }
    if(req.method==="GET" && parts.length===6 && parts[5]==="participations" && p.startsWith("api/v1/serve-community/initiatives/")) { const identity=await auth(req); return ok(res,await serveCommunityInitiatives.listInitiativeParticipations(parts[4],identity.sub),requestId); }
    if(req.method==="POST" && parts.length===7 && parts[6]==="withdraw" && p.startsWith("api/v1/me/serve-community/participations/")) { const identity=await auth(req); return ok(res,await serveCommunityInitiatives.withdrawParticipation(parts[5],identity.sub,(await body(req)).reason,requestId),requestId); }
    if(req.method==="PATCH" && parts.length===6 && parts[5]==="decision" && p.startsWith("api/v1/serve-community/participations/")) { const identity=await auth(req); return ok(res,await serveCommunityInitiatives.decideParticipation(parts[4],identity.sub,await body(req),requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/serve-community/initiatives") { const identity=await auth(req); return ok(res,await serveCommunityInitiatives.listReviewQueue(identity.sub,{limit:query(req.url).get("limit"),offset:query(req.url).get("offset")}),requestId); }
    if(req.method==="PATCH" && parts.length===7 && parts[6]==="review" && p.startsWith("api/v1/admin/serve-community/initiatives/")) { const identity=await auth(req); return ok(res,await serveCommunityInitiatives.reviewInitiative(parts[5],identity.sub,await body(req),requestId),requestId); }
    if(req.method==="POST" && p==="api/v1/serve-community/legacy-classifications") { const identity=await auth(req),b=await body(req); return ok(res,await serveCommunityInitiatives.proposeLegacyClassification(identity.sub,b.serviceListingId,b.initiativeId,b.reason,requestId),requestId,201); }
    if(req.method==="GET" && p==="api/v1/admin/serve-community/legacy-classifications") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin","serve_community_reviewer"],["serve_community.legacy.classify"]); const q=query(req.url); const rows=await getPool().query("select c.id,c.service_listing_id,c.initiative_id,c.status,c.reason,c.proposed_by,c.created_at,i.title initiative_title,s.title legacy_service_title from serve_community_legacy_classification c join serve_community_initiative i on i.id=c.initiative_id join service_listing s on s.id=c.service_listing_id where c.status=any($1::text[]) order by c.created_at limit $2 offset $3",[[q.get("status")||"proposed"],Math.min(Math.max(Number(q.get("limit"))||20,1),50),Math.max(Number(q.get("offset"))||0,0)]); return ok(res,{items:rows.rows},requestId); }
    if(req.method==="PATCH" && parts.length===7 && parts[6]==="review" && p.startsWith("api/v1/admin/serve-community/legacy-classifications/")) { const identity=await auth(req); return ok(res,await serveCommunityInitiatives.reviewLegacyClassification(parts[5],identity.sub,await body(req),requestId),requestId); }

    if(req.method==="GET" && p==="api/v1/service-announcements") { const q=query(req.url); const viewer=optionalIdentity(req); return ok(res,await servicesMentorship.listPublicServiceAnnouncements(viewer?.sub||null,{limit:q.get("limit")}),requestId); }
    if(req.method==="GET" && p==="api/v1/services") { const q=query(req.url); const viewer=req.headers.authorization?.startsWith("Bearer ")?await auth(req):null; return ok(res,await servicesMentorship.listServices(viewer?.sub||null,{category:q.get("category"),q:q.get("q"),limit:q.get("limit"),offset:q.get("offset")}),requestId); }

    if(req.method==="GET" && parts.length===5 && parts[0]==="api" && parts[1]==="v1" && parts[4]==="stories" && (parts[2]==="services"||parts[2]==="mentors")) { const viewer=optionalIdentity(req); return ok(res,await servicesMentorship.listPublicMediaStories(parts[2]==="services"?"service":"mentor",parts[3],viewer?.sub||null),requestId); }
    if(req.method==="POST" && parts.length===5 && parts[4]==="stories" && (parts[2]==="services"||parts[2]==="mentors")) { const identity=await auth(req); return ok(res,await servicesMentorship.createPublicMediaStory(identity.sub,parts[2]==="services"?"service":"mentor",parts[3],await body(req),requestId,req.headers["x-idempotency-key"]),requestId,201); }
    if(req.method==="GET" && p==="api/v1/me/public-media-stories") { const identity=await auth(req); const q=query(req.url); return ok(res,await servicesMentorship.listMyPublicMediaStories(identity.sub,q.get("subjectType")||undefined,q.get("subjectId")||undefined),requestId); }
    if(req.method==="POST" && parts.length===5 && parts[2]==="public-media-stories" && parts[4]==="withdraw") { const identity=await auth(req); return ok(res,await servicesMentorship.withdrawPublicMediaStory(parts[3],identity.sub,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/public-media-stories") { const identity=await auth(req); return ok(res,await servicesMentorship.listPublicMediaStoryReviewQueue(identity.sub,query(req.url).get("status")||"pending"),requestId); }
    if(req.method==="PATCH" && parts.length===6 && parts[2]==="admin" && parts[3]==="public-media-stories" && parts[5]==="review") { const identity=await auth(req); return ok(res,await servicesMentorship.reviewPublicMediaStory(parts[4],identity.sub,await body(req),requestId),requestId); }

    if(req.method==="GET" && parts.length===4 && p.startsWith("api/v1/services/")) { const viewer=optionalIdentity(req); return ok(res,await servicesMentorship.getServiceListing(parts[3],viewer?.sub||null),requestId); }
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/services/") && parts[4]==="announcements") { const viewer=optionalIdentity(req); return ok(res,await servicesMentorship.listServiceListingAnnouncements(parts[3],viewer?.sub||null),requestId); }
    if(req.method==="GET" && p==="api/v1/mentors") { const q=query(req.url); const viewer=req.headers.authorization?.startsWith("Bearer ")?await auth(req):null; return ok(res,await servicesMentorship.listMentors(viewer?.sub||null,{q:q.get("q"),topic:q.get("topic"),limit:q.get("limit"),offset:q.get("offset")}),requestId); }
    if(req.method==="GET" && parts.length===4 && p.startsWith("api/v1/mentors/")) { const viewer=optionalIdentity(req); return ok(res,await servicesMentorship.getMentorProfile(parts[3],viewer?.sub||null),requestId); }
    if(req.method==="POST" && p==="api/v1/files/uploads") { const identity=await auth(req); return ok(res,await authorizePrivateUpload(identity.sub,await body(req)),requestId,201); }
    if(req.method==="PUT" && parts.length===6 && p.startsWith("api/v1/files/uploads/") && parts[5]==="content") { const identity=await auth(req); if(!String(req.headers["content-type"]||"").startsWith("application/octet-stream")) throw Object.assign(new Error("Upload content must use application/octet-stream."),{statusCode:415,code:"UNSUPPORTED_MEDIA_TYPE"}); const result=await receivePrivateUpload(identity.sub,parts[4],String(req.headers["x-upload-token"]||""),await rawBody(req)); return ok(res,result,requestId,201); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/files/uploads/") && parts[5]==="confirm") { const identity=await auth(req); return ok(res,await confirmPrivateUpload(identity.sub,parts[4]),requestId,201); }
    if(req.method==="GET" && parts.length===4 && p.startsWith("api/v1/files/")) { const identity=await auth(req); const result=await readAuthorizedPrivateFile(identity.sub,parts[3],identity.roles||[],requestId,identity.permissions||[]); res.writeHead(200,{"content-type":result.file.content_type,"content-length":String(result.bytes.length),"content-disposition":`attachment; filename*=UTF-8''${encodeURIComponent(result.file.original_name)}`,"cache-control":"private, no-store","x-content-type-options":"nosniff","x-request-id":requestId}); return res.end(result.bytes); }
    if(req.method==="POST" && p==="api/v1/auth/member-invitation/claim") return ok(res,await membershipAdminBulk.claimMemberInvitation(await body(req)),requestId);
    
    if(req.method==="POST" && p==="api/v1/auth/register") { const b=await body(req); await enforcePersistentRateLimit(req,"register",5,60000,String(b.email||"").trim().toLowerCase()); return ok(res,await membership.register(b,requestId),requestId,201); }
    if(req.method==="GET" && p==="api/v1/me/referrals") { const identity=await auth(req); return ok(res,await memberReferrals.listMyReferrals(identity.sub),requestId); }
    if(req.method==="GET" && p==="api/v1/me/referrals/candidate-outcomes") { const identity=await auth(req); return ok(res,await memberReferrals.listMyCandidateReferrals(identity.sub),requestId); }
    if(req.method==="POST" && p==="api/v1/me/referrals/code") { const identity=await auth(req); return ok(res,await memberReferrals.ensureMyReferralCode(identity.sub),requestId,201); }
    if(req.method==="POST" && parts.length===6 && parts[2]==="me" && parts[3]==="referrals" && parts[5]==="employment-confirmation") { const identity=await auth(req); return ok(res,await memberReferrals.confirmEmploymentOutcome(identity.sub,parts[4],await body(req)),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/referrals") { const identity=await auth(req); return ok(res,await memberReferrals.listReferralAdminQueue(identity,{status:query(req.url).get("status"),limit:query(req.url).get("limit")}),requestId); }
    if(req.method==="POST" && parts.length===6 && parts[2]==="admin" && parts[3]==="referrals" && parts[5]==="verify-employment") { const identity=await auth(req); return ok(res,await memberReferrals.verifyEmploymentReferral(identity,parts[4],await body(req),requestId),requestId); }
    if(req.method==="POST" && p==="api/v1/admin/referrals/scoring-policies") { const identity=await auth(req); const b=await body(req); return ok(res,await memberReferrals.proposeReferralScorePolicy(identity,b.points,b.reason),requestId,201); }
    if(req.method==="POST" && parts.length===7 && parts[2]==="admin" && parts[3]==="referrals" && parts[4]==="scoring-policies" && parts[6]==="approve") { const identity=await auth(req); const b=await body(req); return ok(res,await memberReferrals.approveReferralScorePolicy(identity,parts[5],b.activate===true,b.reason),requestId); }
    if(req.method==="GET" && p==="api/v1/membership/products") return ok(res,await membership.listMembershipProducts(),requestId);
    if(req.method==="GET" && p==="api/v1/membership/payment-methods") { await auth(req); return ok(res,await membership.listMembershipPaymentMethods(),requestId); }
     if(req.method==="GET" && p==="api/v1/admin/membership/payment-methods") {
       const identity=await auth(req); assertMembershipPaymentMethodAdmin(identity);
       return ok(res,await membership.listMembershipPaymentMethods({admin:true}),requestId);
     }
     if(req.method==="PUT" && p==="api/v1/admin/membership/payment-methods") {
       const identity=await auth(req); assertMembershipPaymentMethodAdmin(identity);
       return ok(res,await membership.saveMembershipPaymentMethod(identity.sub,await body(req),requestId),requestId);
     }
     if(req.method==="GET" && p==="api/v1/admin/membership/products") {
     if(req.method==="GET" && p==="api/v1/admin/experience/guides") { const identity=await auth(req); return ok(res,await experience.listAdminGuides(identity.sub),requestId); }
    const identity=await auth(req);
      anyRoleOrPermission(identity,["system_admin","reviewer"],["members.view","members.manage"]);
      return ok(res,await membership.listMembershipProductsForAdmin(),requestId);
    }
    if(req.method==="POST" && p==="api/v1/admin/membership/products") {
      const identity=await auth(req);
      anyRoleOrPermission(identity,["system_admin"],["members.manage"]);
      return ok(res,await membership.saveMembershipProduct(identity.sub,null,await body(req),requestId),requestId,201);
    }
    if(req.method==="PATCH" && parts.length===6 && p.startsWith("api/v1/admin/membership/products/")) {
      const identity=await auth(req);
      anyRoleOrPermission(identity,["system_admin"],["members.manage"]);
      return ok(res,await membership.saveMembershipProduct(identity.sub,parts[5],await body(req),requestId),requestId);
    }
    if(req.method==="POST" && p==="api/v1/auth/one-time-session/redeem") { await enforcePersistentRateLimit(req,"one-time-session-redeem",12,60000); publicRateLimit(req,"one-time-session-redeem",12,60000); const b=await body(req); return ok(res,await accountSecurity.redeemOneTimeSessionLink(b.token,requestId,{ip:clientIp(req),userAgent:req.headers["user-agent"]||null}),requestId); }
    if(req.method==="POST" && p==="api/v1/auth/recovery-email/verify") { await enforcePersistentRateLimit(req,"recovery-email-verify",8,60000); publicRateLimit(req,"recovery-email-verify",8,60000); const b=await body(req); return ok(res,await accountSecurity.verifyRecoveryEmailChange(b.token,requestId),requestId); }
    if(req.method==="POST" && p==="api/v1/auth/login") {
      const b=await body(req); await enforcePersistentRateLimit(req,"login",20,60000,String(b.email||"").trim().toLowerCase()); return ok(res,await membership.login(b.email,b.password,requestId,{ip:clientIp(req),userAgent:req.headers["user-agent"]||null}),requestId);
    }

    if(req.method==="POST" && p==="api/v1/auth/logout") { const identity=await auth(req); return ok(res,await userAdmin.logout(identity.sub,identity.sid,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/reference-portfolio") { const identity=await auth(req); return ok(res,await referencePortfolio.listReferenceDatasets(identity),requestId); }
    if(req.method==="GET" && parts.length===6 && p.startsWith("api/v1/admin/reference-portfolio/") && parts[5]==="items") { const identity=await auth(req); return ok(res,await referencePortfolio.listReferenceItems(identity,parts[4]),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/reference-portfolio/") && parts[5]==="items") { const identity=await auth(req); return ok(res,await referencePortfolio.saveReferenceItem(identity,parts[4],await body(req),null),requestId,201); }
    if(req.method==="PATCH" && parts.length===7 && p.startsWith("api/v1/admin/reference-portfolio/") && parts[5]==="items") { const identity=await auth(req); return ok(res,await referencePortfolio.saveReferenceItem(identity,parts[4],await body(req),parts[6]),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/reference-portfolio/") && parts[5]==="preview-import") { const identity=await auth(req); const b=await body(req); return ok(res,await referencePortfolio.previewReferenceCsv(identity,parts[4],b.filename||"reference.csv",b.csv||"",b.mapping||{}),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/reference-portfolio/") && parts[5]==="import") { const identity=await auth(req); const b=await body(req); return ok(res,await referencePortfolio.importReferenceCsv(identity,parts[4],b.filename||"reference.csv",b.csv||"",b.mapping||{}),requestId,201); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/reference-portfolio/") && parts[5]==="preview-import-json") { const identity=await auth(req); const b=await body(req); return ok(res,await referencePortfolio.previewReferenceJson(identity,parts[4],b.filename||"reference.json",b.json||"",b.mapping||{}),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/reference-portfolio/") && parts[5]==="import-json") { const identity=await auth(req); const b=await body(req); return ok(res,await referencePortfolio.importReferenceJson(identity,parts[4],b.filename||"reference.json",b.json||"",b.mapping||{}),requestId,201); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/reference-portfolio/") && parts[5]==="preview-import-xlsx") { const identity=await auth(req); const b=await body(req,12*1024*1024); return ok(res,await referencePortfolio.previewReferenceXlsx(identity,parts[4],b.filename||"reference.xlsx",b.xlsxBase64||"",b.mapping||{}),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/reference-portfolio/") && parts[5]==="import-xlsx") { const identity=await auth(req); const b=await body(req,12*1024*1024); return ok(res,await referencePortfolio.importReferenceXlsx(identity,parts[4],b.filename||"reference.xlsx",b.xlsxBase64||"",b.mapping||{}),requestId,201); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/reference-portfolio/") && parts[5]==="publish") { const identity=await auth(req); const b=await body(req); return ok(res,await referencePortfolio.publishReferenceDataset(identity,parts[4],b.reason||""),requestId); }
     if(req.method==="GET" && parts.length===6 && p.startsWith("api/v1/admin/reference-portfolio/") && parts[5]==="export") { const identity=await auth(req); return ok(res,await referencePortfolio.exportReferenceCsv(identity,parts[4]),requestId); }
    if(req.method==="GET" && parts.length===6 && p.startsWith("api/v1/admin/reference-portfolio/") && parts[5]==="export-json") { const identity=await auth(req); return ok(res,await referencePortfolio.exportReferenceJson(identity,parts[4]),requestId); }
    if(req.method==="GET" && parts.length===6 && p.startsWith("api/v1/admin/reference-portfolio/") && parts[5]==="export-xlsx") { const identity=await auth(req); return ok(res,await referencePortfolio.exportReferenceXlsx(identity,parts[4]),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/directory-export/fields") { const identity=await auth(req),q=query(req.url); return ok(res,directoryExports.listDirectoryExportFields(identity,q.get("kind")||"members"),requestId); }
    if(req.method==="POST" && p==="api/v1/admin/directory-export/preview") { const identity=await auth(req),b=await body(req); return ok(res,await directoryExports.previewDirectoryExport(identity,b.kind||"members",b),requestId); }
    if(req.method==="POST" && p==="api/v1/admin/directory-export") { const identity=await auth(req),b=await body(req,1024*1024),out=await directoryExports.exportDirectory(identity,b.kind||"members",b,requestId); res.writeHead(200,{"content-type":out.contentType,"content-disposition":`attachment; filename="${out.filename}"`,"content-length":String(out.buffer.length),"cache-control":"private, no-store","x-content-type-options":"nosniff","x-request-id":requestId,"x-export-row-count":String(out.rowCount),"x-export-expected-row-count":String(out.expectedRows)}); return res.end(out.buffer); }
    if(req.method==="GET" && p==="api/v1/admin/members/import-template") { const identity=await auth(req); const csv=membershipAdminBulk.memberImportTemplate(identity); res.writeHead(200,{"content-type":"text/csv; charset=utf-8","content-disposition":"attachment; filename=mpa-approved-members-template.csv","cache-control":"no-store","x-request-id":requestId}); return res.end(csv); }
    if(req.method==="POST" && p==="api/v1/admin/members/import/preview") { const identity=await auth(req); return ok(res,await membershipAdminBulk.previewMemberImport(identity,await body(req,6*1024*1024),requestId),requestId,201); }
    if(req.method==="POST" && parts.length===7 && p.startsWith("api/v1/admin/members/import/") && parts[6]==="apply") { const identity=await auth(req); return ok(res,await membershipAdminBulk.applyMemberImport(identity,parts[5],await body(req),requestId),requestId); }
        if(req.method==="GET" && p==="api/v1/admin/members/catalog") { const identity=await auth(req),q=query(req.url); return ok(res,await membershipAdminBulk.listMemberCatalog(identity,{q:q.get("q"),status:q.get("status"),limit:q.get("limit"),offset:q.get("offset")}),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/members/export") { const identity=await auth(req),q=query(req.url),out=await directoryExports.exportDirectory(identity,"members",{q:q.get("q"),status:q.get("status"),format:q.get("format")||"csv"},requestId); res.writeHead(200,{"content-type":out.contentType,"content-disposition":`attachment; filename="${out.filename}"`,"content-length":String(out.buffer.length),"cache-control":"private, no-store","x-content-type-options":"nosniff","x-request-id":requestId,"x-export-row-count":String(out.rowCount),"x-export-expected-row-count":String(out.expectedRows)}); return res.end(out.buffer); }
    if(req.method==="GET" && p==="api/v1/me/report-saved-views") { const identity=await auth(req); return ok(res,await reports.listSavedViews(identity),requestId); }
    if(req.method==="POST" && p==="api/v1/me/report-saved-views") { const identity=await auth(req); return ok(res,await reports.saveSavedView(identity,await body(req),requestId),requestId,201); }
    if(req.method==="DELETE" && parts.length===5 && p.startsWith("api/v1/me/report-saved-views/")) { const identity=await auth(req); return ok(res,await reports.deleteSavedView(identity,parts[4],requestId),requestId); }
    if(req.method==="PATCH" && parts.length===6 && p.startsWith("api/v1/services/listings/") && parts[5]==="completion-policy") { const identity=await auth(req); return ok(res,await servicesMentorship.configureServiceCompletionPolicy(parts[4],identity.sub,await body(req),requestId),requestId); }
    if(req.method==="GET" && parts.length===6 && p.startsWith("api/v1/services/listings/") && parts[5]==="impact-report") {
      const identity=await auth(req),q=query(req.url);
      const result=await serveCommunityImpactReports.runImpactReport(identity,parts[4],{from:q.get("from"),to:q.get("to")},requestId,q.get("view")||"owner");
      return ok(res,result,requestId);
    }
    if(req.method==="GET" && parts.length===7 && p.startsWith("api/v1/services/listings/") && parts[5]==="impact-report" && parts[6]==="export") {
      const identity=await auth(req),q=query(req.url),view=q.get("view")||"owner";
      const result=await serveCommunityImpactReports.runImpactReport(identity,parts[4],{from:q.get("from"),to:q.get("to")},requestId,view);
      const exportData=serveCommunityImpactReports.toImpactExportData(result,parts[4]);
      const format=q.get("format")||"pdf";
      if(!["csv","pdf","xlsx"].includes(format)) throw Object.assign(new Error("Choose CSV, PDF or XLSX export format."),{statusCode:400,code:"INVALID_EXPORT_FORMAT"});
      const buffer=format==="pdf"?reports.makePdf(exportData):format==="csv"?reports.makeCsv(exportData):reports.makeXlsx(exportData);
      await getPool().query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,'service_listing',$3,$4,'success',$5)",[identity.sub,view==="governance"?"serve_community.impact_governance_report_exported":"serve_community.impact_report_exported",parts[4],requestId,JSON.stringify({format,view,rows:exportData.rows.length,minimumGroupSize:result.minimumGroupSize})]);
      res.writeHead(200,{"content-type":format==="pdf"?"application/pdf":format==="csv"?"text/csv; charset=utf-8":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","content-disposition":`attachment; filename=serve-community-impact-${new Date().toISOString().slice(0,10)}.${format}`,"content-length":String(buffer.length),"cache-control":"private, no-store","x-content-type-options":"nosniff","x-request-id":requestId});
      return res.end(buffer);
    }
    if(req.method==="GET" && p==="api/v1/admin/reports") { const identity=await auth(req); return ok(res,await reports.listReportCatalogue(identity),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/reports/") && parts[5]==="run") { const identity=await auth(req); return ok(res,await reports.runReport(identity,parts[4],await body(req),requestId),requestId); }
    if(req.method==="GET" && parts.length===6 && p.startsWith("api/v1/admin/reports/") && parts[5]==="export") { const identity=await auth(req),q=query(req.url),out=await reports.exportReport(identity,parts[4],{from:q.get("from"),to:q.get("to"),status:q.get("status"),q:q.get("q"),groupBy:q.get("groupBy")},q.get("format")||"pdf",requestId); res.writeHead(200,{"content-type":out.contentType,"content-disposition":`attachment; filename=${out.filename}`,"content-length":String(out.buffer.length),"cache-control":"private, no-store","x-content-type-options":"nosniff","x-request-id":requestId}); return res.end(out.buffer); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/organizations/") && parts[5]==="members") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin","admin"],["organizations.manage"]); return ok(res,await organizationJobs.adminAddOrganizationUser(identity,parts[4],await body(req),requestId),requestId,201); }
    if(req.method==="PATCH" && parts.length===7 && p.startsWith("api/v1/admin/organizations/") && parts[5]==="members") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin","admin"],["organizations.manage"]); return ok(res,await organizationJobs.adminUpdateOrganizationUser(identity,parts[4],parts[6],await body(req),requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/organizations") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin","admin"],["organizations.manage"]); const q=query(req.url); return ok(res,await organizationJobs.listOrganizationsForAdmin({q:q.get("q"),status:q.get("status"),limit:q.get("limit"),offset:q.get("offset")}),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/account-governance") { const identity=await auth(req); return ok(res,await userAdmin.getAccountGovernance(identity,query(req.url).get("accountReference")),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/users") { const identity=await auth(req); return ok(res,await userAdmin.listUsers(identity,{q:query(req.url).get("q"),status:query(req.url).get("status")}),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/roles") { const identity=await auth(req); return ok(res,await userAdmin.listRoles(identity.sub),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/permissions") { const identity=await auth(req); return ok(res,await userAdmin.listPermissions(identity.sub),requestId); }
    if(req.method==="PATCH" && parts.length===6 && p.startsWith("api/v1/admin/users/") && parts[5]==="permissions") { const identity=await auth(req); return ok(res,await userAdmin.updateUserPermissions(identity.sub,parts[4],await body(req),requestId),requestId); }
    if(req.method==="PATCH" && parts.length===5 && p.startsWith("api/v1/admin/users/")) { const identity=await auth(req); return ok(res,await userAdmin.updateUser(identity,parts[4],await body(req),requestId),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/users/") && parts[5]==="revoke-sessions") { const identity=await auth(req); const b=await body(req); return ok(res,await userAdmin.revokeSessions(identity,parts[4],requestId,b.reason),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/users/") && parts[5]==="reset-password") { const identity=await auth(req); await enforcePersistentRateLimit(req,"admin-one-time-password",5,3600000,identity.sub); const b=await body(req); res.setHeader("cache-control","no-store, private, max-age=0"); res.setHeader("pragma","no-cache"); res.setHeader("expires","0"); return ok(res,await userAdmin.issueOneTimePassword(identity,parts[4],requestId,b.reason),requestId,201); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/users/") && parts[5]==="one-time-session-link") { const identity=await auth(req); const b=await body(req); const origin=resolveAllowedOrigin(req.headers.origin,config.corsOrigin); return ok(res,await accountSecurity.createOneTimeSessionLink(identity,parts[4],requestId,b.reason,origin),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/users/") && parts[5]==="one-time-password") { const identity=await auth(req); await enforcePersistentRateLimit(req,"admin-one-time-password",5,3600000,identity.sub); const b=await body(req); res.setHeader("cache-control","no-store, private, max-age=0"); res.setHeader("pragma","no-cache"); res.setHeader("expires","0"); return ok(res,await userAdmin.issueOneTimePassword(identity,parts[4],requestId,b.reason),requestId,201); }
    if(req.method==="PATCH" && parts.length===6 && p.startsWith("api/v1/admin/users/") && parts[5]==="recovery-email") { const identity=await auth(req); await enforcePersistentRateLimit(req,"admin-recovery-email-change",5,3600000,identity.sub); const b=await body(req); const origin=resolveAllowedOrigin(req.headers.origin,config.corsOrigin); return ok(res,await accountSecurity.requestRecoveryEmailChange(identity,parts[4],b,requestId,origin),requestId,202); }
    if(req.method==="GET" && p==="api/v1/experience/demo-cases") return ok(res,await experience.listDemoCases(),requestId);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/experience/demo-cases/")) return ok(res,await experience.getDemoCase(parts[4]),requestId);
    if(req.method==="GET" && p==="api/v1/experience/guides") { const q=query(req.url); return ok(res,await experience.listGuides(q.get("route")),requestId); }

    if(req.method==="GET" && p==="api/v1/talent"){
      const q=query(req.url);
      const viewer=req.headers.authorization?.startsWith("Bearer ")?await auth(req):null;
      return ok(res,await talent.searchTalent(viewer?.sub||null,{q:q.get("q"),occupation:q.get("occupation"),industry:q.get("industry"),educationLevel:q.get("educationLevel"),qualificationType:q.get("qualificationType"),fieldOfStudy:q.get("fieldOfStudy"),availability:q.get("availability"),location:q.get("location"),verifiedClaim:q.get("verifiedClaim"),limit:q.get("limit"),offset:q.get("offset")}),requestId);
    }
    if(req.method==="GET" && parts.length===4 && p.startsWith("api/v1/talent/") && !["inquiries","saved-searches"].includes(parts[3])){
      const viewer=req.headers.authorization?.startsWith("Bearer ")?await auth(req):null;
      return ok(res,await talent.getTalent(parts[3],viewer?.sub||null),requestId);
    }

    if(req.method==="GET" && p==="api/v1/marketplace-demand/topics") { const q=query(req.url); return ok(res,await marketplaceDemand.listPublishedTopics({type:q.get("type"),q:q.get("q"),limit:q.get("limit")}),requestId); }
     if(req.method==="GET" && p==="api/v1/organization-mentorship-offers") { const viewer=req.headers.authorization?.startsWith("Bearer ")?await auth(req):null; return ok(res,await organizationMentorshipOffers.listOrganizationMentorshipOffers(viewer?.sub||null),requestId); }
    const identity=await auth(req);
    if(req.method==="GET" && p==="api/v1/network-plus/access") return ok(res,await resolveNetworkPlusAccess(getPool(),identity.sub),requestId);
    if(req.method==="GET" && p==="api/v1/network-plus/organizations"){
      const q=query(req.url);
      return ok(res,await organizationJobs.listNetworkPlusOrganizations(identity.sub,{q:q.get("q"),organizationType:q.get("organizationType"),location:q.get("location"),limit:q.get("limit"),offset:q.get("offset")}),requestId);
    }

    if(req.method==="GET" && p==="api/v1/network-plus/businesses"){
      await enforcePersistentRateLimit(req,"network-plus.business.search",60,60000,identity.sub);
      const q=query(req.url);
      return ok(res,await networkPlusBusiness.listBusinesses(identity.sub,{q:q.get("q"),limit:q.get("limit"),offset:q.get("offset")}),requestId);
    }
    if(req.method==="GET" && parts.length===6 && p.startsWith("api/v1/network-plus/businesses/") && parts[5]==="services") {
      return ok(res,await networkPlusBusiness.getBusiness(parts[4],identity.sub),requestId);
    }
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/network-plus/businesses/")) return ok(res,await networkPlusBusiness.getBusiness(parts[4],identity.sub),requestId);
    if(req.method==="GET" && p==="api/v1/network-plus/services"){
      await enforcePersistentRateLimit(req,"network-plus.service.search",60,60000,identity.sub);
      const q=query(req.url);
      return ok(res,await networkPlusBusiness.listProfessionalServices(identity.sub,{q:q.get("q"),category:q.get("category"),limit:q.get("limit"),offset:q.get("offset")}),requestId);
    }
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/network-plus/services/")) return ok(res,await networkPlusBusiness.getProfessionalService(parts[4],identity.sub),requestId);
    if(req.method==="GET" && p==="api/v1/network-plus/my/businesses") return ok(res,await networkPlusBusiness.listMyBusinesses(identity.sub),requestId);
    if(req.method==="POST" && p==="api/v1/network-plus/businesses"){
      await enforcePersistentRateLimit(req,"network-plus.business.create",5,60000,identity.sub);
      return ok(res,await networkPlusBusiness.createBusiness(identity.sub,await body(req),requestId,req.headers["x-idempotency-key"]),requestId,201);
    }
    if(req.method==="PATCH" && parts.length===5 && p.startsWith("api/v1/network-plus/businesses/")) return ok(res,await networkPlusBusiness.updateBusiness(parts[4],identity.sub,await body(req),requestId),requestId);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/network-plus/businesses/") && parts[5]==="owners"){ await enforcePersistentRateLimit(req,"network-plus.business.ownership.invite",10,60000,identity.sub); return ok(res,await networkPlusBusiness.addBusinessOwner(parts[4],identity.sub,await body(req),requestId),requestId,201); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/network-plus/business-ownership/") && parts[5]==="respond"){
      const b=await body(req);return ok(res,await networkPlusBusiness.respondBusinessOwnership(parts[4],identity.sub,b.decision,requestId),requestId);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/network-plus/businesses/") && parts[5]==="access") return ok(res,await networkPlusBusiness.grantBusinessAccess(parts[4],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && parts.length===6 && p.startsWith("api/v1/network-plus/businesses/") && parts[5]==="evidence") return ok(res,await networkPlusBusiness.listBusinessVerificationEvidence(parts[4],identity.sub),requestId);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/network-plus/businesses/") && parts[5]==="evidence"){ await enforcePersistentRateLimit(req,"network-plus.business.evidence",10,60000,identity.sub); return ok(res,await networkPlusBusiness.addBusinessVerificationEvidence(parts[4],identity.sub,await body(req),requestId),requestId,201); }
    if(req.method==="GET" && parts.length===6 && p==="api/v1/admin/network-plus/businesses/verification-queue"){ await enforcePersistentRateLimit(req,"network-plus.business.verification.queue",60,60000,identity.sub); const q=query(req.url); return ok(res,await networkPlusBusiness.listBusinessVerificationQueue(identity.sub,{limit:q.get("limit"),offset:q.get("offset")}),requestId); }
    if(req.method==="GET" && parts.length===6 && p==="api/v1/admin/network-plus/businesses/moderation-queue"){ await enforcePersistentRateLimit(req,"network-plus.business.moderation.queue",60,60000,identity.sub); const q=query(req.url); return ok(res,await networkPlusBusiness.listBusinessModerationQueue(identity.sub,{limit:q.get("limit"),offset:q.get("offset")}),requestId); }
    if(req.method==="GET" && parts.length===6 && p==="api/v1/admin/network-plus/services/moderation-queue"){ await enforcePersistentRateLimit(req,"network-plus.service.moderation.queue",60,60000,identity.sub); const q=query(req.url); return ok(res,await networkPlusBusiness.listProfessionalServiceModerationQueue(identity.sub,{limit:q.get("limit"),offset:q.get("offset")}),requestId); }
    if(req.method==="GET" && parts.length===7 && p.startsWith("api/v1/admin/network-plus/businesses/") && parts[6]==="evidence") return ok(res,await networkPlusBusiness.listBusinessVerificationEvidence(parts[5],identity.sub),requestId);
    if(req.method==="DELETE" && parts.length===7 && p.startsWith("api/v1/network-plus/businesses/") && parts[5]==="access") return ok(res,await networkPlusBusiness.revokeBusinessAccess(parts[4],parts[6],identity.sub,requestId),requestId);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/network-plus/businesses/") && parts[5]==="verification"){
      await enforcePersistentRateLimit(req,"network-plus.business.verification.submit",5,60000,identity.sub);
      return ok(res,await networkPlusBusiness.submitBusinessVerification(parts[4],identity.sub,requestId),requestId,201);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/network-plus/businesses/") && parts[5]==="moderation") return ok(res,await networkPlusBusiness.submitBusinessModeration(parts[4],identity.sub,requestId),requestId,201);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/network-plus/businesses/") && parts[5]==="publication"){
      const b=await body(req);return ok(res,await networkPlusBusiness.changeBusinessPublicationStatus(parts[4],identity.sub,b.status,b.reason,requestId),requestId);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/network-plus/businesses/") && parts[5]==="services"){
      await enforcePersistentRateLimit(req,"network-plus.service.create",10,60000,identity.sub);
      return ok(res,await networkPlusBusiness.createProfessionalServiceListing(parts[4],identity.sub,await body(req),requestId,req.headers["x-idempotency-key"]),requestId,201);
    }
    if(req.method==="PATCH" && parts.length===5 && p.startsWith("api/v1/network-plus/services/")) return ok(res,await networkPlusBusiness.updateProfessionalServiceListing(parts[4],identity.sub,await body(req),requestId),requestId);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/network-plus/services/") && parts[5]==="publication"){ const b=await body(req); return ok(res,await networkPlusBusiness.changeProfessionalServiceStatus(parts[4],identity.sub,b.status,b.reason,requestId),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/network-plus/services/") && parts[5]==="submit"){
      await enforcePersistentRateLimit(req,"network-plus.service.submit",10,60000,identity.sub);
      return ok(res,await networkPlusBusiness.submitProfessionalServiceListing(parts[4],identity.sub,requestId),requestId);
    }
    if(req.method==="POST" && parts.length===7 && p.startsWith("api/v1/admin/network-plus/businesses/") && parts[6]==="verification") return ok(res,await networkPlusBusiness.reviewBusinessVerification(parts[5],identity.sub,await body(req),requestId),requestId);
    if(req.method==="POST" && parts.length===7 && p.startsWith("api/v1/admin/network-plus/businesses/") && parts[6]==="moderation") return ok(res,await networkPlusBusiness.reviewBusinessModeration(parts[5],identity.sub,await body(req),requestId),requestId);
    if(req.method==="POST" && parts.length===7 && p.startsWith("api/v1/admin/network-plus/services/") && parts[6]==="moderation") return ok(res,await networkPlusBusiness.moderateProfessionalServiceListing(parts[5],identity.sub,await body(req),requestId),requestId);
    if(req.method==="GET" && p==="api/v1/network-plus/request-invitations"){ await enforcePersistentRateLimit(req,"network-plus.request.invitations",60,60000,identity.sub); return ok(res,await networkPlusRequests.listNetworkPlusParticipantInvitations(identity.sub),requestId); }
    if(req.method==="GET" && p==="api/v1/network-plus/requests"){
      await enforcePersistentRateLimit(req,"network-plus.request.list",60,60000,identity.sub);
      const q=query(req.url); return ok(res,await networkPlusRequests.listNetworkPlusRequests(identity.sub,{status:q.get("status"),intent:q.get("intent"),limit:q.get("limit"),offset:q.get("offset"),supportReason:q.get("supportReason"),supportTicket:q.get("supportTicket"),supportRequestId:q.get("supportRequestId")}),requestId);
    }
    if(req.method==="POST" && p==="api/v1/network-plus/requests"){
      await enforcePersistentRateLimit(req,"network-plus.request.create",10,60000,identity.sub);
      return ok(res,await networkPlusRequests.createNetworkPlusRequest(identity.sub,await body(req),requestId,req.headers["x-idempotency-key"]),requestId,201);
    }
    if(req.method==="POST" && parts.length===7 && p.startsWith("api/v1/admin/network-plus/requests/") && parts[6]==="support-access"){ await enforcePersistentRateLimit(req,"network-plus.request.support.grant",10,60000,identity.sub); return ok(res,await networkPlusRequests.grantNetworkPlusSupportAccess(parts[5],identity.sub,await body(req),requestId),requestId,201); }
    if(req.method==="DELETE" && parts.length===8 && p.startsWith("api/v1/admin/network-plus/requests/") && parts[6]==="support-access") return ok(res,await networkPlusRequests.revokeNetworkPlusSupportAccess(parts[5],parts[7],identity.sub,requestId),requestId);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/network-plus/requests/")) { await enforcePersistentRateLimit(req,"network-plus.request.detail",60,60000,identity.sub); const q=query(req.url); return ok(res,await networkPlusRequests.getNetworkPlusRequest(parts[4],identity.sub,{supportReason:q.get("supportReason"),supportTicket:q.get("supportTicket")}),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/network-plus/requests/") && parts[5]==="submit") { await enforcePersistentRateLimit(req,"network-plus.request.submit",10,60000,identity.sub); return ok(res,await networkPlusRequests.submitNetworkPlusRequest(parts[4],identity.sub,requestId,req.headers["x-idempotency-key"]),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/network-plus/requests/") && parts[5]==="transitions") { await enforcePersistentRateLimit(req,"network-plus.request.transition",20,60000,identity.sub); return ok(res,await networkPlusRequests.transitionNetworkPlusRequest(parts[4],identity.sub,await body(req),requestId,req.headers["x-idempotency-key"]),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/network-plus/requests/") && parts[5]==="participants") { await enforcePersistentRateLimit(req,"network-plus.request.participant.invite",10,60000,identity.sub); return ok(res,await networkPlusRequests.addNetworkPlusRequestParticipant(parts[4],identity.sub,await body(req),requestId),requestId,201); }
    if(req.method==="POST" && parts.length===7 && p.startsWith("api/v1/network-plus/requests/") && parts[5]==="participants" && parts[6]==="respond") { await enforcePersistentRateLimit(req,"network-plus.request.participant.respond",10,60000,identity.sub); const b=await body(req); return ok(res,await networkPlusRequests.respondNetworkPlusParticipant(parts[4],identity.sub,b.decision,requestId),requestId); }
    if(req.method==="GET" && parts.length===6 && p.startsWith("api/v1/network-plus/requests/") && parts[5]==="workspace") { await enforcePersistentRateLimit(req,"network-plus.workspace.read",60,60000,identity.sub); return ok(res,await networkPlusRequests.getNetworkPlusWorkspace(parts[4],identity.sub),requestId); }
    if(req.method==="POST" && parts.length===7 && p.startsWith("api/v1/network-plus/requests/") && parts[5]==="workspace" && parts[6]==="milestones") { await enforcePersistentRateLimit(req,"network-plus.workspace.milestone.create",20,60000,identity.sub); return ok(res,await networkPlusRequests.addNetworkPlusWorkspaceMilestone(parts[4],identity.sub,await body(req),req.headers["x-idempotency-key"]),requestId,201); }
    if(req.method==="PATCH" && parts.length===8 && p.startsWith("api/v1/network-plus/requests/") && parts[5]==="workspace" && parts[6]==="milestones") { await enforcePersistentRateLimit(req,"network-plus.workspace.milestone.update",30,60000,identity.sub); return ok(res,await networkPlusRequests.updateNetworkPlusWorkspaceMilestone(parts[4],parts[7],identity.sub,await body(req),requestId),requestId); }
    if(req.method==="POST" && parts.length===7 && p.startsWith("api/v1/network-plus/requests/") && parts[5]==="workspace" && parts[6]==="events") { await enforcePersistentRateLimit(req,"network-plus.workspace.event.create",30,60000,identity.sub); return ok(res,await networkPlusRequests.addNetworkPlusWorkspaceEvent(parts[4],identity.sub,await body(req),requestId,req.headers["x-idempotency-key"]),requestId,201); }
    if(req.method==="PATCH" && parts.length===5 && p.startsWith("api/v1/organizations/") && parts[4]==="network-plus-visibility"){
      return ok(res,await organizationJobs.updateNetworkPlusVisibility(parts[3],identity.sub,await body(req),requestId),requestId);
    }
    if(req.method==="POST" && p==="api/v1/admin/experience/demo-cases") { return ok(res,await experience.createDemoCase(identity.sub,await body(req),requestId),requestId,201); }
    if(req.method==="PATCH" && parts.length===6 && p.startsWith("api/v1/admin/experience/demo-cases/")) { return ok(res,await experience.updateDemoCase(parts[5],identity.sub,await body(req),requestId),requestId); }
    if(req.method==="POST" && p==="api/v1/admin/experience/guides") { return ok(res,await experience.createGuide(identity.sub,await body(req),requestId),requestId,201); }
    if(req.method==="PATCH" && parts.length===6 && p.startsWith("api/v1/admin/experience/guides/")) { return ok(res,await experience.updateGuide(parts[5],identity.sub,await body(req),requestId),requestId); }

    if(req.method==="POST" && p==="api/v1/organizations") return ok(res,await organizationJobs.registerOrganization(identity.sub,await body(req),requestId),requestId,201);
     if(req.method==="GET" && p==="api/v1/organizations") return ok(res,await organizationJobs.listMyOrganizations(identity.sub),requestId);
     if(req.method==="GET" && p==="api/v1/me/organization-access") return ok(res,await organizationJobs.listMyOrganizationAccess(identity.sub),requestId);
    if(req.method==="GET" && p==="api/v1/me/job-assignments") return ok(res,await organizationJobs.listMyJobAssignments(identity.sub),requestId);
    if(req.method==="GET" && parts.length===4 && p.startsWith("api/v1/organizations/")) return ok(res,await organizationJobs.getOrganization(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/organizations/") && parts[4]==="verification-evidence") return ok(res,await organizationJobs.addVerificationEvidence(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/organizations/") && parts[4]==="submit-verification") return ok(res,await organizationJobs.submitOrganizationVerification(parts[3],identity.sub,requestId),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/organizations/") && parts[4]==="users") return ok(res,await organizationJobs.addOrganizationUser(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="PATCH" && parts.length===6 && p.startsWith("api/v1/organizations/") && parts[4]==="users") return ok(res,await organizationJobs.updateOrganizationUser(parts[3],identity.sub,parts[5],await body(req),requestId),requestId);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/organizations/") && parts[4]==="users") return ok(res,await organizationJobs.listOrganizationUsers(parts[3],identity.sub),requestId);
    if(req.method==="GET" && p==="api/v1/review/organizations") return ok(res,await organizationJobs.listOrganizationVerificationQueue(identity.sub),requestId);
    if(req.method==="POST" && p==="api/v1/review/organizations") { anyRoleOrPermission(identity,["reviewer","system_admin"],["organizations.review"]); const b=await body(req); return ok(res,await organizationJobs.reviewOrganization(b.organizationId,identity.sub,b,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/organization-verification-requirements") return ok(res,await organizationJobs.listOrganizationVerificationRequirements(identity.sub),requestId);
    if(req.method==="POST" && p==="api/v1/admin/organization-verification-requirements") return ok(res,await organizationJobs.createOrganizationVerificationRequirement(identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="PATCH" && parts.length===5 && p.startsWith("api/v1/admin/organization-verification-requirements/")) return ok(res,await organizationJobs.updateOrganizationVerificationRequirement(parts[4],identity.sub,await body(req),requestId),requestId);

    if(req.method==="POST" && p==="api/v1/jobs") { const b=await body(req); if(!b.organizationId) throw Object.assign(new Error("organizationId is required."),{statusCode:400,code:"VALIDATION_ERROR"}); return ok(res,await organizationJobs.createJob(b.organizationId,identity.sub,b,requestId),requestId,201); }
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/organizations/") && parts[4]==="requisitions") return ok(res,await organizationJobs.createRequisition(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/organizations/") && parts[4]==="requisitions") return ok(res,await organizationJobs.listRequisitions(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/job-requisitions/") && parts[4]==="decision") return ok(res,await organizationJobs.decideRequisition(parts[3],identity.sub,await body(req),requestId),requestId);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/organizations/") && parts[4]==="jobs") return ok(res,await organizationJobs.listOrganizationJobs(parts[3],identity.sub),requestId);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/organizations/") && parts[4]==="recruiting-dashboard") return ok(res,await organizationJobs.organizationRecruitingDashboard(parts[3],identity.sub),requestId);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/organizations/") && parts[4]==="outcomes") return ok(res,await stakeholderOutcomes.getOrganizationOutcomeWorkspace(parts[3],identity.sub),requestId);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="dashboard") return ok(res,await organizationJobs.jobDashboard(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="team") return ok(res,await organizationJobs.addJobTeamMember(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="team") return ok(res,await organizationJobs.listJobTeam(parts[3],identity.sub),requestId);
    if(req.method==="DELETE" && parts.length===6 && p.startsWith("api/v1/jobs/") && parts[4]==="team") return ok(res,await organizationJobs.removeJobTeamMember(parts[3],identity.sub,parts[5],await body(req),requestId),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="screening-questions") return ok(res,await organizationJobs.addScreeningQuestion(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="scorecards") return ok(res,await organizationJobs.listInterviewScorecards(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="scorecards") return ok(res,await organizationJobs.createInterviewScorecard(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="screening-questions") return ok(res,await organizationJobs.listScreeningQuestions(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="referrals") return ok(res,await organizationJobs.referCandidate(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="save") return ok(res,await organizationJobs.saveJob(parts[3],identity.sub,requestId),requestId,201);
    if(req.method==="DELETE" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="save") return ok(res,await organizationJobs.unsaveJob(parts[3],identity.sub,requestId),requestId);
    if(req.method==="GET" && p==="api/v1/me/saved-jobs") return ok(res,await organizationJobs.listSavedJobs(identity.sub),requestId);
    if(req.method==="GET" && p==="api/v1/me/saved-items") return ok(res,await savedDiscoveryItems.listDiscoveryItems(identity.sub),requestId);
    if(req.method==="POST" && p==="api/v1/me/saved-items") return ok(res,await savedDiscoveryItems.saveDiscoveryItem(identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="DELETE" && parts.length===6 && p.startsWith("api/v1/me/saved-items/")) return ok(res,await savedDiscoveryItems.removeDiscoveryItem(identity.sub,parts[4],parts[5],requestId),requestId);
    if(req.method==="POST" && p==="api/v1/me/job-alerts") return ok(res,await organizationJobs.createJobAlert(identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && p==="api/v1/me/job-alerts") return ok(res,await organizationJobs.listJobAlerts(identity.sub),requestId);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/job-applications/") && parts[4]==="notes") return ok(res,await organizationJobs.listApplicationNotes(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/job-applications/") && parts[4]==="notes") return ok(res,await organizationJobs.addApplicationNote(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/job-applications/") && parts[4]==="interviews") return ok(res,await organizationJobs.listApplicationInterviews(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/job-applications/") && parts[4]==="interviews") return ok(res,await organizationJobs.scheduleInterview(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/job-interviews/") && parts[4]==="status") return ok(res,await organizationJobs.updateInterviewStatus(parts[3],identity.sub,await body(req),requestId),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/job-interviews/") && parts[4]==="change-proposals") return ok(res,await organizationJobs.proposeInterviewChange(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/job-interview-change-proposals/") && parts[4]==="decision") return ok(res,await organizationJobs.decideInterviewChange(parts[3],identity.sub,await body(req),requestId),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/job-interviews/") && parts[4]==="response") { const b=await body(req); return ok(res,await organizationJobs.respondInterview(parts[3],identity.sub,b.status,requestId),requestId); }
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/job-interviews/") && parts[4]==="feedback") return ok(res,await organizationJobs.submitInterviewFeedback(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="outcome") return ok(res,await organizationJobs.recordJobOutcome(parts[3],identity.sub,await body(req),requestId),requestId,201);


    if(req.method==="POST" && p==="api/v1/marketplace-demand") return ok(res,await marketplaceDemand.createDemand(identity.sub,await body(req),requestId,req.headers["x-idempotency-key"]),requestId,201);
    if(req.method==="POST" && p==="api/v1/marketplace-demand/public-topics") return ok(res,await marketplaceDemand.createPublicTopicSubmission(identity.sub,await body(req),requestId,req.headers["x-idempotency-key"]),requestId,201);
    if(req.method==="GET" && p==="api/v1/me/marketplace-demand-public-topics") return ok(res,await marketplaceDemand.listMyPublicTopicSubmissions(identity.sub),requestId);
    if(req.method==="GET" && p==="api/v1/admin/marketplace-demand-public-topics") { const q=query(req.url); return ok(res,await marketplaceDemand.listPublicTopicSubmissionsForReview(identity.sub,{status:q.get("status")||"pending_review",q:q.get("q")||"",limit:q.get("limit")||"50",offset:q.get("offset")||"0"}),requestId); }
    if(req.method==="PATCH" && parts.length===6 && p.startsWith("api/v1/admin/marketplace-demand-public-topics/") && parts[5]==="review") return ok(res,await marketplaceDemand.reviewPublicTopicSubmission(parts[4],identity.sub,await body(req),requestId),requestId);
    if(req.method==="GET" && p==="api/v1/me/marketplace-demand") return ok(res,await marketplaceDemand.listMyDemand(identity.sub),requestId);
    if(req.method==="GET" && p==="api/v1/me/marketplace-demand-interests") return ok(res,await marketplaceDemand.listMyInterests(identity.sub),requestId);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/marketplace-demand/topics/") && parts[5]==="interest") return ok(res,await marketplaceDemand.joinDemandTopic(parts[4],identity.sub,await body(req),requestId),requestId,201);
     if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/marketplace-demand/topics/") && parts[5]==="withdraw") { const b=await body(req); return ok(res,await marketplaceDemand.withdrawDemandInterest(parts[4],identity.sub,b.reason,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/marketplace-match-candidates") { const q=query(req.url); return ok(res,await marketplaceDemand.listDemandMatchCandidates(identity.sub,q.get("type")||"service"),requestId); }
     if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/marketplace-demand/") && parts[5]==="matches") return ok(res,await marketplaceDemand.createDemandProviderMatch(parts[4],identity.sub,await body(req),requestId),requestId,201);
     if(req.method==="GET" && p==="api/v1/me/marketplace-demand-matches") return ok(res,await marketplaceDemand.listMyDemandProviderMatches(identity.sub),requestId);
     if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/marketplace-demand-matches/") && parts[4]==="response") { const b=await body(req); return ok(res,await marketplaceDemand.respondToDemandProviderMatch(parts[3],identity.sub,b.status,b.note,requestId),requestId); }
     if(req.method==="GET" && p==="api/v1/admin/marketplace-demand") { const q=query(req.url); return ok(res,await marketplaceDemand.listReviewQueue(identity.sub,{status:q.get("status")||"submitted",q:q.get("q")||"",limit:q.get("limit")||"50",offset:q.get("offset")||"0"}),requestId); }
     if(req.method==="GET" && p==="api/v1/admin/marketplace-demand-assessment") { const q=query(req.url); return ok(res,await marketplaceDemand.getDemandInterestAssessment(identity.sub,{type:q.get("type"),from:q.get("from"),to:q.get("to")}),requestId); }
     if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/marketplace-demand/") && parts[5]==="merge") { const b=await body(req); return ok(res,await marketplaceDemand.mergeDemand(parts[4],b.targetDemandId,identity.sub,requestId),requestId); }
    if(req.method==="PATCH" && parts.length===6 && p.startsWith("api/v1/admin/marketplace-demand/") && parts[5]==="review") return ok(res,await marketplaceDemand.reviewDemand(parts[4],identity.sub,await body(req),requestId),requestId);
    if(req.method==="GET" && p==="api/v1/admin/marketplace-listings") { const q=query(req.url); return ok(res,await marketplaceDemand.listAdminListings(identity.sub,{q:q.get("q")||"",moderationStatus:q.get("moderationStatus")||"all",limit:q.get("limit")||"50",offset:q.get("offset")||"0"}),requestId); }
    if(req.method==="POST" && parts.length===7 && p.startsWith("api/v1/admin/marketplace-listings/") && parts[6]==="moderate") return ok(res,await marketplaceDemand.moderateListing(parts[4],parts[5],identity.sub,await body(req),requestId),requestId);
    if(req.method==="GET" && parts.length===6 && p.startsWith("api/v1/admin/marketplace-demand-topics/") && parts[5]==="summary") return ok(res,await marketplaceDemand.getDemandSummary(identity.sub,parts[4]),requestId);
    if(req.method==="POST" && p==="api/v1/services") return ok(res,await servicesMentorship.createServiceListing(identity.sub,await body(req),requestId,req.headers["x-idempotency-key"]),requestId,201);
    if(req.method==="PATCH" && parts.length===4 && p.startsWith("api/v1/services/")) return ok(res,await servicesMentorship.updateServiceListing(parts[3],identity.sub,await body(req),requestId),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/services/") && parts[4]==="status") { const b=await body(req); return ok(res,await servicesMentorship.changeServiceListingStatus(parts[3],identity.sub,b.status,requestId,b.reason),requestId); }
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/services/") && parts[4]==="announcements") return ok(res,await servicesMentorship.createServiceListingAnnouncement(parts[3],identity.sub,await body(req),requestId,req.headers["x-idempotency-key"]),requestId,201);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/service-listing-announcements/") && parts[4]==="status") { const b=await body(req); return ok(res,await servicesMentorship.changeServiceListingAnnouncementStatus(parts[3],identity.sub,b.status,b.reason,requestId),requestId); }
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/services/") && parts[4]==="interest") return ok(res,await servicesMentorship.createServiceListingInterest(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/services/") && parts[4]==="pledges") return ok(res,await servicesMentorship.createServiceListingPledge(parts[3],identity.sub,await body(req),requestId,req.headers["x-idempotency-key"]),requestId,201);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/service-listing-interests/") && parts[4]==="withdraw") { const b=await body(req); return ok(res,await servicesMentorship.withdrawServiceListingInterest(parts[3],identity.sub,b.reason,requestId),requestId); }
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/service-listing-pledges/") && parts[4]==="status") { const b=await body(req); return ok(res,await servicesMentorship.changeServiceListingPledgeStatus(parts[3],identity.sub,b.status,b.reason,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/me/service-listings") return ok(res,await servicesMentorship.listMyServiceListings(identity.sub),requestId);
    if(req.method==="GET" && p==="api/v1/me/service-listing-interest-summary") return ok(res,await servicesMentorship.listMyServiceListingInterestSummary(identity.sub),requestId);
    if(req.method==="GET" && p==="api/v1/me/service-listing-pledges") return ok(res,await servicesMentorship.listMyServiceListingPledges(identity.sub),requestId);
     if(req.method==="GET" && p==="api/v1/me/organization-mentorship-offers") return ok(res,await organizationMentorshipOffers.listMyOrganizationMentorshipOffers(identity.sub),requestId);
     if(req.method==="POST" && p==="api/v1/organization-mentorship-offers") return ok(res,await organizationMentorshipOffers.createOrganizationMentorshipOffer(identity.sub,await body(req),requestId),requestId,201);
     if(req.method==="PATCH" && parts.length===4 && p.startsWith("api/v1/organization-mentorship-offers/")) return ok(res,await organizationMentorshipOffers.updateOrganizationMentorshipOffer(parts[3],identity.sub,await body(req),requestId),requestId);
     if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/organization-mentorship-offers/") && parts[4]==="status") { const b=await body(req); return ok(res,await organizationMentorshipOffers.changeOrganizationMentorshipOfferStatus(parts[3],identity.sub,b.status,requestId),requestId); }
     if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/organization-mentorship-offers/") && parts[4]==="requests") return ok(res,await organizationMentorshipOffers.requestOrganizationMentorship(parts[3],identity.sub,await body(req),requestId),requestId,201);
     if(req.method==="GET" && p==="api/v1/me/organization-mentorship-requests") return ok(res,await organizationMentorshipOffers.listMyOrganizationMentorshipRequests(identity.sub),requestId);
     if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/organization-mentorship-requests/") && parts[4]==="status") { const b=await body(req); return ok(res,await organizationMentorshipOffers.respondOrganizationMentorshipRequest(parts[3],identity.sub,b.status,b.note,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/me/service-requests") return ok(res,await servicesMentorship.listMyServiceRequests(identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/services/") && parts[4]==="requests") return ok(res,await servicesMentorship.requestService(parts[3],identity.sub,await body(req),requestId,req.headers["x-idempotency-key"]),requestId,201);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/service-requests/") && parts[4]==="updates") return ok(res,await servicesMentorship.listServiceRequestUpdates(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/service-requests/") && parts[4]==="updates") return ok(res,await servicesMentorship.createServiceRequestUpdate(parts[3],identity.sub,await body(req),requestId,req.headers["x-idempotency-key"]),requestId,201);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/service-requests/") && parts[4]==="status") { const b=await body(req); return ok(res,await servicesMentorship.changeServiceRequestStatus(parts[3],identity.sub,b.status,b.note,requestId),requestId); }
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/service-requests/") && parts[4]==="agreement") return ok(res,await servicesMentorship.acceptServiceAgreement(parts[3],identity.sub,requestId),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/service-requests/") && parts[4]==="accept-completion") { const b=await body(req); return ok(res,await servicesMentorship.acceptServiceCompletion(parts[3],identity.sub,b.note,requestId),requestId); }
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/service-requests/") && parts[4]==="review-completion") return ok(res,await servicesMentorship.reviewServiceCompletion(parts[3],identity.sub,await body(req),requestId),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/service-requests/") && parts[4]==="payment") return ok(res,await servicesMentorship.submitServicePayment(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/service-payments/") && parts[4]==="verify") { anyRoleOrPermission(identity,["finance_officer","reviewer","system_admin"],["finance.manage"]); return ok(res,await servicesMentorship.verifyServicePayment(parts[3],identity.sub,await body(req),requestId),requestId); }
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/service-requests/") && parts[4]==="milestones") return ok(res,await servicesMentorship.listServiceMilestones(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/service-requests/") && parts[4]==="milestones") return ok(res,await servicesMentorship.createServiceMilestone(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/service-requests/") && parts[4]==="deliveries") return ok(res,await servicesMentorship.listServiceDeliveries(parts[3],identity.sub),requestId);
     if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/service-requests/") && parts[4]==="deliveries") return ok(res,await servicesMentorship.submitServiceDelivery(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/service-deliveries/") && parts[5]==="review") return ok(res,await servicesMentorship.reviewServiceDelivery(parts[4],identity.sub,await body(req),requestId),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/service-requests/") && parts[4]==="feedback") return ok(res,await servicesMentorship.submitServiceFeedback(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && p==="api/v1/mentors") { const q=query(req.url); return ok(res,await servicesMentorship.listMentors(identity.sub,{q:q.get("q"),topic:q.get("topic")}),requestId); }
    if(req.method==="GET" && p==="api/v1/me/mentor-profile") return ok(res,await servicesMentorship.getMyMentorProfile(identity.sub),requestId);
    if(req.method==="POST" && p==="api/v1/me/mentor-profile") return ok(res,await servicesMentorship.createMentorProfile(identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="PATCH" && parts.length===4 && p.startsWith("api/v1/mentor-profiles/")) return ok(res,await servicesMentorship.updateMentorProfile(parts[3],identity.sub,await body(req),requestId),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/mentor-profiles/") && parts[4]==="status") { const b=await body(req); return ok(res,await servicesMentorship.changeMentorStatus(parts[3],identity.sub,b.status,requestId),requestId); }
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/mentor-profiles/") && parts[4]==="circle") return ok(res,await mentorshipOperations.getMentorshipCircleSummary(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/mentor-profiles/") && parts[4]==="circle" && parts[5]==="join") return ok(res,await mentorshipOperations.joinMentorshipCircle(parts[3],identity.sub,requestId),requestId,201);
    if(req.method==="DELETE" && parts.length===6 && p.startsWith("api/v1/mentor-profiles/") && parts[4]==="circle" && parts[5]==="join") return ok(res,await mentorshipOperations.leaveMentorshipCircle(parts[3],identity.sub,requestId),requestId);
    if(req.method==="PUT" && parts.length===5 && p.startsWith("api/v1/mentor-profiles/") && parts[4]==="availability") return ok(res,await servicesMentorship.setMentorAvailability(parts[3],identity.sub,await body(req),requestId),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/mentor-profiles/") && parts[4]==="time-off") return ok(res,await servicesMentorship.addMentorTimeOff(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && p==="api/v1/me/mentorship-requests") return ok(res,await servicesMentorship.listMyMentorshipRequests(identity.sub),requestId);
    if(req.method==="GET" && p==="api/v1/me/mentorship-interest") return ok(res,await mentorshipOperations.listMentorshipInterestPool(identity.sub),requestId);
    if(req.method==="GET" && p==="api/v1/me/mentorship-operations") return ok(res,await mentorshipOperations.getMentorshipOperationalReport(identity.sub),requestId);
    if(req.method==="GET" && p==="api/v1/me/mentorship-reports") return ok(res,await mentorshipOperations.listMyMentorshipParticipantReports(identity.sub,{limit:query(req.url).get("limit")||50}),requestId);
    if(req.method==="GET" && p==="api/v1/admin/mentorship-reports") return ok(res,await mentorshipOperations.listMentorshipParticipantReports(identity.sub,{status:query(req.url).get("status")||"open",limit:query(req.url).get("limit")||25,offset:query(req.url).get("offset")||0}),requestId);
    if(req.method==="GET" && p==="api/v1/admin/service-mentorship-cases") { const params=query(req.url); return ok(res,await serviceMentorshipSupportCases.listSupportCases(identity.sub,{type:params.get("type")||"all",status:params.get("status")||"",q:params.get("q")||"",limit:params.get("limit")||25,offset:params.get("offset")||0},requestId),requestId); }
    if(req.method==="POST" && parts.length===7 && parts[2]==="admin" && parts[3]==="service-mentorship-cases" && parts[6]==="access") return ok(res,await serviceMentorshipSupportCases.openSupportCase(identity.sub,parts[4],parts[5],await body(req),requestId),requestId);
    if(req.method==="GET" && p==="api/v1/admin/mentorship-interest") return ok(res,await mentorshipOperations.listMentorshipInterestReviewQueue(identity.sub),requestId);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/mentorship-interest/") && parts[5]==="propose") return ok(res,await mentorshipOperations.proposeMentorshipInterestMatch(identity.sub,parts[4],requestId),requestId,201);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/admin/mentorship-interest/") && parts[5]==="review") return ok(res,await mentorshipOperations.markMentorshipInterestReviewed(identity.sub,parts[4],requestId),requestId);
    if(req.method==="PATCH" && parts.length===5 && p.startsWith("api/v1/admin/mentorship-reports/")) return ok(res,await mentorshipOperations.updateMentorshipParticipantReport(identity.sub,parts[4],await body(req),requestId),requestId);
    if(req.method==="GET" && p==="api/v1/me/mentorship-matches") return ok(res,await servicesMentorship.listMyMentorshipMatches(identity.sub),requestId);
    if(req.method==="GET" && p==="api/v1/me/mentorships") return ok(res,await servicesMentorship.listMyMentorships(identity.sub),requestId);
    if(req.method==="POST" && p==="api/v1/mentorship/requests") return ok(res,await servicesMentorship.createMentorshipRequest(identity.sub,await body(req),requestId,req.headers["x-idempotency-key"]),requestId,201);
    if(req.method==="PATCH" && parts.length===6 && p.startsWith("api/v1/mentorship/requests/") && parts[5]==="sharing") { const b=await body(req); return ok(res,await mentorshipOperations.setMentorshipRequestSharing(parts[4],identity.sub,b.enabled,requestId),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/mentorship/requests/") && parts[5]==="interest") return ok(res,await mentorshipOperations.registerMentorshipInterest(parts[4],identity.sub,requestId),requestId,201);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/mentorship/requests/")) return ok(res,await servicesMentorship.getMentorshipRequest(parts[4],identity.sub),requestId);
    if(req.method==="GET" && parts.length===6 && p.startsWith("api/v1/mentorship/requests/") && parts[5]==="matches") return ok(res,await servicesMentorship.findMentorMatches(parts[4],identity.sub),requestId);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/mentorship/requests/") && parts[5]==="match") { const b=await body(req); return ok(res,await servicesMentorship.proposeMentorMatch(parts[4],b.mentorUserId,identity.sub,requestId),requestId,201); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/mentorship/matches/") && parts[5]==="response") { const b=await body(req); return ok(res,await servicesMentorship.respondToMatch(parts[4],identity.sub,b.status,requestId),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/mentorship/matches/") && parts[5]==="mentee-response") { const b=await body(req); return ok(res,await servicesMentorship.respondToMenteeMatch(parts[4],identity.sub,b.status,b.note,requestId),requestId); }
    if(req.method==="GET" && parts.length===4 && p.startsWith("api/v1/mentorship/")) return ok(res,await servicesMentorship.getMentorship(parts[3],identity.sub),requestId);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/mentorship/") && parts[4]==="goals") return ok(res,await servicesMentorship.listMentorshipGoals(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/mentorship/") && parts[4]==="goals") return ok(res,await servicesMentorship.createMentorshipGoal(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="PATCH" && parts.length===4 && p.startsWith("api/v1/mentorship-goals/")) return ok(res,await servicesMentorship.updateMentorshipGoal(parts[3],identity.sub,await body(req),requestId),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/mentorship/") && parts[4]==="status") { const b=await body(req); return ok(res,await servicesMentorship.changeMentorshipStatus(parts[3],identity.sub,b.status,b.note,requestId),requestId); }
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/mentorship/") && parts[4]==="sessions") return ok(res,await servicesMentorship.listMentorshipSessions(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/mentorship/") && parts[4]==="sessions") return ok(res,await servicesMentorship.createMentorshipSession(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/mentorship/sessions/") && parts[5]==="response") { const b=await body(req); return ok(res,await mentorshipOperations.respondToSessionProposal(parts[4],identity.sub,b.status,b.note,requestId),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/mentorship/sessions/") && parts[5]==="change-proposals") { const b=await body(req); return ok(res,await mentorshipOperations.proposeMentorshipSessionChange(parts[4],identity.sub,b,requestId),requestId,201); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/mentorship/session-changes/") && parts[5]==="response") { const b=await body(req); return ok(res,await mentorshipOperations.respondToMentorshipSessionChange(parts[4],identity.sub,b.status,b.note,requestId),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/mentorship/sessions/") && parts[5]==="status") { const b=await body(req); return ok(res,await servicesMentorship.changeMentorshipSession(parts[4],identity.sub,b.status,b.notes,requestId),requestId); }
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/mentorship/") && parts[4]==="feedback") return ok(res,await servicesMentorship.submitMentorshipFeedback(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/mentorship/") && parts[4]==="reports") return ok(res,await mentorshipOperations.createMentorshipParticipantReport(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && p==="api/v1/me/outcomes") return ok(res,await stakeholderOutcomes.getMyOutcomeWorkspace(identity.sub),requestId);
    if(req.method==="GET" && parts.length===5 && p==="api/v1/support/job-seeker-demands/organizations") { const identity=await auth(req); return ok(res,await publicOpportunity.listShareableOrganizations(identity.sub),requestId); }
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/organizations/") && parts[4]==="job-seeker-demands") { const identity=await auth(req); return ok(res,await publicOpportunity.listSharedJobSeekerDemands(parts[3],identity.sub),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/support/job-seeker-demands/") && parts[5]==="share") { const identity=await auth(req); return ok(res,await publicOpportunity.shareJobSeekerDemand(parts[4],identity.sub,await body(req),requestId),requestId,201); }
    if(req.method==="GET" && p==="api/v1/me/job-interests") { const identity=await auth(req); return ok(res,await publicOpportunity.listMyMemberJobInterests(identity.sub),requestId); }
    if(req.method==="POST" && p==="api/v1/me/job-interests") { const identity=await auth(req); const b=await body(req); return ok(res,await publicOpportunity.createMemberJobInterest(identity.sub,b,requestId,req.headers["x-idempotency-key"]),requestId,201); }
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/me/job-interests/") && parts[4]!=="sharing-history" && parts[4]!=="sharing-consent") { const identity=await auth(req); return ok(res,await publicOpportunity.getMyMemberJobInterest(parts[4],identity.sub),requestId); }
    if(req.method==="GET" && parts.length===6 && p.startsWith("api/v1/me/job-interests/") && parts[5]==="sharing-history") { const identity=await auth(req); return ok(res,await publicOpportunity.getMyMemberJobInterestSharingHistory(parts[4],identity.sub),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/me/job-interests/") && parts[5]==="sharing-consent") { const identity=await auth(req); return ok(res,await publicOpportunity.updateMyMemberJobInterestConsent(parts[4],identity.sub,await body(req),requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/me/job-interest-sharing-organizations") { const identity=await auth(req); return ok(res,await publicOpportunity.searchMemberJobInterestOrganizations(identity.sub,query(req.url).get("q")||""),requestId); }
    if(req.method==="GET" && p==="api/v1/me/opportunity-inquiries") { const identity=await auth(req); return ok(res,await publicOpportunity.listMyLinkedInquiries(identity.sub),requestId); }
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/me/opportunity-inquiries/")) { const identity=await auth(req); return ok(res,await publicOpportunity.getLinkedInquiryDetails(parts[4],identity.sub),requestId); }
    if(req.method==="PATCH" && parts.length===5 && p.startsWith("api/v1/me/opportunity-inquiries/")) { const identity=await auth(req); return ok(res,await publicOpportunity.updateLinkedInquiryDetails(parts[4],identity.sub,await body(req),requestId),requestId); }
    if(req.method==="GET" && parts.length===6 && p.startsWith("api/v1/me/opportunity-inquiries/") && parts[5]==="sharing-history") { const identity=await auth(req); return ok(res,await publicOpportunity.getLinkedSharingHistory(parts[4],identity.sub),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/me/opportunity-inquiries/") && parts[5]==="sharing-consent") { const identity=await auth(req); return ok(res,await publicOpportunity.updateLinkedSharingConsent(parts[4],identity.sub,await body(req),requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/opportunity-inquiries") { const identity=await auth(req); return ok(res,await publicOpportunity.listInquiries(identity.sub,{type:query(req.url).get("type"),status:query(req.url).get("status")}),requestId); }
    if(req.method==="PATCH" && parts.length===4 && p.startsWith("api/v1/opportunity-inquiries/")) { const identity=await auth(req); const b=await body(req); return ok(res,await publicOpportunity.decideInquiry(parts[3],identity.sub,b,requestId,req.headers["x-idempotency-key"]),requestId); }
    if(req.method==="GET" && p==="api/v1/me/application-tracking") { const q=query(req.url); return ok(res,await applicationTracking.getApplicationTracking(identity.sub,{limit:q.get("limit")||undefined,offset:q.get("offset")||undefined,reference:q.get("reference")||undefined}),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/support/knowledge") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin","admin","platform_admin","supporting_staff"],["support.knowledge.manage","support.inquiries.manage"]); return ok(res,await supportBot.adminGetKnowledge(),requestId); }
    if(req.method==="POST" && p==="api/v1/admin/support/knowledge/categories") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin","admin","platform_admin"],["support.knowledge.manage"]); return ok(res,await supportBot.adminSaveCategory(identity.sub,await body(req),requestId),requestId,201); }
    if(req.method==="POST" && p==="api/v1/admin/support/knowledge/articles") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin","admin","platform_admin"],["support.knowledge.manage"]); return ok(res,await supportBot.adminSaveArticle(identity.sub,await body(req),requestId),requestId,201); }
     if(req.method==="GET" && p==="api/v1/admin/support/colleagues") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin","admin","platform_admin"],["support.inquiries.manage"]); return ok(res,await supportBot.adminListSupportColleagues(identity.sub),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/support/inquiries") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin","admin","platform_admin","supporting_staff"],["support.inquiries.view","support.inquiries.manage"]); const q=query(req.url); const roles=Array.isArray(identity.roles)?identity.roles:[]; const permissions=Array.isArray(identity.permissions)?identity.permissions:[]; const canViewAll=["system_admin","admin","platform_admin"].some(role=>roles.includes(role))||permissions.includes("support.inquiries.manage"); return ok(res,await supportBot.adminListConversations({actorId:identity.sub,canViewAll,status:q.get("status"),escalatedOnly:q.get("status")==="escalated",limit:q.get("limit")||"50",offset:q.get("offset")||"0",q:q.get("q")||""}),requestId); }
    if(req.method==="PATCH" && parts.length===6 && parts[0]==="api" && parts[1]==="v1" && parts[2]==="admin" && parts[3]==="support" && parts[4]==="inquiries") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin","admin","platform_admin","supporting_staff"],["support.inquiries.manage"]); const roles=Array.isArray(identity.roles)?identity.roles:[]; const permissions=Array.isArray(identity.permissions)?identity.permissions:[]; const canManageAll=["system_admin","admin","platform_admin"].some(role=>roles.includes(role))||permissions.includes("support.inquiries.manage"); return ok(res,await supportBot.adminUpdateConversation(identity.sub,parts[5],await body(req),requestId,canManageAll),requestId); }
     if(req.method==="POST" && parts.length===7 && parts[0]==="api" && parts[1]==="v1" && parts[2]==="admin" && parts[3]==="support" && parts[4]==="inquiries" && parts[6]==="escalate") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin","admin","platform_admin","supporting_staff"],["support.inquiries.manage"]); const roles=Array.isArray(identity.roles)?identity.roles:[]; const permissions=Array.isArray(identity.permissions)?identity.permissions:[]; const canManageAll=["system_admin","admin","platform_admin"].some(role=>roles.includes(role))||permissions.includes("support.inquiries.manage"); return ok(res,await supportBot.escalateConversation(identity.sub,parts[5],await body(req),requestId,canManageAll),requestId); }
    if(req.method==="POST" && parts.length===7 && parts[0]==="api" && parts[1]==="v1" && parts[2]==="admin" && parts[3]==="support" && parts[4]==="inquiries" && parts[6]==="reply") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin","admin","platform_admin","supporting_staff"],["support.inquiries.manage"]); const roles=Array.isArray(identity.roles)?identity.roles:[]; const permissions=Array.isArray(identity.permissions)?identity.permissions:[]; const canManageAll=["system_admin","admin","platform_admin"].some(role=>roles.includes(role))||permissions.includes("support.inquiries.manage"); return ok(res,await supportBot.adminReplyToConversation(identity.sub,parts[5],await body(req),requestId,canManageAll),requestId,201); }
    if(req.method==="GET" && p==="api/v1/membership/card") { const identity=await auth(req); return ok(res,await membershipCard.getMyMembershipCard(identity.sub),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/membership-card") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin","reviewer"],["members.view","members.manage"]); return ok(res,await membershipCard.getMembershipCardForAdmin(query(req.url).get("membershipNumber"),identity.sub,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/membership-cards/eligible") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin","reviewer"],["members.view","members.manage"]); const q=query(req.url); return ok(res,await membershipCard.listEligibleMembershipCardsForAdmin({q:q.get("q")||"",limit:q.get("limit")||50,offset:q.get("offset")||0}),requestId); }
    if(req.method==="POST" && p==="api/v1/admin/membership-cards/batch") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin","reviewer"],["members.view","members.manage"]); const b=await body(req); return ok(res,await membershipCard.getMembershipCardsForAdmin(b.membershipNumbers,identity.sub,requestId),requestId); }
    if(req.method==="POST" && p==="api/v1/admin/membership-cards/print") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin","reviewer"],["members.view","members.manage"]); const b=await body(req); return ok(res,await membershipCard.recordMembershipCardsPrintRequest(b.batchReference,identity.sub,requestId),requestId); }
    if(req.method==="PATCH" && p==="api/v1/me/profile-picture") { const identity=await auth(req); return ok(res,await membershipCard.setMyProfilePicture(identity.sub,(await body(req)).fileObjectId,requestId),requestId); }
    if(req.method==="DELETE" && p==="api/v1/me/profile-picture") { const identity=await auth(req); return ok(res,await membershipCard.removeMyProfilePicture(identity.sub,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/audit-log") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin"],["audit.view"]); const q=query(req.url); return ok(res,await adminAudit.listAdminAuditEvents({action:q.get("action"),resourceType:q.get("resourceType"),limit:q.get("limit")||"50",offset:q.get("offset")||"0"}),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/membership-card-settings") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin","admin","platform_admin"],["members.manage"]); return ok(res,await membershipCard.getMembershipCardSettings(),requestId); }
    if(req.method==="PATCH" && p==="api/v1/admin/membership-card-settings") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin"],["members.manage"]); return ok(res,await membershipCard.updateMembershipCardSettings(identity.sub,await body(req),requestId),requestId); }
    if(req.method==="POST" && parts.length===6 && parts[0]==="api" && parts[1]==="v1" && parts[2]==="admin" && parts[3]==="membership-records" && parts[5]==="rotate-verification") { const identity=await auth(req); anyRoleOrPermission(identity,["system_admin"],["members.manage"]); return ok(res,await membershipCard.rotateMembershipCardVerification(parts[4],identity.sub,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/me") return ok(res,{...(await membership.getMe(identity.sub)),permissions:identity.permissions||[],credential_setup_required:identity.credential_setup_required===true},requestId);
    if(req.method==="PATCH" && p==="api/v1/me/account") return ok(res,await accountSecurity.updateOwnCredentials(identity,await body(req),requestId),requestId);
    if(req.method==="PATCH" && p==="api/v1/me/profile") return ok(res,await membership.updateProfile(identity.sub,await body(req),requestId),requestId);
    if(req.method==="GET" && p==="api/v1/membership/history") return ok(res,await membership.history(identity.sub),requestId);
    if(req.method==="GET" && p==="api/v1/membership/applications/me") return ok(res,await membership.listMyApplications(identity.sub),requestId);
    if(req.method==="GET" && p==="api/v1/notifications/campaign-preferences") { const identity=await auth(req); const r=await getPool().query("select community_campaign_enabled from notification_preference where user_id=$1",[identity.sub]); return ok(res,{communityCampaignEnabled:Boolean(r.rows[0]?.community_campaign_enabled)},requestId); }
    if(req.method==="PATCH" && p==="api/v1/notifications/campaign-preferences") { const identity=await auth(req); const b=await body(req); const enabled=b.communityCampaignEnabled===true; await getPool().query("insert into notification_preference(user_id,community_campaign_enabled,updated_at) values($1,$2,now()) on conflict(user_id) do update set community_campaign_enabled=excluded.community_campaign_enabled,updated_at=now()",[identity.sub,enabled]); return ok(res,{communityCampaignEnabled:enabled},requestId); }
    if(req.method==="GET" && p==="api/v1/admin/community-campaigns/messages") { const identity=await auth(req); anyRole(identity,["system_admin","admin","platform_admin"]); return ok(res,await communityCampaigns.listCampaignMessages(),requestId); }
    if(req.method==="POST" && p==="api/v1/admin/community-campaigns/messages") { const identity=await auth(req); anyRole(identity,["system_admin","admin","platform_admin"]); return ok(res,await communityCampaigns.saveCampaignMessage(identity.sub,await body(req),requestId),requestId,201); }
    if(req.method==="POST" && parts.length===7 && p.startsWith("api/v1/admin/community-campaigns/messages/") && parts[6]==="submit") { const identity=await auth(req); anyRole(identity,["system_admin","admin","platform_admin"]); return ok(res,await communityCampaigns.submitCampaignMessage(identity.sub,parts[5],requestId),requestId); }
    if(req.method==="POST" && parts.length===7 && p.startsWith("api/v1/admin/community-campaigns/messages/") && parts[6]==="decision") { const identity=await auth(req); anyRole(identity,["system_admin","admin","platform_admin"]); const b=await body(req); return ok(res,await communityCampaigns.decideCampaignMessage(identity.sub,parts[5],b.decision,b.note,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/community-campaigns/schedules") { const identity=await auth(req); anyRole(identity,["system_admin","admin","platform_admin"]); return ok(res,await communityCampaigns.getCampaignSchedules(),requestId); }
    if(req.method==="PATCH" && parts.length===6 && p.startsWith("api/v1/admin/community-campaigns/schedules/")) { const identity=await auth(req); anyRole(identity,["system_admin","admin","platform_admin"]); return ok(res,await communityCampaigns.updateCampaignSchedule(identity.sub,parts[5],await body(req),requestId),requestId); }
    if(req.method==="POST" && p==="api/v1/admin/community-campaigns/pause") { const identity=await auth(req); anyRole(identity,["system_admin","admin","platform_admin"]); return ok(res,await communityCampaigns.pauseCampaign(identity.sub,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/admin/community-campaigns/monitoring") { const identity=await auth(req); anyRole(identity,["system_admin","admin","platform_admin"]); return ok(res,await communityCampaigns.getCampaignMonitoring(),requestId); }
    if(req.method==="GET" && p==="api/v1/notifications/push/public-key") return ok(res,getWebPushPublicConfiguration(),requestId);
    if(req.method==="GET" && p==="api/v1/notifications/push/status") return ok(res,await getPushSubscriptionStatus(identity.sub),requestId);
    if(req.method==="POST" && p==="api/v1/notifications/push/subscriptions") return ok(res,await registerPushSubscription(identity.sub,await body(req)),requestId,201);
    if(req.method==="DELETE" && p==="api/v1/notifications/push/subscriptions") { const b=await body(req); return ok(res,await removePushSubscription(identity.sub,b.endpoint),requestId); }
    if(req.method==="GET" && p==="api/v1/notifications") { const q=query(req.url); return ok(res,await notifications.getNotificationInbox(identity.sub,{category:q.get("category")||"all",unreadOnly:q.get("unreadOnly")||"false",actionRequired:q.get("actionRequired")||"false",limit:q.get("limit")||30,offset:q.get("offset")||0}),requestId); }
     if(req.method==="POST" && p==="api/v1/notifications/read-all") return ok(res,await notifications.markAllNotificationsRead(identity.sub,requestId),requestId);
     if(req.method==="PATCH" && parts.length===5 && p.startsWith("api/v1/notifications/") && parts[4]==="read") return ok(res,await notifications.markNotificationRead(identity.sub,parts[3],requestId),requestId);
     if(req.method==="PATCH" && parts.length===5 && p.startsWith("api/v1/notifications/") && parts[4]==="archive") return ok(res,await notifications.archiveNotification(identity.sub,parts[3],requestId),requestId);
     if(req.method==="GET" && p==="api/v1/notifications/preferences") return ok(res,await membership.notificationPreferences(identity.sub),requestId);
    if(req.method==="PATCH" && p==="api/v1/notifications/preferences") { const b=await body(req); if(b.pushEnabled===false)await disablePushForUser(identity.sub); return ok(res,await membership.notificationPreferences(identity.sub,b),requestId); }
    if(req.method==="POST" && p==="api/v1/payments/chapa/verify") { const identity=await auth(req); requireRole(identity,"member"); const b=await body(req); return ok(res,await membership.verifyChapaMembershipPayment(b.merchantReference,requestId,identity.sub),requestId); }
     if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/membership/applications/") && parts[5]==="chapa-checkout") { const identity=await auth(req); requireRole(identity,"member"); return ok(res,await membership.initiateChapaMembershipPayment(parts[4],identity.sub,await body(req),requestId),requestId,201); }
     if(req.method==="POST" && p==="api/v1/membership/applications") {
      requireRole(identity,"member"); return ok(res,await membership.createApplication(identity.sub,await body(req),requestId),requestId,201);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/membership/applications/") && parts[5]==="review") {
      assertMembershipReviewAccess(identity); return ok(res,await membership.reviewApplication(parts[4],identity.sub,await body(req),requestId),requestId);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/membership/applications/") && parts[5]==="correction") {
      requireRole(identity,"member"); return ok(res,await membership.respondCorrection(parts[4],identity.sub,await body(req),requestId),requestId);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/membership/applications/") && parts[5]==="attachments") {
      requireRole(identity,"member"); return ok(res,await membership.attachApplicationFile(parts[4],identity.sub,await body(req),requestId),requestId,201);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/membership/applications/") && parts[5]==="payment") {
      requireRole(identity,"member"); const b=await body(req); return ok(res,await membership.createManualPayment(parts[4],identity.sub,b,requestId),requestId,201);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/membership/applications/") && parts[5]==="activate") {
      assertMembershipActivationAccess(identity); return ok(res,await membership.activateApplication(parts[4],identity.sub,requestId),requestId);
    }
    if(req.method==="POST" && p==="api/v1/membership/renew") {
      requireRole(identity,"member"); const b=await body(req); return ok(res,await membership.renew(identity.sub,b.productCode,requestId,b.termsAcknowledged===true,b.idempotencyKey),requestId,201);
    }
    if(req.method==="POST" && parts.length===5 && parts[0]==="api" && parts[1]==="v1" && parts[2]==="payments" && parts[4]==="verify") {
      assertPaymentVerificationAccess(identity); return ok(res,await membership.verifyPayment(parts[3],identity.sub,await body(req),requestId),requestId);
    }
    if(req.method==="POST" && parts.length===5 && parts[0]==="api" && parts[1]==="v1" && parts[2]==="payments" && parts[4]==="reverse") {
      assertPaymentReversalAccess(identity);
      return ok(res,await membership.reverseMembershipPayment(parts[3],identity.sub,await body(req),requestId),requestId);
    }
    if(req.method==="GET" && p==="api/v1/finance/payer-search") { const identity=await auth(req); return ok(res,await financeReceipts.searchFinancePayers(identity,query(req.url).get("q")||""),requestId); }
    if(req.method==="GET" && p==="api/v1/finance/organization-search") { const identity=await auth(req); return ok(res,await financeReceipts.searchFinanceOrganizations(identity,query(req.url).get("q")||""),requestId); }
    if(req.method==="GET" && p==="api/v1/finance/receipts") { const identity=await auth(req),q=query(req.url); return ok(res,await financeReceipts.listManualFinancePayments(identity,{q:q.get("q")||"",status:q.get("status")||"",limit:q.get("limit")||50,offset:q.get("offset")||0}),requestId); }
    if(req.method==="POST" && p==="api/v1/finance/receipts") { const identity=await auth(req); return ok(res,await financeReceipts.recordManualFinancePayment(identity,await body(req),requestId),requestId,201); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/finance/receipts/") && parts[5]==="decision") { const identity=await auth(req); return ok(res,await financeReceipts.decideManualFinancePayment(identity,parts[4],await body(req),requestId),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/finance/receipts/") && parts[5]==="reverse") { const identity=await auth(req); return ok(res,await financeReceipts.reverseManualFinancePayment(identity,parts[4],(await body(req)).reason,requestId),requestId); }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/finance/receipts/") && parts[5]==="voucher") { const identity=await auth(req); return ok(res,await financeReceipts.issueFinancePaymentVoucher(identity,parts[4],requestId),requestId,201); }
    if(req.method==="POST" && parts.length===7 && p.startsWith("api/v1/finance/membership/payments/") && parts[6]==="voucher") { const identity=await auth(req); return ok(res,await financeReceipts.issueVerifiedMembershipPaymentVoucher(identity,parts[5],requestId),requestId,201); }
    if(req.method==="GET" && p==="api/v1/finance/membership/payments") { const identity=await auth(req); assertFinancePaymentQueueAccess(identity); return ok(res,await membership.listMembershipPaymentsForFinance(),requestId); }
    if(req.method==="GET" && p==="api/v1/review/membership/applications") {
      assertMembershipReviewQueueAccess(identity);
      return ok(res,await membership.listApplicationsForReview(),requestId);
    }

    if(req.method==="GET" && p==="api/v1/professional-reference-data") return ok(res,await referencePortfolio.listPublicReferenceSets(),requestId);
    if(req.method==="GET" && p==="api/v1/me/cv") return ok(res,await talent.getMyCv(identity.sub),requestId);
    if(req.method==="PATCH" && p==="api/v1/me/cv") { const b=await body(req); return ok(res,await talent.saveMyCv(identity.sub,b.fileObjectId||null,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/me/cv/shares") return ok(res,await talent.listMyCvShares(identity.sub),requestId);
    if(req.method==="POST" && p==="api/v1/me/cv/share") { const b=await body(req); return ok(res,await talent.shareMyCvWithApplication(identity.sub,b.applicationId,requestId),requestId,201); }
    if(req.method==="DELETE" && p==="api/v1/me/cv/share") { const b=await body(req); return ok(res,await talent.revokeMyCvShare(identity.sub,b.applicationId,requestId),requestId); }
    if(req.method==="GET" && p==="api/v1/me/education") return ok(res,await talent.getProfessionalEducation(identity.sub),requestId);
    if(req.method==="PUT" && p==="api/v1/me/education") return ok(res,await talent.saveProfessionalEducation(identity.sub,await body(req),requestId),requestId);
    if(req.method==="GET" && p==="api/v1/me/portfolio") return ok(res,await talent.getProfessionalPortfolio(identity.sub),requestId);
    if(req.method==="POST" && p==="api/v1/me/portfolio") return ok(res,await talent.saveProfessionalPortfolioItem(identity.sub,await body(req),requestId,null),requestId,201);
    if(req.method==="PATCH" && parts.length===5 && p.startsWith("api/v1/me/portfolio/")) return ok(res,await talent.saveProfessionalPortfolioItem(identity.sub,await body(req),requestId,parts[4]),requestId);
    if(req.method==="DELETE" && parts.length===5 && p.startsWith("api/v1/me/portfolio/")) return ok(res,await talent.deleteProfessionalPortfolioItem(identity.sub,parts[4],requestId),requestId);
    if(req.method==="GET" && p==="api/v1/me/talent-profile") return ok(res,await talent.getProfessionalProfile(identity.sub),requestId);
    if(req.method==="PATCH" && p==="api/v1/me/talent-profile") return ok(res,await talent.updateProfessionalProfile(identity.sub,await body(req),requestId),requestId);
    if(req.method==="GET" && p==="api/v1/me/talent-visibility") return ok(res,await talent.getVisibility(identity.sub),requestId);
    if(req.method==="PATCH" && p==="api/v1/me/talent-visibility") return ok(res,await talent.updateVisibility(identity.sub,await body(req),requestId),requestId);
    if(req.method==="POST" && p==="api/v1/talent/saved-searches") return ok(res,await talent.saveSearch(identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && p==="api/v1/talent/saved-searches") return ok(res,await talent.listSavedSearches(identity.sub),requestId);
    if(req.method==="POST" && p==="api/v1/talent/inquiries") return ok(res,await talent.createTalentInquiry(identity.sub,await body(req),requestId,req.headers["x-idempotency-key"]),requestId,201);
    if(req.method==="GET" && p==="api/v1/talent/inquiries") return ok(res,await talent.listTalentInquiries(identity.sub),requestId);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/talent/inquiries/") && parts[5]==="response") return ok(res,await talent.respondToTalentInquiry(parts[4],identity.sub,await body(req),requestId),requestId);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/talent/inquiries/") && parts[5]==="close") return ok(res,await talent.closeTalentInquiry(parts[4],identity.sub,requestId),requestId);

    if(req.method==="POST" && p==="api/v1/ethics/cases") return ok(res,await ethics.createEthicsCase(identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="GET" && p==="api/v1/me/ethics/cases") return ok(res,await ethics.listMyEthicsCases(identity.sub),requestId);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/ethics/cases/") && parts[5]==="evidence") return ok(res,await ethics.addEthicsCaseEvidence(parts[4],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/ethics/cases/") && parts[5]==="respond") return ok(res,await ethics.submitEthicsRespondentResponse(parts[4],identity.sub,await body(req),requestId),requestId);
    if(req.method==="GET" && p==="api/v1/review/ethics/cases") { const q=query(req.url); return ok(res,await ethics.listEthicsCases(identity.sub,{status:q.get("status"),severity:q.get("severity"),limit:q.get("limit")}),requestId); }
    if(req.method==="GET" && p==="api/v1/review/ethics/reviewers") return ok(res,await ethics.listEthicsReviewers(identity.sub),requestId);
    if(req.method==="GET" && parts.length===6 && p.startsWith("api/v1/review/ethics/cases/")) return ok(res,await ethics.getEthicsCase(parts[5],identity.sub),requestId);
    if(req.method==="PATCH" && parts.length===6 && p.startsWith("api/v1/review/ethics/cases/")) return ok(res,await ethics.updateEthicsCase(parts[5],await body(req),identity.sub,requestId),requestId);
    if(req.method==="POST" && parts.length===7 && p.startsWith("api/v1/review/ethics/cases/") && parts[6]==="assign") { const b=await body(req); return ok(res,await ethics.assignEthicsCase(parts[5],b.reviewerId,identity.sub,b.reason,requestId),requestId); }
    if(req.method==="POST" && parts.length===7 && p.startsWith("api/v1/review/ethics/cases/") && parts[6]==="panel") { const b=await body(req); return ok(res,await ethics.assignEthicsPanelMember(parts[5],b.reviewerId,identity.sub,b.reason,requestId),requestId); }
    if(req.method==="POST" && parts.length===7 && p.startsWith("api/v1/review/ethics/cases/") && parts[6]==="conflict") { const b=await body(req); return ok(res,await ethics.declareEthicsConflict(parts[5],identity.sub,b.reason,requestId),requestId); }
    if(req.method==="POST" && parts.length===7 && p.startsWith("api/v1/review/ethics/cases/") && parts[6]==="review") { const b=await body(req); return ok(res,await ethics.recordEthicsReview(parts[5],b,identity.sub,requestId),requestId); }
    if(req.method==="POST" && parts.length===7 && p.startsWith("api/v1/review/ethics/cases/") && parts[6]==="decision") { const b=await body(req); return ok(res,await ethics.decideEthicsCase(parts[5],b,identity.sub,requestId),requestId); }

    if(req.method==="GET" && p==="api/v1/me/volunteer-pledges") return ok(res,await volunteerPledges.listMyVolunteerPledges(identity.sub),requestId);
    if(req.method==="POST" && p==="api/v1/me/volunteer-pledges") return ok(res,await volunteerPledges.saveVolunteerPledge(identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="PATCH" && parts.length===5 && p.startsWith("api/v1/me/volunteer-pledges/")) return ok(res,await volunteerPledges.updateVolunteerPledge(parts[4],identity.sub,await body(req),requestId),requestId);
    if(req.method==="DELETE" && parts.length===5 && p.startsWith("api/v1/me/volunteer-pledges/")) return ok(res,await volunteerPledges.withdrawVolunteerPledge(parts[4],identity.sub,requestId),requestId);

    if(req.method==="GET" && p==="api/v1/verification/programs") return ok(res,await verification.listPrograms(),requestId);
    if(req.method==="GET" && p==="api/v1/verification/claim-types") return ok(res,await verification.listClaimTypes(),requestId);
    if(req.method==="GET" && p==="api/v1/me/verification/cases") return ok(res,await verification.listCases({viewerId:identity.sub,subjectUserId:identity.sub}),requestId);
    if(req.method==="GET" && p==="api/v1/me/verification/reference-requests") return ok(res,await verification.listMyReferenceRequests(identity.sub),requestId);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/verification/cases/") && parts[5]==="references") return ok(res,await verification.requestReference(parts[4],await body(req),identity.sub,requestId),requestId,201);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/verification/reference-requests/") && parts[5]==="respond") return ok(res,await verification.respondReferenceRequest(parts[4],await body(req),identity.sub,requestId),requestId);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/verification/reference-requests/") && parts[5]==="review") return ok(res,await verification.reviewReferenceRequest(parts[4],await body(req),identity.sub,requestId),requestId);
    if(req.method==="POST" && p==="api/v1/verification/cases"){
      const b=await body(req);
      if(b.subjectUserId && b.subjectUserId!==identity.sub) anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]);
      else requireRole(identity,"member");
      return ok(res,await verification.createCase(b.subjectUserId||identity.sub,b.programCode,identity.sub,requestId),requestId,201);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/verification/cases/") && parts[5]==="consent"){ const b=await body(req); return ok(res,await verification.giveConsent(parts[4],identity.sub,b.consentVersion,requestId),requestId); }
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/verification/cases/")){
      const c=await verification.getCase(parts[4],identity.sub);
      return ok(res,c,requestId);
    }
    if(req.method==="GET" && p==="api/v1/review/verification/appeals") return ok(res,await verification.listAppealsForReview(identity.sub),requestId);
    if(req.method==="GET" && p==="api/v1/review/verification/cases"){
      anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]);
      const q=query(req.url);
      return ok(res,await verification.listCases({viewerId:identity.sub,status:q.get("status"),programCode:q.get("programCode"),reviewerId:q.get("reviewerId"),limit:q.get("limit"),offset:q.get("offset")}),requestId);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/verification/cases/") && parts[5]==="assign"){
      anyRoleOrPermission(identity,["system_admin"],["verification.manage"]); const b=await body(req);
      return ok(res,await verification.assignCase(parts[4],b.reviewerId,identity.sub,requestId,b.reason||"Assignment updated"),requestId);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/verification/cases/") && parts[5]==="transition"){
      anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]); const b=await body(req);
      return ok(res,await verification.transitionCase(parts[4],b.status,identity.sub,requestId),requestId);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/verification/cases/") && parts[5]==="claims"){
      const b=await body(req); const c=await verification.getCase(parts[4],identity.sub);
      if(c.subject_user_id!==identity.sub) anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]);
      return ok(res,await verification.addClaim(parts[4],b.claimTypeCode,b.claimedValue,identity.sub,requestId),requestId,201);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/verification/cases/") && parts[5]==="evidence"){
      const b=await body(req); const c=await verification.getCase(parts[4],identity.sub);
      if(c.subject_user_id!==identity.sub) anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]);
      return ok(res,await verification.addEvidence(parts[4],b,identity.sub,requestId),requestId,201);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/verification/cases/") && parts[5]==="decision"){
      anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]);
      return ok(res,await verification.decide(parts[4],await body(req),identity.sub,requestId),requestId);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/verification/cases/") && parts[5]==="response") return ok(res,await verification.memberResponse(parts[4],await body(req),identity.sub,requestId),requestId);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/verification/cases/") && parts[5]==="appeal") return ok(res,await verification.submitAppeal(parts[4],await body(req),identity.sub,requestId),requestId,201);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/verification/appeals/") && parts[4]==="decision"){
      anyRoleOrPermission(identity,["appeal_reviewer","system_admin"],["verification.appeal.review"]);
      return ok(res,await verification.decideAppeal(parts[3],await body(req),identity.sub,requestId),requestId);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/verification/cases/") && parts[5]==="claim-status"){
      anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]); const b=await body(req);
      return ok(res,await verification.setClaimStatus(b.claimId,b.status,identity.sub,requestId,parts[4]),requestId);
    }
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/verification/cases/") && parts[5]==="check-results"){
      anyRoleOrPermission(identity,["verification_reviewer","system_admin"],["verification.manage"]); const b=await body(req);
      return ok(res,await verification.recordCheckResult(parts[4],b.checklistItemId,b,identity.sub,requestId),requestId);
    }

    if(req.method==="GET" && p==="api/v1/review/jobs") { anyRoleOrPermission(identity,["reviewer","system_admin"],["jobs.review"]); return ok(res,await organizationJobs.listJobsForReview(identity.sub),requestId); }
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/review/jobs/") && parts[4]==="decision") { anyRoleOrPermission(identity,["reviewer","system_admin"],["jobs.review"]); return ok(res,await organizationJobs.reviewJob(parts[3],identity.sub,await body(req),requestId),requestId); }
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="eligibility") return ok(res,await organizationJobs.evaluateEligibility(parts[3],identity.sub),requestId);
    if(req.method==="PATCH" && parts.length===4 && p.startsWith("api/v1/jobs/")) return ok(res,await organizationJobs.updateJob(parts[3],identity.sub,await body(req),requestId),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="publish") return ok(res,await organizationJobs.publishJob(parts[3],identity.sub,requestId),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="status") { const b=await body(req); return ok(res,await organizationJobs.changeJobStatus(parts[3],identity.sub,b.status,requestId),requestId); }
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="candidates") return ok(res,await organizationJobs.listCandidates(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="application-drafts") return ok(res,await organizationJobs.saveApplicationDraft(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/jobs/") && parts[4]==="apply") return ok(res,await organizationJobs.applyToJob(parts[3],identity.sub,await body(req),requestId),requestId,201);
    if(req.method==="PATCH" && parts.length===4 && p.startsWith("api/v1/job-applications/")) return ok(res,await organizationJobs.updateApplicationDraft(parts[3],identity.sub,await body(req),requestId),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/job-applications/") && parts[4]==="submit") return ok(res,await organizationJobs.submitApplication(parts[3],identity.sub,await body(req),requestId),requestId);
    if(req.method==="GET" && p==="api/v1/me/job-applications") return ok(res,await organizationJobs.listMyApplications(identity.sub),requestId);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/job-applications/") && parts[4]==="progress") return ok(res,await organizationJobs.getMyApplicationProgress(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===6 && p.startsWith("api/v1/jobs/") && parts[4]==="candidates") { return ok(res,await organizationJobs.updateCandidate(parts[3],parts[5],identity.sub,await body(req),requestId),requestId); }
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/job-applications/") && parts[4]==="offer-approval") return ok(res,await organizationJobs.approveJobOffer(parts[3],identity.sub,await body(req),requestId),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/job-applications/") && parts[4]==="respond") return ok(res,await organizationJobs.respondToJobApplication(parts[3],identity.sub,await body(req),requestId),requestId);
    if(req.method==="GET" && parts.length===5 && p.startsWith("api/v1/job-applications/") && parts[4]==="attachments") return ok(res,await organizationJobs.listApplicationAttachments(parts[3],identity.sub),requestId);
    if(req.method==="POST" && parts.length===5 && p.startsWith("api/v1/job-applications/") && parts[4]==="attachments") return ok(res,await organizationJobs.addApplicationAttachment(parts[3],identity.sub,await body(req),requestId),requestId,201);
    return json(res,404,{error:{code:"NOT_FOUND",message:"Route not found."}},requestId);
  } catch(error) {
    const status=error.statusCode||500;
    logger.error("http.error",{requestId,error:error.message,code:error.code,status});
    return json(res,status,{error:{code:error.code||"INTERNAL_ERROR",message:status>=500?"Internal server error.":error.message}},requestId);
  }
});
// Bounded, unref'd expiry worker. The batch uses row locks so concurrent instances can safely share the work.
let membershipExpiryRunning=false;
async function runMembershipExpiry(){
  if(membershipExpiryRunning)return;
  membershipExpiryRunning=true;
  try {
    const result=await membership.expireDueMemberships(process.env.MEMBERSHIP_EXPIRY_BATCH_SIZE||500);
    if(result.expiredCount)logger.info("membership.expiry.completed",{expiredCount:result.expiredCount});
  } catch(error) {
    logger.warn("membership.expiry.failed",{error:error.message,code:error.code||"MEMBERSHIP_EXPIRY_FAILED"});
  } finally { membershipExpiryRunning=false; }
}
const membershipExpiryTimer=setInterval(()=>void runMembershipExpiry(),60*60*1000);
membershipExpiryTimer.unref();
// Bounded, unref'd dispatcher. Row-level locking in the outbox service coordinates multiple instances.
let emailWorkerRunning=false;
const testLabExpiryTimer=setInterval(async()=>{ try{const result=await testLab.expireTestPortfolioAccounts();if(result.expired)logger.info("test_lab.accounts.expired",{expired:result.expired});}catch(error){logger.warn("test_lab.expiry.failed",{code:error.code||"TEST_LAB_EXPIRY_FAILED"});} },10*60*1000);
testLabExpiryTimer.unref();
const emailWorkerTimer=setInterval(async()=>{
  if(emailWorkerRunning)return;
  emailWorkerRunning=true;
  try { const result=process.env.TEST_DELIVERY_MODE==="capture"&&config.nodeEnv!=="production"?await emailOperations.dispatchEmailOutbox(null,{limit:20,system:true}):await emailOperations.dispatchPendingSystemEmail(); if(result.processed)logger.info("email.outbox.dispatched",{processed:result.processed,mode:result.mode||"provider"}); }
  catch(error){ logger.warn("email.outbox.dispatch_failed",{error:error.message,code:error.code||"EMAIL_DISPATCH_FAILED"}); }
  finally { emailWorkerRunning=false; }
},30000);
emailWorkerTimer.unref();
server.listen(config.port,config.host,async()=>{ try { await bootstrapAdmin(); void runMembershipExpiry(); void testLab.expireTestPortfolioAccounts(); logger.info("server.started",{host:config.host,port:config.port,environment:config.nodeEnv,bootstrapAdmin:Boolean(config.bootstrapAdminEmail)}); } catch(error){ logger.error("bootstrap.admin.failed",{error:error.message}); if(config.nodeEnv==="production") process.exitCode=1; } });
export { server };

