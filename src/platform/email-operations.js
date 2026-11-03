import { createHmac, timingSafeEqual } from "node:crypto";
import { getPool, withTransaction } from "./db.js";
import { classifyEmailDeliveryError, emailIdempotencyKey, emailRetryDelaySeconds } from "./email-retry-policy.js";
import { renderBrandedEmail } from "./email-template.js";
import { retryVerificationDelivery } from "./email-verification.js";
import { createInAppNotification } from "./notifications.js";
import { captureTestDelivery } from "./test-lab-delivery.js";
import { emailAudienceMatches, emailWorkflowEventKey, normalizeEmailAddress } from "./email-event-idempotency.js";

function fail(status,message,code="BUSINESS_RULE"){throw Object.assign(new Error(message),{statusCode:status,code});}
async function requireAdmin(db,actorId){
 const roles=(await db.query("select r.role_code from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1",[actorId])).rows.map(x=>x.role_code);
 if(!roles.includes("system_admin"))fail(403,"System administrator access is required for email operations.","FORBIDDEN");
}
const clean=(v,max=2000)=>String(v??"").trim().slice(0,max);
function render(template,vars,{html=false}={}){
 return String(template||"").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,(_,key)=>{
  const value=String(vars?.[key]??"");
  return html?value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/\u0027/g,"&#39;"):value;
 });
}
function providerConfig(){
 const apiKey=clean(process.env.RESEND_API_KEY,500),from=clean(process.env.EMAIL_FROM,320);
 const endpoint=clean(process.env.EMAIL_DELIVERY_WEBHOOK_URL),secret=clean(process.env.EMAIL_DELIVERY_WEBHOOK_SECRET);
 const environment=process.env.NODE_ENV||"development";
 let publicUrl="",publicValid=false;
 try{
  const parsed=new URL(clean(process.env.PUBLIC_APP_URL));
  publicUrl=parsed.origin;
  publicValid=parsed.username===""&&parsed.password===""&&parsed.pathname==="/"&&!parsed.search&&!parsed.hash&&(environment!=="production"||parsed.protocol==="https:");
 }catch{}
 const resendConfigured=Boolean(apiKey&&from.includes("@"));
 const webhookConfigured=Boolean(endpoint&&secret);
 let webhookValid=false;
 try{webhookValid=new URL(endpoint).protocol==="https:";}catch{}
 const provider=resendConfigured?"resend":webhookConfigured?"signed-webhook":"not-configured";
 return {provider,ready:Boolean((publicValid&&(resendConfigured||(webhookConfigured&&webhookValid)))||(environment!=="production"&&process.env.TEST_DELIVERY_MODE==="capture")),publicUrl,fromConfigured:Boolean(from),apiKeyConfigured:Boolean(apiKey),webhookConfigured,deliveryEventsConfigured:Boolean(clean(process.env.RESEND_WEBHOOK_SECRET)||clean(process.env.EMAIL_DELIVERY_EVENT_WEBHOOK_SECRET)),inboundConfigured:Boolean(clean(process.env.EMAIL_INBOUND_WEBHOOK_SECRET)),testDeliveryMode:environment!=="production"&&process.env.TEST_DELIVERY_MODE==="capture"?"capture":"blocked",environment,sender:from?from:null};
}
export async function queueEmailNotification(db,userId,templateCode,variables={},resourceType="workflow",resourceId=null,{optional=false}={}){
 const user=(await db.query("select u.email,coalesce(np.email_enabled,true) email_enabled from app_user u left join notification_preference np on np.user_id=u.id where u.id=$1",[userId])).rows[0];
 if(!user?.email||(optional&&!user.email_enabled))return false;
 const recipient=normalizeEmailAddress(user.email);
 const template=(await db.query("select enabled,audience from email_notification_template where template_code=$1",[templateCode])).rows[0];
 if(!template){
  await db.query("insert into audit_log(action,resource_type,resource_id,outcome,metadata) values('email.message.enqueue_template_missing','email_notification_template',$1,'failure',$2)",[templateCode,{userId,resourceType,resourceId}]);
  return false;
 }
 // Fail closed before creating an outbox record: enqueue and dispatch must agree
 // on the current persisted recipient identity and template governance.
 if(template?.enabled===false||!template.audience){
  await db.query("insert into audit_log(action,resource_type,resource_id,outcome,metadata) values('email.message.enqueue_template_policy_rejected','email_notification_template',$1,'failure',$2)",[templateCode,{userId,audience:template.audience||null,enabled:template.enabled}]);
  return false;
 }
 if(template&&!await recipientMatchesAudience(db,user.email,template.audience)){
  await db.query("insert into audit_log(action,resource_type,resource_id,outcome,metadata) values('email.message.enqueue_audience_rejected','email_notification_template',$1,'failure',$2)",[templateCode,{userId,audience:template.audience,resourceType,resourceId}]);
  return false;
 }
 const suppressed=(await db.query("select 1 from email_recipient_suppression where email_normalized=$1 and cleared_at is null limit 1",[recipient])).rowCount>0;
 if(suppressed)return false;
 const eventCode=String(variables.notificationEventCode||variables.notification_event_code||templateCode);
 const eventKey=emailWorkflowEventKey({userId,templateCode,resourceType,resourceId,eventCode,eventVersion:variables.eventVersion||variables.event_version||null});
 const inserted=await db.query("insert into notification_outbox(channel,recipient,template_code,payload,status,delivery_status,email_event_key,updated_at) values('email',$1,$2,$3,'pending','queued',$4,now()) on conflict(email_event_key) where channel='email' and email_event_key is not null do nothing returning id",[user.email,templateCode,{...variables,variables},eventKey]);
 return inserted.rowCount>0;
}
export async function queueWorkflowEmail(db,userId,templateCode,variables={},resourceType="workflow",resourceId=null){
 const user=(await db.query("select p.first_name from app_user u left join person p on p.user_id=u.id where u.id=$1",[userId])).rows[0];
 if(!user)return false;
 const vars={firstName:user.first_name||"",...variables};
 const eventCode=String(vars.notificationEventCode||vars.notification_event_code||templateCode);
 const inApp=await createInAppNotification(db,userId,eventCode,resourceType,resourceId,vars);
 const emailQueued=await queueEmailNotification(db,userId,templateCode,vars,resourceType,resourceId);
 return Boolean(inApp||emailQueued);
}
export async function getEmailOperations(actorId){
 const db=getPool();await requireAdmin(db,actorId);
 const cfg=providerConfig();
 const counts=(await db.query("select status,count(*)::int count from notification_outbox where channel='email' group by status")).rows;
 const deliveryCounts=(await db.query("select delivery_status status,count(*)::int count from notification_outbox where channel='email' group by delivery_status")).rows;
 const drafts=(await db.query("select count(*)::int count from email_outbox_draft where status='draft'")).rows[0]?.count||0;
 const unread=(await db.query("select count(*)::int count from email_inbox_message where read_at is null and archived_at is null")).rows[0]?.count||0;
 return {connection:{...cfg,environment:process.env.NODE_ENV||"development",sender:cfg.fromConfigured?clean(process.env.EMAIL_FROM,320):null},counts:Object.fromEntries(counts.map(x=>[x.status,x.count])),deliveryCounts:Object.fromEntries(deliveryCounts.map(x=>[x.status,x.count])),drafts:Number(drafts),unread:Number(unread)};
}
export async function listEmailOutbox(actorId,{folder="outbox",limit=100}={}){
 const db=getPool();await requireAdmin(db,actorId);
 const n=Math.min(Math.max(Number(limit)||100,1),200);
 if(folder==="drafts")return (await db.query("select id,recipient,subject,text_body,html_body,status,created_at,updated_at from email_outbox_draft where status='draft' order by updated_at desc limit $1",[n])).rows;
 if(folder==="inbox")return (await db.query("select id,provider_message_id,sender,recipients,subject,text_body,received_at,read_at,archived_at from email_inbox_message where archived_at is null order by received_at desc limit $1",[n])).rows;
 if(folder==="verification-failed")return (await db.query("select t.id,u.email recipient,'Email verification delivery failed' subject,coalesce(d.last_error_code,t.delivery_error_code,'Delivery failed') last_error,d.attempts,d.next_attempt_at,d.updated_at created_at,'failed' status from email_verification_token t join app_user u on u.id=t.user_id join email_verification_delivery d on d.verification_token_id=t.id where d.status='failed' and d.attempts<8 and t.consumed_at is null and t.expires_at>now() order by d.updated_at desc limit $1",[n])).rows;
 const status=folder==="sent"?"sent":folder==="queued"?"pending":null;
 const deliveryFilter=folder==="failed"?"delivery_status in ('failed','bounced','complained')":folder==="sent"?"delivery_status in ('sent','delivered','captured')":null;
 return (await db.query(`select id,recipient,template_code,coalesce(subject,'') subject,coalesce(text_body,payload->>'text','') text_body,status,delivery_status,delivered_at,delivery_event_at,delivery_event_type,attempts,next_attempt_at,provider_message_id,last_error,delivery_error_code,created_at,updated_at,sent_at
 from notification_outbox where channel='email' and ($1::text is null or status=$1) and ($2::text is null or ${deliveryFilter||"true"}) order by created_at desc limit $3`,[status,deliveryFilter,n])).rows;
}
export async function listEmailTemplates(actorId){
 const db=getPool();await requireAdmin(db,actorId);
 return (await db.query("select template_code,display_name,audience,subject_template,text_template,html_template,enabled,adjustable_by_admin,updated_at from email_notification_template order by audience,display_name")).rows;
}
export async function saveEmailTemplate(actorId,code,input,requestId){
 const db=getPool();await requireAdmin(db,actorId);
 const templateCode=clean(code,100);
 if(templateCode==="account.email_verification"&&input.enabled===false)fail(400,"Email verification is security-critical and cannot be disabled.","SECURITY_TEMPLATE_REQUIRED");
 if(templateCode==="account.email_verification"&&input.audience!==undefined&&input.audience!=="all")fail(400,"Email verification is security-critical and must remain available to all eligible account holders.","SECURITY_TEMPLATE_AUDIENCE_LOCKED");
 const subject=clean(input.subjectTemplate,300),textBody=String(input.textTemplate||"").slice(0,20000),html=String(input.htmlTemplate||"").slice(0,30000);
 if(!/^[a-zA-Z0-9_.-]{2,100}$/.test(templateCode)||!subject||!textBody)fail(400,"Template code, subject and text body are required.","VALIDATION_ERROR");
 const allowedAudiences=["all","professional","organization_representative","reviewer","administrator","employer","mentor"];
 if(input.audience!==undefined&&!allowedAudiences.includes(input.audience))fail(400,"Choose a supported email template audience.","VALIDATION_ERROR");
 if(input.enabled!==undefined&&typeof input.enabled!=="boolean")fail(400,"Template enabled must be a boolean.","VALIDATION_ERROR");
 const audience=input.audience||"all";
 return withTransaction(async tx=>{
  const existing=(await tx.query("select adjustable_by_admin from email_notification_template where template_code=$1 for update",[templateCode])).rows[0];
  if(existing&&!existing.adjustable_by_admin)fail(403,"This system-managed email template cannot be edited by an administrator.","TEMPLATE_LOCKED");
  const row=(await tx.query(`insert into email_notification_template(template_code,display_name,audience,subject_template,text_template,html_template,enabled,updated_by,updated_at)
 values($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict(template_code) do update set display_name=excluded.display_name,audience=excluded.audience,subject_template=excluded.subject_template,text_template=excluded.text_template,html_template=excluded.html_template,enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=now()
 returning template_code,display_name,audience,subject_template,text_template,html_template,enabled,adjustable_by_admin,updated_at`,[templateCode,clean(input.displayName,150)||templateCode,audience,subject,textBody,html, input.enabled!==false,actorId])).rows[0];
  const version=Number((await tx.query("select coalesce(max(version_number),0)+1 version from email_template_version where template_code=$1",[templateCode])).rows[0].version);
  await tx.query("insert into email_template_version(template_code,version_number,display_name,audience,subject_template,text_template,html_template,enabled,changed_by,change_request_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",[row.template_code,version,row.display_name,row.audience,row.subject_template,row.text_template,row.html_template,row.enabled,actorId,requestId||null]);
  await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'email.template.updated','email_notification_template',$2,$3,'success',$4)",[actorId,templateCode,requestId,{audience,enabled:input.enabled!==false,version}]);
  return {...row,version};
 });
}
export async function listEmailTemplateVersions(actorId,code){
 const db=getPool();await requireAdmin(db,actorId);
 const templateCode=clean(code,100);
 return (await db.query("select id,template_code,version_number,display_name,audience,subject_template,text_template,html_template,enabled,changed_by,change_request_id,created_at from email_template_version where template_code=$1 order by version_number desc limit 50",[templateCode])).rows;
}
export async function restoreEmailTemplateVersion(actorId,code,versionNumber,requestId=null){
 const db=getPool();await requireAdmin(db,actorId);
 const templateCode=clean(code,100),number=Number(versionNumber);
 if(!Number.isInteger(number)||number<1)fail(400,"A valid template version is required.","VALIDATION_ERROR");
 return withTransaction(async tx=>{
  const current=(await tx.query("select adjustable_by_admin from email_notification_template where template_code=$1 for update",[templateCode])).rows[0];
  if(!current)fail(404,"Email template not found.","NOT_FOUND");
  if(!current.adjustable_by_admin)fail(403,"This system-managed email template cannot be restored by an administrator.","TEMPLATE_LOCKED");
  const version=(await tx.query("select * from email_template_version where template_code=$1 and version_number=$2",[templateCode,number])).rows[0];
  if(!version)fail(404,"Email template version not found.","NOT_FOUND");
  if(templateCode==="account.email_verification"&&!version.enabled)fail(400,"Email verification is security-critical and cannot be disabled.","SECURITY_TEMPLATE_REQUIRED");
  if(templateCode==="account.email_verification"&&version.audience!=="all")fail(400,"Email verification must remain available to all eligible account holders.","SECURITY_TEMPLATE_AUDIENCE_LOCKED");
  const row=(await tx.query("update email_notification_template set display_name=$2,audience=$3,subject_template=$4,text_template=$5,html_template=$6,enabled=$7,updated_by=$8,updated_at=now() where template_code=$1 returning template_code,display_name,audience,subject_template,text_template,html_template,enabled,adjustable_by_admin,updated_at",[templateCode,version.display_name,version.audience,version.subject_template,version.text_template,version.html_template,version.enabled,actorId])).rows[0];
  const nextVersion=Number((await tx.query("select coalesce(max(version_number),0)+1 version from email_template_version where template_code=$1",[templateCode])).rows[0].version);
  await tx.query("insert into email_template_version(template_code,version_number,display_name,audience,subject_template,text_template,html_template,enabled,changed_by,change_request_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",[row.template_code,nextVersion,row.display_name,row.audience,row.subject_template,row.text_template,row.html_template,row.enabled,actorId,requestId||null]);
  await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'email.template.version_restored','email_notification_template',$2,$3,'success',$4)",[actorId,templateCode,requestId,{restoredVersion:number,newVersion:nextVersion}]);
  return {...row,restoredVersion:number,version:nextVersion};
 });
}

