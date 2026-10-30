"use client";

import {type FormEvent,useCallback,useEffect,useState} from "react";
import {FormFeedback} from "../../../components/form-feedback";
import {TagInput} from "../../../components/tag-input";
import {Badge,Card} from "../../../components/ui";
import {ApiError,api} from "../../../lib/api";
import {humanStatus} from "../../../lib/status-labels";
import {useUiStore} from "../../../lib/store";

type Interest={reference:string;status:string;created_at?:string;updated_at?:string;next_action?:string;employer_sharing_consent?:boolean;employer_sharing_revoked_at?:string|null};
type InterestDetail={reference:string;status:string;intent:string;contactName:string;contactEmail?:string|null;contactPhone?:string|null;details:Record<string,unknown>;employerSharingConsent:boolean;employerSharingOrganizationId?:string|null;employerSharingFields:string[];employerSharingRevokedAt?:string|null;nextStep:string};
type ShareHistory={shareId:string;organizationName:string;sharedFields:string[];sharedAt:string;revokedAt?:string|null;status:string};
type Organization={id:string;display_name?:string|null;legal_name?:string|null};
type Me={has_active_membership?:boolean;status?:string};
const shareable=[["targetRole","Target role"],["skills","Skills"],["experience","Experience"],["location","Preferred location"],["availability","Availability"],["contactEmail","Email address"],["contactPhone","Phone number"]];
const fieldLabel=(field:string)=>shareable.find(([key])=>key===field)?.[1]||field;
function submissionKey(){if(typeof crypto==="undefined"||!crypto.randomUUID)throw new Error("Secure submission is unavailable in this browser. Reload and try again.");return crypto.randomUUID()+crypto.randomUUID();}

