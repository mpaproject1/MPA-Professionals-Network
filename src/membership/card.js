import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { loadConfig } from "../platform/config.js";
import { getPool, withTransaction } from "../platform/db.js";
import { legacyMembershipFeeSettledSql, membershipIsCurrentlyActiveSql } from "./eligibility.js";

const fail=(status,message,code)=>Object.assign(new Error(message),{statusCode:status,code});
const coalesceLegacySource=source=>source??"";
const DEFAULT_SETTINGS={
  header_text:"Muslim Professionals Association",
  subtitle_text:"Membership ID",
  footer_text:"Verify membership using the QR code",
  background_style:"geometric",
  background_start:"#0A3258",
  background_end:"#174A78",
  accent_color:"#E5F044",
  text_color:"#FFFFFF",
  show_membership_type:true
};
function tokenFor(recordId,version){
  const secret=process.env.MEMBERSHIP_CARD_SECRET||loadConfig().jwtSecret;
  if(!secret) throw fail(503,"Membership verification is not configured.","VERIFICATION_NOT_CONFIGURED");
  return createHmac("sha256",secret).update(`mpa-membership-card:${recordId}:${version}`).digest("base64url");
}
function tokenMatches(expected,supplied){
  if(typeof supplied!=="string"||supplied.length<32||supplied.length>128) return false;
  const a=Buffer.from(expected),b=Buffer.from(supplied);
  return a.length===b.length&&timingSafeEqual(a,b);
}
function addisAbabaCivilDate(now=new Date()) {
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Africa/Addis_Ababa",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function membershipDateString(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const match = String(value).match(/^([0-9]{4}-[0-9]{2}-[0-9]{2})/);
  return match ? match[1] : null;
}
export function getMembershipCardStatus(row, now=new Date()) {
  if(["revoked","cancelled","merged"].includes(row.status)) return "revoked";
  if(row.status==="suspended") return "suspended";
  if(coalesceLegacySource(row.source)==="legacy_import" && row.legacy_fee_settled!==true) return "payment_verification_required";
  const today=addisAbabaCivilDate(now);
  const startDate=membershipDateString(row.start_date);
  const endDate=membershipDateString(row.end_date);
  if(row.status!=="active"||!startDate||startDate>today||(endDate&&endDate<today)) return "expired";
  return "active";
}
function assertEligible(row){
  const status=getMembershipCardStatus(row);
  if(status!=="active") throw fail(409,status==="expired"?"This membership is not currently active. Renew or contact membership support before printing a card.":`This membership is ${status} and cannot be used to issue a card.`,"MEMBERSHIP_NOT_ELIGIBLE");
}
function cardPayload(row,cardSettings){
  const token=tokenFor(row.membership_record_id,row.card_token_version);
  return {membershipNumber:row.membership_number,memberName:row.member_name||"MPA Member",membershipType:row.membership_type,status:"active",startDate:row.start_date,endDate:row.end_date,verificationPath:"/membership/verify?membershipNumber="+encodeURIComponent(row.membership_number)+"&token="+encodeURIComponent(token),settings:cardSettings};
}
async function settings(db=getPool()){
  try{
    const row=(await db.query("select header_text,subtitle_text,footer_text,background_style,background_start,background_end,accent_color,text_color,show_membership_type from membership_card_settings where id=1")).rows[0];
    return row||DEFAULT_SETTINGS;
  }catch(error){
    // Card appearance settings are optional; missing configuration must not block
    // retrieval of a membership record or its canonical membership number.
    if(error?.code==="42P01") return DEFAULT_SETTINGS;
    throw error;
  }
}
async function ensureMembershipNumber(db,row,userId,requestId){
  const existing=String(row.membership_number||"").trim();
  if(existing)return existing;
  const startDate=membershipDateString(row.start_date)||new Date().toISOString().slice(0,10);
  const year=startDate.slice(0,4);
  for(let attempt=0;attempt<5;attempt++){
    const candidate=`MPA-${year}-${randomUUID().slice(0,8).toUpperCase()}`;
    try{
      const updated=await db.query("update membership_record set membership_number=$1,updated_at=now() where id=$2 and (membership_number is null or btrim(membership_number)='') returning membership_number",[candidate,row.membership_record_id]);
      if(updated.rows[0]){
        row.membership_number=updated.rows[0].membership_number;
        await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'membership.number_assigned','membership_record',$2,$3,'success',$4)",[userId||null,row.membership_record_id,requestId||null,JSON.stringify({source:"member_card_access"})]);
        return row.membership_number;
      }
      const current=(await db.query("select membership_number from membership_record where id=$1",[row.membership_record_id])).rows[0]?.membership_number;
      if(current){row.membership_number=current;return current;}
    }catch(error){
      if(error?.code!=="23505")throw error;
    }
  }
  throw fail(503,"Your membership is eligible, but MPA could not assign its missing membership ID. Retry or contact membership support.","MEMBERSHIP_NUMBER_ASSIGNMENT_FAILED");
}
export async function getMyMembershipCard(userId,requestId){
  const db=getPool();
  const r=await db.query(`select m.id membership_record_id,m.membership_number,m.status,m.start_date,m.end_date,m.card_token_version,m.source,${legacyMembershipFeeSettledSql("m")} legacy_fee_settled,
      coalesce(p.name,application_product.name) membership_type,coalesce((a.fee_snapshot->>'renewalRequired')::boolean,p.renewal_required,application_product.renewal_required) renewal_required,
      coalesce(nullif(person.display_name,''),concat_ws(' ',person.first_name,person.middle_name,person.last_name)) member_name
    from membership_record m
    left join membership_product p on p.id=m.membership_product_id
    left join membership_application a on a.id=m.application_id
    left join membership_product application_product on application_product.id=a.membership_product_id
    join app_user u on u.id=m.user_id
    left join person on person.user_id=u.id
    where m.user_id=$1 and m.status<>'pending'
    order by (m.status='active' and m.start_date<=(now() at time zone 'Africa/Addis_Ababa')::date and (m.end_date is null or m.end_date>=(now() at time zone 'Africa/Addis_Ababa')::date) and ${membershipIsCurrentlyActiveSql("m")}) desc,m.start_date desc nulls last,m.created_at desc
    limit 1`,[userId]);
  const row=r.rows[0];
  if(!row) throw fail(404,"No membership record is available for this account. Complete membership approval and activation first.","MEMBERSHIP_NOT_FOUND");
  assertEligible(row);
  if(!row.membership_type)throw fail(409,"Your membership record exists, but its membership plan is not linked. MPA membership support must restore the plan before a valid card can be issued.","MEMBERSHIP_PLAN_UNAVAILABLE");
  await ensureMembershipNumber(db,row,userId,requestId);
  const cardSettings=await settings(db);
  const token=tokenFor(row.membership_record_id,row.card_token_version);
  return {
    membershipNumber:row.membership_number,
    memberName:row.member_name||"MPA Member",
    membershipType:row.membership_type,
    renewalRequired:Boolean(row.renewal_required),
    status:getMembershipCardStatus(row),
    startDate:row.start_date,
    endDate:row.end_date,
    verificationPath:"/membership/verify?membershipNumber="+encodeURIComponent(row.membership_number)+"&token="+encodeURIComponent(token),
    settings:cardSettings
  };
}
export async function getMembershipCardForAdmin(membershipNumber,actorId,requestId){
  const number=String(membershipNumber||"").trim().toUpperCase();
  if(!number||number.length>100||/\p{Cc}/u.test(number)) throw fail(400,"Enter the canonical MPA membership ID.","INVALID_MEMBERSHIP_NUMBER");
  if(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(number)||/^MPA-(MEM|APP|REF)-/i.test(number)) throw fail(400,"This is an internal account, payment or application reference, not a membership number. Use the human-readable MPA membership ID shown in the member workspace.","WRONG_MEMBERSHIP_IDENTIFIER");
  const db=getPool();
  const row=(await db.query(`select m.id membership_record_id,m.membership_number,m.status,m.start_date,m.end_date,m.card_token_version,m.source,${legacyMembershipFeeSettledSql("m")} legacy_fee_settled,
      coalesce(p.name,application_product.name) membership_type,coalesce(nullif(person.display_name,''),concat_ws(' ',person.first_name,person.middle_name,person.last_name)) member_name
    from membership_record m left join membership_product p on p.id=m.membership_product_id
    left join membership_application a on a.id=m.application_id
    left join membership_product application_product on application_product.id=a.membership_product_id
    join app_user u on u.id=m.user_id left join person on person.user_id=u.id
    where upper(m.membership_number)=$1 and m.status<>'pending'
    order by (m.status='active' and m.start_date<=(now() at time zone 'Africa/Addis_Ababa')::date and (m.end_date is null or m.end_date>=(now() at time zone 'Africa/Addis_Ababa')::date) and ${membershipIsCurrentlyActiveSql("m")}) desc,m.start_date desc nulls last,m.created_at desc limit 1`,[number])).rows[0];
  if(!row) throw fail(404,"No membership record matches that membership ID. Account IDs and application references are not accepted here.","MEMBERSHIP_NOT_FOUND");
  assertEligible(row);
  if(!row.membership_type)throw fail(409,"This membership record has no linked plan. Restore its membership plan before issuing a card.","MEMBERSHIP_PLAN_UNAVAILABLE");
  await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'membership.card_admin_issued','membership_record',$2,$3,'success',$4)",[actorId,row.membership_record_id,requestId,JSON.stringify({issuedCount:1})]);
  return cardPayload(row,await settings(db));
}
export async function listEligibleMembershipCardsForAdmin({q="",limit=50,offset=0,actorId=null,requestId=null}={}){
  const search=String(q||"").trim().slice(0,100),pageSize=Math.min(Math.max(Number(limit)||50,1),100),start=Math.max(Number(offset)||0,0),db=getPool();
  const result=await db.query(`select m.id membership_record_id,m.start_date,m.membership_number,coalesce(nullif(person.display_name,''),concat_ws(' ',person.first_name,person.middle_name,person.last_name)) member_name,coalesce(p.name,application_product.name) membership_type,m.end_date from membership_record m left join membership_product p on p.id=m.membership_product_id left join membership_application a on a.id=m.application_id left join membership_product application_product on application_product.id=a.membership_product_id join app_user u on u.id=m.user_id left join person on person.user_id=u.id where m.status='active' and coalesce(p.id,application_product.id) is not null and m.start_date<=(now() at time zone 'Africa/Addis_Ababa')::date and (m.end_date is null or m.end_date>=(now() at time zone 'Africa/Addis_Ababa')::date) and ${membershipIsCurrentlyActiveSql("m")} and ($1='' or lower(m.membership_number) like lower('%'||$1||'%') or lower(coalesce(nullif(person.display_name,''),concat_ws(' ',person.first_name,person.middle_name,person.last_name))) like lower('%'||$1||'%')) order by m.membership_number limit $2 offset $3`,[search,pageSize,start]);
  for(const row of result.rows)row.membership_number=await ensureMembershipNumber(db,row,actorId,requestId);
  const total=Number((await db.query(`select count(*)::int count from membership_record m left join membership_product p on p.id=m.membership_product_id left join membership_application a on a.id=m.application_id left join membership_product application_product on application_product.id=a.membership_product_id left join person on person.user_id=m.user_id where m.status='active' and coalesce(p.id,application_product.id) is not null and m.start_date<=(now() at time zone 'Africa/Addis_Ababa')::date and (m.end_date is null or m.end_date>=(now() at time zone 'Africa/Addis_Ababa')::date) and ${membershipIsCurrentlyActiveSql("m")} and ($1='' or lower(m.membership_number) like lower('%'||$1||'%') or lower(coalesce(nullif(person.display_name,''),concat_ws(' ',person.first_name,person.middle_name,person.last_name))) like lower('%'||$1||'%'))`,[search])).rows[0]?.count||0);
  return {items:result.rows.map(row=>({membershipNumber:row.membership_number,memberName:row.member_name||"MPA Member",membershipType:row.membership_type,startDate:row.start_date,endDate:row.end_date})),total,limit:pageSize,offset:start,hasMore:start+result.rows.length<total};
}
export async function getMembershipCardsForAdmin(membershipNumbers,actorId,requestId){
  if(!Array.isArray(membershipNumbers)||membershipNumbers.length<1)throw fail(400,"Select at least one eligible member.","EMPTY_CARD_SELECTION");
  if(membershipNumbers.length>100)throw fail(413,"Select no more than 100 members per print batch.","CARD_BATCH_LIMIT");
  const numbers=[...new Set(membershipNumbers.map(value=>String(value||"").trim().toUpperCase()).filter(Boolean))];
  if(numbers.length!==membershipNumbers.length||numbers.some(value=>value.length>100||/\p{Cc}/u.test(value)||/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)||/^MPA-(MEM|APP|REF)-/i.test(value)))throw fail(400,"Select unique canonical membership numbers, not internal account or record references.","INVALID_CARD_SELECTION");
  const db=getPool(),rows=(await db.query(`select m.id membership_record_id,m.membership_number,m.status,m.start_date,m.end_date,m.card_token_version,coalesce(p.name,application_product.name) membership_type,coalesce(nullif(person.display_name,''),concat_ws(' ',person.first_name,person.middle_name,person.last_name)) member_name from membership_record m left join membership_product p on p.id=m.membership_product_id left join membership_application a on a.id=m.application_id left join membership_product application_product on application_product.id=a.membership_product_id join app_user u on u.id=m.user_id left join person on person.user_id=u.id where coalesce(p.id,application_product.id) is not null and upper(m.membership_number)=any($1::text[]) and m.status='active' and m.start_date<=(now() at time zone 'Africa/Addis_Ababa')::date and (m.end_date is null or m.end_date>=(now() at time zone 'Africa/Addis_Ababa')::date) and ${membershipIsCurrentlyActiveSql("m")} order by m.membership_number`,[numbers])).rows;
  const byNumber=new Map(rows.map(row=>[String(row.membership_number).toUpperCase(),row])),cardSettings=await settings(db);
  const cards=rows.map(row=>cardPayload(row,cardSettings)),skipped=numbers.filter(number=>!byNumber.has(number)).map(membershipNumber=>({membershipNumber,reason:"No active eligible membership was found. Check the membership ID or membership status."}));
  const batchReference=randomUUID();
  await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'membership.cards_batch_generated','membership_card_batch',null,$2,'success',$3)",[actorId,requestId,JSON.stringify({batchReference,selectedCount:numbers.length,generatedCount:cards.length,skippedCount:skipped.length})]);
  return {batchReference,cards,skipped,selectedCount:numbers.length,generatedCount:cards.length,skippedCount:skipped.length};
}
export async function recordMembershipCardsPrintRequest(batchReference,actorId,requestId){
  const reference=String(batchReference||"").trim();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reference))throw fail(400,"The print batch reference is invalid. Prepare the selected cards again.","INVALID_CARD_BATCH_REFERENCE");
  const db=getPool();
  const batch=(await db.query("select id from audit_log where actor_user_id=$1 and action='membership.cards_batch_generated' and metadata->>'batchReference'=$2 limit 1",[actorId,reference])).rows[0];
  if(!batch)throw fail(404,"This print batch was not generated by your account. Prepare the cards again.","CARD_BATCH_NOT_FOUND");
  await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'membership.cards_batch_print_requested','membership_card_batch',null,$2,'success',$3)",[actorId,requestId,JSON.stringify({batchReference:reference})]);
  return {recorded:true};
}
export async function setMyProfilePicture(userId,fileObjectId,requestId){
  if(typeof fileObjectId!=="string"||!fileObjectId.trim()) throw fail(400,"A confirmed image file is required.","INVALID_PROFILE_PICTURE");
  return withTransaction(async db=>{
    const owner=(await db.query(`select p.id person_id,pr.id profile_id
      from app_user u join person p on p.user_id=u.id
      join professional_profile pr on pr.person_id=p.id
      where u.id=$1 and u.account_type='professional'
        and exists(select 1 from membership_record m where m.user_id=u.id and m.status='active' and m.start_date<=(now() at time zone 'Africa/Addis_Ababa')::date and (m.end_date is null or m.end_date>=(now() at time zone 'Africa/Addis_Ababa')::date) and ${membershipIsCurrentlyActiveSql("m")})
      for update of pr`,[userId])).rows[0];
    if(!owner) throw fail(403,"An active professional membership is required to change the profile picture.","MEMBERSHIP_REQUIRED");
    const file=(await db.query("select f.id,f.created_by,f.content_type,f.visibility from file_object f join private_upload_session s on s.file_object_id=f.id and s.status='confirmed' where f.id=$1",[fileObjectId])).rows[0];
    if(!file||file.created_by!==userId||file.visibility!=="private"||!["image/jpeg","image/png"].includes(file.content_type))
      throw fail(403,"Choose a confirmed JPEG or PNG image uploaded by your own account.","PROFILE_PICTURE_FILE_FORBIDDEN");
    await db.query("update professional_profile set profile_picture_file_id=$1,updated_at=now() where id=$2",[file.id,owner.profile_id]);
    await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'profile.picture_updated','professional_profile',$2,$3,'success',$4)",[userId,owner.profile_id,requestId,JSON.stringify({fileObjectId:file.id})]);
    return {profilePictureFileId:file.id};
  });
}
export async function removeMyProfilePicture(userId,requestId){
  return withTransaction(async db=>{
    const r=await db.query(`update professional_profile pr set profile_picture_file_id=null,updated_at=now()
      from person p where p.id=pr.person_id and p.user_id=$1
      and exists(select 1 from membership_record m where m.user_id=$1 and m.status='active' and m.start_date<=(now() at time zone 'Africa/Addis_Ababa')::date and (m.end_date is null or m.end_date>=(now() at time zone 'Africa/Addis_Ababa')::date) and ${membershipIsCurrentlyActiveSql("m")})
      returning pr.id`,[userId]);
    if(!r.rows[0]) throw fail(403,"An active professional membership is required to change the profile picture.","MEMBERSHIP_REQUIRED");
    await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'profile.picture_removed','professional_profile',$2,$3,'success','{}')",[userId,r.rows[0].id,requestId]);
    return {profilePictureFileId:null};
  });
}
export async function updateMembershipCardSettings(actorId,input,requestId){
  const textFields={header_text:"headerText",subtitle_text:"subtitleText",footer_text:"footerText"};
  const values={};
  for(const [column,key] of Object.entries(textFields)){
    if(input[key]!==undefined){
      const value=String(input[key]??"").trim();
      const max=column==="header_text"?120:column==="subtitle_text"?80:180;
      if(!value||value.length>max) throw fail(400,`${key} is required and must be ${max} characters or fewer.`,"INVALID_CARD_SETTINGS");
      values[column]=value;
    }
  }
  for(const [column,key] of [["background_start","backgroundStart"],["background_end","backgroundEnd"],["accent_color","accentColor"],["text_color","textColor"]]){
    if(input[key]!==undefined){
      const value=String(input[key]||"");
      if(!/^#[0-9a-fA-F]{6}$/.test(value)) throw fail(400,`${key} must be a six-digit hex color.`,"INVALID_CARD_SETTINGS");
      values[column]=value.toUpperCase();
    }
  }
  if(input.backgroundStyle!==undefined){
    if(!["geometric","gradient","midnight"].includes(input.backgroundStyle)) throw fail(400,"Choose a supported card background style.","INVALID_CARD_SETTINGS");
    values.background_style=input.backgroundStyle;
  }
  if(input.showMembershipType!==undefined){
    if(typeof input.showMembershipType!=="boolean") throw fail(400,"showMembershipType must be true or false.","INVALID_CARD_SETTINGS");
    values.show_membership_type=input.showMembershipType;
  }
  return withTransaction(async db=>{
    const before=await settings(db);
    const merged={...before,...values};
    const row=(await db.query(`insert into membership_card_settings(id,header_text,subtitle_text,footer_text,background_style,background_start,background_end,accent_color,text_color,show_membership_type,updated_by,updated_at)
      values(1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
      on conflict(id) do update set header_text=excluded.header_text,subtitle_text=excluded.subtitle_text,footer_text=excluded.footer_text,background_style=excluded.background_style,background_start=excluded.background_start,background_end=excluded.background_end,accent_color=excluded.accent_color,text_color=excluded.text_color,show_membership_type=excluded.show_membership_type,updated_by=excluded.updated_by,updated_at=now()
      returning header_text,subtitle_text,footer_text,background_style,background_start,background_end,accent_color,text_color,show_membership_type`,
      [merged.header_text,merged.subtitle_text,merged.footer_text,merged.background_style,merged.background_start,merged.background_end,merged.accent_color,merged.text_color,merged.show_membership_type,actorId])).rows[0];
    await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'membership.card_settings_updated','membership_card_settings','1',$2,'success',$3)",[actorId,requestId,JSON.stringify({fields:Object.keys(values)})]);
    return row;
  });
}
export async function getMembershipCardSettings(){ return settings(); }
export async function rotateMembershipCardVerification(recordId,actorId,requestId){
  return withTransaction(async db=>{
    const row=(await db.query("update membership_record set card_token_version=card_token_version+1,updated_at=now() where id=$1 returning id,card_token_version",[recordId])).rows[0];
    if(!row) throw fail(404,"Membership record not found.","NOT_FOUND");
    await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'membership.card_verification_rotated','membership_record',$2,$3,'success',$4)",[actorId,row.id,requestId,JSON.stringify({tokenVersion:row.card_token_version})]);
    return {membershipRecordId:row.id,verificationRotated:true};
  });
}
export async function verifyMembershipCard(identifier,token){
  if(typeof identifier!=="string"||!identifier.trim()||identifier.length>100||typeof token!=="string") return {valid:false,status:"invalid",message:"This membership ID could not be verified."};
  const db=getPool();
  const row=(await db.query(`select m.id,m.membership_number,m.status,m.start_date,m.end_date,m.card_token_version,m.source,${legacyMembershipFeeSettledSql("m")} legacy_fee_settled,
      coalesce(p.name,application_product.name) membership_type,coalesce(nullif(person.display_name,''),concat_ws(' ',person.first_name,person.middle_name,person.last_name)) member_name
    from membership_record m left join membership_product p on p.id=m.membership_product_id
    left join membership_application a on a.id=m.application_id
    left join membership_product application_product on application_product.id=a.membership_product_id
    join person on person.user_id=m.user_id
    where (m.id::text=$1 or upper(m.membership_number)=upper($1)) limit 1`,[identifier.trim()])).rows[0];
  if(!row||!tokenMatches(tokenFor(row.id,row.card_token_version),token))
    return {valid:false,status:"invalid",message:"This membership ID could not be verified."};
  if(!row.membership_type)return {valid:false,status:"plan_unavailable",membershipNumber:row.membership_number,message:"This membership record has no linked plan. Contact MPA membership support."};
  const status=getMembershipCardStatus(row);
  return {valid:status==="active",status,membershipNumber:row.membership_number,memberName:row.member_name||"MPA Member",membershipType:row.membership_type,startDate:row.start_date,endDate:row.end_date,verifiedAt:new Date().toISOString(),message:status==="active"?"This membership is currently active.":status==="expired"?"This membership is not currently active.":`This membership is ${status}.`};
}