export async function previewEmailTemplate(actorId,input={}){
 const db=getPool();await requireAdmin(db,actorId);
 let template=input;
 if(input.templateCode){
  template=(await db.query("select template_code,display_name,audience,subject_template,text_template,html_template,enabled from email_notification_template where template_code=$1",[clean(input.templateCode,100)])).rows[0];
  if(!template)fail(404,"Email template not found.","NOT_FOUND");
 }
 const subjectTemplate=String(template.subject_template||input.subjectTemplate||"").slice(0,300);
 const textTemplate=String(template.text_template||input.textTemplate||"").slice(0,20000);
 const htmlTemplate=String(template.html_template||input.htmlTemplate||"").slice(0,30000);
 if(!subjectTemplate||(!textTemplate&&!htmlTemplate))fail(400,"A subject and message body are required for preview.","VALIDATION_ERROR");
 const sample={firstName:"Amina",verificationUrl:"https://example.invalid/verify-email?token=sample-only",status:"In review",nextAction:"Open your MPA workspace to review the next step.",registrationReference:"MPA-QA-26-000123",jobTitle:"Sample professional opportunity",organizationName:"Sample organization",lastUpdated:"3 November 2026",event:"Sample platform event",occurredAt:"3 November 2026",workflowType:"Membership",...(input.variables&&typeof input.variables==="object"&&!Array.isArray(input.variables)?input.variables:{})};
 const placeholders=[...new Set([subjectTemplate,textTemplate,htmlTemplate].join("\n").match(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g)||[])].map(value=>value.replace(/[{}\s]/g,""));
 const missingVariables=placeholders.filter(key=>sample[key]===undefined||sample[key]===null||sample[key]==="");
 const subject=render(subjectTemplate,sample);
 const textBody=render(textTemplate,sample);
 const htmlBody=renderBrandedEmail({subject,htmlBody:render(htmlTemplate,sample,{html:true}),textBody,preheader:subject});
 return {subject,textBody,htmlBody,missingVariables,audience:template.audience||input.audience||"all",enabled:template.enabled!==false};
}

