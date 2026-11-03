import crypto from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";

import { hashPassword } from "../membership/identity.js";
import * as membership from "../membership/service.js";
import { TEST_LAB_PERSONAS, TEST_LAB_SCENARIOS } from "./test-lab-catalog.js";
import { getPool, withTransaction } from "./db.js";
import { seedTestLabDomainFixtures } from "./test-lab-domain-fixtures.js";
import { createXlsx } from "./xlsx.js";

const ROLE_FIXTURES = TEST_LAB_PERSONAS.map(({persona,name,role})=>({persona,name,role}));
const ROLE_NAMES = {
 member:"Member", reviewer:"Reviewer", verification_reviewer:"Verification Reviewer",
 appeal_reviewer:"Appeal Reviewer", finance_officer:"Finance Officer", supporting_staff:"Supporting Staff"
};
const fail=(status,message,code="BUSINESS_RULE")=>Object.assign(new Error(message),{statusCode:status,code});
const clean=(v,max=120)=>String(v??"").trim().slice(0,max);
function testLabEnabled(){return process.env.NODE_ENV!=="production"&&process.env.TEST_LAB_ENABLED==="true"&&process.env.TEST_LAB_DISPOSABLE_DATABASE==="true";}
function randomPassword(){return crypto.randomBytes(24).toString("base64url")+"!7";}
function usernameToken(){return crypto.randomBytes(5).toString("hex");}
function requireSystemAdmin(identity){
 if(!Array.isArray(identity?.roles)||!identity.roles.includes("system_admin"))throw fail(403,"Only a system administrator can manage disposable test portfolios.","SYSTEM_ADMIN_REQUIRED");
}
async function assertSafeEnvironment(db){
 if(!testLabEnabled())throw fail(403,"Test Lab is disabled. Enable it explicitly in a non-production deployment.","TEST_LAB_DISABLED");
 if(process.env.NODE_ENV==="production")throw fail(403,"Test Lab operations are blocked in production.","TEST_LAB_PRODUCTION_BLOCKED");
 if(process.env.TEST_LAB_DISPOSABLE_DATABASE!=="true")throw fail(503,"Mark this non-production PostgreSQL database as disposable by setting TEST_LAB_DISPOSABLE_DATABASE=true before enabling Test Lab.","TEST_LAB_DATABASE_NOT_MARKED_DISPOSABLE");
 const actual=(await db.query("select current_database() name, current_setting('server_version') server_version")).rows[0]?.name;
 if(!actual)throw fail(503,"The configured database could not be identified. No test data was changed.","TEST_LAB_DATABASE_UNAVAILABLE");
 return actual;
}
async function seedTestLabPaymentJourneys({portfolioId,prefix,accounts,requestId}) {
 const db=getPool(),applicants=accounts.filter(account=>account.role==="member").slice(4,7);
 const finance=accounts.find(account=>account.role==="finance_officer");
 if(applicants.length!==3||!finance)throw fail(409,"Payment journey personas are incomplete.","TEST_PAYMENT_FIXTURE_PREREQUISITE_MISSING");
 const product=(await db.query("select currency from membership_product where product_code='BASIC' and active=true limit 1")).rows[0];
 if(!product)throw fail(409,"The Basic membership product is unavailable.","TEST_PAYMENT_FIXTURE_PREREQUISITE_MISSING");
 const methodCode="tlcash_"+prefix;
 await db.query("insert into membership_payment_method(method_code,method_type,display_name,enabled,currency,instructions,requires_evidence,updated_by,metadata) values($1,'cash','Test Lab simulated cash',true,$2,'Synthetic payment simulation only; no money is collected.',false,$3,$4) on conflict(method_code) do update set enabled=true,currency=excluded.currency,instructions=excluded.instructions,requires_evidence=false,updated_by=excluded.updated_by,metadata=excluded.metadata",[methodCode,product.currency,finance.userId,{testLab:true,portfolioId}]);
 try {
  for(let index=0;index<applicants.length;index++){
   const account=applicants[index];
   const application=await membership.createApplication(account.userId,{productCode:"BASIC",applicationType:"new",termsAcknowledged:true,idempotencyKey:"testlab_"+prefix+"_application_"+(index+1)},"test-lab:"+portfolioId+":application:"+(index+1));
   const fee=typeof application.fee_snapshot==="string"?JSON.parse(application.fee_snapshot):application.fee_snapshot;
   const payment=await membership.createManualPayment(application.id,account.userId,{paymentMethodCode:methodCode,amount:Number(fee.amount),currency:fee.currency,purpose:"membership_fee",channel:"cash",idempotencyKey:"testlab_"+prefix+"_payment_"+(index+1)},"test-lab:"+portfolioId+":payment:"+(index+1));
   await db.query("insert into test_portfolio_record(portfolio_id,table_name,entity_id) values($1,'membership_application',$2),($1,'payment_transaction',$3) on conflict do nothing",[portfolioId,application.id,payment.id]);
   const link=(await db.query("select id from membership_application_payment where application_id=$1 and payment_transaction_id=$2",[application.id,payment.id])).rows[0];
   if(link?.id)await db.query("insert into test_portfolio_record(portfolio_id,table_name,entity_id) values($1,'membership_application_payment',$2) on conflict do nothing",[portfolioId,link.id]);
   if(index===1)await membership.verifyPayment(payment.id,finance.userId,{decision:"approved",note:"Synthetic Test Lab verification; no external funds were transferred."},"test-lab:"+portfolioId+":verify:"+ (index+1));
   if(index===2)await membership.verifyPayment(payment.id,finance.userId,{decision:"rejected",note:"Synthetic Test Lab rejection; no external funds were transferred."},"test-lab:"+portfolioId+":verify:"+ (index+1));
   const seededStatus=index===0?"pending":index===1?"succeeded":"failed";
   await db.query("insert into test_delivery_capture(portfolio_id,channel,event_code,payload) values($1,'payment','membership_payment_fixture_created',$2)",[portfolioId,{paymentId:payment.id,status:seededStatus,amount:payment.amount,currency:payment.currency,applicationId:application.id}]);
  }
 } finally {
  await db.query("delete from membership_payment_method where method_code=$1 and metadata->>'testLab'='true' and metadata->>'portfolioId'=$2",[methodCode,portfolioId]);
 }
}

