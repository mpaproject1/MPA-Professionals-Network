"use client";
import { useCallback,useEffect,useState } from "react";
import { AdminPageHeader } from "../../admin-page-header";
import { ApiError,api } from "../../../../lib/api";
import { useUiStore } from "../../../../lib/store";

type Verification={case_id:string;business_id:string;case_status:string;submitted_at:string;expires_at?:string|null;display_name:string;business_kind:string;description:string;website?:string|null;location_label?:string|null;verification_status:string;created_at:string};
type Business={id:string;business_kind:string;display_name:string;trading_name?:string|null;description:string;website?:string|null;location_label?:string|null;verification_status:string;moderation_status:string;publication_status:string;created_at:string};
type Evidence={id:string;case_id:string;file_object_id:string;evidence_type:string;note?:string|null;created_at:string};
type Queue<T>={items:T[];limit:number;offset:number};
const label=(v:string)=>String(v||"").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
export default function NetworkPlusBusinessReviewPage(){
 const token=useUiStore(s=>s.token),hydrateToken=useUiStore(s=>s.hydrateToken),hydrated=useUiStore(s=>s.hydrated);
 const [tab,setTab]=useState<"verification"|"moderation">("verification"),[verification,setVerification]=useState<Verification[]>([]),[businesses,setBusinesses]=useState<Business[]>([]);
 const [evidence,setEvidence]=useState<Record<string,Evidence[]>>({}),[decisions,setDecisions]=useState<Record<string,string>>({}),[reasons,setReasons]=useState<Record<string,string>>({}),[expiry,setExpiry]=useState<Record<string,string>>({});
 const [loading,setLoading]=useState(false),[busy,setBusy]=useState<Record<string,boolean>>({}),[error,setError]=useState(""),[notice,setNotice]=useState("");
 useEffect(()=>{hydrateToken();},[hydrateToken]);
 const load=useCallback(async()=>{
  if(!token)return;setLoading(true);setError("");
  try{
   if(tab==="verification"){const result=await api<Queue<Verification>>("/api/v1/admin/network-plus/businesses/verification-queue?limit=50",{},token);setVerification(result.items||[]);}
   else{const result=await api<Queue<Business>>("/api/v1/admin/network-plus/businesses/moderation-queue?limit=50",{},token);setBusinesses(result.items||[]);}
  }catch(e){setError(e instanceof ApiError?e.message:"The business review queue could not be loaded.");}
  finally{setLoading(false);}
 },[token,tab]);
 useEffect(()=>{if(hydrated&&token)void load();},[hydrated,token,load]);
 const loadEvidence=async(id:string)=>{
  try{const rows=await api<Evidence[]>("/api/v1/admin/network-plus/businesses/"+encodeURIComponent(id)+"/evidence",{},token);setEvidence(v=>({...v,[id]:rows||[]}));}
  catch(e){setError(e instanceof ApiError?e.message:"Private verification evidence could not be loaded.");}
 };
 const downloadEvidence=async(fileId:string)=>{
  try{const response=await fetch("/api/v1/files/"+encodeURIComponent(fileId),{headers:{Authorization:"Bearer "+token},cache:"no-store"});if(!response.ok)throw new Error("The private evidence file is not available to this reviewer.");const blob=await response.blob(),url=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=url;anchor.download="business-verification-evidence";document.body.appendChild(anchor);anchor.click();anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(url),30000);}
  catch(e){setError(e instanceof Error?e.message:"Private evidence could not be downloaded.");}
 };
 const review=async(row:Verification)=>{
  const status=decisions[row.business_id]||"under_review",reason=(reasons[row.business_id]||"").trim();
  if(reason.length<8){setError("Add at least eight characters explaining the verification decision.");return;}
  if(status==="verified"&&!expiry[row.business_id]){setError("A verified decision requires a future revalidation date.");return;}
  setBusy(v=>({...v,[row.business_id]:true}));setError("");setNotice("");
  try{await api("/api/v1/admin/network-plus/businesses/"+encodeURIComponent(row.business_id)+"/verification",{method:"POST",body:JSON.stringify({status,reason,expiresAt:status==="verified"?expiry[row.business_id]:null})},token);setNotice("Business verification decision recorded.");await load();}
  catch(e){setError(e instanceof ApiError?e.message:"The verification decision could not be saved.");}
  finally{setBusy(v=>({...v,[row.business_id]:false}));}
 };
 const moderate=async(row:Business)=>{
  const status=decisions[row.id]||"approved",reason=(reasons[row.id]||"").trim();
  if(reason.length<8){setError("Add at least eight characters explaining the moderation decision.");return;}
  setBusy(v=>({...v,[row.id]:true}));setError("");setNotice("");
  try{await api("/api/v1/admin/network-plus/businesses/"+encodeURIComponent(row.id)+"/moderation",{method:"POST",body:JSON.stringify({status,reason})},token);setNotice("Business profile moderation decision recorded.");await load();}
  catch(e){setError(e instanceof ApiError?e.message:"The business moderation decision could not be saved.");}
  finally{setBusy(v=>({...v,[row.id]:false}));}
 };
 return <main className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-6 sm:px-6">
  <AdminPageHeader eyebrow="Network-Plus · Independent review" title="Business verification & profile review" description="Verify business evidence independently, then review the privacy-safe public business profile. Ownership and listing publication remain separate decisions."/>
  <nav className="flex flex-wrap gap-2 border-b pb-3" aria-label="Business review queues"><button type="button" className={tab==="verification"?"btn btn-primary":"btn btn-ghost"} onClick={()=>setTab("verification")}>Verification evidence</button><button type="button" className={tab==="moderation"?"btn btn-primary":"btn btn-ghost"} onClick={()=>setTab("moderation")}>Business profile moderation</button><button type="button" className="btn btn-ghost" disabled={loading} onClick={()=>void load()}>Refresh</button></nav>
  {error&&<div className="form-error" role="alert">{error}</div>}{notice&&<div className="form-success" role="status">{notice}</div>}
  {loading?<div className="card muted">Loading independent review queue…</div>:tab==="verification"?(verification.length?verification.map(row=><article className="card grid gap-3" key={row.case_id}><div><p className="eyebrow">{label(row.business_kind)} · {label(row.case_status)}</p><h2 className="h2">{row.display_name}</h2><p className="muted text-sm">{row.location_label||"Location not specified"} · Submitted {new Date(row.submitted_at).toLocaleString()}</p></div><p className="text-sm">{row.description}</p>{row.website&&<p className="text-sm">{row.website}</p>}<div><button type="button" className="btn btn-ghost" onClick={()=>void loadEvidence(row.business_id)}>View private evidence</button>{evidence[row.business_id]&&<div className="mt-2 grid gap-2 rounded-xl bg-slate-50 p-3">{evidence[row.business_id].length?evidence[row.business_id].map(file=><div key={file.id} className="text-sm"><strong>{file.evidence_type}</strong><p className="muted text-xs">{file.note||"No note"}</p><button type="button" className="btn btn-ghost mt-1" onClick={()=>void downloadEvidence(file.file_object_id)}>Download private evidence</button></div>):<p className="muted text-sm">No evidence references returned.</p>}</div>}</div><div className="grid gap-2 border-t pt-3 sm:grid-cols-[220px_1fr]"><label className="grid gap-1 text-sm">Verification decision<select className="input" value={decisions[row.business_id]||"under_review"} onChange={e=>setDecisions(v=>({...v,[row.business_id]:e.target.value}))}><option value="under_review">Continue review</option><option value="verified">Verify business</option><option value="changes_requested">Request more evidence</option><option value="rejected">Reject</option><option value="suspended">Suspend</option><option value="appealed">Move to appeal review</option></select></label><label className="grid gap-1 text-sm">Decision reason<textarea className="input min-h-16" value={reasons[row.business_id]||""} onChange={e=>setReasons(v=>({...v,[row.business_id]:e.target.value}))} placeholder="Record the evidence assessment and rationale."/></label>{(decisions[row.business_id]||"under_review")==="verified"&&<label className="grid gap-1 text-sm">Revalidation date<input type="date" className="input" value={expiry[row.business_id]||""} onChange={e=>setExpiry(v=>({...v,[row.business_id]:e.target.value}))}/></label>}<button type="button" className="btn btn-primary self-end" disabled={Boolean(busy[row.business_id])} onClick={()=>void review(row)}>{busy[row.business_id]?"Saving…":"Record verification decision"}</button></div></article>):<div className="card text-center"><h3 className="h2">No business verification cases awaiting review</h3></div>):(businesses.length?businesses.map(row=><article className="card grid gap-3" key={row.id}><div><p className="eyebrow">{label(row.business_kind)} · {label(row.verification_status)}</p><h2 className="h2">{row.display_name}</h2><p className="muted text-sm">{row.location_label||"Location not specified"} · Created {new Date(row.created_at).toLocaleString()}</p></div><p className="text-sm">{row.description}</p>{row.website&&<p className="text-sm">{row.website}</p>}<div className="grid gap-2 border-t pt-3 sm:grid-cols-[220px_1fr_auto]"><label className="grid gap-1 text-sm">Profile decision<select className="input" value={decisions[row.id]||"approved"} onChange={e=>setDecisions(v=>({...v,[row.id]:e.target.value}))}><option value="approved">Approve and publish profile</option><option value="rejected">Reject profile</option><option value="suspended">Suspend profile</option></select></label><label className="grid gap-1 text-sm">Decision reason<textarea className="input min-h-16" value={reasons[row.id]||""} onChange={e=>setReasons(v=>({...v,[row.id]:e.target.value}))} placeholder="Explain the profile moderation decision."/></label><button type="button" className="btn btn-primary self-end" disabled={Boolean(busy[row.id])} onClick={()=>void moderate(row)}>{busy[row.id]?"Saving…":"Record decision"}</button></div></article>):<div className="card text-center"><h3 className="h2">No business profiles awaiting moderation</h3></div>)}
 </main>;
}
