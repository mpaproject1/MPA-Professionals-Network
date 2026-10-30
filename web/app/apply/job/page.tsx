"use client";
import {ArrowRight,BriefcaseBusiness,CheckCircle2} from "lucide-react";
import {type FormEvent,useEffect,useState} from "react";
import {FormFeedback} from "../../../components/form-feedback";
import {Badge, Card} from "../../../components/ui";
import {ApiError,api} from "../../../lib/api";
import { humanStatus } from "../../../lib/status-labels";

type Job={id:string;title:string;organization_name?:string;organization_display_name?:string;location_label?:string;posting_scope?:string;status?:string};

function createSubmissionKey(): string {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") throw new Error("Secure submission is unavailable in this browser. Please reload the page and try again.");
  return crypto.randomUUID() + crypto.randomUUID();
}

function normalizeJobs(payload: unknown): Job[] {
  // APIs may return the list directly or wrap it in a named collection.
  // Never trust the response shape at runtime just because the request is typed.
  const value = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
  const candidate = Array.isArray(payload)
    ? payload
    : value && [value.jobs, value.items, value.results, value.opportunities].find(Array.isArray);

  if (!Array.isArray(candidate)) return [];
  return candidate.filter((item): item is Job =>
    Boolean(item && typeof item === "object" &&
      typeof (item as Record<string, unknown>).id === "string" &&
      typeof (item as Record<string, unknown>).title === "string")
  );
}