function makePortfolioName(value){const name=clean(value,100);if(name.length<4)throw fail(400,"Portfolio name must contain at least four characters.","VALIDATION_ERROR");return name;}
function makeEmail(prefix,role,index){return `qa.${prefix}.${role.replace(/_/g,"-")}.${index}@example.test`;}
function randomId(){return crypto.randomUUID();}
export function testLabConfiguration(){
 return {enabled:testLabEnabled(),environment:process.env.NODE_ENV||"development",databaseSafetyConfigured:process.env.TEST_LAB_DISPOSABLE_DATABASE==="true",deliveryMode:process.env.TEST_DELIVERY_MODE==="capture"?"capture":"blocked"};
}
export async function listTestPortfolios(identity){
 requireSystemAdmin(identity);const db=getPool();await assertSafeEnvironment(db);
 return (await db.query(`select p.id,p.name,p.environment,p.database_name,p.branch_ref,p.commit_sha,p.status,p.created_at,p.expires_at,p.reset_at,
  count(distinct a.user_id)::int account_count,count(distinct r.table_name||':'||r.entity_id)::int + (select count(*)::int from test_portfolio_composite_record cr where cr.portfolio_id=p.id) record_count,
  (select count(*)::int from test_delivery_capture d where d.portfolio_id=p.id) captured_delivery_count
  from test_portfolio p left join test_portfolio_account a on a.portfolio_id=p.id
  left join test_portfolio_record r on r.portfolio_id=p.id
  group by p.id order by p.created_at desc limit 50`)).rows;
}
export async function createTestPortfolio(identity,input={},requestId=null){
 requireSystemAdmin(identity);const db=getPool(),databaseName=await assertSafeEnvironment(db);
 const name=makePortfolioName(input.name||"MPA Full Journey — QA Cycle");
 const days=Math.min(Math.max(Number(input.expiryDays)||14,1),30);
 const branch=clean(input.branchRef||process.env.GIT_BRANCH||"feat/workstream-3-progress-members-workspace",180);
 const commit=clean(input.commitSha||process.env.GIT_COMMIT_SHA||"",64)||null;
 const portfolioId=randomId(),prefix=portfolioId.replace(/-/g,"").slice(0,6);
 const accounts=[];
 const syntheticFiles=[];
 try {
 await withTransaction(async tx=>{
  const p=(await tx.query(`insert into test_portfolio(id,name,environment,database_name,branch_ref,commit_sha,created_by,expires_at,metadata)
   values($1,$2,$3,$4,$5,$6,$7,now()+($8::int*interval '1 day'),$9) returning id,name,expires_at`,
   [portfolioId,name,process.env.NODE_ENV||"development",databaseName,branch,commit,identity.sub,days,{requestId,fixtureVersion:"2"}])).rows[0];
  for(let i=0;i<ROLE_FIXTURES.length;i++){
   const fixture=ROLE_FIXTURES[i],password=randomPassword(),email=makeEmail(prefix,fixture.role,i+1),username=`qa-${prefix}-${fixture.role.replace(/_/g,"-")}-${usernameToken()}`;
   const user=(await tx.query("insert into app_user(username,email,password_hash,status) values($1,$2,$3,'active') returning id,email,username",[username,email,hashPassword(password)])).rows[0];
   await tx.query("update app_user set email_verified_at=now() where id=$1",[user.id]);
   await tx.query("insert into person(user_id,first_name,last_name,display_name,nationality) values($1,$2,$3,$4,'Ethiopian')",[user.id,fixture.name[0],fixture.name[1],fixture.name.join(" ")]);
   const person=(await tx.query("select id from person where user_id=$1",[user.id])).rows[0];
   await tx.query("insert into professional_profile(person_id,headline,bio,visibility,completion_percent) values($1,$2,$3,'members',35)",[person.id,fixture.persona,"Synthetic QA persona. All information is fictional."]);
   await tx.query("insert into notification_preference(user_id,email_enabled,sms_enabled,push_enabled,in_app_enabled) values($1,true,false,false,true) on conflict(user_id) do nothing",[user.id]);
   await tx.query("insert into app_role(role_code,name,description) values($1,$2,$3) on conflict(role_code) do nothing",[fixture.role,ROLE_NAMES[fixture.role]||fixture.role,"Test Lab fixture role; assigned only to disposable synthetic test accounts."]);
   const role=(await tx.query("select id from app_role where role_code=$1",[fixture.role])).rows[0];
   if(!role)throw fail(409,`Required role ${fixture.role} is not installed. Apply the platform migrations before creating the portfolio.`,"TEST_ROLE_MISSING");
   await tx.query("insert into app_user_role(user_id,role_id,assigned_by) values($1,$2,$3)",[user.id,role.id,identity.sub]);
   await tx.query("insert into test_portfolio_account(portfolio_id,user_id,email,display_name,persona,role_code) values($1,$2,$3,$4,$5,$6)",
    [portfolioId,user.id,email,fixture.name.join(" "),fixture.persona,fixture.role]);
   await tx.query("insert into test_portfolio_record(portfolio_id,table_name,entity_id) values($1,'app_user',$2),($1,'person',$3),($1,'professional_profile',$4)",
    [portfolioId,user.id,person.id,(await tx.query("select id from professional_profile where person_id=$1",[person.id])).rows[0].id]);
   const category=fixture.role==="member"?"membership":fixture.role.includes("reviewer")?"verification":"system";
   await tx.query("insert into notification_event(user_id,event_code,resource_type,resource_id,payload,category,title,body,priority,action_required,action_url,dedupe_key) values($1,'test_lab.welcome','test_portfolio',$2,$3,$4,'Welcome to the MPA QA environment',$5,'normal',false,'/notifications',$6)",
    [user.id,portfolioId,{testPortfolioId:portfolioId,synthetic:true},category,`This is a synthetic test account for the ${fixture.persona} scenario. No real member information is used.`,`qa:${portfolioId}:${user.id}:welcome`]);
   await tx.query("insert into notification_outbox(channel,recipient,template_code,payload,status,subject,text_body,updated_at) values('email',$1,'test_lab.welcome',$2,'pending','Your MPA QA test account is ready',$3,now())",
    [email,{testPortfolioId:portfolioId,synthetic:true},`This is a test-only message for portfolio ${portfolioId}. No external email will be sent while delivery capture is enabled.`]);
   accounts.push({email,password,displayName:fixture.name.join(" "),persona:fixture.persona,role:fixture.role,userId:user.id});
  }
  // Payment journeys are created after this transaction through the membership service.
  // Seed real membership-application records through the existing schema so testers can
  // exercise member draft, submission, correction and payment-pending journeys.
  const memberAccounts=accounts.filter(account=>account.role==="member");
  const reviewerAccount=accounts.find(account=>account.role==="reviewer");
  const basicProduct=(await tx.query("select id,price,currency from membership_product where product_code='BASIC' and active=true limit 1")).rows[0];
  if(memberAccounts.length<4||!reviewerAccount||!basicProduct)throw fail(409,"Membership fixture prerequisites are missing; apply the membership migrations first.","TEST_FIXTURE_PREREQUISITE_MISSING");
  const applicationStates=["draft","submitted","correction_required","approved"];
  const applicationIds=[];
  for(let i=0;i<4;i++){
   const status=applicationStates[i],account=memberAccounts[i];
   const application=(await tx.query(`insert into membership_application(user_id,application_type,membership_product_id,status,submitted_at,reviewed_at,approved_at,data_snapshot,fee_snapshot)
    values($1,'new',$2,$3,case when $3='draft' then null else now() end,case when $3 in ('correction_required','approved') then now() else null end,case when $3='approved' then now() else null end,$4,$5) returning id`,
    [account.userId,basicProduct.id,status,{synthetic:true,testPortfolioId:portfolioId,persona:account.persona},{productCode:"BASIC",amount:Number(basicProduct.price),currency:basicProduct.currency}])).rows[0];
   applicationIds.push(application.id);
   await tx.query("insert into test_portfolio_record(portfolio_id,table_name,entity_id) values($1,'membership_application',$2)",[portfolioId,application.id]);
   if(status==="correction_required"){
    const review=(await tx.query("insert into membership_application_review(application_id,reviewer_user_id,decision,note,checklist) values($1,$2,'correction_required','Synthetic QA correction request.',$3) returning id",[application.id,reviewerAccount.userId,[{field:"professionalProfile",status:"incomplete"}]])).rows[0];
    await tx.query("insert into test_portfolio_record(portfolio_id,table_name,entity_id) values($1,'membership_application_review',$2)",[portfolioId,review.id]);
    const correction=(await tx.query("insert into membership_correction(application_id,requested_by,status,requested_fields,reviewer_note) values($1,$2,'open',$3,'Please complete the synthetic profile fields for this QA case.') returning id",[application.id,reviewerAccount.userId,["professionalProfile"]])).rows[0];
    await tx.query("insert into test_portfolio_record(portfolio_id,table_name,entity_id) values($1,'membership_correction',$2)",[portfolioId,correction.id]);
   }
   if(status==="approved"){
    const review=(await tx.query("insert into membership_application_review(application_id,reviewer_user_id,decision,note,checklist) values($1,$2,'approved','Synthetic QA application approval; payment journey is covered by the membership service fixtures.',$3) returning id",[application.id,reviewerAccount.userId,[{field:"application",status:"approved"}]])).rows[0];
    await tx.query("insert into test_portfolio_record(portfolio_id,table_name,entity_id) values($1,'membership_application_review',$2)",[portfolioId,review.id]);
   }
  }
  await seedTestLabDomainFixtures({tx,portfolioId,prefix,accounts,createdFiles:syntheticFiles});
 });
 await seedTestLabPaymentJourneys({portfolioId,prefix,accounts,requestId});
 } catch(error) {
  try { await resetTestPortfolio(identity,portfolioId,{confirmation:name,reason:"Automatic cleanup after incomplete Test Lab portfolio creation."},requestId); }
  catch { await Promise.allSettled(syntheticFiles.map(key=>rm(safeStoragePath(key),{force:true}))); }
  throw error;
 }
 await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'test_lab.portfolio.created','test_portfolio',$2,$3,'success',$4)",
  [identity.sub,portfolioId,requestId,{name,accountCount:accounts.length,expiryDays:days}]);
 const expiresAt=(await db.query("select expires_at from test_portfolio where id=$1",[portfolioId])).rows[0].expires_at;
 const credentialRows=accounts.map(account=>({Email:account.email,Password:account.password,"Display name":account.displayName,Persona:account.persona,Role:account.role,"Sign-in URL":process.env.TEST_LAB_SIGN_IN_URL||"Set TEST_LAB_SIGN_IN_URL","Portfolio":name,"Expires":new Date(expiresAt).toISOString(),"Instructions":"Development/test only. This is the one-time initial credential export. Do not reuse passwords. Delete workbook after testing."}));
 const credentialsWorkbook=createXlsx(credentialRows,Object.keys(credentialRows[0]));
 return {id:portfolioId,name,expiresAt,accountCount:accounts.length,accounts:accounts.map(({userId,password,...safe})=>safe),credentialsWorkbookBase64:credentialsWorkbook.toString("base64"),credentialsFilename:`mpa-test-accounts-${portfolioId.slice(0,8)}.xlsx`,message:"The one-time credentials workbook is included in this response. No email or push was sent."};
}
export async function exportTestPortfolioAccounts(identity,portfolioId){
 requireSystemAdmin(identity);const db=getPool();await assertSafeEnvironment(db);
 const credentials=await withTransaction(async tx=>{
  const p=(await tx.query("select id,name,expires_at,status from test_portfolio where id=$1 for update",[portfolioId])).rows[0];
  if(!p||p.status!=="active")throw fail(404,"Active test portfolio not found.","NOT_FOUND");
  const rows=(await tx.query("select a.user_id,a.email,a.display_name,a.persona,a.role_code,u.status account_status from test_portfolio_account a join app_user u on u.id=a.user_id where a.portfolio_id=$1 order by a.role_code,a.email for update of u",[portfolioId])).rows;
  if(!rows.length)throw fail(404,"This portfolio has no test accounts.","NOT_FOUND");
  if(rows.some(row=>row.account_status!=="active"))throw fail(409,"One or more test accounts are expired or disabled. Create a fresh portfolio instead of reactivating expired credentials.","TEST_ACCOUNTS_INACTIVE");
  const generated=rows.map(row=>({...row,password:randomPassword()}));
  for(const account of generated){
   const updated=await tx.query("update app_user set password_hash=$1,updated_at=now() where id=$2 and status='active'",[hashPassword(account.password),account.user_id]);
   if(updated.rowCount!==1)throw fail(409,"A test account changed state while credentials were being regenerated. No workbook was issued.","TEST_ACCOUNT_CHANGED");
  }
  const userIds=rows.map(row=>row.user_id);
  await tx.query("update auth_session set revoked_at=coalesce(revoked_at,now()) where user_id=any($1::uuid[]) and revoked_at is null",[userIds]);
  await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,outcome,metadata) values($1,'test_lab.credentials.regenerated','test_portfolio',$2,'success',$3)",[identity.sub,portfolioId,{accountCount:rows.length,format:"xlsx",sessionsRevoked:true}]);
  return generated.map(row=>({email:row.email,password:row.password,displayName:row.display_name,persona:row.persona,role:row.role_code,expiresAt:p.expires_at,portfolioName:p.name}));
 });
 const workbookRows=credentials.map(row=>({Email:row.email,Password:row.password,"Display name":row.displayName,Persona:row.persona,Role:row.role,"Sign-in URL":process.env.TEST_LAB_SIGN_IN_URL||"Set TEST_LAB_SIGN_IN_URL","Portfolio":row.portfolioName,"Expires":new Date(row.expiresAt).toISOString(),"Instructions":"Development/test only. Credentials were regenerated for this export. All previous passwords and sessions are invalid. Do not reuse this password. Delete workbook after testing."}));
 const buffer=createXlsx(workbookRows,Object.keys(workbookRows[0]));
 return {buffer,filename:`mpa-test-accounts-${portfolioId.slice(0,8)}.xlsx`};
}
export async function previewTestPortfolioReset(identity,portfolioId){
 requireSystemAdmin(identity);const db=getPool();await assertSafeEnvironment(db);
 const p=(await db.query("select id,name,status from test_portfolio where id=$1",[portfolioId])).rows[0];
 if(!p||p.status!=="active")throw fail(404,"Active test portfolio not found.","NOT_FOUND");
 const records=(await db.query("select table_name,sum(record_count)::int count from (select table_name,count(*) record_count from test_portfolio_record where portfolio_id=$1 group by table_name union all select table_name,count(*) record_count from test_portfolio_composite_record where portfolio_id=$1 group by table_name) inventory group by table_name order by table_name",[portfolioId])).rows;
 const accounts=(await db.query("select count(*)::int count from test_portfolio_account where portfolio_id=$1",[portfolioId])).rows[0].count;
 const deliveries=(await db.query("select count(*)::int count from test_delivery_capture where portfolio_id=$1",[portfolioId])).rows[0].count;
 return {portfolio:p,accounts,deliveries,records,recordCount:records.reduce((n,r)=>n+r.count,0),requiresTypedConfirmation:p.name,warning:"Only records captured in this portfolio will be deleted. Any unregistered foreign-key dependency blocks reset."};
}
function orderTables(tables,constraints){
 const set=new Set(tables),children=new Map(tables.map(t=>[t,new Set()]));
 for(const edge of constraints)if(set.has(edge.parent)&&set.has(edge.child))children.get(edge.parent).add(edge.child);
 const done=new Set(),visiting=new Set(),ordered=[];
 function visit(table){if(done.has(table))return;if(visiting.has(table))return;visiting.add(table);for(const child of children.get(table)||[])visit(child);visiting.delete(table);done.add(table);ordered.push(table);}
 for(const table of tables)visit(table);
 return ordered;
}
function safeStoragePath(key){
 const root=path.resolve(process.env.PRIVATE_FILE_STORAGE_ROOT||path.join(process.cwd(),".private-files"));
 const target=path.resolve(root,String(key||""));
 if(!target.startsWith(root+path.sep))throw fail(409,"A portfolio file path is outside the configured private storage root; reset was blocked.","TEST_FILE_PATH_UNSAFE");
 return target;
}
export async function resetTestPortfolio(identity,portfolioId,input={},requestId=null){
 requireSystemAdmin(identity);const db=getPool();await assertSafeEnvironment(db);
 const preview=await previewTestPortfolioReset(identity,portfolioId);
 if(String(input.confirmation||"")!==preview.requiresTypedConfirmation)throw fail(400,"Type the exact portfolio name to confirm deletion.","TEST_RESET_CONFIRMATION_REQUIRED");
 const reason=clean(input.reason,400);if(reason.length<8)throw fail(400,"Enter a reset reason of at least eight characters.","AUDIT_REASON_REQUIRED");
 const files=[];
 const result=await withTransaction(async tx=>{
  const p=(await tx.query("select * from test_portfolio where id=$1 and status='active' for update",[portfolioId])).rows[0];
  if(!p)throw fail(409,"Portfolio was already reset or changed. Refresh the list.","INVALID_STATE");
  const registered=(await tx.query("select table_name,array_agg(entity_id) ids from test_portfolio_record where portfolio_id=$1 group by table_name",[portfolioId])).rows;
  const composite=(await tx.query("select table_name,primary_key from test_portfolio_composite_record where portfolio_id=$1 order by table_name,captured_at",[portfolioId])).rows;
  const tables=[...new Set([...registered.map(x=>x.table_name),...composite.map(x=>x.table_name)])];
  const constraints=(await tx.query(`select child.relname child,parent.relname parent from pg_constraint c
   join pg_class child on child.oid=c.conrelid join pg_namespace cn on cn.oid=child.relnamespace
   join pg_class parent on parent.oid=c.confrelid join pg_namespace pn on pn.oid=parent.relnamespace
   where c.contype='f' and cn.nspname='public' and pn.nspname='public'`)).rows;
  const ordered=orderTables(tables,constraints);
  for(const row of registered.filter(x=>["file_object","private_upload_session"].includes(x.table_name))){
   const f=row.table_name==="file_object"
    ?await tx.query("select object_key,storage_provider from public.file_object where id=any($1::uuid[])",[row.ids])
    :await tx.query("select object_key,'private-local' storage_provider from public.private_upload_session where id=any($1::uuid[])",[row.ids]);
   if(f.rows.some(x=>x.storage_provider!=="private-local"))throw fail(409,"A test portfolio references a non-local file provider; reset was blocked to avoid deleting outside private storage.","TEST_FILE_PROVIDER_UNSUPPORTED");
   files.push(...f.rows.map(x=>x.object_key));
  }
  files.splice(0,files.length,...new Set(files));
  for(const key of files)safeStoragePath(key);
  const accountRows=(await tx.query("select user_id,email, (select username from app_user u where u.id=test_portfolio_account.user_id) username from test_portfolio_account where portfolio_id=$1",[portfolioId])).rows;
  const userIds=accountRows.map(x=>x.user_id),identities=accountRows.flatMap(x=>[String(x.email).toLowerCase(),String(x.username).toLowerCase()]);
  if(identities.length)await tx.query("delete from auth_login_attempt where lower(identity_key)=any($1::text[])",[identities]);
  if(userIds.length){
   await tx.query("delete from app_user_role where user_id=any($1::uuid[])",[userIds]);
   await tx.query("delete from app_user_permission where user_id=any($1::uuid[])",[userIds]);
   await tx.query("delete from notification_preference where user_id=any($1::uuid[])",[userIds]);
  }
  // The account registry itself references app_user, so remove its rows before
  // deleting the registered app_user records. Credentials are no longer exportable.
  await tx.query("delete from test_portfolio_account where portfolio_id=$1",[portfolioId]);
  // Child-first deletion. A reference from any unregistered/non-test row causes
  // PostgreSQL to reject the transaction; no partial cleanup is committed.
  const deleted={};
  for(const table of ordered){
   if(!/^[a-z_][a-z0-9_]*$/.test(table))throw fail(409,"Unexpected table name in test portfolio registry; reset blocked.","TEST_RESET_SCOPE_INVALID");
   const row=registered.find(x=>x.table_name===table);
   let count=0;
   if(row){
    const d=await tx.query(`delete from public."${table}" where id=any($1::uuid[])`,[row.ids]);
    count+=d.rowCount;
   }
   for(const key of composite.filter(x=>x.table_name===table)){
    const d=await tx.query(`delete from public."${table}" t where to_jsonb(t) @> $1::jsonb`,[key.primary_key]);
    count+=d.rowCount;
   }
   deleted[table]=count;
  }
  await tx.query("delete from test_portfolio_record where portfolio_id=$1",[portfolioId]);
  await tx.query("delete from test_portfolio_composite_record where portfolio_id=$1",[portfolioId]);
  await tx.query("delete from test_delivery_capture where portfolio_id=$1",[portfolioId]);
  await tx.query("update test_portfolio set status='reset',reset_at=now(),reset_by=$2,reset_reason=$3 where id=$1",[portfolioId,identity.sub,reason]);
  await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'test_lab.portfolio.reset','test_portfolio',$2,$3,'success',$4)",
   [identity.sub,portfolioId,requestId,{reason,deleted,accountCount:userIds.length,fileCount:files.length}]);
  return {portfolioId,deleted,accountCount:userIds.length,fileCount:files.length};
 });
 let removedFiles=0,failedFiles=0;
 for(const key of files){try{await rm(safeStoragePath(key),{force:true});removedFiles++;}catch{failedFiles++;}}
 return {...result,removedFiles,failedFiles,status:failedFiles?"reset_with_file_cleanup_warning":"reset"};
}