export async function saveEmailDraft(actorId,input,requestId=null){
 const db=getPool();await requireAdmin(db,actorId);
 const recipient=clean(input.recipient,320),subject=clean(input.subject,300),textBody=String(input.textBody||"").slice(0,20000),htmlBody=String(input.htmlBody||"").slice(0,30000);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)||!subject||(!textBody&&!htmlBody))fail(400,"A valid recipient, subject and message body are required.","VALIDATION_ERROR");
 const row=(await db.query("insert into email_outbox_draft(created_by,recipient,subject,text_body,html_body) values($1,$2,$3,$4,$5) returning id,recipient,subject,text_body,html_body,status,created_at,updated_at",[actorId,recipient,subject,textBody,htmlBody])).rows[0];
 await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'email.draft.created','email_outbox_draft',$2,$3,'success',$4)",[actorId,row.id,requestId,{recipient}]);
 return row;
}
export async function updateEmailDraft(actorId,id,input,requestId=null){
 const db=getPool();await requireAdmin(db,actorId);
 const recipient=clean(input.recipient,320),subject=clean(input.subject,300),textBody=String(input.textBody||"").slice(0,20000),htmlBody=String(input.htmlBody||"").slice(0,30000);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)||!subject||(!textBody&&!htmlBody))fail(400,"A valid recipient, subject and message body are required.","VALIDATION_ERROR");
 const row=(await db.query("update email_outbox_draft set recipient=$2,subject=$3,text_body=$4,html_body=$5,updated_at=now() where id=$1 and status='draft' returning id,recipient,subject,text_body,html_body,status,created_at,updated_at",[id,recipient,subject,textBody,htmlBody])).rows[0];
 if(!row)fail(404,"Editable email draft not found.","NOT_FOUND");
 await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'email.draft.updated','email_outbox_draft',$2,$3,'success',$4)",[actorId,id,requestId,{recipient}]);
 return row;
}
export async function cancelEmailDraft(actorId,id,requestId=null){
 const db=getPool();await requireAdmin(db,actorId);
 const row=(await db.query("update email_outbox_draft set status='cancelled',updated_at=now() where id=$1 and status='draft' returning id,recipient,status",[id])).rows[0];
 if(!row)fail(404,"Active email draft not found.","NOT_FOUND");
 await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'email.draft.cancelled','email_outbox_draft',$2,$3,'success',$4)",[actorId,id,requestId,{recipient:row.recipient}]);
 return row;
}

export async function sendEmailMessage(input){ return sendMessage(input); }

async function sendMessage({recipient,subject,textBody,htmlBody,templateCode,payload,idempotencyKey=null}){
 htmlBody=renderBrandedEmail({subject,htmlBody,textBody,preheader:subject});
 const stableIdempotencyKey=emailIdempotencyKey(idempotencyKey);
 if(process.env.TEST_LAB_ENABLED==="true"&&process.env.NODE_ENV==="production")fail(403,"Test Lab is forbidden in production; no email was sent.","TEST_LAB_PRODUCTION_BLOCKED");
 if(process.env.TEST_DELIVERY_MODE==="capture"&&process.env.NODE_ENV==="production")fail(403,"Test delivery capture mode cannot run in production; no email was sent.","TEST_DELIVERY_PRODUCTION_BLOCKED");
 if(process.env.TEST_LAB_ENABLED==="true"&&process.env.TEST_DELIVERY_MODE!=="capture")fail(503,"Test Lab requires TEST_DELIVERY_MODE=capture; no email was sent.","TEST_DELIVERY_CAPTURE_REQUIRED");
 if(process.env.TEST_DELIVERY_MODE==="capture"&&process.env.NODE_ENV!=="production"){
  await captureTestDelivery({channel:"email",recipient,eventCode:templateCode||"email",payload:{subject,textBody,htmlBody,payload}});
  return {providerMessageId:"test-capture",provider:"test-capture",captured:true};
 }
 const cfg=providerConfig();
 if(!cfg.ready)fail(503,"Email provider is not configured. Set PUBLIC_APP_URL and Resend or signed-webhook credentials in the server environment.","EMAIL_DELIVERY_NOT_CONFIGURED");
 if(cfg.provider==="resend"){
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${clean(process.env.RESEND_API_KEY)}`,...(stableIdempotencyKey?{"Idempotency-Key":stableIdempotencyKey}:{})},body:JSON.stringify({from:clean(process.env.EMAIL_FROM),to:[recipient],subject,text:textBody||"",html:htmlBody||undefined}),signal:AbortSignal.timeout(10000)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(`Resend rejected the message (HTTP ${response.status}).`),{code:`RESEND_HTTP_${response.status}`});
  return {provider:"resend",providerMessageId:result.id||null};
 }
 const endpoint=clean(process.env.EMAIL_DELIVERY_WEBHOOK_URL),secret=clean(process.env.EMAIL_DELIVERY_WEBHOOK_SECRET);
 const body=JSON.stringify({to:recipient,subject,text:textBody||"",html:htmlBody||"",template:templateCode||"manual",idempotencyKey:stableIdempotencyKey||undefined,payload:payload||{}});
 const signature=createHmac("sha256",secret).update(body).digest("hex");
 const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${secret}`,"x-mpa-payload-signature":signature},body,signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Object.assign(new Error(`Email delivery webhook rejected the message (HTTP ${response.status}).`),{code:`DELIVERY_HTTP_${response.status}`});
 const result=await response.json().catch(()=>({}));
 return {provider:"signed-webhook",providerMessageId:result.messageId||result.id||null};
}
export async function queueEmailDraft(actorId,draftId,requestId){
 const db=getPool();await requireAdmin(db,actorId);
 return withTransaction(async tx=>{
  const draft=(await tx.query("select * from email_outbox_draft where id=$1 and status='draft' for update",[draftId])).rows[0];
  if(!draft)fail(404,"Draft not found or already queued.","NOT_FOUND");
  const queued=(await tx.query("insert into notification_outbox(channel,recipient,template_code,payload,status,subject,text_body,html_body,created_by,updated_at) values('email',$1,'admin.manual',$2,'pending',$3,$4,$5,$6,now()) returning id",[draft.recipient,{source:"admin_email_center",draftId:draft.id},draft.subject,draft.text_body,draft.html_body,actorId])).rows[0];
  await tx.query("update email_outbox_draft set status='queued',queued_outbox_id=$1,updated_at=now() where id=$2",[queued.id,draft.id]);
  await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'email.draft.queued','notification_outbox',$2,$3,'success',$4)",[actorId,queued.id,requestId,{draftId:draft.id}]);
  return {queued:true,outboxId:queued.id};
 });
}
async function recipientMatchesAudience(db,recipient,audience){
 if(!audience||audience==="all")return true;
 const row=(await db.query(`select u.account_type,
  exists(select 1 from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=u.id and r.role_code in ('system_admin','admin','platform_admin')) is_admin,
  (exists(select 1 from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=u.id and r.role_code in ('reviewer','verification_reviewer','appeal_reviewer','system_admin')) or
   exists(select 1 from app_user_permission up where up.user_id=u.id and up.permission_code in ('organizations.review','jobs.review','verification.review'))) is_reviewer,
  (exists(select 1 from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=u.id and r.role_code='mentor') or exists(select 1 from mentorship_match mm where mm.mentor_user_id=u.id) or exists(select 1 from mentorship m where m.mentor_user_id=u.id)) is_mentor,
  exists(select 1 from organization_membership om where om.user_id=u.id and om.status='active' and om.role_code in ('owner','administrator','recruiter')) is_employer
 from app_user u where lower(u.email)=lower($1) limit 1`,[recipient])).rows[0];
 if(!row)return false;
 return emailAudienceMatches(audience,{accountType:row.account_type,isAdmin:row.is_admin,isReviewer:row.is_reviewer,isMentor:row.is_mentor,isEmployer:row.is_employer});
}

