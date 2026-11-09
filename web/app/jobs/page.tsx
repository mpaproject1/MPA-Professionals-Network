"use client";

import {Bookmark,Building2,Clock3,MapPin,Users} from "lucide-react";
import {type FormEvent,useCallback,useEffect,useId,useState} from "react";
import {DiscoveryPagination} from "../../components/discovery-pagination";
import { OperationStatus } from "../../components/operation-status";
import {Badge, Card} from "../../components/ui";
import {ApiError, api} from "../../lib/api";
import { humanStatus } from "../../lib/status-labels";
import {useUiStore} from "../../lib/store";

type Job={
 id:string;title:string;description?:string;organization_id:string;organization_name?:string;
 location_label?:string;posting_scope?:string;employment_type?:string;work_mode?:string;
 seniority_level?:string;department?:string;application_deadline?:string;salary_min?:number|string|null;
 salary_max?:number|string|null;salary_currency?:string|null;
 screeningQuestions?:{id:string;question:string;question_type:string;options?:string[];required:boolean;knockout?:boolean}[];
};
type Eligibility={eligible:boolean;summary:string;results:{code:string;eligible:boolean;reason:string}[]};
type EligibilityResult=Eligibility|{error:string};
type ExistingApplication={id:string;job_id:string;status:string;cover_letter?:string|null;screening_answers?:{questionId:string;answer:string|string[]}[]};
type Filters={q:string;location:string;employmentType:string;workMode:string;seniority:string;postingScope:string};
const initialFilters:Filters={q:"",location:"",employmentType:"",workMode:"",seniority:"",postingScope:""};

function EligibilityDetails({result}:{result?:EligibilityResult}){if(!result)return <p className="muted">Eligibility has not been checked yet.</p>;if("error" in result)return <p className="form-error" role="alert">{result.error}</p>;return <>{<p>{result.summary}</p>}{result.results.length>0&&<ul>{result.results.map((rule,_index)=><li key={rule.code}>{rule.eligible?"Meets requirement: ":"Still needed: "}{rule.reason}</li>)}</ul>}</>;}
function queryString(filters:Filters){
 const p=new URLSearchParams();
 for(const [key,value] of Object.entries(filters)) if(value.trim()) p.set(key,value.trim());
 return p.toString();
}
function scopeLabel(scope?:string){return scope==="public"?"Public":scope==="mpa_members"?"MPA members":scope==="partner_network"?"Partner network":scope==="organization_internal"?"My organization": "Opportunity";}
function salary(job:Job){
 if(job.salary_min==null&&job.salary_max==null)return null;
 const money=(n:number|string)=>Number(n).toLocaleString();
 if(job.salary_min!=null&&job.salary_max!=null)return `${job.salary_currency||""} ${money(job.salary_min)}–${money(job.salary_max)}`.trim();
 return `${job.salary_currency||""} ${money((job.salary_min??job.salary_max) as number|string)}`.trim();
}