export async function expireTestPortfolioAccounts(){
 if(!testLabEnabled())return {expired:0,skipped:true};
 const db=getPool();
 return withTransaction(async tx=>{
  const portfolios=(await tx.query("select id from test_portfolio where status='active' and expires_at<=now() for update skip locked")).rows;
  if(!portfolios.length)return {expired:0,skipped:false};
  const portfolioIds=portfolios.map(row=>row.id);
  const expired=(await tx.query("select user_id,portfolio_id from test_portfolio_account where portfolio_id=any($1::uuid[])",[portfolioIds])).rows;
  if(!expired.length)return {expired:0,skipped:false};
  const userIds=[...new Set(expired.map(row=>row.user_id))];
  await tx.query("update app_user set status='disabled',updated_at=now() where id=any($1::uuid[]) and status='active'",[userIds]);
  await tx.query("update auth_session set revoked_at=coalesce(revoked_at,now()) where user_id=any($1::uuid[]) and revoked_at is null",[userIds]);
  for(const portfolioId of [...new Set(expired.map(row=>row.portfolio_id))]){
   await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,outcome,metadata) values(null,'test_lab.accounts.expired','test_portfolio',$1,'success',$2)",[portfolioId,{expiredAccountCount:expired.filter(row=>row.portfolio_id===portfolioId).length}]);
  }
  return {expired:userIds.length,skipped:false};
 });
}

