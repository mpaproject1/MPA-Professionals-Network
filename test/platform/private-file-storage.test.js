import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import * as membership from "../../src/membership/service.js";
import * as organizationJobs from "../../src/organization-jobs/service.js";
import {closePool, getPool} from "../../src/platform/db.js";
import {MAX_PRIVATE_UPLOAD_BYTES, readAuthorizedPrivateFile, validatePrivateUploadBytes, validatePrivateUploadName} from "../../src/platform/private-file-storage.js";

async function account(suffix=randomUUID()){
  const digits=suffix.replace(/[^0-9]/g,"").slice(0,8).padEnd(8,"7");
  const created=await membership.register({email:`private-file-${suffix}@example.test`,password:"PrivateFileGatePassword!2026",firstName:"Private",lastName:`File${suffix.slice(0,8)}`,phone:`08${digits}`},`private-file-test-${suffix}`);
  return created.user.id;
}

test("private upload names are reduced to a safe basename",()=>{
  assert.equal(validatePrivateUploadName("../../evidence.pdf"),"evidence.pdf");
  assert.equal(validatePrivateUploadName("folder\\\\evidence.pdf"),"evidence.pdf");
  assert.throws(()=>validatePrivateUploadName(""),{code:"INVALID_FILE"});
  assert.throws(()=>validatePrivateUploadName("bad\nname.pdf"),{code:"INVALID_FILE"});
});

test("private upload enforces bounded size and allowlisted content type",()=>{
  assert.equal(MAX_PRIVATE_UPLOAD_BYTES,10*1024*1024);
  assert.throws(()=>validatePrivateUploadBytes("application/x-msdownload",Buffer.from("MZ")),{code:"UNSUPPORTED_FILE_TYPE"});
  assert.throws(()=>validatePrivateUploadBytes("application/pdf",Buffer.from("not a pdf")),{code:"FILE_TYPE_MISMATCH"});
  assert.throws(()=>validatePrivateUploadBytes("image/png",Buffer.from("not png")),{code:"FILE_TYPE_MISMATCH"});
  assert.throws(()=>validatePrivateUploadBytes("image/jpeg",Buffer.from("not jpeg")),{code:"FILE_TYPE_MISMATCH"});
  assert.throws(()=>validatePrivateUploadBytes("text/plain",Buffer.from([65,0,66])),{code:"FILE_TYPE_MISMATCH"});
});

test("private upload validates signatures for PDF and images",()=>{
  assert.doesNotThrow(()=>validatePrivateUploadBytes("application/pdf",Buffer.from("%PDF-1.7\\nprivate evidence")));
  assert.doesNotThrow(()=>validatePrivateUploadBytes("image/png",Buffer.from([137,80,78,71,13,10,26,10,0])));
  assert.doesNotThrow(()=>validatePrivateUploadBytes("image/jpeg",Buffer.from([255,216,255,0])));
});

