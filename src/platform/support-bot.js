import { createHash, randomUUID } from "node:crypto";
import { getPool, withTransaction } from "./db.js";
import { queueWorkflowEmail } from "./email-operations.js";

const clean = (value, max=2000) => String(value ?? "").replace(/\p{Cc}/gu, character => "\t\n\r".includes(character) ? character : "").trim().slice(0,max);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sha = value => createHash("sha256").update(String(value)).digest("hex");
const slugify = value => clean(value,80).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80) || "category";
function publicRef(){return `MPA-SUP-${randomUUID().replace(/-/g,"").slice(0,10).toUpperCase()}`;}
function httpError(message,statusCode=400,code="INVALID_REQUEST"){return Object.assign(new Error(message),{statusCode,code});}
function rowArticle(row){return {id:row.id,categoryId:row.category_id,categoryName:row.category_name,title:row.title,questionExamples:row.question_examples||[],keywords:row.keywords||[],answer:row.answer,sourceNote:row.source_note,sortOrder:row.sort_order,isPublished:row.is_published,updatedAt:row.updated_at};}
function matchScore(question,article){
 const normalize=value=>String(value||"").toLowerCase().normalize("NFKD").replace(/[^\\p{L}\\p{N}\\s]/gu," ").replace(/\\s+/g," ").trim();
 const q=normalize(question);
 const entries=[article.title,...(article.question_examples||[]),...(article.keywords||[])].map(normalize).filter(Boolean);
 const qTokens=new Set(q.split(" ").filter(token=>token.length>2));
 let score=0;
 for(const token of qTokens){if(entries.some(entry=>entry.split(" ").includes(token)))score+=token.length>5?2:1;}
 if(entries.some(entry=>entry===q))score+=5;
 if(entries.some(entry=>entry.startsWith(`${q} `)||entry.endsWith(` ${q}`)||entry.includes(` ${q} `)))score+=4;
 return score;
}
async function logAudit(db,actorId,action,resourceId,requestId,metadata={}){
 await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,'support_bot',$3,$4,'success',$5)",
 [actorId,action,resourceId,requestId||null,{source:"support-bot-admin",...metadata}]);
}
async function assertConversationScope(db,actorId,id,canManageAll=false,lock=false){
 if(!actorId) throw httpError("A signed-in support identity is required.",403,"FORBIDDEN");
 const row=(await db.query(`select id,public_reference,assigned_to,status from support_conversation where id=$1${lock?" for update":""}`,[id])).rows[0];
 if(!row) throw httpError("Inquiry not found.",404,"NOT_FOUND");
 if(!canManageAll && row.assigned_to && row.assigned_to!==actorId) throw httpError("This inquiry is assigned to another support colleague. Ask a support manager if reassignment is needed.",403,"FORBIDDEN");
 return row;
}
export async function answerPublicQuestion(input,context={}){
 const question=clean(input.question,2000);
 if(question.length<2)throw httpError("Please enter a question with at least two characters.");
 const rawVisitorKey=clean(context.visitorKey||"",200);
 if(rawVisitorKey.length<16)throw httpError("Refresh the page and try sending your question again.",400,"VISITOR_SESSION_REQUIRED");
 const contactName=clean(input.contactName,160)||null;
 const contactEmail=clean(input.contactEmail,254).toLowerCase()||null;
 const contactPhone=clean(input.contactPhone,40)||null;
 const consentToContact=input.consentToContact===true;
 const preferredContact=["email","phone","none"].includes(input.preferredContact)?input.preferredContact:"email";
 if(contactEmail&&!emailPattern.test(contactEmail))throw httpError("Enter a valid email address or leave it blank.");
 if(contactPhone&&!/^[+0-9() .-]{6,40}$/.test(contactPhone))throw httpError("Enter a valid phone number or leave it blank.");
 if(consentToContact&&!contactEmail&&!contactPhone)throw httpError("Add an email address or phone number to request follow-up.");
 const db=getPool();
 const visitorKey=sha(rawVisitorKey);
 const pagePath=clean(context.pagePath||"/",500)||"/";
 let conversationId=null;
 let conversationReference=null;
 const suppliedRef=clean(input.conversationRef,32);
 if(suppliedRef){
   const found=await db.query("select id from support_conversation where public_reference=$1 and visitor_key_hash=$2",[suppliedRef,visitorKey]);
   if(found.rows[0]){conversationId=found.rows[0].id;conversationReference=suppliedRef;}
 }
 if(!conversationId){
   const generatedRef=publicRef();
   const created=await db.query("insert into support_conversation(public_reference,visitor_key_hash,user_id,page_path,last_question) values($1,$2,$3,$4,$5) returning id,public_reference",
   [generatedRef,visitorKey,context.userId||null,pagePath,question]);
   conversationId=created.rows[0].id;conversationReference=created.rows[0].public_reference;
 }
 await db.query("insert into support_message(conversation_id,sender_type,message_text) values($1,'visitor',$2)",[conversationId,question]);
 const articles=await db.query(`select a.*,c.name as category_name,c.id as category_id from support_knowledge_article a join support_knowledge_category c on c.id=a.category_id where a.is_published=true and c.is_active=true order by a.sort_order,a.updated_at desc limit 300`);
 const ranked=articles.rows.map(article=>({article,score:matchScore(question,article)})).sort((a,b)=>b.score-a.score);
 const best=ranked[0]?.score>=3?ranked[0].article:null;
 const answer=best?best.answer:"I don’t have a verified answer for that question in the MPA help library yet. I’ve recorded your inquiry so the support team can review it. If you share contact details and consent to follow-up, they can get back to you.";
 const categoryId=best?.category_id||null;
 const contactable=consentToContact&&(Boolean(contactEmail)||Boolean(contactPhone));
 await db.query(`update support_conversation set user_id=coalesce($2,user_id),contact_name=coalesce($3,contact_name),contact_email=coalesce($4,contact_email),contact_phone=coalesce($5,contact_phone),preferred_contact=$6,consent_to_contact=$7,page_path=$8,status=case when $9 then 'open' when status='open' then 'resolved' else status end,category_id=coalesce($10,category_id),last_question=$11,updated_at=now() where id=$1`,
 [conversationId,context.userId||null,contactName,contactEmail,contactPhone,preferredContact,contactable,pagePath,Boolean(!best||contactable),categoryId,question]);
 await db.query("insert into support_message(conversation_id,sender_type,message_text,knowledge_article_id) values($1,'bot',$2,$3)",[conversationId,answer,best?.id||null]);
 return {conversationRef:conversationReference,answer,answeredFromKnowledgeBase:Boolean(best),articleTitle:best?.title||null,needsHumanFollowUp:!best||contactable,contactSaved:Boolean(contactName||contactEmail||contactPhone),privacyNotice:"Your inquiry is visible to authorized MPA support staff. Contact details are used for follow-up only when you ask MPA to contact you."};
}
export async function listPublicKnowledge(){
 const db=getPool();
 const r=await db.query("select a.id,a.title,a.question_examples,a.keywords,a.answer,c.name as category_name from support_knowledge_article a join support_knowledge_category c on c.id=a.category_id where a.is_published=true and c.is_active=true order by c.sort_order,a.sort_order,a.title");
 return r.rows.map(row=>({id:row.id,title:row.title,questionExamples:row.question_examples||[],keywords:row.keywords||[],answer:row.answer,categoryName:row.category_name}));
}
export async function adminGetKnowledge(){
 const db=getPool();
 const [categories,articles]=await Promise.all([
  db.query("select id,slug,name,description,sort_order,is_active,updated_at from support_knowledge_category order by sort_order,name"),
  db.query("select a.*,c.name as category_name from support_knowledge_article a join support_knowledge_category c on c.id=a.category_id order by c.sort_order,a.sort_order,a.updated_at desc")
 ]);
 return {categories:categories.rows.map(c=>({id:c.id,slug:c.slug,name:c.name,description:c.description,sortOrder:c.sort_order,isActive:c.is_active,updatedAt:c.updated_at})),articles:articles.rows.map(rowArticle)};
}
export async function adminSaveCategory(actorId,input,requestId){
 const db=getPool();const name=clean(input.name,120);if(name.length<2)throw httpError("Category name is required.");
 const slug=slugify(input.slug||name);const description=clean(input.description,500);
 const id=clean(input.id,40);
 let r;
 if(id){r=await db.query("update support_knowledge_category set name=$2,slug=$3,description=$4,sort_order=$5,is_active=$6,updated_by=$7,updated_at=now() where id=$1 returning id",[id,name,slug,description,Number.isFinite(Number(input.sortOrder))?Math.trunc(Number(input.sortOrder)):0,input.isActive!==false,actorId]);}
 else{r=await db.query("insert into support_knowledge_category(name,slug,description,sort_order,is_active,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$6) returning id",[name,slug,description,Number.isFinite(Number(input.sortOrder))?Math.trunc(Number(input.sortOrder)):0,input.isActive!==false,actorId]);}
 if(!r.rows[0])throw httpError("Category was not found.",404,"NOT_FOUND");await logAudit(db,actorId,"support.knowledge_category_saved",r.rows[0].id,requestId);return (await adminGetKnowledge()).categories.find(c=>c.id===r.rows[0].id);
}
export async function adminSaveArticle(actorId,input,requestId){
 const db=getPool();const title=clean(input.title,180),answer=clean(input.answer,12000),categoryId=clean(input.categoryId,40);
 if(title.length<3||answer.length<3||!categoryId)throw httpError("Choose a category and provide an article title and answer.");
 const category=await db.query("select id from support_knowledge_category where id=$1",[categoryId]);if(!category.rows[0])throw httpError("Choose an existing category.",400,"INVALID_CATEGORY");
 const toArray=v=>(Array.isArray(v)?v:String(v||"").split(/[,\n]/)).map(x=>clean(x,100)).filter(Boolean).slice(0,50);
 const examples=toArray(input.questionExamples),keywords=toArray(input.keywords),sourceNote=clean(input.sourceNote,500),sortOrder=Number.isFinite(Number(input.sortOrder))?Math.trunc(Number(input.sortOrder)):0;
 const id=clean(input.id,40);let r;
 if(id){r=await db.query("update support_knowledge_article set category_id=$2,title=$3,question_examples=$4,keywords=$5,answer=$6,source_note=$7,sort_order=$8,is_published=$9,updated_by=$10,updated_at=now() where id=$1 returning id",[id,categoryId,title,examples,keywords,answer,sourceNote,sortOrder,input.isPublished===true,actorId]);}
 else{r=await db.query("insert into support_knowledge_article(category_id,title,question_examples,keywords,answer,source_note,sort_order,is_published,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) returning id",[categoryId,title,examples,keywords,answer,sourceNote,sortOrder,input.isPublished===true,actorId]);}
 if(!r.rows[0])throw httpError("Article was not found.",404,"NOT_FOUND");await logAudit(db,actorId,"support.knowledge_article_saved",r.rows[0].id,requestId);return (await adminGetKnowledge()).articles.find(a=>a.id===r.rows[0].id);
}
export async function adminListSupportColleagues(actorId){
 const db=getPool();
 const manager=(await db.query("select exists(select 1 from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1 and r.role_code in ('system_admin','admin','platform_admin')) is_admin,exists(select 1 from app_user_permission up where up.user_id=$1 and up.permission_code='support.inquiries.manage') can_manage",[actorId])).rows[0]||{};
 if(!manager.is_admin&&!manager.can_manage)throw httpError("Only a support manager may view the colleague transfer list.",403,"FORBIDDEN");
 return (await db.query("select distinct u.id,p.display_name,u.email from app_user u left join person p on p.user_id=u.id where u.status='active' and (exists(select 1 from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=u.id and r.role_code in ('supporting_staff','system_admin','admin')) or exists(select 1 from app_user_permission up where up.user_id=u.id and up.permission_code=any(array['support.manage','support.queue.manage','support.inquiries.manage']))) order by p.display_name nulls last,u.email")).rows;
}
export async function adminListConversations(filters={}){
 const db=getPool();const escalatedOnly=filters.escalatedOnly===true;const status=["open","in_progress","resolved","closed"].includes(filters.status)?filters.status:null;
 const actorId=filters.actorId;
 if(!actorId) throw httpError("A signed-in support identity is required.",403,"FORBIDDEN");
 const canViewAll=filters.canViewAll===true;
 const limit=Math.max(1,Math.min(100,Number.parseInt(filters.limit||"50",10)||50));
 const r=await db.query(`select c.id,c.public_reference,c.user_id,case when c.consent_to_contact then c.contact_name else null end as contact_name,case when c.consent_to_contact then c.contact_email else null end as contact_email,case when c.consent_to_contact then c.contact_phone else null end as contact_phone,case when c.consent_to_contact then c.preferred_contact else null end as preferred_contact,c.consent_to_contact,c.page_path,c.status,c.last_question,c.created_at,c.updated_at,c.assigned_to,c.resolved_at,coalesce((select w.priority from support_conversation_workflow w where w.conversation_id=c.id),'normal') as priority,coalesce((select w.waiting_on from support_conversation_workflow w where w.conversation_id=c.id),'none') as waiting_on,(select w.escalated_at from support_conversation_workflow w where w.conversation_id=c.id) as escalated_at,(select w.escalation_reason from support_conversation_workflow w where w.conversation_id=c.id) as escalation_reason,cat.name as category_name,
 coalesce(json_agg(json_build_object('id',m.id,'senderType',m.sender_type,'message',m.message_text,'createdAt',m.created_at,'knowledgeArticleId',m.knowledge_article_id) order by m.created_at) filter(where m.id is not null),'[]'::json) as messages
 from support_conversation c left join support_knowledge_category cat on cat.id=c.category_id left join support_message m on m.conversation_id=c.id
 where ($1::text is null or c.status=$1) and ($3::boolean=true or c.assigned_to is null or c.assigned_to=$2) and (not $5::boolean or exists(select 1 from support_conversation_workflow ew where ew.conversation_id=c.id and ew.escalated_at is not null))
 group by c.id,cat.name order by case when exists(select 1 from support_conversation_workflow ew where ew.conversation_id=c.id and ew.escalated_at is not null) then 0 else 1 end,case c.status when 'open' then 0 when 'in_progress' then 1 else 2 end,c.updated_at desc limit $4`,[status,actorId,canViewAll,limit,escalatedOnly]);
 return r.rows.map(c=>({...c,contactName:c.contact_name,contactEmail:c.contact_email,contactPhone:c.contact_phone,preferredContact:c.preferred_contact,consentToContact:c.consent_to_contact,pagePath:c.page_path,publicReference:c.public_reference,lastQuestion:c.last_question,createdAt:c.created_at,updatedAt:c.updated_at,categoryName:c.category_name,waitingOn:c.waiting_on,escalatedAt:c.escalated_at,escalationReason:c.escalation_reason,messages:c.messages||[]}));
}
export async function adminUpdateConversation(actorId,id,input,requestId,canManageAll=false){
 const status=input.status===undefined?null:clean(input.status,20);
 if(status!==null&&!["open","in_progress","resolved","closed"].includes(status))throw httpError("Choose a valid inquiry status.");
 const hasTransfer=Object.prototype.hasOwnProperty.call(input,"assignToUserId");
 const requestedAssignee=hasTransfer?(clean(input.assignToUserId,80)||null):undefined;
 const reason=clean(input.reason,1000)||null;
 if(hasTransfer&&!canManageAll)throw httpError("Only a support manager may transfer an inquiry to another colleague.",403,"FORBIDDEN");
 if(hasTransfer&&requestedAssignee===null&&!reason)throw httpError("Add a reason when returning an inquiry to the unassigned queue.");
 if(hasTransfer&&!reason)throw httpError("Add a short handoff reason so the next colleague understands why this inquiry is being transferred.");
 return withTransaction(async db=>{
  const current=await assertConversationScope(db,actorId,id,canManageAll,true);
  if(hasTransfer&&requestedAssignee){
   const eligible=await db.query(`select u.id from app_user u where u.id=$1 and u.status='active' and (
    exists(select 1 from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=u.id and r.role_code=any($2::text[]))
    or exists(select 1 from app_user_permission up where up.user_id=u.id and up.permission_code=any($3::text[]))
   )`,[requestedAssignee,["supporting_staff","system_admin","admin"],["support.manage","support.queue.manage","support.inquiries.manage"]]);
   if(!eligible.rowCount)throw httpError("Choose an active Support Desk colleague with support permissions.",400,"INVALID_ASSIGNEE");
  }
  const nextStatus=status||current.status;
  const hasPriority=Object.prototype.hasOwnProperty.call(input,"priority");
  const hasWaitingOn=Object.prototype.hasOwnProperty.call(input,"waitingOn");
  const priority=hasPriority?clean(input.priority,20):null;
  const waitingOn=hasWaitingOn?clean(input.waitingOn,30):null;
  if(hasPriority&&!["low","normal","high","urgent"].includes(priority))throw httpError("Choose a valid inquiry priority.");
  if(hasWaitingOn&&!["none","member","organization","provider","internal"].includes(waitingOn))throw httpError("Choose a valid waiting state.");
  const assignToSelf=!hasTransfer&&(input.assignToSelf===true||(!current.assigned_to&&["in_progress","resolved","closed"].includes(nextStatus)));
  const nextAssignee=hasTransfer?requestedAssignee:(assignToSelf?actorId:current.assigned_to);
  const r=await db.query("update support_conversation set status=$2,assigned_to=$3,resolved_at=case when $4='resolved' then coalesce(resolved_at,now()) when $4 in ('open','in_progress') then null else resolved_at end,updated_at=now() where id=$1 returning id,public_reference,status,assigned_to",[id,nextStatus,nextAssignee,String(nextStatus)]);
  if(!r.rows[0])throw httpError("Inquiry not found.",404,"NOT_FOUND");
  if(hasTransfer){
   await logAudit(db,actorId,"support.inquiry_transferred",id,requestId,{fromAssignee:current.assigned_to,toAssignee:r.rows[0].assigned_to,fromStatus:current.status,toStatus:r.rows[0].status,reason});
  }
  if(status!==null&&status!==current.status){
   await logAudit(db,actorId,"support.inquiry_status_changed",id,requestId,{fromStatus:current.status,toStatus:status,assignedTo:r.rows[0].assigned_to,reason});
  }
  if(hasPriority||hasWaitingOn){
   const oldWorkflow=(await db.query("select priority,waiting_on from support_conversation_workflow where conversation_id=$1 for update",[id])).rows[0]||{priority:"normal",waiting_on:"none"};
   await db.query("insert into support_conversation_workflow(conversation_id,priority,waiting_on,updated_by) values($1,$2,$3,$4) on conflict(conversation_id) do update set priority=$2,waiting_on=$3,updated_by=$4,updated_at=now()",[id,hasPriority?priority:oldWorkflow.priority,hasWaitingOn?waitingOn:oldWorkflow.waiting_on,actorId]);
   await logAudit(db,actorId,"support.inquiry_workflow_updated",id,requestId,{fromPriority:oldWorkflow.priority,toPriority:hasPriority?priority:oldWorkflow.priority,fromWaitingOn:oldWorkflow.waiting_on,toWaitingOn:hasWaitingOn?waitingOn:oldWorkflow.waiting_on,reason});
  }
  return {id:r.rows[0].id,publicReference:r.rows[0].public_reference,status:r.rows[0].status,assignedTo:r.rows[0].assigned_to,transferred:hasTransfer};
 });
}

