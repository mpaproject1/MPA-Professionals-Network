import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPool, withTransaction } from "./db.js";

export const MAX_PRIVATE_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf","image/jpeg","image/png","text/plain"]);
const sha256 = value => createHash("sha256").update(value).digest("hex");
const fail = (status,message,code) => Object.assign(new Error(message),{statusCode:status,code});
export function validatePrivateUploadName(value){
  const name=path.basename(String(value||"").replace(/\\/g,"/")).trim();
  if(!name||name.length>180||/\p{Cc}/u.test(name)) throw fail(400,"A valid file name is required.","INVALID_FILE");
  return name;
}
export function validatePrivateUploadBytes(type,bytes){
  if(!ALLOWED_TYPES.has(type)) throw fail(400,"Unsupported private file type.","UNSUPPORTED_FILE_TYPE");
  if(!Buffer.isBuffer(bytes)) bytes=Buffer.from(bytes||[]);
  if(bytes.length<1||bytes.length>MAX_PRIVATE_UPLOAD_BYTES) throw fail(413,"Private files must be between 1 byte and 10 MiB.","PAYLOAD_TOO_LARGE");
  if(type==="application/pdf" && !(bytes.length>=5&&bytes.subarray(0,5).toString("ascii")==="%PDF-")) throw fail(400,"The file content does not match its declared type.","FILE_TYPE_MISMATCH");
  if(type==="image/png" && !(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ) throw fail(400,"The file content does not match its declared type.","FILE_TYPE_MISMATCH");
  if(type==="image/jpeg" && !(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)) throw fail(400,"The file content does not match its declared type.","FILE_TYPE_MISMATCH");
  if(type==="text/plain" && bytes.includes(0)) throw fail(400,"The text file contains unsupported binary content.","FILE_TYPE_MISMATCH");
}
function root(){ return path.resolve(process.env.PRIVATE_FILE_STORAGE_ROOT || path.join(process.cwd(),".private-files")); }
function filePath(key){ const target=path.resolve(root(),key); if(!target.startsWith(root()+path.sep)) throw fail(400,"Invalid private file key.","INVALID_FILE"); return target; }
function tokenMatches(token,stored){
  if(typeof token!=="string"||!stored) return false;
  const a=Buffer.from(sha256(token),"hex"),b=Buffer.from(stored,"hex");
  return a.length===b.length&&timingSafeEqual(a,b);
}
export async function authorizePrivateUpload(userId,input){
  const originalName=validatePrivateUploadName(input?.fileName);
  const contentType=String(input?.contentType||"").toLowerCase().trim();
  const byteSize=Number(input?.byteSize);
  if(!ALLOWED_TYPES.has(contentType)) throw fail(400,"Supported private files are PDF, PNG, JPEG or plain text.","UNSUPPORTED_FILE_TYPE");
  if(!Number.isSafeInteger(byteSize)||byteSize<1||byteSize>MAX_PRIVATE_UPLOAD_BYTES) throw fail(413,"Private files must be between 1 byte and 10 MiB.","PAYLOAD_TOO_LARGE");
  const expected= input?.checksumSha256==null ? null : String(input.checksumSha256).toLowerCase();
  if(expected!==null&&!/^[a-f0-9]{64}$/.test(expected)) throw fail(400,"checksumSha256 must be a SHA-256 hex digest.","INVALID_CHECKSUM");
  const id=randomUUID(),token=randomBytes(32).toString("base64url"),objectKey=path.posix.join(userId,randomUUID());
  const expiresAt=new Date(Date.now()+10*60*1000);
  await getPool().query("insert into private_upload_session(id,user_id,object_key,original_name,content_type,expected_byte_size,expected_checksum_sha256,upload_token_sha256,expires_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",[id,userId,objectKey,originalName,contentType,byteSize,expected,sha256(token),expiresAt]);
  return {uploadId:id,uploadToken:token,uploadUrl:`/api/v1/files/uploads/${id}/content`,expiresAt:expiresAt.toISOString(),maxBytes:MAX_PRIVATE_UPLOAD_BYTES};
}
export async function receivePrivateUpload(userId,id,token,bytes){
  if(!Buffer.isBuffer(bytes)) bytes=Buffer.from(bytes||[]);
  if(bytes.length<1||bytes.length>MAX_PRIVATE_UPLOAD_BYTES) throw fail(413,"Private files must be between 1 byte and 10 MiB.","PAYLOAD_TOO_LARGE");
  const db=getPool(),r=await db.query("select * from private_upload_session where id=$1 and user_id=$2",[id,userId]),s=r.rows[0];
  if(!s) throw fail(404,"Upload authorization not found.","NOT_FOUND");
  if(s.status!=="authorized") throw fail(409,"This upload authorization has already been used.","INVALID_STATE");
  if(new Date(s.expires_at).getTime()<=Date.now()){await db.query("update private_upload_session set status='expired' where id=$1",[id]);throw fail(410,"Upload authorization expired. Request a new upload.","UPLOAD_EXPIRED");}
  if(!tokenMatches(token,s.upload_token_sha256)) throw fail(403,"Upload token is invalid.","FORBIDDEN");
  if(bytes.length!==Number(s.expected_byte_size)) throw fail(400,"Uploaded byte size does not match the authorized size.","UPLOAD_SIZE_MISMATCH");
  const checksum=sha256(bytes);
  if(s.expected_checksum_sha256&&checksum!==s.expected_checksum_sha256) throw fail(400,"Uploaded checksum does not match the authorized checksum.","UPLOAD_CHECKSUM_MISMATCH");
  validatePrivateUploadBytes(s.content_type,bytes);
  const target=filePath(s.object_key),temp=`${target}.uploading`;
  await mkdir(path.dirname(target),{recursive:true,mode:0o700});
  try { await writeFile(temp,bytes,{flag:"wx",mode:0o600}); await rename(temp,target); }
  catch(_e){await rm(temp,{force:true}).catch(()=>{});throw fail(500,"Private file storage could not accept the upload.","PRIVATE_STORAGE_ERROR");}
  try {
    const updated=await db.query("update private_upload_session set status='uploaded',actual_byte_size=$2,actual_checksum_sha256=$3,uploaded_at=now() where id=$1 and status='authorized' returning id",[id,bytes.length,checksum]);
    if(!updated.rows[0]) {await rm(target,{force:true});throw fail(409,"Upload authorization was already consumed.","INVALID_STATE");}
  } catch(e){await rm(target,{force:true}).catch(()=>{});throw e;}
  return {uploadId:id,status:"uploaded",byteSize:bytes.length,checksumSha256:checksum};
}
export async function confirmPrivateUpload(userId,id){
  return withTransaction(async db=>{
    const r=await db.query("select * from private_upload_session where id=$1 and user_id=$2 for update",[id,userId]),s=r.rows[0];
    if(!s) throw fail(404,"Upload authorization not found.","NOT_FOUND");
    if(s.status==="confirmed"&&s.file_object_id) return (await db.query("select id,original_name,content_type,byte_size,checksum_sha256,visibility,created_at from file_object where id=$1",[s.file_object_id])).rows[0];
    if(s.status!=="uploaded") throw fail(409,"Upload bytes must be accepted before confirmation.","UPLOAD_NOT_COMPLETE");
    if(Number(s.actual_byte_size)!==Number(s.expected_byte_size)||!s.actual_checksum_sha256) throw fail(400,"Uploaded file metadata failed validation.","UPLOAD_METADATA_INVALID");
    const file=(await db.query("insert into file_object(storage_provider,object_key,original_name,content_type,byte_size,checksum_sha256,visibility,created_by) values('private-local',$1,$2,$3,$4,$5,'private',$6) returning id,original_name,content_type,byte_size,checksum_sha256,visibility,created_at",[s.object_key,s.original_name,s.content_type,s.actual_byte_size,s.actual_checksum_sha256,userId])).rows[0];
    await db.query("update private_upload_session set status='confirmed',file_object_id=$2,confirmed_at=now() where id=$1",[id,file.id]);
    await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'file.private_upload_confirmed','file_object',$2,null,'success',$3)",[userId,file.id,JSON.stringify({contentType:s.content_type,byteSize:Number(s.actual_byte_size),checksumSha256:s.actual_checksum_sha256})]);
    return file;
  });
}
export async function readAuthorizedPrivateFile(userId,fileId,roles=[],requestId=null,permissions=[]){
  const db=getPool();
  const r=await db.query(`select f.*,s.object_key from file_object f join private_upload_session s on s.file_object_id=f.id where f.id=$1 and f.visibility='private' and s.status='confirmed'`,[fileId]);
  const f=r.rows[0]; if(!f) throw fail(404,"Private file not found.","NOT_FOUND");
  let allowed=f.created_by===userId;
  if(!allowed){
    const businessOwnerEvidence=await db.query(`select 1 from network_plus_business_verification_evidence e
      join network_plus_business_verification_case vc on vc.id=e.case_id
      join network_plus_business_ownership bo on bo.business_id=vc.business_id
      where e.file_object_id=$1 and bo.status='active' and bo.consent_status='accepted'
        and ((bo.owner_type='member' and bo.owner_user_id=$2
            and exists(select 1 from membership_record mr where mr.user_id=$2 and mr.status='active' and mr.start_date<=current_date and (mr.end_date is null or mr.end_date>=current_date))
            and exists(select 1 from app_user_role ur join app_role ar on ar.id=ur.role_id where ur.user_id=$2 and ar.role_code in ('member','professional')))
          or (bo.owner_type='organization' and exists(select 1 from organization_membership om join organization o on o.id=om.organization_id
            where om.organization_id=bo.owner_organization_id and om.user_id=$2 and om.status='active' and om.role_code in ('owner','administrator') and o.verification_status='verified')))
      limit 1`,[fileId,userId]);
    allowed=businessOwnerEvidence.rowCount>0;
  }
  if(!allowed){
    const membership=await db.query(`select 1 from organization_verification_evidence e join organization_verification_case c on c.id=e.case_id join organization_membership om on om.organization_id=c.organization_id and om.user_id=$1 and om.status='active' and om.role_code in ('owner','administrator') where e.file_object_id=$2 limit 1`,[userId,fileId]);
    allowed=membership.rowCount>0;
  }
  if(!allowed){
    const applicationShare=await db.query(`select 1 from job_application_attachment aa join job_application a on a.id=aa.application_id join job j on j.id=a.job_id where aa.file_object_id=$1 and a.applicant_user_id<>$2 and a.status not in ('draft','withdrawn','rejected') and (exists(select 1 from organization_membership om where om.organization_id=j.organization_id and om.user_id=$2 and om.status='active' and om.role_code in ('owner','administrator','recruiter')) or exists(select 1 from job_team_member jt join organization_membership om on om.organization_id=j.organization_id and om.user_id=jt.user_id and om.status='active' where jt.job_id=j.id and jt.user_id=$2 and jt.active=true and jt.role_code in ('hiring_manager','recruiter','interviewer'))) limit 1`,[fileId,userId]);
    allowed=applicationShare.rowCount>0;
  }
  if(!allowed){
    const ethicsRole=roles.some(role=>["ethics_reviewer","system_admin"].includes(role))||permissions.includes("ethics.case.review");
    const ethicsEvidence=await db.query("select 1 from ethics_case_evidence e join ethics_case c on c.id=e.case_id where e.file_object_id=$1 and not exists(select 1 from ethics_case_conflict x where x.case_id=c.id and x.reviewer_id=$2 and x.resolution='recused') and (c.reporter_user_id=$2 or c.subject_user_id=$2 or $3::boolean or ($4::boolean and (c.assigned_reviewer_id=$2 or exists(select 1 from ethics_case_panel_member pm where pm.case_id=c.id and pm.reviewer_id=$2 and pm.active=true)))) limit 1",[fileId,userId,roles.includes("system_admin"),ethicsRole]);
    allowed=ethicsEvidence.rowCount>0;
  }
  if(!allowed){
    const canReviewVetting=roles.some(role=>["verification_reviewer","appeal_reviewer","system_admin"].includes(role))||permissions.includes("verification.manage");
    const canReviewOrganization=roles.some(role=>["reviewer","system_admin"].includes(role))||permissions.includes("organizations.review");
    const canReviewMembership=roles.some(role=>["reviewer","finance_officer","system_admin"].includes(role))||permissions.some(permission=>["finance.view","finance.manage","members.view","members.manage"].includes(permission));
    if(canReviewOrganization){
      const organizationEvidence=await db.query("select 1 from organization_verification_evidence where file_object_id=$1 limit 1",[fileId]);
      allowed=organizationEvidence.rowCount>0;
    }
    if(!allowed&&canReviewVetting){
      const isVettingManager=roles.includes("system_admin")||permissions.includes("verification.manage");
      const assignedCaseEvidence=await db.query("select 1 from verification_evidence e join verification_case vc on vc.id=e.case_id where e.file_object_id=$1 and (vc.assigned_reviewer_id=$2 or $3=true) limit 1",[fileId,userId,isVettingManager]);
      const assignedPortfolioEvidence=await db.query("select 1 from professional_portfolio_item pi join professional_profile pp on pp.id=pi.profile_id join person p on p.id=pp.person_id join verification_case vc on vc.subject_user_id=p.user_id join verification_evidence ve on ve.file_object_id=pi.evidence_file_id and ve.case_id=vc.id where pi.evidence_file_id=$1 and (vc.assigned_reviewer_id=$2 or $3=true) limit 1",[fileId,userId,isVettingManager]);
      const appealEvidence=roles.includes("appeal_reviewer")?await db.query("select 1 from verification_evidence e join verification_case vc on vc.id=e.case_id join verification_appeal a on a.case_id=vc.id join verification_decision d on d.id=a.decision_id where e.file_object_id=$1 and a.status in ('submitted','under_review') and vc.subject_user_id<>$2 and d.decided_by<>$2 limit 1",[fileId,userId]):{rowCount:0};
      const appealPortfolioEvidence=roles.includes("appeal_reviewer")?await db.query("select 1 from professional_portfolio_item pi join professional_profile pp on pp.id=pi.profile_id join person p on p.id=pp.person_id join verification_case vc on vc.subject_user_id=p.user_id join verification_evidence ve on ve.file_object_id=pi.evidence_file_id and ve.case_id=vc.id join verification_appeal a on a.case_id=vc.id join verification_decision d on d.id=a.decision_id where pi.evidence_file_id=$1 and a.status in ('submitted','under_review') and vc.subject_user_id<>$2 and d.decided_by<>$2 limit 1",[fileId,userId]):{rowCount:0};
      allowed=assignedCaseEvidence.rowCount>0||assignedPortfolioEvidence.rowCount>0||appealEvidence.rowCount>0||appealPortfolioEvidence.rowCount>0;
    }
    if(!allowed&&canReviewMembership){
      const membershipEvidence=await db.query("select 1 from membership_application_attachment aa join membership_application a on a.id=aa.application_id where aa.file_object_id=$1 and a.user_id=$2 limit 1",[fileId,f.created_by]);
      const canReadMemberProfilePictures=roles.some(role=>["reviewer","system_admin"].includes(role))||permissions.some(permission=>["members.view","members.manage"].includes(permission));
      const membershipCardPhoto=canReadMemberProfilePictures?await db.query("select 1 from professional_profile pp join person p on p.id=pp.person_id where pp.profile_picture_file_id=$1 limit 1",[fileId]):{rowCount:0};
      allowed=membershipEvidence.rowCount>0||membershipCardPhoto.rowCount>0;
    }
  }
    if(!allowed){
      const canReadFinanceEvidence=roles.some(role=>["finance_officer","system_admin","admin"].includes(role))||permissions.some(permission=>["finance.view","finance.payment.verify","finance.payment.reverse","finance.manage"].includes(permission));
      if(canReadFinanceEvidence){
        const financeEvidence=await db.query("select 1 from finance_payment_record where evidence_file_id=$1 limit 1",[fileId]);
        allowed=financeEvidence.rowCount>0;
      }
    }
  if(!allowed){
    const businessReviewer=roles.some(role=>["business_verification_reviewer","system_admin"].includes(role))||permissions.includes("business.verify");
    if(businessReviewer){
      const businessEvidence=await db.query("select 1 from network_plus_business_verification_evidence e join network_plus_business_verification_case c on c.id=e.case_id where e.file_object_id=$1 and c.submitted_by<>$2 and c.status in ('submitted','under_review','appealed') limit 1",[fileId,userId]);
      allowed=businessEvidence.rowCount>0;
    }
  }
  if(!allowed) throw fail(403,"You do not have permission to read this private file.","FORBIDDEN");
  const {readFile}=await import("node:fs/promises");
  let bytes; try{bytes=await readFile(filePath(f.object_key));}catch{throw fail(404,"Private file content is unavailable.","PRIVATE_FILE_MISSING");}
  await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'file.private_read','file_object',$2,$3,'success',$4)",[userId,fileId,requestId,JSON.stringify({contentType:f.content_type,byteSize:Number(f.byte_size)})]);
  return {file:f,bytes};
}
