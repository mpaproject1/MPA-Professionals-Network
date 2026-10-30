"use client";
import {useCallback,useEffect,useState} from "react";
import {Card} from "../../../../components/ui";
import {ApiError,api} from "../../../../lib/api";
import {humanStatus} from "../../../../lib/status-labels";
import {useUiStore} from "../../../../lib/store";

type ReviewJob={id:string;organization_id:string;organization_name:string;title:string;description:string;employment_type?:string|null;work_mode?:string|null;location_label?:string|null;posting_scope:string;visibility:string;application_deadline?:string|null;review_submitted_at?:string|null;verification_status:string};
export default function JobReviewQueue(){
 const token=useUiStore(s=>s.token);
 const hydrated=useUiStore(s=>s.hydrated);
 const hydrateToken=useUiStore(s=>s.hydrateToken);
 const [items,setItems]=useState<ReviewJob[]>([]);
 const [reasons,setReasons]=useState<Record<string,string>>({});
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const load=useCallback(async()=>{if(!hydrated)return;if(!token){setLoading(false);setItems([]);return;}setLoading(true);setError("");try{const rows=await api<ReviewJob[]>("/api/v1/review/jobs",{},token);setItems(Array.isArray(rows)?rows:[]);}catch(e){setError(e instanceof ApiError?e.message:"The MPA vacancy review queue could not be loaded.");}finally{setLoading(false);}},[token,hydrated]);
 useEffect(()=>{hydrateToken();},[hydrateToken]);
 useEffect(()=>{if(hydrated)void load();},[hydrated,load]);
 async function decide(job:ReviewJob,decision:"approved"|"rejected"|"correction_required"){
  setBusy(job.id);setError("");setNotice("");
  try{await api("/api/v1/review/jobs/"+encodeURIComponent(job.id)+"/decision",{method:"POST",body:JSON.stringify({decision,reason:reasons[job.id]||""})},token||undefined);setNotice(decision==="approved"?"Vacancy approved and published.":decision==="rejected"?"Vacancy rejected.":"Vacancy returned for correction.");setItems(current=>current.filter(item=>item.id!==job.id));}
  catch(e){setError(e instanceof ApiError?e.message:"The review decision could not be saved. Refresh the queue before retrying.");}
  finally{setBusy("");}
 }
 return <main className="page-shell" style={{maxWidth:1080,margin:"0 auto",padding:"24px 16px"}}>
  <div className="eyebrow">MPA governance · Jobs</div><h1 className="h1">Vacancy review queue</h1>
  <p className="muted">Every vacancy requires an MPA decision before it can appear in public or restricted job discovery. Organization verification is necessary, but does not replace vacancy approval.</p>
  {error&&<p className="form-error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {loading?<Card><p>Loading submitted vacancies…</p></Card>:items.length===0?<Card><h2>No vacancies awaiting review</h2><p className="muted">New submissions will appear here for authorized MPA reviewers.</p><button className="btn btn-ghost" onClick={()=>void load()}>Refresh queue</button></Card>:<div className="grid" style={{gap:14}}>{items.map(job=><Card key={job.id}>
   <div className="row" style={{justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><div className="eyebrow">{job.organization_name}</div><h2>{job.title}</h2></div><span className="badge">{humanStatus("pending_review")}</span></div>
   <p>{job.description}</p><p className="muted">Organization verification: {humanStatus(job.verification_status)} · Scope: {humanStatus(job.posting_scope)} · Visibility: {humanStatus(job.visibility)}</p>
   <label style={{display:"grid",gap:6}}>Decision reason (required for return or rejection)<textarea rows={3} value={reasons[job.id]||""} onChange={e=>setReasons(current=>({...current,[job.id]:e.target.value}))} placeholder="Explain the decision and any changes required."/></label>
   <div className="row" style={{gap:8,flexWrap:"wrap",marginTop:12}}>
    <button className="btn btn-primary" disabled={busy===job.id||job.verification_status!=="verified"} onClick={()=>void decide(job,"approved")}>Approve and publish</button>
    <button className="btn btn-secondary" disabled={busy===job.id} onClick={()=>void decide(job,"correction_required")}>Return for correction</button>
    <button className="btn btn-ghost" disabled={busy===job.id} onClick={()=>void decide(job,"rejected")}>Reject vacancy</button>
   </div>
  </Card>)}</div>}
 </main>;
}