async function reconcilePendingEmailDeliveryEvents(db){
 const events=(await db.query("select id,provider,provider_event_id,provider_message_id,event_type from email_delivery_event where outbox_id is null and processed_at is null order by occurred_at limit 100")).rows;
 let reconciled=0;
 for(const event of events){
  const completed=await withTransaction(async tx=>{
   // Lock the ledger row so concurrent dispatchers cannot reconcile it twice.
   const locked=(await tx.query("select id from email_delivery_event where id=$1 and outbox_id is null and processed_at is null for update",[event.id])).rows[0];
   if(!locked)return false;
   const verification=(await tx.query("update email_verification_delivery set provider_delivery_status=case when provider_delivery_status='complained' then 'complained' when provider_delivery_status='bounced' and $1<>'complained' then 'bounced' when provider_delivery_status='delivered' and $1='failed' then 'delivered' else $1 end,delivery_event_at=now(),updated_at=now() where provider_message_id=$2 and provider=$3 returning id,verification_token_id",[event.event_type,event.provider_message_id,event.provider])).rows[0];
   if(verification){
    const recipient=(await tx.query("select u.email,t.user_id from email_verification_token t join app_user u on u.id=t.user_id where t.id=$1",[verification.verification_token_id])).rows[0];
    if(recipient&&(event.event_type==="bounced"||event.event_type==="complained")){
     const reason=event.event_type==="complained"?"complaint":"hard_bounce";
     await tx.query("insert into email_recipient_suppression(email_normalized,reason,source,provider_message_id) values($1,$2,$3,$4) on conflict(email_normalized) do update set reason=case when email_recipient_suppression.reason='complaint' then email_recipient_suppression.reason else excluded.reason end,source=excluded.source,provider_message_id=excluded.provider_message_id,created_at=now(),cleared_at=null,cleared_by=null,clear_reason=null",[normalizeEmailAddress(recipient.email),reason,event.provider,event.provider_message_id]);
    }
    await tx.query("insert into audit_log(action,resource_type,resource_id,outcome,metadata) values('email.verification.provider_delivery_event','email_verification_token',$1,'success',$2)",[verification.verification_token_id,{provider:event.provider,providerEventId:event.provider_event_id,eventType:event.event_type}]);
    await tx.query("update email_delivery_event set verification_delivery_id=$1,processed_at=now() where id=$2",[verification.id,event.id]);
    return true;
   }
   const result=await tx.query("update notification_outbox set delivery_status=case when delivery_status='complained' then 'complained' when delivery_status='bounced' and $1<>'complained' then 'bounced' when delivery_status='delivered' and $1='failed' then 'delivered' else $1 end,delivered_at=case when $1='delivered' and delivery_status not in ('bounced','complained') then coalesce(delivered_at,now()) else delivered_at end,delivery_event_at=now(),delivery_event_type=case when delivery_status='complained' then delivery_event_type when delivery_status='bounced' and $1<>'complained' then delivery_event_type else $2 end,delivery_error_code=case when delivery_status='complained' then delivery_error_code when delivery_status='bounced' and $1<>'complained' then delivery_error_code when $1 in ('bounced','complained','failed') then $2 else null end,updated_at=now() where id=(select id from notification_outbox where channel='email' and provider_message_id=$3 order by sent_at desc nulls last,created_at desc limit 1) returning id,recipient,payload,template_code,delivery_status",[event.event_type,event.event_type,event.provider_message_id]);
   const row=result.rows[0];
   if(!row)return false;
   if(event.event_type==="bounced"||event.event_type==="complained"){
    const reason=event.event_type==="complained"?"complaint":"hard_bounce";
    await tx.query("insert into email_recipient_suppression(email_normalized,reason,source,provider_message_id) values($1,$2,$3,$4) on conflict(email_normalized) do update set reason=case when email_recipient_suppression.reason='complaint' then email_recipient_suppression.reason else excluded.reason end,source=excluded.source,provider_message_id=excluded.provider_message_id,created_at=now(),cleared_at=null,cleared_by=null,clear_reason=null",[normalizeEmailAddress(row.recipient),reason,event.provider,event.provider_message_id]);
   }
   const matchId=row.payload?.matchId||row.payload?.variables?.matchId;
   if(row.template_code==="mentor.mentorship_update"&&matchId)await tx.query("update mentorship_match set mentor_notification_status=$1,mentor_notification_updated_at=now(),mentor_notification_detail=$2 where id=$3",[row.delivery_status==="delivered"?"delivered":"failed","Reconciled provider delivery event: "+row.delivery_status,matchId]);
   await tx.query("insert into audit_log(action,resource_type,resource_id,outcome,metadata) values('email.delivery_event.reconciled','notification_outbox',$1,'success',$2)",[row.id,{provider:event.provider,providerEventId:event.provider_event_id,eventType:event.event_type}]);
   await tx.query("update email_delivery_event set outbox_id=$1,processed_at=now() where id=$2",[row.id,event.id]);
   return true;
  });
  if(completed)reconciled++;
 }
 return reconciled;
}

