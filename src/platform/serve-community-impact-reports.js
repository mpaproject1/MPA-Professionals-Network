import {getPool} from "./db.js";

const MIN_GROUP_SIZE=5;
const GOVERNANCE_ROLES=new Set(["system_admin","admin","reviewer","supporting_staff"]);
const ORG_REPORT_ROLES=["owner","administrator","project_manager"];
function fail(status,message,code="IMPACT_REPORT_ERROR"){const e=new Error(message);e.statusCode=status;e.code=code;return e;}
function isGovernanceReviewer(identity){return (identity?.roles||[]).some(role=>GOVERNANCE_ROLES.has(role))||(identity?.permissions||[]).some(permission=>["serve_community.governance_reports","reports.governance"].includes(permission));}
function safeCount(value){const n=Number(value||0);return Number.isFinite(n)&&n>=0?Math.trunc(n):0;}
function suppress(value){const n=safeCount(value);return n<MIN_GROUP_SIZE?{value:null,suppressed:true,minimumGroupSize:MIN_GROUP_SIZE}:{value:n,suppressed:false,minimumGroupSize:MIN_GROUP_SIZE};}
function suppressRows(rows,key){return rows.map(row=>({...row,[key]:suppress(row.count)}));}
function cleanFilters(input={}){const from=String(input.from||"").trim(),to=String(input.to||"").trim();const valid=v=>!v||(/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+"T00:00:00Z")));if(!valid(from)||!valid(to)||(from&&to&&from>to))throw fail(400,"Dates must use YYYY-MM-DD and the start date must not follow the end date.","INVALID_DATE_RANGE");return {from,to};}
async function authorizeListing(db,identity,listingId,view){
 if(typeof listingId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(listingId))throw fail(400,"A valid listing ID is required.","LISTING_ID_REQUIRED");
 const listing=(await db.query("select id,provider_user_id,organization_id,title,service_category,lifecycle_status from service_listing where id=$1",[listingId])).rows[0];
 if(!listing)throw fail(404,"Service listing not found.","NOT_FOUND");
 const governance=isGovernanceReviewer(identity);
 if(view==="governance"&&!governance)throw fail(403,"The governance report is restricted to authorized administrators and reviewers.","GOVERNANCE_REPORT_FORBIDDEN");
 if(governance)return {...listing,view:"governance"};
 if(view==="governance")throw fail(403,"The governance report is restricted to authorized administrators and reviewers.","GOVERNANCE_REPORT_FORBIDDEN");
 if(listing.provider_user_id===identity?.sub)return {...listing,view:"owner"};
 if(listing.organization_id){
  const allowed=(await db.query("select 1 from organization_membership om join app_user u on u.id=om.user_id where om.organization_id=$1 and om.user_id=$2 and om.status='active' and u.status='active' and om.role_code=any($3::text[]) limit 1",[listing.organization_id,identity?.sub,ORG_REPORT_ROLES])).rowCount>0;
  if(allowed)return {...listing,view:"owner"};
 }
 throw fail(403,"Only the listing owner, an authorized organization manager, or an authorized governance reviewer may access this report.","IMPACT_REPORT_FORBIDDEN");
}
export async function runImpactReport(identity,listingId,filters={},requestId,view="owner"){
 const db=getPool(),applied=cleanFilters(filters),listing=await authorizeListing(db,identity,listingId,view);
 const dateClause="($2::date is null or created_at >= $2::date) and ($3::date is null or created_at < ($3::date + interval '1 day'))";
 const args=[listingId,applied.from||null,applied.to||null];
 const counts=(await db.query(`select
 (select count(distinct i.individual_user_id)::int from service_listing_interest i where i.listing_id=$1 and i.status='interested' and i.individual_user_id is not null and ${dateClause.replaceAll("created_at","i.created_at")}) interested_users,
 (select count(distinct i.organization_id)::int from service_listing_interest i where i.listing_id=$1 and i.status='interested' and i.organization_id is not null and ${dateClause.replaceAll("created_at","i.created_at")}) interested_organizations,
 (select count(distinct p.id)::int from service_listing_pledge p where p.listing_id=$1 and p.status='submitted' and ${dateClause.replaceAll("created_at","p.created_at")}) submitted_pledges,
 (select count(distinct p.id)::int from service_listing_pledge p where p.listing_id=$1 and p.status='accepted' and ${dateClause.replaceAll("created_at","p.created_at")}) accepted_commitments,
 (select count(distinct r.id)::int from service_request r join lateral (select a.provider_accepted_at,a.requester_accepted_at from service_request_agreement a where a.request_id=r.id order by a.terms_version desc limit 1) a on true where r.service_listing_id=$1 and r.status='in_progress' and a.provider_accepted_at is not null and a.requester_accepted_at is not null and ($2::date is null or r.created_at >= $2::date) and ($3::date is null or r.created_at < ($3::date + interval '1 day'))) active_engagements,
 (select count(distinct r.id)::int from service_request r where r.service_listing_id=$1 and r.status='completed' and r.provider_completed_at is not null and r.requester_accepted_at is not null and length(trim(coalesce(r.outcome_summary,'')))>0 and ($2::date is null or r.created_at >= $2::date) and ($3::date is null or r.created_at < ($3::date + interval '1 day'))) submitted_outcomes,
 (select count(distinct f.request_id)::int from service_request_feedback f join service_request r on r.id=f.request_id where r.service_listing_id=$1 and ($2::date is null or f.created_at >= $2::date) and ($3::date is null or f.created_at < ($3::date + interval '1 day'))) feedback_completed,
 (select count(distinct r.id)::int from service_request r join lateral (select a.provider_accepted_at,a.requester_accepted_at from service_request_agreement a where a.request_id=r.id order by a.terms_version desc limit 1) a on true where r.service_listing_id=$1 and a.provider_accepted_at is not null and a.requester_accepted_at is not null and ($2::date is null or r.created_at >= $2::date) and ($3::date is null or r.created_at < ($3::date + interval '1 day'))) accepted_engagements`,args)).rows[0]||{};
 const metrics=Object.fromEntries(Object.entries(counts).map(([key,value])=>[key,suppress(value)]));
 const monthly=(await db.query(`select to_char(date_trunc('month',x.created_at),'YYYY-MM') month,count(*)::int count from (
 select i.created_at from service_listing_interest i where i.listing_id=$1 and i.status='interested'
 union all select p.created_at from service_listing_pledge p where p.listing_id=$1 and p.status in ('submitted','accepted')
 union all select r.created_at from service_request r where r.service_listing_id=$1 and r.status in ('accepted','in_progress','completed')
 ) x where ($2::date is null or x.created_at >= $2::date) and ($3::date is null or x.created_at < ($3::date + interval '1 day')) group by 1 order by 1`,args)).rows.map(r=>({month:r.month,...suppress(r.count)}));
 const feedback=(await db.query(`select f.category,count(distinct f.request_id)::int count from service_request_feedback f join service_request r on r.id=f.request_id where r.service_listing_id=$1 and ($2::date is null or f.created_at >= $2::date) and ($3::date is null or f.created_at < ($3::date + interval '1 day')) group by f.category order by f.category`,args)).rows.map(r=>({category:r.category,...suppress(r.count)}));
 const milestones=(await db.query(`select u.category,count(*)::int count from service_request_update u join service_request r on r.id=u.request_id where r.service_listing_id=$1 and ($2::date is null or u.created_at >= $2::date) and ($3::date is null or u.created_at < ($3::date + interval '1 day')) group by u.category order by u.category`,args)).rows.map(r=>({milestoneType:r.category,...suppress(r.count)}));
 let decisions=[];
 if(listing.view==="governance"){
  decisions=(await db.query(`select e.to_status decision,count(*)::int count,max(e.created_at) latest_at from service_listing_lifecycle_event e where e.listing_id=$1 and ($2::date is null or e.created_at >= $2::date) and ($3::date is null or e.created_at < ($3::date + interval '1 day')) group by e.to_status order by e.to_status`,args)).rows.map(r=>({decision:r.decision,...suppress(r.count),latestAt:r.latest_at}));
 }
 const report={id:"serve-community-impact",title:listing.view==="governance"?"Serve-Community impact governance report":"Serve-Community impact report",listing:{id:listing.id,title:listing.title,category:listing.service_category,lifecycleStatus:listing.lifecycle_status},view:listing.view,minimumGroupSize:MIN_GROUP_SIZE,suppressionPolicy:"Counts below five are suppressed. Participant identities, contact details, free-text outcomes, pledge descriptions, decision reasons and actor identifiers are excluded. Monthly and category breakdowns are suppressed independently.",filters:applied,generatedAt:new Date().toISOString(),metrics,monthlySummary:monthly,feedbackCompletionByCategory:feedback,milestoneActivity:milestones,...(listing.view==="governance"?{decisionAudit:decisions}: {})};
 await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,'service_listing',$3,$4,'success',$5)",[identity.sub,listing.view==="governance"?"serve_community.impact_governance_report_generated":"serve_community.impact_report_generated",listing.id,requestId,JSON.stringify({view:listing.view,filters:applied,minimumGroupSize:MIN_GROUP_SIZE,suppressedMetricCount:Object.values(metrics).filter(x=>x.suppressed).length})]);
 return report;
}
export {MIN_GROUP_SIZE};