export async function getTestPortfolioOperations(identity,portfolioId){
 requireSystemAdmin(identity);const db=getPool();await assertSafeEnvironment(db);
 const portfolio=(await db.query("select id,name,status from test_portfolio where id=$1",[portfolioId])).rows[0];
 if(!portfolio)throw fail(404,"Test portfolio not found.","NOT_FOUND");
 const deliveries=(await db.query("select id,channel,recipient,event_code,payload,captured_at from test_delivery_capture where portfolio_id=$1 order by captured_at desc limit 200",[portfolioId])).rows;
 const payments=(await db.query("select p.id,p.provider_transaction_id,p.purpose,p.amount,p.currency,p.status,p.created_at,p.updated_at,a.id application_id,a.status application_status,a.tracking_reference,account.email applicant_email from test_portfolio_record r join payment_transaction p on p.id=r.entity_id join membership_application_payment ap on ap.payment_transaction_id=p.id join membership_application a on a.id=ap.application_id left join test_portfolio_account account on account.portfolio_id=r.portfolio_id and account.user_id=a.user_id where r.portfolio_id=$1 and r.table_name='payment_transaction' and p.provider='manual' and p.purpose='membership' order by p.created_at desc",[portfolioId])).rows;
 return {portfolio,deliveries,payments};
}