export default function JobInterestPage(){
 const token=useUiStore(s=>s.token),hydrated=useUiStore(s=>s.hydrated);
 const [member,setMember]=useState<boolean|null>(null),[loading,setLoading]=useState(true);
 const [items,setItems]=useState<Interest[]>([]),[selected,setSelected]=useState<InterestDetail|null>(null);
 const [history,setHistory]=useState<ShareHistory[]>([]);
 const [form,setForm]=useState({contactName:"",contactEmail:"",contactPhone:"",targetRole:"",experience:"",location:"",workMode:"",availability:"",intent:""});
 const [skills,setSkills]=useState<string[]>([]),[consent,setConsent]=useState(false);
 const [shareOptIn,setShareOptIn]=useState(false),[organizationSearch,setOrganizationSearch]=useState(""),[organizations,setOrganizations]=useState<Organization[]>([]),[organizationId,setOrganizationId]=useState(""),[shareFields,setShareFields]=useState(["targetRole","skills"]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[requestKey,setRequestKey]=useState("");
 const load=useCallback(async()=>{
  if(!hydrated)return;
  if(!token){setMember(false);setItems([]);setLoading(false);return;}
  setLoading(true);setError("");
  try{
   const me=await api<Me>("/api/v1/me",{},token);
   const eligible=me.has_active_membership===true;setMember(eligible);
   if(!eligible){setItems([]);setSelected(null);return;}
   const rows=await api<Interest[]>("/api/v1/me/job-interests",{},token);
   setItems(Array.isArray(rows)?rows:[]);
  }catch(e){setMember(false);setItems([]);setError(e instanceof ApiError?e.message:"Your membership status could not be checked. Retry before submitting.");}
  finally{setLoading(false);}
 },[hydrated,token]);
 useEffect(()=>{void load();},[load]);
 async function openInterest(reference:string){
  setBusy(true);setError("");setNotice("");
  try{
   const detail=await api<InterestDetail>("/api/v1/me/job-interests/"+encodeURIComponent(reference),{},token||undefined);
   const rows=await api<ShareHistory[]>("/api/v1/me/job-interests/"+encodeURIComponent(reference)+"/sharing-history",{},token||undefined);
   setSelected(detail);setHistory(Array.isArray(rows)?rows:[]);
   setShareFields(detail.employerSharingFields?.length?detail.employerSharingFields:["targetRole","skills"]);
   setOrganizationId(detail.employerSharingOrganizationId||"");
   setShareOptIn(detail.employerSharingConsent===true&&!detail.employerSharingRevokedAt);
  }catch(e){setError(e instanceof ApiError?e.message:"This request could not be opened. Refresh your membership status and try again.");}
  finally{setBusy(false);}
 }
 async function searchOrganizations(){
  if(organizationSearch.trim().length<3){setError("Enter at least 3 characters of an organization name.");return;}
  setBusy(true);setError("");
  try{const rows=await api<Organization[]>("/api/v1/me/job-interest-sharing-organizations?q="+encodeURIComponent(organizationSearch.trim()),{},token||undefined);setOrganizations(Array.isArray(rows)?rows:[]);setOrganizationId("");}
  catch(e){setError(e instanceof ApiError?e.message:"Verified organizations could not be searched.");}
  finally{setBusy(false);}
 }
 async function submit(event:FormEvent){
  event.preventDefault();if(busy||!token)return;
  setBusy(true);setError("");setNotice("");
  try{
   const key=requestKey||submissionKey();setRequestKey(key);
   const created=await api<InterestDetail>("/api/v1/me/job-interests",{method:"POST",headers:{"X-Idempotency-Key":key},body:JSON.stringify({...form,skills,consent:true})},token);
   setRequestKey("");setNotice("Your request was submitted. Reference: "+created.reference+". "+created.nextStep);
   setForm({contactName:"",contactEmail:"",contactPhone:"",targetRole:"",experience:"",location:"",workMode:"",availability:"",intent:""});setSkills([]);setConsent(false);
   await load();await openInterest(created.reference);
   if(shareOptIn&&organizationId){await api("/api/v1/me/job-interests/"+encodeURIComponent(created.reference)+"/sharing-consent",{method:"POST",body:JSON.stringify({employerSharingConsent:true,scope:"named_employer",organizationId,fields:shareFields})},token);}
  }catch(e){setError(e instanceof ApiError?e.message:e instanceof Error?e.message:"Your request could not be submitted.");}
  finally{setBusy(false);}
 }
 async function saveConsent(enabled:boolean){
  if(!selected||!token)return;
  setBusy(true);setError("");setNotice("");
  try{
   const payload=enabled?{employerSharingConsent:true,scope:"named_employer",organizationId,fields:shareFields}:{employerSharingConsent:false};
   if(enabled&&(!organizationId||!organizations.some(org=>org.id===organizationId)))throw new Error("Choose a verified organization from the current search results.");
   await api("/api/v1/me/job-interests/"+encodeURIComponent(selected.reference)+"/sharing-consent",{method:"POST",body:JSON.stringify(payload)},token);
   setNotice(enabled?"Your selected-field consent is recorded. MPA Support Desk review is still required before employer sharing.":"Your employer-sharing consent was revoked.");
   await openInterest(selected.reference);
  }catch(e){setError(e instanceof ApiError?e.message:e instanceof Error?e.message:"Consent could not be updated.");}
  finally{setBusy(false);}
 }
 if(!hydrated||loading)return <div style={{maxWidth:900,margin:"0 auto"}}><Card><p className="muted">Checking sign-in and membership eligibility…</p></Card></div>;
 if(!token)return <div style={{maxWidth:900,margin:"0 auto"}}><Card><h1 className="h1">Sign in to access job interest</h1><p className="muted">Job-interest requests are available only to signed-in members with a current active MPA membership. Your private requests are not shown on this page until you sign in.</p><a className="btn btn-primary" href="/login?returnTo=%2Fjobs%2Finterest">Sign in</a><p className="muted">Need to apply or check your membership? <a href="/membership">Open membership status and applications</a>.</p></Card></div>;
 if(member!==true)return <div style={{maxWidth:900,margin:"0 auto"}}><Card><h1 className="h1">Current membership required</h1><p className="muted">A current active MPA membership is required to submit or track job-interest requests. An account role by itself does not establish active membership. Your job-interest information remains private and is not displayed here.</p><a className="btn btn-primary" href="/membership">Check membership status or application</a></Card></div>;
 return <div style={{maxWidth:1000,margin:"0 auto",display:"grid",gap:18}}>
  <div><div className="eyebrow">Employment & opportunity hub</div><h1 className="h1">My job interests</h1><p className="muted">Submit an interest request when no suitable vacancy is listed, then follow its status here. Your details remain private to you and MPA Support Desk unless you separately consent to selected-field sharing with one named verified organization.</p></div>
  {error?<FormFeedback kind="error" message={error} onRetry={()=>void load()}/>:null}
  {notice?<p role="status" className="muted">{notice}</p>:null}
  <Card><h2 className="h2">Your requests</h2>{items.length?items.map(item=><div key={item.reference} className="case-row"><div className="row" style={{justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><b>{item.reference}</b><p className="muted">{humanStatus(item.status)} · Updated {item.updated_at?new Date(item.updated_at).toLocaleDateString():"—"}</p></div><button className="btn btn-ghost" type="button" disabled={busy} onClick={()=>void openInterest(item.reference)}>View details</button></div><p className="muted">{item.next_action}</p></div>):<p className="muted">You have not submitted a job-interest request yet.</p>}</Card>
  {selected?<Card><div className="row" style={{justifyContent:"space-between",flexWrap:"wrap"}}><div><Badge>{humanStatus(selected.status)}</Badge><h2 className="h2" style={{marginTop:10}}>Request {selected.reference}</h2></div><button className="btn btn-ghost" type="button" onClick={()=>setSelected(null)}>Close details</button></div><p>{selected.nextStep}</p><p className="muted">Your reference is for support and status lookup only. It does not grant access to this request.</p><h3 className="h2">Employer-sharing consent</h3><p className="muted">Off by default. Consent is limited to selected fields and one named verified organization. MPA Support Desk must review before any employer receives information.</p>{!selected.employerSharingConsent||selected.employerSharingRevokedAt?<><label><input type="checkbox" checked={shareOptIn} onChange={e=>setShareOptIn(e.target.checked)}/> I explicitly consent to sharing selected information with one named verified organization after Support Desk review.</label>{shareOptIn?<><label>Organization name<input value={organizationSearch} maxLength={120} onChange={e=>setOrganizationSearch(e.target.value)} placeholder="Enter at least 3 characters"/></label><button className="btn btn-ghost" type="button" disabled={busy} onClick={()=>void searchOrganizations()}>Search verified organizations</button><label>Organization<select value={organizationId} onChange={e=>setOrganizationId(e.target.value)}><option value="">Choose an organization</option>{organizations.map(org=><option key={org.id} value={org.id}>{org.display_name||org.legal_name||"Verified organization"}</option>)}</select></label>{shareable.map(([field,label])=><label key={field}><input type="checkbox" checked={shareFields.includes(field)} onChange={e=>setShareFields(current=>e.target.checked?[...new Set([...current,field])]:current.filter(value=>value!==field))}/> {label}</label>)}<button className="btn btn-primary" type="button" disabled={busy||!organizationId||!shareFields.length} onClick={()=>void saveConsent(true)}>Save explicit consent</button></>:null}</>:<button className="btn btn-ghost" type="button" disabled={busy} onClick={()=>void saveConsent(false)}>Revoke employer-sharing consent</button>}<h3 className="h2" style={{marginTop:16}}>Sharing history</h3>{history.length?history.map(row=><div key={row.shareId} className="case-row"><b>{row.organizationName}</b><p className="muted">{row.sharedFields.map(fieldLabel).join(", ")} · {new Date(row.sharedAt).toLocaleString()}</p><Badge>{row.status}</Badge></div>):<p className="muted">No employer-sharing activity is recorded for this request.</p>}</Card>:null}
  <Card><h2 className="h2">Submit a job-interest request</h2><form onSubmit={submit} style={{display:"grid",gap:12}}><div className="grid grid-2"><label>Your name<input required maxLength={200} value={form.contactName} onChange={e=>setForm(v=>({...v,contactName:e.target.value}))}/></label><label>Email (optional if phone provided)<input type="email" maxLength={320} value={form.contactEmail} onChange={e=>setForm(v=>({...v,contactEmail:e.target.value}))}/></label><label>Phone (optional if email provided)<input maxLength={80} value={form.contactPhone} onChange={e=>setForm(v=>({...v,contactPhone:e.target.value}))}/></label><label>Target role / occupation<input required maxLength={500} value={form.targetRole} onChange={e=>setForm(v=>({...v,targetRole:e.target.value}))}/></label><label>Experience range<select value={form.experience} onChange={e=>setForm(v=>({...v,experience:e.target.value}))}><option value="">Not specified</option><option value="less_than_1_year">Less than 1 year</option><option value="1_to_3_years">1–3 years</option><option value="4_to_7_years">4–7 years</option><option value="8_to_10_years">8–10 years</option><option value="more_than_10_years">More than 10 years</option></select></label><label>Preferred location<input maxLength={300} value={form.location} onChange={e=>setForm(v=>({...v,location:e.target.value}))}/></label><label>Work mode<select value={form.workMode} onChange={e=>setForm(v=>({...v,workMode:e.target.value}))}><option value="">No preference</option><option value="onsite">On-site</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option></select></label><label>Availability<select value={form.availability} onChange={e=>setForm(v=>({...v,availability:e.target.value}))}><option value="">Not specified</option><option value="immediately">Immediately</option><option value="within_2_weeks">Within two weeks</option><option value="within_1_month">Within one month</option><option value="within_3_months">Within three months</option><option value="flexible">Flexible / to discuss</option></select></label></div><TagInput label="Skills" value={skills} onChange={setSkills} placeholder="Add one skill at a time"/><label>Anything else MPA should know<textarea maxLength={2000} rows={3} value={form.intent} onChange={e=>setForm(v=>({...v,intent:e.target.value}))}/></label><label><input type="checkbox" required checked={consent} onChange={e=>setConsent(e.target.checked)}/> I agree that MPA may receive and review this job-interest request. This does not authorize employer sharing.</label><p className="muted">Employer-sharing consent is managed separately after submission and is off by default.</p><button className="btn btn-primary" type="submit" disabled={busy||!consent}>{busy?"Submitting…":"Submit job-interest request"}</button></form></Card>
 </div>;
}