export async function dispatchEmailOutbox(actorId,{limit=20,onlyId=null,system=false}={}){
 const db=getPool();if(!system)await requireAdmin(db,actorId);
 if(process.env.TEST_LAB_ENABLED==="true"&&process.env.NODE_ENV==="production")fail(403,"Test Lab is forbidden in production; no email was sent.","TEST_LAB_PRODUCTION_BLOCKED");
 if(process.env.TEST_DELIVERY_MODE==="capture"&&process.env.NODE_ENV==="production")fail(403,"Test delivery capture mode cannot run in production; no email was sent.","TEST_DELIVERY_PRODUCTION_BLOCKED");
 if(process.env.TEST_LAB_ENABLED==="true"&&process.env.TEST_DELIVERY_MODE!=="capture"&&process.env.NODE_ENV!=="production")fail(503,"Test Lab is enabled but outbound delivery is not safely configured. Set TEST_DELIVERY_MODE=capture; no email was sent.","TEST_DELIVERY_CAPTURE_REQUIRED");
 if(process.env.TEST_DELIVERY_MODE==="capture"&&process.env.NODE_ENV!=="production"){
  const batch=Math.min(Math.max(Number(limit)||20,1),50);
  const rows=await withTransaction(async tx=>{
   await tx.query("update notification_outbox set status='pending',locked_at=null,updated_at=now() where channel='email' and status='processing' and locked_at<now()-interval '5 minutes'");
   const selected=(await tx.query(`select o.id,o.recipient,o.template_code,o.payload,t.enabled,t.audience
    from notification_outbox o left join email_notification_template t on t.template_code=o.template_code
    where o.channel='email' and o.status in ('pending','failed') and ($1::uuid is null or o.id=$1::uuid)
    order by o.created_at for update of o skip locked limit $2`,[onlyId,batch])).rows;
   for(const row of selected)await tx.query("update notification_outbox set status='processing',attempts=attempts+1,locked_at=now(),updated_at=now() where id=$1",[row.id]);
   return selected;
  });
  const results=[];
  for(const row of rows){
   if((row.template_code!=="admin.manual"&&(row.enabled!==true||!row.audience))||(row.audience&&!await recipientMatchesAudience(db,row.recipient,row.audience))){
    await db.query("update notification_outbox set status='cancelled',delivery_status='cancelled',delivery_event_type=$2,delivery_event_at=now(),locked_at=null,updated_at=now() where id=$1",[row.id,row.enabled===false?"template_disabled":"audience_mismatch"]);
    results.push({id:row.id,status:"cancelled"});continue;
   }
   const hold=(await db.query("select 1 from email_recipient_suppression where email_normalized=$1 and cleared_at is null limit 1",[normalizeEmailAddress(row.recipient)])).rowCount>0;
   if(hold){
    await db.query("update notification_outbox set status='cancelled',delivery_status='suppressed',delivery_event_type='recipient_suppressed',delivery_event_at=now(),locked_at=null,updated_at=now() where id=$1",[row.id]);
    results.push({id:row.id,status:"suppressed"});continue;
   }
   try{
    await captureTestDelivery({channel:"email",recipient:row.recipient,eventCode:row.template_code,payload:{outboxId:row.id,payload:row.payload}});
    await db.query("update notification_outbox set status='sent',delivery_status='captured',delivery_event_type='test_capture',delivery_event_at=now(),sent_at=null,provider_message_id='test-capture',last_error=null,locked_at=null,updated_at=now() where id=$1",[row.id]);
    results.push({id:row.id,status:"captured"});
   }catch(error){
    await db.query("update notification_outbox set status='failed',delivery_status='failed',last_error=$2,delivery_error_code='TEST_CAPTURE_FAILED',locked_at=null,updated_at=now() where id=$1",[row.id,clean(error?.message||"Test delivery capture failed",500)]);
    results.push({id:row.id,status:"failed",error:"Test delivery capture failed"});
   }
  }
  return {processed:results.length,results,mode:"capture"};
 }
 if(!providerConfig().ready)fail(503,"Email provider is not configured. Set server-side email credentials first.","EMAIL_DELIVERY_NOT_CONFIGURED");
 try{await reconcilePendingEmailDeliveryEvents(db);}catch(error){console.warn("[email-outbox] pending provider events remain for reconciliation",{code:error.code||"EMAIL_EVENT_RECONCILIATION_FAILED"});}
 const batch=Math.min(Math.max(Number(limit)||20,1),50);
 const claimed=await withTransaction(async tx=>{
  await tx.query("update notification_outbox set status='pending',delivery_status='queued',next_attempt_at=now(),locked_at=null,updated_at=now() where channel='email' and status='processing' and locked_at<now()-interval '5 minutes'");
  const rows=(await tx.query(`select id,recipient,template_code,payload,subject,text_body,html_body,attempts
   from notification_outbox where channel='email' and (status='pending' or (status='failed' and next_attempt_at is not null and next_attempt_at<=now()))
   and ($1::uuid is null or id=$1::uuid) and coalesce(next_attempt_at,created_at)<=now()
   order by created_at for update skip locked limit $2`,[onlyId,batch])).rows;
  for(const row of rows)await tx.query("update notification_outbox set status='processing',attempts=attempts+1,locked_at=now(),updated_at=now() where id=$1",[row.id]);
  return rows;
 });
 const results=[];
 for(const row of claimed){
  try{
   let subject=row.subject||"",textBody=row.text_body||row.payload?.text||"",htmlBody=row.html_body||row.payload?.html||"";
   const template=(await db.query("select subject_template,text_template,html_template,enabled,audience,adjustable_by_admin from email_notification_template where template_code=$1",[row.template_code])).rows[0];
   if(!template&&row.template_code!=="admin.manual"){
    await db.query("update notification_outbox set status='cancelled',delivery_status='cancelled',delivery_event_type='template_missing',delivery_event_at=now(),last_error='Workflow email template is not configured',locked_at=null,updated_at=now() where id=$1",[row.id]);
    await db.query("insert into audit_log(action,resource_type,resource_id,outcome,metadata) values('email.message.template_missing','notification_outbox',$1,'failure',$2)",[row.id,{templateCode:row.template_code}]);
    results.push({id:row.id,status:"cancelled",reason:"template_missing"});
    continue;
   }
   if(template&&!await recipientMatchesAudience(db,row.recipient,template.audience)){
    await db.query("update notification_outbox set status='cancelled',delivery_status='cancelled',delivery_event_type='audience_mismatch',delivery_event_at=now(),last_error='Recipient does not match the notification template audience',locked_at=null,updated_at=now() where id=$1",[row.id]);
    await db.query("insert into audit_log(action,resource_type,resource_id,outcome,metadata) values('email.message.audience_rejected','notification_outbox',$1,'failure',$2)",[row.id,{templateCode:row.template_code,audience:template.audience}]);
    results.push({id:row.id,status:"cancelled",reason:"audience_mismatch"});
    continue;
   }
   if(template&&(!template.enabled||!template.audience)){await db.query("update notification_outbox set status='cancelled',delivery_status='cancelled',delivery_event_type='template_disabled',delivery_event_at=now(),last_error='Notification template disabled by administrator',locked_at=null,updated_at=now() where id=$1",[row.id]);const matchId=row.payload?.matchId||row.payload?.variables?.matchId;if(row.template_code==="mentor.mentorship_update"&&matchId){try{await db.query("update mentorship_match set mentor_notification_status='cancelled',mentor_notification_updated_at=now(),mentor_notification_detail=$2 where id=$1",[matchId,"Email template disabled; provider delivery did not occur."]);}catch(e){console.error("[email-outbox] could not update mentorship notification evidence",{outboxId:row.id});}}results.push({id:row.id,status:"cancelled"});continue;}
   if(template?.enabled){const vars={...(row.payload||{}),...(row.payload?.variables||{})};subject=render(template.subject_template,vars);textBody=render(template.text_template,vars);htmlBody=render(template.html_template,vars,{html:true});}
   const humanEvent=String(row.template_code||"account update").replace(/[._-]+/g," ").replace(/\b\w/g,ch=>ch.toUpperCase());
   if(!subject)subject=`${humanEvent} · MPA Professionals Network`;
   if(!textBody)textBody=`There is a new update to your MPA Professionals Network account.\n\n${row.payload?.status?`Status: ${row.payload.status}\n`:""}${row.payload?.nextAction?`Next action: ${row.payload.nextAction}\n`:""}${row.payload?.registrationReference?`Reference: ${row.payload.registrationReference}\n`:""}Sign in to the platform to review the latest details. If you need help, contact platform support.`;
   if(!htmlBody)htmlBody=`<p>There is a new update to your MPA Professionals Network account.</p>${row.payload?.status?`<p>Status: ${String(row.payload.status).replace(/[&<>]/g,"")} </p>`:""}${row.payload?.nextAction?`<p>Next action: ${String(row.payload.nextAction).replace(/[&<>]/g,"")}</p>`:""}${row.payload?.registrationReference?`<p>Reference: <strong>${String(row.payload.registrationReference).replace(/[&<>]/g,"")}</strong></p>`:""}<p>Sign in to the platform to review the latest details.</p>`;
   if(!subject)subject="Notification from MPA Professionals Network";
   const suppression=(await db.query("select reason from email_recipient_suppression where email_normalized=$1 and cleared_at is null limit 1",[normalizeEmailAddress(row.recipient)])).rows[0];
   if(suppression){
    await db.query("update notification_outbox set status='cancelled',delivery_status='suppressed',delivery_event_type='recipient_suppressed',delivery_event_at=now(),last_error='Recipient is suppressed from outbound email',locked_at=null,updated_at=now() where id=$1",[row.id]);
    results.push({id:row.id,status:"suppressed"});
    continue;
   }
   const sent=await sendMessage({recipient:row.recipient,subject,textBody,htmlBody,templateCode:row.template_code,payload:row.payload,idempotencyKey:row.id});
   await db.query("update notification_outbox set status='sent',delivery_status='sent',sent_at=now(),provider_message_id=$1,last_error=null,delivery_error_code=null,next_attempt_at=null,locked_at=null,updated_at=now() where id=$2",[sent.providerMessageId,row.id]);
   await db.query("insert into audit_log(action,resource_type,resource_id,outcome,metadata) values('email.message.provider_accepted','notification_outbox',$1,'success',$2)",[row.id,{provider:providerConfig().provider,providerMessageId:sent.providerMessageId||null,attempt:Number(row.attempts||0)+1}]);
   const matchId=row.payload?.matchId||row.payload?.variables?.matchId;if(row.template_code==="mentor.mentorship_update"&&matchId){try{await db.query("update mentorship_match set mentor_notification_status='sent',mentor_notification_updated_at=now(),mentor_notification_detail=$2 where id=$1",[matchId,"Provider accepted the send request; delivery is not confirmed."]);}catch(e){console.error("[email-outbox] could not update mentorship notification evidence",{outboxId:row.id});}}
   results.push({id:row.id,status:"sent"});
  }catch(e){
   const attempt=Number(row.attempts||0)+1;
   const classification=classifyEmailDeliveryError(e);
   const code=classification.code;
   const exhausted=attempt>=8;
   const failed=!classification.retryable||exhausted;
   const delay=emailRetryDelaySeconds(attempt);
   try{
    await db.query("update notification_outbox set status=$1,delivery_status=case when $1='failed' then 'failed' else 'queued' end,last_error=$2,delivery_error_code=$3,next_attempt_at=$4,locked_at=null,updated_at=now() where id=$5",[failed?"failed":"pending",clean(e.message,500),code,failed?null:new Date(Date.now()+delay*1000),row.id]);
    await db.query("insert into audit_log(action,resource_type,resource_id,outcome,metadata) values('email.message.delivery_attempt_failed','notification_outbox',$1,$2,$3)",[row.id,failed?"failure":"retry_scheduled",{code,attempt,retryable:classification.retryable&&!exhausted}]);
    const matchId=row.payload?.matchId||row.payload?.variables?.matchId;if(row.template_code==="mentor.mentorship_update"&&matchId){try{await db.query("update mentorship_match set mentor_notification_status=$2,mentor_notification_updated_at=now(),mentor_notification_detail=$3 where id=$1",[matchId,failed?"failed":"queued",failed?"Email delivery failed after retry policy was exhausted.":"Email send attempt failed and is queued for retry."]);}catch(persistMatchError){console.error("[email-outbox] could not update mentorship notification evidence",{outboxId:row.id});}}
    results.push({id:row.id,status:failed?"failed":"pending",error:clean(e.message,250),retryable:classification.retryable&&!exhausted});
   }catch(persistError){
    console.error("[email-outbox] failed to persist delivery failure", {outboxId:row.id,code,reason:clean(persistError?.message||"database error",180)});
    results.push({id:row.id,status:"persistence_error",error:"Delivery failed and the failure status could not be saved. Check database connectivity and the outbox record."});
   }
  }
 }
 return {processed:results.length,results};
}
export async function retryVerificationEmail(actorId,id,requestId){
 const db=getPool();await requireAdmin(db,actorId);
 if(!providerConfig().ready&&!(process.env.NODE_ENV!=="production"&&process.env.TEST_DELIVERY_MODE==="capture"))fail(503,"Configure the email provider or enable safe development capture before retrying verification messages.","EMAIL_DELIVERY_NOT_CONFIGURED");
 const row=(await db.query("select t.id,u.email from email_verification_token t join app_user u on u.id=t.user_id join email_verification_delivery d on d.verification_token_id=t.id where t.id=$1 and d.status='failed' and d.attempts<8 and t.consumed_at is null and t.expires_at>now()",[id])).rows[0];
 if(!row)fail(409,"Only unconsumed, unexpired verification deliveries with retryable recorded failures can be retried.","INVALID_STATE");
 const hold=(await db.query("select reason from email_recipient_suppression where email_normalized=lower(trim($1)) and cleared_at is null limit 1",[row.email])).rows[0];
 if(hold)fail(409,"This verification recipient is on an outbound email hold. Resolve the address or consent issue before retrying.","RECIPIENT_HOLD_ACTIVE");
 const result=await retryVerificationDelivery(row.id);
 await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'email.verification.retry_requested','email_verification_token',$2,$3,$4,$5)",[actorId,id,requestId,result.requested?"success":"failure",{attemptRequested:Boolean(result.requested)}]);
 return result;
}
export async function retryFailedEmail(actorId,id,requestId=null){
 const db=getPool();await requireAdmin(db,actorId);
 if(!providerConfig().ready)fail(503,"Configure the email provider before retrying failed messages.","EMAIL_DELIVERY_NOT_CONFIGURED");
 const current=(await db.query("select recipient from notification_outbox where id=$1 and channel='email' and (status='failed' or delivery_status in ('failed','bounced'))",[id])).rows[0];
 if(!current)fail(409,"Only failed or bounced email messages can be retried. Complaints remain suppressed and cannot be retried.","INVALID_STATE");
 const hold=(await db.query("select reason from email_recipient_suppression where email_normalized=$1 and cleared_at is null limit 1",[normalizeEmailAddress(current.recipient)])).rows[0];
 if(hold)fail(409,"This recipient is still on an outbound email hold. Review and release an eligible hard-bounce hold before retrying.","RECIPIENT_HOLD_ACTIVE");
 const row=(await db.query("update notification_outbox set status='pending',delivery_status='queued',attempts=0,next_attempt_at=now(),last_error=null,delivery_error_code=null,delivery_event_type=null,delivery_event_at=null,updated_at=now() where id=$1 and channel='email' and (status='failed' or delivery_status in ('failed','bounced')) returning id,recipient",[id])).rows[0];
 if(!row)fail(409,"Email retry state changed during review. Refresh and try again.","CONCURRENT_UPDATE");
 await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'email.message.retry_requested','notification_outbox',$2,$3,'success',$4)",[actorId,id,requestId||null,{recipient:normalizeEmailAddress(row.recipient)}]);
 return dispatchEmailOutbox(actorId,{limit:1,onlyId:id});
}
export async function updateInbox(actorId,id,action,requestId=null){
 const db=getPool();await requireAdmin(db,actorId);
 let row;
 if(action==="read")row=(await db.query("update email_inbox_message set read_at=coalesce(read_at,now()) where id=$1 and archived_at is null returning id,read_at",[id])).rows[0];
 else if(action==="unread")row=(await db.query("update email_inbox_message set read_at=null where id=$1 and archived_at is null returning id,read_at",[id])).rows[0];
 else if(action==="archive")row=(await db.query("update email_inbox_message set archived_at=now() where id=$1 and archived_at is null returning id,archived_at",[id])).rows[0];
 else fail(400,"Unsupported inbox action.","VALIDATION_ERROR");
 if(!row)fail(404,"Message not found.","NOT_FOUND");
 await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,'email_inbox_message',$3,$4,'success',$5)",[actorId,"email.inbox."+action,id,requestId,{action}]);
 return row;
}
export async function receiveInboundEmail(input,providedSecret,signatureHeaders={}) {
 const payload=input.data&&typeof input.data==="object"?input.data:input;
 const isResend=Boolean(signatureHeaders["svix-id"]||input.type==="email.received"||payload.email_id);
 if(isResend){
  if(!verifyResendWebhookSignature(signatureHeaders.rawBody,signatureHeaders,clean(process.env.RESEND_WEBHOOK_SECRET,500)))fail(401,"Resend inbound webhook signature is missing, invalid, or outside the allowed timestamp window.","UNAUTHENTICATED");
 }else{
  const expected=clean(process.env.EMAIL_INBOUND_WEBHOOK_SECRET,500);
  if(!expected||!providedSecret||Buffer.byteLength(expected)!==Buffer.byteLength(providedSecret)||!timingSafeEqual(Buffer.from(expected),Buffer.from(providedSecret)))fail(401,"Inbound email webhook is not authorized.","UNAUTHENTICATED");
 }
 const providerMessageId=clean(input.messageId||input.id||payload.email_id||payload.id,300);
 const sender=clean(input.from||input.sender||payload.from||payload.sender,320);
 if(!providerMessageId)fail(400,"A stable provider message ID is required for inbound email deduplication.","PROVIDER_MESSAGE_ID_REQUIRED");
 if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(sender))fail(400,"Inbound sender address is invalid.","VALIDATION_ERROR");
 const rawRecipients=payload.to??input.to;
 const recipients=Array.isArray(rawRecipients)?rawRecipients.map(v=>clean(v,320)).filter(Boolean).slice(0,20):rawRecipients?[clean(rawRecipients,320)]:[];
 return withTransaction(async tx=>{
  const result=(await tx.query("insert into email_inbox_message(provider_message_id,sender,recipients,subject,text_body,html_body,metadata) values($1,$2,$3,$4,$5,$6,$7) on conflict(provider_message_id) do nothing returning id,received_at",[providerMessageId,sender,recipients,clean(payload.subject||input.subject,500),String(payload.text||input.text||"").slice(0,50000),String(payload.html||input.html||"").slice(0,100000),{provider:isResend?"resend":"configured-inbound-webhook"}])).rows[0];
  if(!result)return {duplicate:true};
  await tx.query("insert into audit_log(action,resource_type,resource_id,outcome,metadata) values('email.inbound.received','email_inbox_message',$1,'success',$2)",[result.id,{providerMessageId,provider:isResend?"resend":"configured-inbound-webhook"}]);
  return result;
 });
}
export function verifyResendWebhookSignature(rawBody, headers = {}, secret = "", nowMs = Date.now()) {
 const id=String(headers["svix-id"]||"").trim(),timestamp=String(headers["svix-timestamp"]||"").trim(),signatures=String(headers["svix-signature"]||"");
 if(!id||!timestamp||!signatures||!String(secret).startsWith("whsec_"))return false;
 const seconds=Number(timestamp);
 if(!Number.isInteger(seconds)||Math.abs(Math.floor(nowMs/1000)-seconds)>300)return false;
 let key;
 try{key=Buffer.from(String(secret).slice(6),"base64");}catch{return false;}
 if(key.length<16)return false;
 const raw=Buffer.isBuffer(rawBody)?rawBody:Buffer.from(String(rawBody||""));
 const expected=createHmac("sha256",key).update(id+"."+timestamp+".").update(raw).digest("base64");
 const candidates=signatures.split(" ").map(value=>value.trim()).filter(value=>value.startsWith("v1,")).map(value=>value.slice(3));
 const expectedBuffer=Buffer.from(expected);
 return candidates.some(value=>{
  const candidate=Buffer.from(value);
  return candidate.length===expectedBuffer.length&&timingSafeEqual(candidate,expectedBuffer);
 });
}

