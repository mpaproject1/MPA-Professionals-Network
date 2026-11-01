import crypto from "node:crypto";
import path from "node:path";
import { rm } from "node:fs/promises";
import { getPool, withTransaction } from "./db.js";
import { hashPassword } from "../membership/identity.js";
import { createXlsx } from "./xlsx.js";
import { seedTestLabDomainFixtures } from "./test-lab-domain-fixtures.js";

const ROLE_FIXTURES = [
 {persona:"Member — incomplete profile",name:["Amina","Yusuf"],role:"member"},
 {persona:"Member — pending membership",name:["Bilal","Ahmed"],role:"member"},
 {persona:"Active member — verification pending",name:["Hana","Mohammed"],role:"member"},
 {persona:"Verified professional / mentor",name:["Yusuf","Ibrahim"],role:"member"},
 {persona:"Membership reviewer",name:["Mariam","Abdi"],role:"reviewer"},
 {persona:"Verification reviewer",name:["Ahmed","Nur"],role:"verification_reviewer"},
 {persona:"Independent appeal reviewer",name:["Fatima","Hassan"],role:"appeal_reviewer"},
 {persona:"Finance officer",name:["Ibrahim","Suleiman"],role:"finance_officer"},
 {persona:"Support staff",name:["Samira","Ali"],role:"supporting_staff"}
];
const ROLE_NAMES = {
 member:"Member", reviewer:"Reviewer", verification_reviewer:"Verification Reviewer",
 appeal_reviewer:"Appeal Reviewer", finance_officer:"Finance Officer", supporting_staff:"Supporting Staff"
};
const fail=(status,message,code="BUSINESS_RULE")=>Object.assign(new Error(message),{statusCode:status,code});
const clean=(v,max=120)=>String(v??"").trim().slice(0,max);
function testLabEnabled(){return process.env.NODE_ENV!=="production"&&process.env.TEST_LAB_ENABLED==="true";}
function credentialKey(){
 const value=String(process.env.TEST_LAB_CREDENTIAL_ENCRYPTION_KEY||"");
 let key;
 try{key=Buffer.from(value,"base64url");}catch{}
 if(!key||key.length!==32)key=Buffer.from(value,"utf8");
 if(key.length!==32)throw fail(503,"Set TEST_LAB_CREDENTIAL_ENCRYPTION_KEY to a dedicated 32-byte key before enabling test portfolios.","TEST_LAB_KEY_REQUIRED");
 return key;
}
function encryptSecret(value){
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",credentialKey(),iv);
 const encrypted=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
 return ["v1",iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),encrypted.toString("base64url")].join(".");
}
function decryptSecret(value){
 const [version,iv,tag,data]=String(value||"").split(".");
 if(version!=="v1"||!iv||!tag||!data)throw fail(500,"A stored test credential could not be decrypted.","TEST_CREDENTIAL_DECRYPT_FAILED");
 const decipher=crypto.createDecipheriv("aes-256-gcm",credentialKey(),Buffer.from(iv,"base64url"));
 decipher.setAuthTag(Buffer.from(tag,"base64url"));
 return Buffer.concat([decipher.update(Buffer.from(data,"base64url")),decipher.final()]).toString("utf8");
}
function randomPassword(){return crypto.randomBytes(24).toString("base64url")+"!7";}
function usernameToken(){return crypto.randomBytes(5).toString("hex");}
function requireSystemAdmin(identity){
 if(!Array.isArray(identity?.roles)||!identity.roles.includes("system_admin"))throw fail(403,"Only a system administrator can manage disposable test portfolios.","SYSTEM_ADMIN_REQUIRED");
}
async function assertSafeEnvironment(db){
 if(!testLabEnabled())throw fail(403,"Test Lab is disabled. Enable it explicitly in a non-production deployment.","TEST_LAB_DISABLED");
 if(process.env.NODE_ENV==="production")throw fail(403,"Test Lab operations are blocked in production.","TEST_LAB_PRODUCTION_BLOCKED");
 const expected=clean(process.env.TEST_LAB_DATABASE_NAME,120);
 if(!expected)throw fail(503,"Set TEST_LAB_DATABASE_NAME to the exact disposable database name.","TEST_LAB_DATABASE_NOT_ALLOWLISTED");
 const actual=(await db.query("select current_database() name")).rows[0]?.name;
 if(actual!==expected)throw fail(403,"The connected database does not match TEST_LAB_DATABASE_NAME. No test data was changed.","TEST_LAB_DATABASE_MISMATCH");
 return actual;
}
function makePortfolioName(value){const name=clean(value,100);if(name.length<4)throw fail(400,"Portfolio name must contain at least four characters.","VALIDATION_ERROR");return name;}
function makeEmail(prefix,role,index){return `qa.${prefix}.${role.replace(/_/g,"-")}.${index}@example.test`;}
function randomId(){return crypto.randomUUID();}
export function testLabConfiguration(){
 return {enabled:testLabEnabled(),environment:process.env.NODE_ENV||"development",databaseAllowlistConfigured:Boolean(process.env.TEST_LAB_DATABASE_NAME),credentialEncryptionConfigured:Boolean(process.env.TEST_LAB_CREDENTIAL_ENCRYPTION_KEY),deliveryMode:process.env.TEST_DELIVERY_MODE==="capture"?"capture":"blocked"};
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
   [portfolioId,name,process.env.NODE_ENV||"development",databaseName,branch,commit,identity.sub,days,{requestId,fixtureVersion:"1"}])).rows[0];
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
   await tx.query("insert into test_portfolio_account(portfolio_id,user_id,email,display_name,persona,role_code,password_ciphertext) values($1,$2,$3,$4,$5,$6,$7)",
    [portfolioId,user.id,email,fixture.name.join(" "),fixture.persona,fixture.role,encryptSecret(password)]);
   await tx.query("insert into test_portfolio_record(portfolio_id,table_name,entity_id) values($1,'app_user',$2),($1,'person',$3),($1,'professional_profile',$4)",
    [portfolioId,user.id,person.id,(await tx.query("select id from professional_profile where person_id=$1",[person.id])).rows[0].id]);
   const category=fixture.role==="member"?"membership":fixture.role.includes("reviewer")?"verification":"system";
   await tx.query("insert into notification_event(user_id,event_code,resource_type,resource_id,payload,category,title,body,priority,action_required,action_url,dedupe_key) values($1,'test_lab.welcome','test_portfolio',$2,$3,$4,'Welcome to the MPA QA environment',$5,'normal',false,'/notifications',$6)",
    [user.id,portfolioId,{testPortfolioId:portfolioId,synthetic:true},category,`This is a synthetic test account for the ${fixture.persona} scenario. No real member information is used.`,`qa:${portfolioId}:${user.id}:welcome`]);
   await tx.query("insert into notification_outbox(channel,recipient,template_code,payload,status,subject,text_body,updated_at) values('email',$1,'test_lab.welcome',$2,'pending','Your MPA QA test account is ready',$3,now())",
    [email,{testPortfolioId:portfolioId,synthetic:true},`This is a test-only message for portfolio ${portfolioId}. No external email will be sent while delivery capture is enabled.`]);
   accounts.push({email,displayName:fixture.name.join(" "),persona:fixture.persona,role:fixture.role,userId:user.id});
  }
  // Clearly simulated transactions only: no provider API, webhook or bank integration is invoked.
  for(const [index,status,amount] of [[1,"succeeded",1200],[2,"pending",1200],[3,"failed",50000]]){
   const payment=(await tx.query(`insert into payment_transaction(provider,provider_transaction_id,idempotency_key,purpose,amount,currency,status,request_payload,response_payload)
    values('test-simulator',$1,$2,'test_lab_simulation',$3,'ETB',$4,$5,$6) returning id`,
    [`QA-${prefix}-PAY-${index}`,`test-lab:${portfolioId}:payment:${index}`,amount,status,{testPortfolioId:portfolioId,simulated:true},{captured:true,noExternalProvider:true}])).rows[0];
   await tx.query("insert into test_portfolio_record(portfolio_id,table_name,entity_id) values($1,'payment_transaction',$2)",[portfolioId,payment.id]);
   await tx.query("insert into test_delivery_capture(portfolio_id,channel,event_code,payload) values($1,'payment','simulated_payment_created',$2)",[portfolioId,{paymentId:payment.id,status,amount,currency:"ETB"}]);
  }
  // Seed real membership-application records through the existing schema so testers can
  // exercise member draft, submission, correction and payment-pending journeys.
  const memberAccounts=accounts.filter(account=>account.role==="member");
  const reviewerAccount=accounts.find(account=>account.role==="reviewer");
  const basicProduct=(await tx.query("select id,price,currency from membership_product where product_code='BASIC' and active=true limit 1")).rows[0];
  if(memberAccounts.length<4||!reviewerAccount||!basicProduct)throw fail(409,"Membership fixture prerequisites are missing; apply the membership migrations first.","TEST_FIXTURE_PREREQUISITE_MISSING");
  const applicationStates=["draft","submitted","correction_required","payment_pending"];
  const applicationIds=[];
  for(let i=0;i<4;i++){
   const status=applicationStates[i],account=memberAccounts[i];
   const application=(await tx.query(`insert into membership_application(user_id,application_type,membership_product_id,status,submitted_at,reviewed_at,approved_at,data_snapshot,fee_snapshot)
    values($1,'new',$2,$3,case when $3='draft' then null else now() end,case when $3 in ('correction_required','payment_pending') then now() else null end,case when $3='payment_pending' then now() else null end,$4,$5) returning id`,
    [account.userId,basicProduct.id,status,{synthetic:true,testPortfolioId:portfolioId,persona:account.persona},{productCode:"BASIC",amount:Number(basicProduct.price),currency:basicProduct.currency}])).rows[0];
   applicationIds.push(application.id);
   if(status==="correction_required"){
    await tx.query("insert into membership_application_review(application_id,reviewer_user_id,decision,note,checklist) values($1,$2,'correction_required','Synthetic QA correction request.',$3)",[application.id,reviewerAccount.userId,[{field:"professionalProfile",status:"incomplete"}]]);
    await tx.query("insert into membership_correction(application_id,requested_by,status,requested_fields,reviewer_note) values($1,$2,'open',$3,'Please complete the synthetic profile fields for this QA case.')",[application.id,reviewerAccount.userId,["professionalProfile"]]);
   }
   if(status==="payment_pending"){
    await tx.query("insert into membership_application_review(application_id,reviewer_user_id,decision,note,checklist) values($1,$2,'approved','Synthetic QA approval; payment remains pending.',$3)",[application.id,reviewerAccount.userId,[{field:"application",status:"approved"}]]);
    const payment=(await tx.query(`insert into payment_transaction(provider,provider_transaction_id,idempotency_key,purpose,amount,currency,status,request_payload,response_payload)
     values('test-simulator',$1,$2,'test_lab_simulation',$3,$4,'pending',$5,$6) returning id`,
     [`QA-${prefix}-MEMBERSHIP-PAYMENT`,`test-lab:${portfolioId}:membership-payment`,Number(basicProduct.price),basicProduct.currency,{testPortfolioId:portfolioId,applicationId:application.id,simulated:true},{captured:true,noExternalProvider:true}])).rows[0];
    const link=(await tx.query("insert into membership_application_payment(application_id,payment_transaction_id) values($1,$2) returning id",[application.id,payment.id])).rows[0];
    await tx.query("insert into test_portfolio_record(portfolio_id,table_name,entity_id) values($1,'payment_transaction',$2),($1,'membership_application_payment',$3)",[portfolioId,payment.id,link.id]);
    await tx.query("insert into test_delivery_capture(portfolio_id,channel,event_code,payload) values($1,'payment','simulated_membership_payment_pending',$2)",[portfolioId,{paymentId:payment.id,applicationId:application.id,amount:Number(basicProduct.price),currency:basicProduct.currency}]);
   }
  }
  await seedTestLabDomainFixtures({tx,portfolioId,prefix,accounts,createdFiles:syntheticFiles});
 });
 } catch(error) {
  await Promise.allSettled(syntheticFiles.map(key=>rm(safeStoragePath(key),{force:true})));
  throw error;
 }
 await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'test_lab.portfolio.created','test_portfolio',$2,$3,'success',$4)",
  [identity.sub,portfolioId,requestId,{name,accountCount:accounts.length,expiryDays:days}]);
 return {id:portfolioId,name,expiresAt:(await db.query("select expires_at from test_portfolio where id=$1",[portfolioId])).rows[0].expires_at,accountCount:accounts.length,accounts:accounts.map(({userId,...safe})=>safe),message:"Export the temporary credentials workbook separately. No email or push was sent."};
}
export async function exportTestPortfolioAccounts(identity,portfolioId){
 requireSystemAdmin(identity);const db=getPool();await assertSafeEnvironment(db);
 const p=(await db.query("select id,name,branch_ref,commit_sha,expires_at,status from test_portfolio where id=$1",[portfolioId])).rows[0];
 if(!p||p.status!=="active")throw fail(404,"Active test portfolio not found.","NOT_FOUND");
 const rows=(await db.query("select email,display_name,persona,role_code,password_ciphertext from test_portfolio_account where portfolio_id=$1 order by role_code,email",[portfolioId])).rows;
 if(!rows.length)throw fail(404,"This portfolio has no active test accounts.","NOT_FOUND");
 const workbookRows=rows.map(row=>({Email:row.email,Password:decryptSecret(row.password_ciphertext),"Display name":row.display_name,Persona:row.persona,Role:row.role_code,"Sign-in URL":process.env.TEST_LAB_SIGN_IN_URL||"Set TEST_LAB_SIGN_IN_URL","Portfolio":p.name,"Expires":new Date(p.expires_at).toISOString(),"Instructions":"Development/test only. Do not reuse this password. Delete workbook after testing."}));
 const buffer=createXlsx(workbookRows,Object.keys(workbookRows[0]));
 await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,outcome,metadata) values($1,'test_lab.credentials.exported','test_portfolio',$2,'success',$3)",[identity.sub,portfolioId,{accountCount:rows.length,format:"xlsx"}]);
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
export async function captureTestDelivery({channel,recipient=null,eventCode,payload={},portfolioId=null}){
 if(process.env.TEST_DELIVERY_MODE!=="capture"||process.env.NODE_ENV==="production")return false;
 const db=getPool();
 let owner=portfolioId;
 if(!owner&&recipient)owner=(await db.query("select portfolio_id from test_portfolio_account where lower(email)=lower($1) limit 1",[String(recipient)])).rows[0]?.portfolio_id||null;
 await db.query("insert into test_delivery_capture(portfolio_id,channel,recipient,event_code,payload) values($1,$2,$3,$4,$5)",[owner,channel,recipient,eventCode,payload]);
 return true;
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
 const payments=(await db.query(`select r.entity_id id,p.provider_transaction_id,p.purpose,p.amount,p.currency,p.status,p.created_at,p.updated_at
  from test_portfolio_record r join payment_transaction p on p.id=r.entity_id
  where r.portfolio_id=$1 and r.table_name='payment_transaction' and p.provider='test-simulator' and p.purpose='test_lab_simulation'
  order by p.created_at desc`,[portfolioId])).rows;
 return {portfolio,deliveries,payments};
}
export async function simulateTestPayment(identity,portfolioId,paymentId,input={},requestId=null){
 requireSystemAdmin(identity);const db=getPool();await assertSafeEnvironment(db);
 const next=String(input.status||"").trim().toLowerCase();
 if(!["pending","succeeded","failed","cancelled"].includes(next))throw fail(400,"Choose pending, succeeded, failed or cancelled for a simulated payment.","VALIDATION_ERROR");
 return withTransaction(async tx=>{
  const payment=(await tx.query(`select p.* from payment_transaction p join test_portfolio_record r on r.entity_id=p.id and r.table_name='payment_transaction' and r.portfolio_id=$1
   join test_portfolio t on t.id=r.portfolio_id and t.status='active'
   where p.id=$2 and p.provider='test-simulator' and p.purpose='test_lab_simulation' for update of p`,[portfolioId,paymentId])).rows[0];
  if(!payment)throw fail(404,"Simulated payment was not found in this active test portfolio.","NOT_FOUND");
  if(payment.status===next)return {paymentId,status:next,replayed:true,simulated:true};
  if(!["initiated","pending"].includes(payment.status))throw fail(409,"A completed simulated payment cannot be reopened or changed to a different outcome.","PAYMENT_ALREADY_DECIDED");
  const updated=(await tx.query("update payment_transaction set status=$1,response_payload=response_payload || $2::jsonb,completed_at=case when $1 in ('succeeded','failed','cancelled') then now() else null end,updated_at=now() where id=$3 returning id,status,amount,currency,provider_transaction_id",
   [next,{simulated:true,testPortfolioId:portfolioId,simulationReason:clean(input.reason,240)||"QA payment simulation",simulatedAt:new Date().toISOString()},paymentId])).rows[0];
  await tx.query("insert into test_delivery_capture(portfolio_id,channel,event_code,payload) values($1,'payment','simulated_payment_status_changed',$2)",[portfolioId,{paymentId,status:next,amount:payment.amount,currency:payment.currency}]);
  await tx.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'test_lab.payment.simulated','payment_transaction',$2,$3,'success',$4)",[identity.sub,paymentId,requestId,{portfolioId,from:payment.status,to:next,reason:clean(input.reason,240)}]);
  return {...updated,simulated:true,replayed:false};
 });
}