export async function exportTestPortfolioScenarioWorkbook(identity,portfolioId){
 requireSystemAdmin(identity);const db=getPool();await assertSafeEnvironment(db);
 const portfolio=(await db.query("select id,name,status from test_portfolio where id=$1",[portfolioId])).rows[0];
 if(!portfolio||portfolio.status!=="active")throw fail(404,"Active test portfolio not found.","NOT_FOUND");
 const accounts=(await db.query("select email,persona,role_code from test_portfolio_account where portfolio_id=$1",[portfolioId])).rows;
 const byPersona=new Map(accounts.map(row=>[row.persona,row]));
 const rows=TEST_LAB_SCENARIOS.map(scenario=>{const persona=TEST_LAB_PERSONAS.find(item=>item.personaKey===scenario.personaKey);const account=persona?byPersona.get(persona.persona):null;return {"Portfolio":portfolio.name,"Scenario ID":scenario.id,"Module":scenario.module,"Scenario":scenario.title,"Actor role":scenario.actorRole,"Actor persona":persona?.persona||"","Actor email":account?.email||"","Review / counterparty role":scenario.reviewerRole,"Expected result":scenario.expected,"Evidence to capture":scenario.evidence,"Execution status":"Not started","Evidence reference":"","Actual result":"","Tester notes":"","Executed by":"","Executed at":""};});
 const buffer=createXlsx(rows,Object.keys(rows[0]));
 return {buffer,filename:"mpa-test-scenarios-evidence-"+portfolioId.slice(0,8)+".xlsx"};
}