export async function receiveDeliveryWebhook(input,providedSecret,signatureHeaders={}){
 const providerHint=clean(input.provider,80)||(input.data?.email_id?"resend":"signed-webhook");
 if(providerHint==="resend"||signatureHeaders["svix-id"]){
  const headers=signatureHeaders;
  if(!verifyResendWebhookSignature(headers.rawBody,headers,clean(process.env.RESEND_WEBHOOK_SECRET,500)))fail(401,"Resend webhook signature is missing, invalid, or outside the allowed timestamp window.","UNAUTHENTICATED");
 }else{
  const expected=clean(process.env.EMAIL_DELIVERY_EVENT_WEBHOOK_SECRET,500);
  if(!expected||!providedSecret||Buffer.byteLength(expected)!==Buffer.byteLength(providedSecret)||!timingSafeEqual(Buffer.from(expected),Buffer.from(providedSecret)))fail(401,"Email delivery event webhook is not authorized.","UNAUTHENTICATED");
 }
 const providerMessageId=clean(input.providerMessageId||input.messageId||input.data?.email_id||input.data?.id,300);
 const providerEventId=clean(input.eventId||input.event_id||input.id,300);
 const rawEventType=clean(input.eventType||input.type,80).toLowerCase();
 const eventType=rawEventType.startsWith("email.")?rawEventType.slice(6):rawEventType;
 if(["opened","clicked","delivery_delayed","sent","scheduled"].includes(eventType))return {ignored:true,eventType};
 if(!providerMessageId)fail(400,"providerMessageId is required.","VALIDATION_ERROR");
 if(!providerEventId)fail(400,"A stable provider event ID is required for webhook idempotency.","PROVIDER_EVENT_ID_REQUIRED");
 if(!["delivered","bounced","complained","failed"].includes(eventType))fail(400,"Unsupported delivery event type.","VALIDATION_ERROR");
 const db=getPool(),provider=providerHint;
 // The ledger insert, outbox transition, suppression, domain evidence and audit
 // record commit together. A transient DB error rolls the event insert back so
 // the provider can safely replay the same event ID.
 return withTransaction(async tx=>{
  const recorded=(await tx.query("insert into email_delivery_event(provider,provider_event_id,provider_message_id,event_type,payload,processed_at) values($1,$2,$3,$4,$5,null) on conflict(provider,provider_event_id) do nothing returning id",[provider,providerEventId,providerMessageId,eventType,{provider}])).rows[0];
  if(!recorded)return {matched:true,duplicate:true,providerEventId};
  const result=await tx.query("update notification_outbox set delivery_status=case when delivery_status='complained' then 'complained' when delivery_status='bounced' and $1<>'complained' then 'bounced' when delivery_status='delivered' and $1='failed' then 'delivered' else $1 end,delivered_at=case when $1='delivered' and delivery_status not in ('bounced','complained') then coalesce(delivered_at,now()) else delivered_at end,delivery_event_at=now(),delivery_event_type=case when delivery_status='complained' then delivery_event_type when delivery_status='bounced' and $1<>'complained' then delivery_event_type else $2 end,delivery_error_code=case when delivery_status='complained' then delivery_error_code when delivery_status='bounced' and $1<>'complained' then delivery_error_code when $1 in ('bounced','complained','failed') then $2 else null end,updated_at=now() where id=(select id from notification_outbox where channel='email' and provider_message_id=$3 order by sent_at desc nulls last,created_at desc limit 1) returning id,recipient,payload,template_code,delivery_status,delivered_at",[eventType,eventType,providerMessageId]);
  const row=result.rows[0];
  if(!row){
   const verification=(await tx.query("update email_verification_delivery set provider_delivery_status=case when provider_delivery_status='complained' then 'complained' when provider_delivery_status='bounced' and $1<>'complained' then 'bounced' when provider_delivery_status='delivered' and $1='failed' then 'delivered' else $1 end,delivery_event_at=now(),updated_at=now() where provider_message_id=$2 and provider=$3 returning id,verification_token_id",[eventType,providerMessageId,provider])).rows[0];
   if(!verification)return {matched:false,providerMessageId,nextAction:"No outbox or verification delivery matched this provider message ID; the event is retained for reconciliation."};
   const recipient=(await tx.query("select u.email,t.user_id from email_verification_token t join app_user u on u.id=t.user_id where t.id=$1",[verification.verification_token_id])).rows[0];
   if(recipient&&(eventType==="bounced"||eventType==="complained")){
    const reason=eventType==="complained"?"complaint":"hard_bounce";
    await tx.query("insert into email_recipient_suppression(email_normalized,reason,source,provider_message_id) values($1,$2,$3,$4) on conflict(email_normalized) do update set reason=case when email_recipient_suppression.reason='complaint' then email_recipient_suppression.reason else excluded.reason end,source=excluded.source,provider_message_id=excluded.provider_message_id,created_at=now(),cleared_at=null,cleared_by=null,clear_reason=null",[normalizeEmailAddress(recipient.email),reason,provider,providerMessageId]);
   }
   await tx.query("insert into audit_log(action,resource_type,resource_id,outcome,metadata) values('email.verification.provider_delivery_event','email_verification_token',$1,'success',$2)",[verification.verification_token_id,{provider,providerEventId,eventType}]);
   await tx.query("update email_delivery_event set verification_delivery_id=$1,processed_at=now() where id=$2",[verification.id,recorded.id]);
   return {matched:true,verificationDelivery:true,deliveryStatus:eventType};
  }
  if(eventType==="bounced"||eventType==="complained"){
   const reason=eventType==="complained"?"complaint":"hard_bounce";
   await tx.query("insert into email_recipient_suppression(email_normalized,reason,source,provider_message_id) values($1,$2,$3,$4) on conflict(email_normalized) do update set reason=case when email_recipient_suppression.reason='complaint' then email_recipient_suppression.reason else excluded.reason end,source=excluded.source,provider_message_id=excluded.provider_message_id,created_at=now(),cleared_at=null,cleared_by=null,clear_reason=null",[normalizeEmailAddress(row.recipient),reason,provider,providerMessageId]);
  }
  const matchId=row.payload?.matchId||row.payload?.variables?.matchId;
  if(row.template_code==="mentor.mentorship_update"&&matchId){
   await tx.query("update mentorship_match set mentor_notification_status=$1,mentor_notification_updated_at=now(),mentor_notification_detail=$2 where id=$3",[row.delivery_status==="delivered"?"delivered":"failed",row.delivery_status==="delivered"?"Trusted provider delivery event received.":"Trusted provider failure or suppression event: "+row.delivery_status,matchId]);
  }
  await tx.query("insert into audit_log(action,resource_type,resource_id,outcome,metadata) values('email.delivery_event.received','notification_outbox',$1,'success',$2)",[row.id,{provider,providerEventId,eventType}]);
  await tx.query("update email_delivery_event set outbox_id=$1,processed_at=now() where id=$2",[row.id,recorded.id]);
  return {matched:true,deliveryStatus:row.delivery_status,deliveredAt:row.delivered_at||null,nextAction:row.delivery_status==="delivered"?"Provider reported delivery. This does not prove the recipient read the message.":"Provider reported a delivery failure; the recipient is suppressed for bounce/complaint events and must not be retried automatically."};
 });
}