test("private file authorization denies an owner from another organization",async()=>{
  const owner=await account(),applicant=await account(),otherOrganizationOwner=await account();
  const organization=await organizationJobs.registerOrganization(owner,{legalName:`Private file owner ${randomUUID()}`,displayName:"Private File Owner Organization"},"private-file-owner-org");
  const otherOrganization=await organizationJobs.registerOrganization(otherOrganizationOwner,{legalName:`Unrelated organization ${randomUUID()}`,displayName:"Unrelated Organization"},"private-file-unrelated-org");
  assert.notEqual(organization.id,otherOrganization.id);
  const db=getPool(),objectKey=`private-test/${randomUUID()}.pdf`;
  const job=(await db.query("insert into job(organization_id,title,description,status,created_by,updated_by) values($1,$2,$3,'published',$4,$4) returning id",[organization.id,"Private attachment authorization test","A published test vacancy used only to verify organization-scoped file access.",owner])).rows[0];
  const application=(await db.query("insert into job_application(job_id,applicant_user_id,status) values($1,$2,'submitted') returning id",[job.id,applicant])).rows[0];
  const file=(await db.query("insert into file_object(storage_provider,object_key,original_name,content_type,byte_size,checksum_sha256,visibility,created_by) values('local',$1,'private-cv.pdf','application/pdf',1,repeat('a',64),'private',$2) returning id",[objectKey,applicant])).rows[0];
  await db.query("insert into private_upload_session(user_id,object_key,original_name,content_type,expected_byte_size,upload_token_sha256,status,actual_byte_size,actual_checksum_sha256,file_object_id,expires_at,uploaded_at,confirmed_at) values($1,$2,'private-cv.pdf','application/pdf',1,repeat('b',64),'confirmed',1,repeat('a',64),$3,now()+interval '1 day',now(),now())",[applicant,objectKey,file.id]);
  await db.query("insert into job_application_attachment(application_id,file_object_id,attachment_type) values($1,$2,'application_document')",[application.id,file.id]);
  await assert.rejects(
    readAuthorizedPrivateFile(otherOrganizationOwner,file.id,[], "private-file-cross-org-test", []),
    error=>error.code==="FORBIDDEN"&&error.statusCode===403,
    "an owner in a different organization must not read another organization's applicant attachment"
  );

  const orgCase=(await db.query("select id from organization_verification_case where organization_id=$1",[organization.id])).rows[0];
  assert.ok(orgCase,"the organization should have its own verification case");
  const evidenceObjectKey=`private-test/${randomUUID()}.pdf`;
  const evidenceFile=(await db.query("insert into file_object(storage_provider,object_key,original_name,content_type,byte_size,checksum_sha256,visibility,created_by) values('local',$1,'organization-evidence.pdf','application/pdf',1,repeat('c',64),'private',$2) returning id",[evidenceObjectKey,owner])).rows[0];
  await db.query("insert into private_upload_session(user_id,object_key,original_name,content_type,expected_byte_size,upload_token_sha256,status,actual_byte_size,actual_checksum_sha256,file_object_id,expires_at,uploaded_at,confirmed_at) values($1,$2,'organization-evidence.pdf','application/pdf',1,repeat('d',64),'confirmed',1,repeat('c',64),$3,now()+interval '1 day',now(),now())",[owner,evidenceObjectKey,evidenceFile.id]);
  await db.query("insert into organization_verification_evidence(case_id,file_object_id,evidence_type,created_by) values($1,$2,'registration_document',$3)",[orgCase.id,evidenceFile.id,owner]);
  await assert.rejects(
    readAuthorizedPrivateFile(otherOrganizationOwner,evidenceFile.id,[], "private-file-cross-org-org-evidence-test", []),
    error=>error.code==="FORBIDDEN"&&error.statusCode===403,
    "an owner in another organization must not download private organization-verification evidence"
  );

  const draftJob=(await db.query("insert into job(organization_id,title,description,status,created_by,updated_by) values($1,$2,$3,'published',$4,$4) returning id",[organization.id,"Draft attachment privacy test","A published test vacancy with an unsubmitted application.",owner])).rows[0];
  const draftApplication=(await db.query("insert into job_application(job_id,applicant_user_id,status) values($1,$2,'draft') returning id",[draftJob.id,applicant])).rows[0];
  const draftObjectKey=`private-test/${randomUUID()}.pdf`;
  const draftFile=(await db.query("insert into file_object(storage_provider,object_key,original_name,content_type,byte_size,checksum_sha256,visibility,created_by) values('local',$1,'draft-cv.pdf','application/pdf',1,repeat('a',64),'private',$2) returning id",[draftObjectKey,applicant])).rows[0];
  await db.query("insert into private_upload_session(user_id,object_key,original_name,content_type,expected_byte_size,upload_token_sha256,status,actual_byte_size,actual_checksum_sha256,file_object_id,expires_at,uploaded_at,confirmed_at) values($1,$2,'draft-cv.pdf','application/pdf',1,repeat('b',64),'confirmed',1,repeat('a',64),$3,now()+interval '1 day',now(),now())",[applicant,draftObjectKey,draftFile.id]);
  await db.query("insert into job_application_attachment(application_id,file_object_id,attachment_type) values($1,$2,'application_document')",[draftApplication.id,draftFile.id]);
  await assert.rejects(
    readAuthorizedPrivateFile(owner,draftFile.id,[], "private-file-draft-application-test", []),
    error=>error.code==="FORBIDDEN"&&error.statusCode===403,
    "even the correct organization owner must not read a CV attached to an unsubmitted draft application"
  );
});

test.after(async()=>{ await closePool(); });
