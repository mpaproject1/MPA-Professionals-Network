import { getPool, withTransaction } from "./db.js";
import { assertCurrentActiveMembership } from "./identity-policy.js";

function fail(status,message,code="VOLUNTEER_PLEDGE_ERROR"){const error=new Error(message);error.statusCode=status;error.code=code;return error;}
const SCOPES=new Set(["community","mpa","members"]);
const MODES=new Set(["remote","in_person","hybrid","flexible"]);
function clean(value,max){return String(value??"").trim().slice(0,max);}
function validate(input){
 const title=clean(input.serviceTitle,120),category=clean(input.serviceCategory,80),description=clean(input.description,2000),availability=clean(input.availabilityDetails,500);
 const scopes=[...new Set(Array.isArray(input.beneficiaryScopes)?input.beneficiaryScopes.map(String):[])];
 const hours=Number(input.hoursPerWeek),weeks=Number(input.durationWeeks),mode=String(input.deliveryMode||"flexible");
 if(title.length<4||category.length<2||description.length<20||availability.length<5)throw fail(400,"Complete the service title, category, description and availability details.","VALIDATION_ERROR");
 if(!scopes.length||scopes.some(scope=>!SCOPES.has(scope)))throw fail(400,"Choose at least one beneficiary group: community, MPA or members.","VALIDATION_ERROR");
 if(!Number.isFinite(hours)||hours<=0||hours>60||!Number.isInteger(weeks)||weeks<1||weeks>104||!MODES.has(mode))throw fail(400,"Hours per week, active duration and delivery mode are invalid.","VALIDATION_ERROR");
 return {title,category,description,scopes,availability,hours,weeks,mode,location:clean(input.locationText,240)||null,availableFrom:input.availableFrom||null,status:["active","paused","completed"].includes(input.status)?input.status:"active"};
}
async function assertActiveMember(db,userId){await assertCurrentActiveMembership(db,userId,"An active MPA membership is required to create or edit a community volunteer pledge.");}
async function audit(db,userId,action,id,requestId,metadata={}){await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,'member_volunteer_pledge',$3,$4,'success',$5)",[userId,action,id,requestId,JSON.stringify(metadata)]);}
export async function listMyVolunteerPledges(userId){
 const db=getPool();await assertActiveMember(db,userId);
 return (await db.query("select id,service_title,service_category,description,beneficiary_scopes,availability_details,hours_per_week,duration_weeks,available_from,delivery_mode,location_text,status,created_at,updated_at from member_volunteer_pledge where user_id=$1 and status<>'withdrawn' order by created_at",[userId])).rows;
}
export async function saveVolunteerPledge(userId,input={},requestId){
 const fields=validate(input);
 return withTransaction(async db=>{
  await assertActiveMember(db,userId);
  const row=(await db.query("insert into member_volunteer_pledge(user_id,service_title,service_category,description,beneficiary_scopes,availability_details,hours_per_week,duration_weeks,available_from,delivery_mode,location_text,status) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *",[userId,fields.title,fields.category,fields.description,fields.scopes,fields.availability,fields.hours,fields.weeks,fields.availableFrom,fields.mode,fields.location,fields.status])).rows[0];
  await audit(db,userId,"volunteer_pledge.created",row.id,requestId,{serviceCategory:fields.category,beneficiaryScopes:fields.scopes,hoursPerWeek:fields.hours,durationWeeks:fields.weeks});
  return row;
 });
}
export async function updateVolunteerPledge(pledgeId,userId,input={},requestId){
 const fields=validate(input);
 return withTransaction(async db=>{
  await assertActiveMember(db,userId);
  const current=(await db.query("select * from member_volunteer_pledge where id=$1 and user_id=$2 for update",[pledgeId,userId])).rows[0];
  if(!current)throw fail(404,"Volunteer pledge not found.","NOT_FOUND");
  if(current.status==="withdrawn")throw fail(409,"A withdrawn pledge cannot be edited. Add a new service pledge instead.","INVALID_STATE");
  const row=(await db.query("update member_volunteer_pledge set service_title=$1,service_category=$2,description=$3,beneficiary_scopes=$4,availability_details=$5,hours_per_week=$6,duration_weeks=$7,available_from=$8,delivery_mode=$9,location_text=$10,status=$11,updated_at=now() where id=$12 returning *",[fields.title,fields.category,fields.description,fields.scopes,fields.availability,fields.hours,fields.weeks,fields.availableFrom,fields.mode,fields.location,fields.status,pledgeId])).rows[0];
  await audit(db,userId,"volunteer_pledge.updated",pledgeId,requestId,{status:fields.status,serviceCategory:fields.category});
  return row;
 });
}
export async function withdrawVolunteerPledge(pledgeId,userId,requestId){
 return withTransaction(async db=>{
  await assertActiveMember(db,userId);
  const row=(await db.query("update member_volunteer_pledge set status='withdrawn',updated_at=now() where id=$1 and user_id=$2 and status<>'withdrawn' returning id",[pledgeId,userId])).rows[0];
  if(!row)throw fail(404,"Active volunteer pledge not found.","NOT_FOUND");
  await audit(db,userId,"volunteer_pledge.withdrawn",pledgeId,requestId,{});
  return {id:pledgeId,status:"withdrawn"};
 });
}