export async function simulateTestPayment(identity,portfolioId,paymentId,input={},requestId=null){
 requireSystemAdmin(identity);const db=getPool();await assertSafeEnvironment(db);
 const next=String(input.status||"").trim().toLowerCase();
 if(!["pending","succeeded","failed","refunded","needs_correction"].includes(next))throw fail(400,"Choose pending, succeeded, failed or refunded for a simulated membership payment.","VALIDATION_ERROR");
 const payment=(await db.query("select p.* from payment_transaction p join test_portfolio_record r on r.entity_id=p.id and r.table_name='payment_transaction' and r.portfolio_id=$1 join test_portfolio t on t.id=r.portfolio_id and t.status='active' join membership_application_payment ap on ap.payment_transaction_id=p.id where p.id=$2 and p.provider='manual' and p.purpose='membership'",[portfolioId,paymentId])).rows[0];
 if(!payment)throw fail(404,"A membership-service payment was not found in this active test portfolio.","NOT_FOUND");
 const finance=(await db.query("select user_id from test_portfolio_account where portfolio_id=$1 and role_code='finance_officer' order by email limit 1",[portfolioId])).rows[0];
 if(!finance)throw fail(409,"This portfolio has no finance test persona.","TEST_PAYMENT_FIXTURE_PREREQUISITE_MISSING");
 if(payment.status===next)return {paymentId,status:next,replayed:true,simulated:true};
 if(next==="pending")throw fail(409,"A decided payment cannot be returned to pending. Create a fresh scenario instead.","PAYMENT_ALREADY_DECIDED");
 if(next==="needs_correction"){if(payment.status!=="pending")throw fail(409,"Only a pending synthetic membership payment can receive a correction request.","PAYMENT_ALREADY_DECIDED");const updated=await membership.verifyPayment(paymentId,finance.user_id,{decision:"needs_correction",note:clean(input.reason,240)||"Synthetic Test Lab request for additional payment evidence."},requestId);await db.query("insert into test_delivery_capture(portfolio_id,channel,event_code,payload) values($1,'payment','simulated_membership_payment_correction_requested',$2)",[portfolioId,{paymentId,status:updated.status,amount:payment.amount,currency:payment.currency}]);return {paymentId,status:updated.status,decision:"needs_correction",simulated:true,replayed:false};}
 if(next==="refunded"){if(payment.status!=="succeeded")throw fail(409,"Only a successful synthetic payment can be refunded.","PAYMENT_NOT_REVERSIBLE");const reversal=await membership.reverseMembershipPayment(paymentId,finance.user_id,{type:"refund",reason:clean(input.reason,240)||"Synthetic Test Lab refund scenario."},requestId);await db.query("insert into test_delivery_capture(portfolio_id,channel,event_code,payload) values($1,'payment','simulated_membership_payment_refunded',$2)",[portfolioId,{paymentId,reversalId:reversal.id,status:"refunded"}]);return {paymentId,status:"refunded",simulated:true,replayed:false};}
 if(payment.status!=="pending")throw fail(409,"Only a pending synthetic membership payment can be decided.","PAYMENT_ALREADY_DECIDED");
 const decision=next==="succeeded"?"approved":"rejected";
 const updated=await membership.verifyPayment(paymentId,finance.user_id,{decision,note:clean(input.reason,240)||"Synthetic Test Lab payment outcome; no external funds were transferred."},requestId);
 await db.query("insert into test_delivery_capture(portfolio_id,channel,event_code,payload) values($1,'payment','simulated_membership_payment_status_changed',$2)",[portfolioId,{paymentId,status:updated.status,amount:payment.amount,currency:payment.currency}]);
 return {paymentId,status:updated.status,simulated:true,replayed:false};
}