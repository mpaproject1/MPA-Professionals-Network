import crypto from "node:crypto";
import {closePool,getPool,withTransaction} from "../src/platform/db.js";

const apiKey=process.env.RESEND_API_KEY;
const from=process.env.EMAIL_FROM;
if(!apiKey||!from){
 console.error("Account recovery email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM; queued messages remain pending.");
 process.exitCode=1;
}else{
 try{
  const pool=getPool();
  const rows=await withTransaction(async tx=>{
   const result=await tx.query(`with candidates as (
     select id from notification_outbox
     where channel='email' and template_code in ('account.one_time_session_link','account.recovery_email_verify','account.recovery_email_change_notice')
       and ((status='pending' and (next_attempt_at is null or next_attempt_at<=now())) or (status='processing' and created_at<now()-interval '5 minutes'))
     order by created_at
     limit 20
     for update skip locked
   )
   update notification_outbox n set status='processing',attempts=n.attempts+1
   from candidates c where n.id=c.id
   returning n.id,n.recipient,n.template_code,n.payload,n.attempts`);
   return result.rows;
  });
  let sent=0,failed=0;
  for(const row of rows){
   let payload={};
   try{
    payload=typeof row.payload==="string"?JSON.parse(row.payload):row.payload;
    let subject="",textBody="",htmlBody="";
    if(row.template_code==="account.recovery_email_change_notice"){
     subject="A recovery email change was requested";
     textBody=[
      "A request was made to change the recovery email for your MPA account.",
      `Proposed new address: ${String(payload?.newEmailMasked||"an address not shown here")}`,
      "The address will not be trusted unless it is verified.",
      "If you did not expect this request, contact MPA through a known support channel. Do not reply with passwords or codes."
     ].join("\n");
     htmlBody=`<p>A request was made to change the recovery email for your MPA account.</p><p>Proposed new address: <strong>${String(payload?.newEmailMasked||"an address not shown here").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")}</strong></p><p>The address will not be trusted unless it is verified.</p><p>If you did not expect this request, contact MPA through a known support channel. Do not reply with passwords or codes.</p>`;
    } else {
     const url=new URL(String(payload?.url||""));
     if(process.env.NODE_ENV==="production"&&url.protocol!=="https:")throw new Error("Recovery links must use HTTPS in production.");
     const rawLinkToken=new URLSearchParams(url.hash.replace(/^#/,"")).get("token")||url.searchParams.get("token");
     if(!rawLinkToken)throw new Error("Recovery email payload is missing its single-use token.");
     const tokenHash=crypto.createHash("sha256").update(rawLinkToken).digest("hex");
     if(row.template_code==="account.one_time_session_link"){
      if(url.pathname!=="/account/one-time-access")throw new Error("Recovery email payload did not contain a valid account recovery URL.");
      const validLink=await pool.query("select 1 from one_time_session_link where token_hash=$1 and used_at is null and revoked_at is null and expires_at>now()",[tokenHash]);
      if(!validLink.rowCount)throw new Error("The recovery link expired or was used before delivery; request a fresh link.");
      subject="Your one-time MPA sign-in link";
      textBody=["You asked for help signing in to your MPA account.","","Use this secure link to sign in and choose a new password:",String(payload.url),"","This link can be used once and expires in 20 minutes. Using it signs out other active sessions.","If you did not request this, do not use or forward the link. Contact MPA through a known support channel."].join("\n");
      htmlBody=`<p>You asked for help signing in to your MPA account.</p><p><a href="${String(payload.url).replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;").replaceAll(">","&gt;")}">Continue securely and choose a new password</a></p><p>This link can be used once and expires in 20 minutes. Using it signs out other active sessions.</p><p>If you did not request this, do not use or forward the link. Contact MPA through a known support channel.</p>`;
     } else if(row.template_code==="account.recovery_email_verify"){
      if(url.pathname!=="/account/recovery-email/verify")throw new Error("Recovery-email verification URL is invalid.");
      const validToken=await pool.query("select 1 from app_user where recovery_email_change_token_hash=$1 and recovery_email_pending=$2 and recovery_email_change_expires_at>now()",[tokenHash,row.recipient]);
      if(!validToken.rowCount)throw new Error("The recovery-email verification token expired or was replaced.");
      subject="Verify your MPA recovery email";
      textBody=["A request was made to use this address for MPA account recovery.","","Verify the address using this single-use link:",String(payload.url),"","The link expires in 30 minutes. The address is not trusted until verification succeeds.","If you did not request this change, do not use the link and contact MPA through a known support channel."].join("\n");
      htmlBody=`<p>A request was made to use this address for MPA account recovery.</p><p><a href="${String(payload.url).replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;").replaceAll(">","&gt;")}">Verify recovery email</a></p><p>The link expires in 30 minutes. The address is not trusted until verification succeeds.</p><p>If you did not request this change, do not use the link and contact MPA through a known support channel.</p>`;
     } else throw new Error("Unsupported account recovery message type.");
    }
    const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[row.recipient],subject,text:textBody,html:htmlBody})});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(`Email provider returned HTTP ${response.status}`);
    await pool.query("update notification_outbox set status='sent',sent_at=now(),provider_message_id=$2,last_error=null,next_attempt_at=null,payload=payload-'url' where id=$1",[row.id,body.id||null]);
    sent++;
   }catch(error){
    const delay=Math.min(30,2**Math.max(0,(Number(row.attempts)||1)-1));
    const status=Number(row.attempts)>=5?"failed":"pending";
    await pool.query("update notification_outbox set status=$2,last_error=$3,next_attempt_at=case when $2='pending' then now()+make_interval(mins=>$4) else null end,payload=case when $2='failed' then payload-'url' else payload end where id=$1",[row.id,status,String(error?.message||"Email delivery failed").slice(0,500),delay]);
    if(status==="failed"&&payload?.url){try{const url=new URL(String(payload.url));const token=new URLSearchParams(url.hash.replace(/^#/,"")).get("token");if(token){const tokenHash=crypto.createHash("sha256").update(token).digest("hex");if(row.template_code==="account.one_time_session_link")await pool.query("update one_time_session_link set revoked_at=now() where token_hash=$1 and used_at is null and revoked_at is null",[tokenHash]);if(row.template_code==="account.recovery_email_verify")await pool.query("update app_user set recovery_email_pending=null,recovery_email_change_token_hash=null,recovery_email_change_expires_at=null where recovery_email_change_token_hash=$1",[tokenHash])}}catch{ /* Keep dispatcher logs free of secret link material. */ }}
    console.error("Could not deliver account recovery email",row.id,"attempt",row.attempts,"status",status);
    failed++;
   }
  }
  console.log(JSON.stringify({claimed:rows.length,sent,failed}));
 }catch(error){console.error("Account recovery email dispatch failed:",error?.message||error);process.exitCode=1}
 finally{await closePool()}
}