// Server worker entry point: only queued platform messages are processed; no caller identity is accepted from HTTP.
export async function dispatchPendingSystemEmail(){
 if(!providerConfig().ready)return {processed:0,results:[],skipped:"provider_not_configured"};
 const verification = await (await import("./email-verification.js")).dispatchPendingVerificationEmails({limit:20});
 const workflow = await dispatchEmailOutbox(null,{limit:20,system:true});
 return {processed:verification.processed+workflow.processed,verification,workflow};
}

export async function listEmailRecipientHolds(actorId,{limit=100}={}){
 const db=getPool();await requireAdmin(db,actorId);
 const n=Math.min(Math.max(Number(limit)||100,1),200);
 return (await db.query("select id,email_normalized recipient,reason,source,provider_message_id,created_at from email_recipient_suppression where cleared_at is null order by created_at desc limit $1",[n])).rows;
}
export async function releaseEmailRecipientHold(actorId,id,reason,requestId=null){
 const db=getPool();await requireAdmin(db,actorId);
 const note=clean(reason,500);
 if(note.length<8)fail(400,"A reason of at least eight characters is required.","RELEASE_REASON_REQUIRED");
 const current=(await db.query("select id,email_normalized,reason from email_recipient_suppression where id=$1 and cleared_at is null",[id])).rows[0];
 if(!current)fail(404,"Active recipient hold not found.","NOT_FOUND");
 if(current.reason==="complaint")fail(409,"Complaint-based recipient holds cannot be released by an administrator. A separate documented recipient re-consent process is required.","COMPLAINT_HOLD_LOCKED");
 const row=(await db.query("update email_recipient_suppression set cleared_at=now(),cleared_by=$1,clear_reason=$2 where id=$3 and cleared_at is null returning id,email_normalized,reason",[actorId,note,id])).rows[0];
 if(!row)fail(409,"Recipient hold changed during review. Refresh and try again.","CONCURRENT_UPDATE");
 await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'email.recipient_hold.released','email_recipient_suppression',$2,$3,'success',$4)",[actorId,id,requestId,{recipient:row.email_normalized,originalReason:row.reason,releaseReason:note}]);
 return {released:true,recipient:row.email_normalized};
}

export async function sendTestEmail(actorId,requestId){
 const db=getPool();await requireAdmin(db,actorId);
 const user=(await db.query("select email from app_user where id=$1",[actorId])).rows[0];
 if(!user?.email)fail(400,"The administrator account has no email address configured.","EMAIL_ADDRESS_MISSING");
 const sent=await sendMessage({recipient:user.email,subject:"MPA Network email connection test",textBody:"This is a test message from the MPA Professionals Network email operations center. The configured provider accepted this message.",htmlBody:"<p>This is a test message from the MPA Professionals Network email operations center.</p><p>The configured provider accepted this message.</p>",templateCode:"admin.email_connection_test",payload:{}});
 await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'email.connection.test_sent','email_provider',$2,$3,'success',$4)",[actorId,sent.providerMessageId||null,requestId,{provider:providerConfig().provider}]);
 return {sent:true,recipient:user.email,provider:providerConfig().provider,providerMessageId:sent.providerMessageId};
}