export default function PublicJobApply(){
 const [jobs,setJobs]=useState<Job[]>([]); const [jobId,setJobId]=useState(""); const [jobsNotice,setJobsNotice]=useState(""); const [form,setForm]=useState({contactName:"",contactEmail:"",contactPhone:"",intent:"",consent:false}); const [result,setResult]=useState<any>(null); const [error,setError]=useState(""); const [errorReference,setErrorReference]=useState(""); const [submitting,setSubmitting]=useState(false); const [submissionUncertain,setSubmissionUncertain]=useState(false); const [idempotencyKey,setIdempotencyKey]=useState("");
 useEffect(()=>{
   let active=true;
   api<unknown>("/api/v1/jobs?postingScope=public")
     .then(payload=>{
       if(!active)return;
       const list=normalizeJobs(payload);
       setJobs(list);
       const requestedJobId=new URLSearchParams(window.location.search).get("jobId");
       if(requestedJobId&&list.some(job=>job.id===requestedJobId))setJobId(requestedJobId);
       else if(!Array.isArray(payload) && !(payload && typeof payload==="object" && [ "jobs","items","results","opportunities" ].some(key=>Array.isArray((payload as Record<string,unknown>)[key]))))
         setJobsNotice("Public job listings are temporarily unavailable. You can still send a general job inquiry.");
     })
     .catch(()=>{
       if(!active)return;
       setJobs([]);
       setJobsNotice("We couldn't load public job listings right now. You can still send a general job inquiry.");
     });
   return ()=>{active=false};
 },[]);
 async function submit(e?:FormEvent){e?.preventDefault();if(submitting)return;setSubmitting(true);setError("");setErrorReference("");try{const key=idempotencyKey||createSubmissionKey();setIdempotencyKey(key);const r=await api<any>("/api/v1/public/opportunity-inquiries",{method:"POST",headers:{"X-Idempotency-Key":key},body:JSON.stringify({...form,inquiryType:"job",jobId:jobId||null})});setSubmissionUncertain(false);setResult(r)}catch(e){setError(e instanceof Error?e.message:"We could not receive your inquiry. Your entries are still here; retry when ready.");setErrorReference(e instanceof ApiError?e.requestId||"": "");setSubmissionUncertain(e instanceof ApiError&&(e.status===0||e.status>=500||e.code==="INVALID_RESPONSE"));}finally{setSubmitting(false)}}
 if(result)return <div className="auth-page"><Card><Badge>{humanStatus(result.status||"received")}</Badge><h1 className="h1">We have your interest.</h1><p className="muted">Reference <b>{result.publicReference}</b>. Current status: <b>{humanStatus(result.status||"received")}</b>.</p><p className="muted">{result.nextStep||"Your inquiry has been recorded. Review the status above before taking the next step."}</p>{!["converted","declined","closed"].includes(result.status)&&<><div className="form-success"><CheckCircle2 size={18}/> Save your secure continuation link. It lets you provide detailed information later.</div><a className="btn btn-primary" href={`/apply/opportunity?ref=${encodeURIComponent(result.publicReference)}&token=${encodeURIComponent(result.continuationToken)}`} style={{marginTop:16}}>Continue with detailed information <ArrowRight size={16}/></a></>}{["converted","declined","closed"].includes(result.status)&&<div className="form-success"><CheckCircle2 size={18}/> This inquiry has a recorded outcome. Do not submit the same request again; contact MPA support if you need clarification.</div>}<button type="button" className="btn btn-ghost" style={{marginTop:12}} onClick={()=>{setResult(null);setForm({contactName:"",contactEmail:"",contactPhone:"",intent:"",consent:false});setError("");setErrorReference("");setJobId("");setIdempotencyKey("");setSubmissionUncertain(false);}}>Start another inquiry</button><p className="muted" style={{marginTop:14}}>Formal eligibility, membership and employer screening still apply. Non-members may be considered only when an authorized reviewer explicitly allows that path.</p></Card></div>;
 return <div className="auth-page"><Card><div className="eyebrow">Public job application · first step</div><h1 className="h1">Tell us what opportunity you want.</h1><p className="muted">This is an initial question to MPA, not a formal job application. Choose a specific vacancy if your question is about one role, or leave it unselected for a general inquiry. To register your skills and preferred roles for future opportunities, use the separate job-interest form.</p>{jobsNotice&&<p className="muted" aria-live="polite" aria-atomic="true">{jobsNotice}</p>}<form className="form-stack" onSubmit={submit} aria-busy={submitting||submissionUncertain}><label>Specific vacancy (optional)<select value={jobId} disabled={submitting||submissionUncertain} onChange={e=>{setIdempotencyKey("");setJobId(e.target.value)}}><option value="">I am asking about jobs generally</option>{jobs.map(j=><option key={j.id} value={j.id}>{j.title}{j.organization_display_name?` · ${j.organization_display_name}`:""}</option>)}</select></label><label>Your name<input required value={form.contactName} disabled={submitting||submissionUncertain} onChange={e=>{setIdempotencyKey("");setSubmissionUncertain(false);setForm({...form,contactName:e.target.value})}}/></label><div className="form-grid"><label>Email<input type="email" value={form.contactEmail} disabled={submitting||submissionUncertain} onChange={e=>{setIdempotencyKey("");setSubmissionUncertain(false);setForm({...form,contactEmail:e.target.value})}}/></label><label>Phone<input value={form.contactPhone} disabled={submitting||submissionUncertain} onChange={e=>{setIdempotencyKey("");setForm({...form,contactPhone:e.target.value})}}/></label></div><label>What are you looking for?<textarea required rows={4} value={form.intent} disabled={submitting||submissionUncertain} onChange={e=>{setIdempotencyKey("");setForm({...form,intent:e.target.value})}} placeholder="For example: I am interested in the project finance role and would like to know how to apply."/></label><label className="check-row"><input type="checkbox" required checked={form.consent} disabled={submitting||submissionUncertain} onChange={e=>{setIdempotencyKey("");setForm({...form,consent:e.target.checked})}}/> I agree that MPA may use these contact details to respond to this opportunity inquiry.</label>{error&&<FormFeedback kind="error" message={error} reference={errorReference||undefined} onRetry={()=>void submit()} retryLabel={submissionUncertain?"Check submission again":"Retry sending inquiry"} busy={submitting} nextAction={submissionUncertain?"We could not confirm whether the previous request was received. Your entries are locked so you can safely retry the same submission and retrieve its result without creating a duplicate.":"Your entries have been kept on this page. Review the details, then retry."}/>}<button type="submit" className="btn btn-primary" disabled={submitting}>{submitting?"Sending your inquiry securely…":submissionUncertain?"Check previous submission":"Send job application inquiry"} <BriefcaseBusiness size={16}/></button></form><div className="auth-links"><a href="/jobs">Browse vacancies</a><a href="/jobs/interest">Register interest in future jobs</a><a href="/track">Track an existing application</a></div></Card></div>;
}