export default function Jobs(){
 useEffect(()=>{const code=new URLSearchParams(window.location.search).get("ref");if(code)setReferralCode(code.trim().toUpperCase());},[]);
 const jobsId=useId();
 const token=useUiStore(s=>s.token);
 const [filters,setFilters]=useState<Filters>(initialFilters);
 const [referralCode,setReferralCode]=useState("");
 const [referralStatusConsent,setReferralStatusConsent]=useState(false);
 const [jobs,setJobs]=useState<Job[]>([]);
 const [page,setPage]=useState(0);const [hasMore,setHasMore]=useState(false);const pageSize=20;
 const [saved,setSaved]=useState<string[]>([]);
 const [expanded,setExpanded]=useState<Record<string,boolean>>({});
 const [loading,setLoading]=useState(true);
 const [savingId,setSavingId]=useState("");
 const [creatingAlert,setCreatingAlert]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [coverLetters,setCoverLetters]=useState<Record<string,string>>({});
 const [screeningAnswersByJob,setScreeningAnswersByJob]=useState<Record<string,Record<string,string|string[]>>>({});
 const [draftIds,setDraftIds]=useState<Record<string,string>>({});
 const [applyingIds,setApplyingIds]=useState<Record<string,boolean>>({});
 const [eligibilityByJob,setEligibilityByJob]=useState<Record<string,EligibilityResult>>({});
 const [eligibilityLoading,setEligibilityLoading]=useState<Record<string,boolean>>({});

 const loadJobs=useCallback(async(nextFilters:Filters,pageIndex=0)=>{
   setLoading(true);setError("");setNotice("");
   try{
     const params=new URLSearchParams(queryString(nextFilters));params.set("limit",String(pageSize));params.set("offset",String(pageIndex*pageSize));
     const payload=await api<{items:Job[];hasMore?:boolean;total?:number}|Job[]>(`/api/v1/jobs?${params.toString()}`,{},token||undefined);
     const items=Array.isArray(payload)?payload:payload?.items;
     const valid=Array.isArray(items)?items.filter(j=>j&&typeof j.id==="string"&&typeof j.title==="string"):[];
     setJobs(valid);setHasMore(Array.isArray(payload)?valid.length===pageSize:Boolean(payload.hasMore));setPage(pageIndex);
     if(!Array.isArray(items))setError("The jobs service returned an incomplete response. Published opportunities are unavailable until a complete response is received.");
   }catch(e){
     setJobs([]);
     setError(e instanceof ApiError?e.message:"We couldn't load opportunities right now.");
   }finally{setLoading(false);}
 },[token]);

 useEffect(()=>{void loadJobs(initialFilters)},[loadJobs]);
 useEffect(()=>{
   if(!token){setSaved([]);setDraftIds({});setCoverLetters({});setScreeningAnswersByJob({});return;}
   let active=true;
   api<Job[]>("/api/v1/me/saved-jobs",{},token).then(rows=>{if(active)setSaved(Array.isArray(rows)?rows.map(row=>row.id):[])}).catch(e=>{if(active)setError(e instanceof ApiError?e.message:"We couldn't load saved opportunities.")});
   api<ExistingApplication[]>("/api/v1/me/job-applications",{},token).then(rows=>{
     if(!active)return;
     const drafts=Array.isArray(rows)?rows.filter(row=>row.status==="draft"&&typeof row.job_id==="string"):[];
     setDraftIds(Object.fromEntries(drafts.map(row=>[row.job_id,row.id])));
     setCoverLetters(Object.fromEntries(drafts.map(row=>[row.job_id,row.cover_letter||""])));
     setScreeningAnswersByJob(Object.fromEntries(drafts.map(row=>[row.job_id,Object.fromEntries((row.screening_answers||[]).map(answer=>[answer.questionId,answer.answer]))])));
   }).catch(e=>{if(active)setError(e instanceof ApiError?e.message:"Saved application drafts could not be restored. Confirm the current application state in tracking before submitting another application.")});
   return ()=>{active=false};
 },[token]);

 async function submitFilters(e:FormEvent){e.preventDefault();await loadJobs(filters,0);}
 function answersFor(jobId:string){return Object.entries(screeningAnswersByJob[jobId]||{}).map(([questionId,answer])=>({questionId,answer}));}
 function updateScreeningAnswer(jobId:string,questionId:string,answer:string|string[]){setScreeningAnswersByJob(current=>({...current,[jobId]:{...(current[jobId]||{}),[questionId]:answer}}));}
 function missingRequiredAnswers(job:Job){return (job.screeningQuestions||[]).some(question=>{const answer=screeningAnswersByJob[job.id]?.[question.id];return question.required&&(answer===undefined||answer===null||answer===""||(Array.isArray(answer)&&answer.length===0));});}
 async function createAlert(){
   if(!token){setNotice("Sign in to save a job alert for these search criteria.");return;}
   setCreatingAlert(true);setError("");setNotice("");
   try{
     const parts=[filters.q,filters.location].filter(Boolean);
     const name=parts.length?`Job alert: ${parts.join(" · ")}`:"Job alert: all matching opportunities";
     await api("/api/v1/me/job-alerts",{method:"POST",body:JSON.stringify({name,criteria:filters,channel:"in_app",frequency:"daily"})},token);
     setNotice("Your daily in-app job alert was saved with the current search criteria.");
   }catch(e){setError(e instanceof ApiError?e.message:"We couldn't save this job alert.");}
   finally{setCreatingAlert(false);}
 }
 async function toggleSave(job:Job){
   if(!token){setNotice("Sign in to save opportunities. Your search results remain available without signing in.");return;}
   setSavingId(job.id);setError("");setNotice("");
   const isSaved=saved.includes(job.id);
   try{
     await api(`/api/v1/jobs/${encodeURIComponent(job.id)}/save`,{method:isSaved?"DELETE":"POST"},token);
     setSaved(current=>isSaved?current.filter(id=>id!==job.id):[...current,job.id]);
     setNotice(isSaved?"Opportunity removed from saved jobs.":"Opportunity saved to your account.");
   }catch(e){setError(e instanceof ApiError?e.message:"We couldn't update your saved jobs.");}
   finally{setSavingId("");}
 }
 async function saveFormalApplicationDraft(job:Job){
   if(!token){setNotice("Sign in to save an application draft to your account.");return;}
   if(applyingIds[job.id])return;setApplyingIds(current=>({...current,[job.id]:true}));setError("");setNotice("");
   try{
     let draftId=draftIds[job.id];
     if(!draftId){
       const draft=await api<{id:string}>("/api/v1/jobs/"+encodeURIComponent(job.id)+"/application-drafts",{method:"POST",body:JSON.stringify({coverLetter:coverLetters[job.id]||"",answers:answersFor(job.id),referralCode:referralCode,referralStatusConsent})},token);
       draftId=draft.id;setDraftIds(current=>({...current,[job.id]:draftId!}));
     }else{
       await api("/api/v1/job-applications/"+encodeURIComponent(draftId),{method:"PATCH",body:JSON.stringify({coverLetter:coverLetters[job.id]||"",answers:answersFor(job.id),referralCode:referralCode,referralStatusConsent})},token);
     }
     setNotice("Your application draft is saved to your account. You can return to it before submitting.");
   }catch(e){setError(e instanceof ApiError?e.message:"We couldn't save this draft. Your text is still on this page; retry before leaving.");}
   finally{setApplyingIds(current=>({...current,[job.id]:false}));}
 }

  async function submitFormalApplication(job:Job){
    if(!token){setNotice("Sign in to start a formal application. Public interest intake remains available separately.");return;}
    if(missingRequiredAnswers(job)){setError("Answer each required screening question before submitting. Your draft remains available.");return;}
    if(applyingIds[job.id])return;
    setApplyingIds(current=>({...current,[job.id]:true}));setError("");setNotice("");
    try{
      let draftId=draftIds[job.id];
      if(!draftId){
        const draft=await api<{id:string}>(`/api/v1/jobs/${encodeURIComponent(job.id)}/application-drafts`,{method:"POST",body:JSON.stringify({coverLetter:coverLetters[job.id]||"",answers:answersFor(job.id),referralCode:referralCode,referralStatusConsent})},token);
        draftId=draft.id;setDraftIds(current=>({...current,[job.id]:draftId!}));
      }
      const submitted=await api<{status?:string;tracking_reference?:string|null}>(`/api/v1/job-applications/${encodeURIComponent(draftId)}/submit`,{method:"POST",body:JSON.stringify({coverLetter:coverLetters[job.id]||"",answers:answersFor(job.id),referralCode:referralCode,referralStatusConsent})},token);
      setNotice(`Formal application status: ${humanStatus(submitted.status||"submitted")}.${submitted.tracking_reference?` Reference ${submitted.tracking_reference}.`:""} Open application tracking for the next steps.`);
      setDraftIds(current=>{const next={...current};delete next[job.id];return next;});
    }catch(e){
      if(e instanceof ApiError&&e.code==="INVALID_STATE"){
        setDraftIds(current=>{const next={...current};delete next[job.id];return next;});
        setNotice("This application is no longer a draft. It may already have been submitted. Check application tracking before trying again.");
      }else setError(e instanceof ApiError?e.message:"We couldn't confirm the formal application outcome. Check application tracking before retrying so you do not duplicate the application.");
    }finally{setApplyingIds(current=>({...current,[job.id]:false}));}
  }

 async function toggleDetails(job:Job){
   const isOpen=Boolean(expanded[job.id]);
   if(isOpen){setExpanded(current=>({...current,[job.id]:false}));return;}
   setExpanded(current=>({...current,[job.id]:true}));
   const tasks:Promise<unknown>[]=[];
   if(job.description===undefined||job.screeningQuestions===undefined)tasks.push(api<Job>(`/api/v1/jobs/${encodeURIComponent(job.id)}`,{},token||undefined).then(detail=>setJobs(current=>current.map(item=>item.id===job.id?{...item,...detail}:item))).catch(e=>setError(e instanceof ApiError?e.message:"We couldn't load the opportunity details.")));
   if(token&&!eligibilityByJob[job.id]){
     setEligibilityLoading(current=>({...current,[job.id]:true}));
     tasks.push(
       api<Eligibility>(`/api/v1/jobs/${encodeURIComponent(job.id)}/eligibility`, {}, token)
         .then((result) => setEligibilityByJob((current) => ({ ...current, [job.id]: result })))
         .catch((e) => setEligibilityByJob((current) => ({
           ...current,
           [job.id]: { error: e instanceof ApiError ? e.message : "Eligibility could not be confirmed. Do not treat this opportunity as eligible until the server returns a valid result." },
         })))
         .finally(() => setEligibilityLoading((current) => ({ ...current, [job.id]: false }))),
     );
   }
   await Promise.all(tasks);
 }

 return <div className="mpa-jobs-page">
   <section className="mpa-signature-intro" aria-labelledby="jobs-page-title">
     <div className="eyebrow">Careers and opportunities</div>
     <h1 id="jobs-page-title" className="h1">Find your next professional opportunity.</h1>
     <p>Explore published vacancies from eligible organizations. Review each role’s requirements, check your eligibility and track any formal application from your account.</p>
   </section>
   <div className="job-journey grid grid-3" aria-label="Your opportunity journey" style={{gap:10,marginTop:14}}>
    <Card><div className="eyebrow">Step 1</div><b>Prepare your profile</b><p className="muted">Keep your experience and visibility settings up to date.</p><a className="text-link" href="/profile">Review profile →</a></Card>
    <Card><div className="eyebrow">Step 2</div><b>Discover and apply</b><p className="muted">Check requirements and submit the information requested for each role.</p><a className="text-link" href="#job-search">Search opportunities →</a></Card>
    <Card><div className="eyebrow">Step 3</div><b>Track your progress</b><p className="muted">Follow recorded application updates and next actions.</p><a className="text-link" href="/track">Track applications →</a></Card>
   </div>
   <p><a className="btn btn-ghost" href="/jobs/interest">No matching vacancy? Register your job interest</a> <a className="btn btn-ghost" href="/saved">Review saved items</a></p>
   <div className="split" style={{marginTop:20}}>
     <Card id="job-search" className="filter">
       <form onSubmit={submitFilters}>
         <fieldset className="form-category grid" style={{gap:10}}><legend>Find opportunities</legend>
         <label style={{display:"grid",gap:6,marginTop:4,fontSize:13,fontWeight:700}}>Role, skill or sector<input value={filters.q} onChange={e=>setFilters({...filters,q:e.target.value})} placeholder="Search job title or description"/></label></fieldset>
         <details className="form-category"><summary style={{cursor:"pointer",fontWeight:700}}>Refine results <span className="muted">· location, work type and visibility</span></summary><div className="grid" style={{gap:10,marginTop:12}}>
         <label style={{display:"grid",gap:6,fontSize:13,fontWeight:700}}>Location<input value={filters.location} onChange={e=>setFilters({...filters,location:e.target.value})} placeholder="City or region"/></label>
         <label style={{display:"grid",gap:6,marginTop:16,fontSize:13,fontWeight:700}}>Employment type<select value={filters.employmentType} onChange={e=>setFilters({...filters,employmentType:e.target.value})}><option value="">Any employment type</option><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="contract">Contract</option><option value="temporary">Temporary</option><option value="internship">Internship</option></select></label>
         <label style={{display:"grid",gap:6,marginTop:16,fontSize:13,fontWeight:700}}>Work arrangement<select value={filters.workMode} onChange={e=>setFilters({...filters,workMode:e.target.value})}><option value="">Any work arrangement</option><option value="onsite">On-site</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option></select></label>
         <label style={{display:"grid",gap:6,marginTop:16,fontSize:13,fontWeight:700}}>Experience level<input value={filters.seniority} onChange={e=>setFilters({...filters,seniority:e.target.value})} placeholder="e.g. entry, mid-level, senior"/></label>
         <label style={{display:"grid",gap:6,marginTop:16,fontSize:13,fontWeight:700}}>Scope<select value={filters.postingScope} onChange={e=>setFilters({...filters,postingScope:e.target.value})}><option value="">All opportunities visible to me</option><option value="public">Public opportunities</option><option value="mpa_members">MPA members</option><option value="partner_network">Partner network</option><option value="organization_internal">My organization only</option></select></label></div></details>
         <button className="btn btn-primary" type="submit" disabled={loading} style={{width:"100%",marginTop:18}}>{loading?"Finding matching jobs…":"Apply filters"}</button>
         <button className="btn btn-ghost" type="button" onClick={()=>{setFilters(initialFilters);void loadJobs(initialFilters,0)}} disabled={loading} style={{width:"100%",marginTop:8}}>Clear filters</button>
         <button className="btn btn-ghost" type="button" onClick={()=>void createAlert()} disabled={creatingAlert||loading} style={{width:"100%",marginTop:8}}>{creatingAlert?"Saving alert…":"Save job alert"}</button>
       </form>
     </Card>
     <div id={`${jobsId}-cards`} className="grid">
       {error&&<div className="form-error" role="alert">{error}</div>}
       {notice&&<p className="muted" aria-live="polite" aria-atomic="true">{notice}{(notice.includes("application tracking")||notice.includes("Check application tracking"))&&token?<a className="btn btn-ghost" href="/track" style={{marginLeft:8}}>Open application tracking</a>:null}{!token&&<a href="/login?next=/jobs"> Sign in</a>}</p>}
       {loading&&<Card><OperationStatus state="loading" title="Loading current opportunities" detail="We’re retrieving published jobs that match your search and account access. Your saved drafts and applications are not being changed." /></Card>}
       {!loading&&!error&&jobs.length===0&&<Card><h2 className="h2">No roles match these filters yet</h2><p className="muted">Broaden your search or register your job interest to help the team understand what roles you are looking for. You can also review saved opportunities while new listings are published.</p><div className="row" style={{gap:8,flexWrap:"wrap"}}><button type="button" className="btn btn-ghost" onClick={()=>{setFilters(initialFilters);void loadJobs(initialFilters)}}>Clear filters</button><a className="btn btn-primary" href="/jobs/interest">Register job interest <span aria-hidden="true">→</span></a><a className="btn btn-ghost" href="/saved">View saved items</a></div></Card>}
       {jobs.map(job=><Card key={job.id}>
         <div className="row"><Badge>{scopeLabel(job.posting_scope)}</Badge><button className="icon-btn" type="button" aria-label={saved.includes(job.id)?"Remove saved opportunity":"Save opportunity"} title={saved.includes(job.id)?"Remove saved opportunity":"Save opportunity"} disabled={savingId===job.id} onClick={()=>void toggleSave(job)}><Bookmark size={18} fill={saved.includes(job.id)?"currentColor":"none"}/></button></div>
         <h2 style={{fontSize:20,margin:"12px 0 5px"}}>{job.title}</h2>
         <div className="muted"><Building2 size={14}/> {job.organization_name||"Verified organization"}</div>
         <div style={{display:"flex",gap:12,marginTop:12,flexWrap:"wrap"}}>
           {job.location_label&&<span className="tagline"><MapPin size={14}/> {job.location_label}</span>}
           {job.employment_type&&<span className="tagline"><Clock3 size={14}/> {job.employment_type.replaceAll("_"," ")}</span>}
           {job.seniority_level&&<span className="tagline"><Users size={14}/> {job.seniority_level}</span>}
           {job.work_mode&&<span className="tagline">{job.work_mode.replaceAll("_"," ")}</span>}
           {salary(job)&&<span className="tagline">{salary(job)}</span>}
         </div>
         {job.application_deadline&&<p className="muted">Application deadline: {new Date(job.application_deadline).toLocaleDateString()}</p>}
         {expanded[job.id]&&<div style={{marginTop:14}}><p>{job.description||"No further description has been published."}</p>
         {(job.screeningQuestions||[]).length>0&&<fieldset className="form-category grid" style={{gap:12,marginTop:14}}><legend>Application questions</legend><p className="muted">Your answers are saved with this application draft and submitted with your application. Required questions must be answered before submission.</p>{(job.screeningQuestions||[]).map(question=><div className="grid" style={{gap:6}} key={question.id}><div><b>{question.question}</b>{question.required?<span className="muted"> · Required</span>:<span className="muted"> · Optional</span>}</div>{question.question_type==="text"&&<textarea rows={3} disabled={applyingIds[job.id]} value={String(screeningAnswersByJob[job.id]?.[question.id]||"")} onChange={e=>updateScreeningAnswer(job.id,question.id,e.target.value)}/>}{question.question_type==="number"&&<input type="number" disabled={applyingIds[job.id]} value={String(screeningAnswersByJob[job.id]?.[question.id]||"")} onChange={e=>updateScreeningAnswer(job.id,question.id,e.target.value)}/>}{["yes_no","single_choice"].includes(question.question_type)&&<select disabled={applyingIds[job.id]} value={String(screeningAnswersByJob[job.id]?.[question.id]||"")} onChange={e=>updateScreeningAnswer(job.id,question.id,e.target.value)}><option value="">Choose an answer</option>{(question.question_type==="yes_no"?["yes","no"]:(question.options||[])).map(option=><option key={option} value={option}>{option==="yes"?"Yes":option==="no"?"No":option}</option>)}</select>}{question.question_type==="multiple_choice"&&(question.options||[]).map(option=><label key={option} className="check-row"><input type="checkbox" disabled={applyingIds[job.id]} checked={Array.isArray(screeningAnswersByJob[job.id]?.[question.id])&&(screeningAnswersByJob[job.id]?.[question.id] as string[]).includes(option)} onChange={e=>{const current=Array.isArray(screeningAnswersByJob[job.id]?.[question.id])?screeningAnswersByJob[job.id][question.id] as string[]:[];updateScreeningAnswer(job.id,question.id,e.target.checked?[...new Set([...current,option])]:current.filter(value=>value!==option));}}/>{option}</label>)}</div>)}</fieldset>}{token?<div className="case-row" style={{margin:"12px 0"}}><div style={{flex:1,minWidth:0}}><b>Are you eligible for this opportunity?</b>{eligibilityLoading[job.id]?<p className="muted">Checking the published requirements for your account…</p>:<EligibilityDetails result={eligibilityByJob[job.id]}/>}</div><div className="row" style={{gap:8,flexWrap:"wrap"}}>{eligibilityByJob[job.id]&&"error" in eligibilityByJob[job.id]&&<button className="btn btn-ghost" type="button" onClick={()=>void retryEligibility(job)} disabled={eligibilityLoading[job.id]}>Retry eligibility check</button>}</div></div>:<p className="muted">Sign in to check your eligibility against this vacancy's actual requirements.</p>}<p className="muted">A public inquiry is not a formal application. Formal submission is authenticated and checks eligibility, required screening answers and duplicate applications.</p>{token?<div className="grid" style={{gap:8,marginTop:10}}><label>Member referral code (optional)<input value={referralCode} onChange={e=>setReferralCode(e.target.value.toUpperCase())} maxLength={12} placeholder="MPA-XXXXXXXX" autoComplete="off"/></label><label className="check-row"><input type="checkbox" checked={referralStatusConsent} onChange={e=>setReferralStatusConsent(e.target.checked)}/> I consent to the member who referred me seeing my name and limited referral progress. This is optional.</label><label htmlFor={`cover-${job.id}`}>Cover letter (optional)<textarea id={`cover-${job.id}`} rows={3} disabled={applyingIds[job.id]} value={coverLetters[job.id]||""} onChange={e=>setCoverLetters(current=>({...current,[job.id]:e.target.value}))} placeholder="Explain your interest and relevant experience."/></label><div className="row" style={{gap:8,flexWrap:"wrap"}}><button className="btn btn-ghost" type="button" disabled={applyingIds[job.id]} onClick={()=>void saveFormalApplicationDraft(job)}>{applyingIds[job.id]?"Saving…":draftIds[job.id]?"Save draft changes":"Save draft"}</button><button className="btn btn-primary" type="button" disabled={applyingIds[job.id]} onClick={()=>void submitFormalApplication(job)}>{applyingIds[job.id]?"Submitting application…":draftIds[job.id]?"Submit saved draft":"Submit formal application"}</button></div></div>:<p className="muted"><a href={`/login?next=${encodeURIComponent("/jobs?ref="+referralCode)}`}>Sign in to submit a formal application</a>{referralCode&&<> or <a href={`/register?ref=${encodeURIComponent(referralCode)}`}>create an account using this member invitation code</a></>}; use public inquiry only if you want to ask questions first.</p>}</div>}
         <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:18}}>
           <button className="btn btn-ghost" type="button" disabled={applyingIds[job.id]} onClick={()=>void toggleDetails(job)}>{expanded[job.id]?"Hide details":"View details"}</button>
           <a className="btn btn-primary" href={`/apply/job?jobId=${encodeURIComponent(job.id)}`}>Ask about this vacancy</a>
         </div>
       </Card>)}
       {!loading&&!error&&jobs.length>0&&<DiscoveryPagination page={page} pageSize={pageSize} itemCount={jobs.length} hasMore={hasMore} disabled={loading} label="opportunities" onPageChange={next=>void loadJobs(filters,next)}/>}
     </div>
   </div>
 </div>;
}