export async function escalateConversation(actorId,id,input,requestId,canManageAll=false){
 const reason=clean(input.reason,1000);
 if(reason.length<8)throw httpError("Add a clear escalation reason of at least 8 characters.");
 const priority=clean(input.priority||"high",20);
 if(!["high","urgent"].includes(priority))throw httpError("Escalations must use high or urgent priority.");
 return withTransaction(async db=>{
  const current=await assertConversationScope(db,actorId,id,canManageAll,true);
  if(["resolved","closed"].includes(current.status))throw httpError("Reopen the inquiry before escalating a closed or resolved case.",409,"INVALID_STATE");
  const assigned=(await db.query("update support_conversation set assigned_to=coalesce(assigned_to,$2),updated_at=now() where id=$1 returning assigned_to",[id,actorId])).rows[0];
  const row=(await db.query("insert into support_conversation_workflow(conversation_id,priority,waiting_on,escalated_at,escalated_by,escalation_reason,updated_by) values($1,$2,'internal',now(),$3,$4,$3) on conflict(conversation_id) do update set priority=$2,waiting_on='internal',escalated_at=now(),escalated_by=$3,escalation_reason=$4,updated_by=$3,updated_at=now() returning *",[id,priority,actorId,reason])).rows[0];
  await logAudit(db,actorId,"support.inquiry_escalated",id,requestId,{fromStatus:current.status,priority,reason,assignedTo:assigned.assigned_to});
  const managers=(await db.query("select distinct u.id from app_user u where u.status='active' and (exists(select 1 from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=u.id and r.role_code in ('system_admin','admin','platform_admin')) or exists(select 1 from app_user_permission up where up.user_id=u.id and up.permission_code='support.inquiries.manage'))")).rows;
  for(const manager of managers)await queueWorkflowEmail(db,manager.id,"support.inquiry_escalated",{category:"support",title:"Support inquiry escalated",publicReference:current.public_reference||id,status:current.status,priority,message:"A support inquiry has been escalated for manager attention.",nextAction:"Review the inquiry, its assignment and escalation reason, then record the next decision.",actionUrl:"/admin/support",actionRequired:true,eventVersion:row.updated_at?.toISOString?.()||String(row.updated_at)},"support_bot",id);
  return {id,publicReference:current.public_reference||null,status:current.status,priority:row.priority,waitingOn:row.waiting_on,escalatedAt:row.escalated_at,escalationReason:row.escalation_reason,assignedTo:assigned.assigned_to};
 });
}

export async function adminReplyToConversation(actorId,id,input,requestId,canManageAll=false){
 const message=clean(input.message,5000);if(message.length<2)throw httpError("Reply must contain at least two characters.");
 return withTransaction(async db=>{
  const current=await assertConversationScope(db,actorId,id,canManageAll,true);
  await db.query("insert into support_message(conversation_id,sender_type,message_text) values($1,'staff',$2)",[id,message]);
  const updated=(await db.query("update support_conversation set status=case when status='open' then 'in_progress' else status end,assigned_to=coalesce(assigned_to,$2),updated_at=now() where id=$1 returning assigned_to,status",[id,actorId])).rows[0];
  await logAudit(db,actorId,"support.inquiry_replied",id,requestId,{fromStatus:current.status,toStatus:updated.status,assignedTo:updated.assigned_to});
  return {id,message,status:updated.status,assignedTo:updated.assigned_to};
 });
}
