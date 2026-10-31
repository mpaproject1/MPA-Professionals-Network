"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { NetworkPlusAccessGuard } from "../../../components/network-plus-access-guard";
import { ApiError, api } from "../../../lib/api";
import { useUiStore } from "../../../lib/store";

type Intent = "service_request"|"supplier_inquiry"|"referral"|"expertise_request"|"partnership_proposal"|"collaboration_request";
type Participant = {user_id:string;participant_role:string;consent_status:string};
type MemberChoice = {user_id:string;display_name:string;professional_title?:string};
type OrgChoice = {id:string;display_name:string};
type BusinessChoice = {id:string;display_name:string;business_kind:string};
type ServiceChoice = {id:string;business_id:string;business_name:string;title:string};
type Workspace = {id:string;purpose:string;scope:string;status:string};
type RequestRow = {isRequester?:boolean;isRecipientRepresentative?:boolean;id:string;intent:Intent;status:string;subject:string;summary:string;requester_user_id:string;recipient_user_id?:string|null;recipient_organization_id?:string|null;participants?:Participant[];terms?:Record<string,any>;workspace?:Workspace|null;events?:any[]};
const intents: {value:Intent;label:string;description:string}[] = [
 {value:"service_request",label:"Service request",description:"Ask a business to deliver a defined professional service."},
 {value:"supplier_inquiry",label:"Supplier inquiry",description:"Ask about supplying goods, materials or professional capacity."},
 {value:"referral",label:"Referral",description:"Request or offer a professional introduction or referral."},
 {value:"expertise_request",label:"Expertise request",description:"Seek specialist advice, review or expertise."},
 {value:"partnership_proposal",label:"Partnership proposal",description:"Propose a structured partnership with shared contributions and outputs."},
 {value:"collaboration_request",label:"Collaboration request",description:"Propose a scoped collaboration with named responsibilities."}
];
function key(){return crypto.randomUUID()+crypto.randomUUID();}
function lines(value:string){return value.split("\n").map(v=>v.trim()).filter(Boolean);}
function label(value:string){return value.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());}

export default function NetworkPlusRequestsPage(){
 const token=useUiStore(s=>s.token);
 const [items,setItems]=useState<RequestRow[]>([]);
 const [selectedId,setSelectedId]=useState("");
 const [selected,setSelected]=useState<RequestRow|null>(null);\n const [workspaceData,setWorkspaceData]=useState<any>(null);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const [intent,setIntent]=useState<Intent>("service_request");
 const [recipientUserId,setRecipientUserId]=useState(""),[recipientOrganizationId,setRecipientOrganizationId]=useState("");
 const [memberQuery,setMemberQuery]=useState(""),[memberChoices,setMemberChoices]=useState<MemberChoice[]>([]);
 const [organizationQuery,setOrganizationQuery]=useState(""),[organizationChoices,setOrganizationChoices]=useState<OrgChoice[]>([]);
 const [businessChoices,setBusinessChoices]=useState<BusinessChoice[]>([]),[serviceChoices,setServiceChoices]=useState<ServiceChoice[]>([]);
 const [businessId,setBusinessId]=useState(""),[serviceListingId,setServiceListingId]=useState("");
 const [subject,setSubject]=useState(""),[summary,setSummary]=useState("");
 const [scope,setScope]=useState(""),[deliverables,setDeliverables]=useState("");
 const [pricing,setPricing]=useState("Quotation requested"),[schedule,setSchedule]=useState("");
 const [purpose,setPurpose]=useState(""),[contributions,setContributions]=useState(""),[responsibilities,setResponsibilities]=useState(""),[outputs,setOutputs]=useState(""),[timeline,setTimeline]=useState(""),[representatives,setRepresentatives]=useState("");
 const [updateTitle,setUpdateTitle]=useState(""),[updateBody,setUpdateBody]=useState(""),[updateType,setUpdateType]=useState("update");
 const [milestoneTitle,setMilestoneTitle]=useState(""),[milestoneDue,setMilestoneDue]=useState("");\n const [completionEvidence,setCompletionEvidence]=useState("");

 const load=useCallback(async()=>{
  if(!token){setLoading(false);return;}
  setLoading(true);setError("");
  try{const data=await api<RequestRow[]>("/api/v1/network-plus/requests",{},token);setItems(data||[]);}
  catch(e){setError(e instanceof ApiError?e.message:"Requests could not be loaded.");}
  finally{setLoading(false);}
 },[token]);
 const loadDetail=useCallback(async(id:string)=>{
  if(!token||!id)return;
  try{const data=await api<RequestRow>("/api/v1/network-plus/requests/"+encodeURIComponent(id),{},token);setSelected(data);}
  catch(e){setError(e instanceof ApiError?e.message:"This request could not be opened.");}
 },[token]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{if(!token)return;Promise.all([api<{items:BusinessChoice[]}>("/api/v1/network-plus/businesses?limit=50",{},token),api<{items:ServiceChoice[]}>("/api/v1/network-plus/services?limit=50",{},token)]).then(([businesses,services])=>{setBusinessChoices(businesses.items||[]);setServiceChoices(services.items||[]);}).catch(()=>{});},[token]);
 useEffect(()=>{if(selectedId)void loadDetail(selectedId);else {setSelected(null);setWorkspaceData(null);}},[selectedId,loadDetail]);\n useEffect(()=>{if(selected?.workspace&&token)void api<any>("/api/v1/network-plus/requests/"+encodeURIComponent(selected.id)+"/workspace",{},token).then(setWorkspaceData).catch(()=>setWorkspaceData(null));else setWorkspaceData(null);},[selected?.id,selected?.workspace?.id,token]);
 const currentIntent=useMemo(()=>intents.find(v=>v.value===intent),[intent]);

 async function searchMembers(){
  if(!token||memberQuery.trim().length<2){setError("Enter at least two characters to search verified members.");return;}
  try{const result=await api<{items:MemberChoice[]}>("/api/v1/talent?q="+encodeURIComponent(memberQuery.trim())+"&limit=20",{},token);setMemberChoices(result.items||[]);}
  catch(e){setError(e instanceof ApiError?e.message:"Member search is unavailable.");}
 }
 async function searchOrganizations(){
  if(!token||organizationQuery.trim().length<2){setError("Enter at least two characters to search organizations.");return;}
  try{const result=await api<{items:OrgChoice[]}>("/api/v1/network-plus/organizations?q="+encodeURIComponent(organizationQuery.trim())+"&limit=20",{},token);setOrganizationChoices(result.items||[]);}
  catch(e){setError(e instanceof ApiError?e.message:"Organization search is unavailable.");}
 }
 async function createDraft(e:FormEvent){
  e.preventDefault();if(!token||saving)return;
  setSaving(true);setError("");setNotice("");
  try{
   let terms:Record<string,any>={};
   if(intent==="service_request")terms={scope,deliverables:lines(deliverables),pricing:{proposal:pricing},schedule:{requested:schedule||"To be agreed"}};
   if(intent==="partnership_proposal"||intent==="collaboration_request")terms={purpose,scope,contributions:lines(contributions),responsibilities:lines(responsibilities),outputs:lines(outputs),timeline:{proposed:timeline},authorizedRepresentatives:lines(representatives)};
   const created=await api<RequestRow>("/api/v1/network-plus/requests",{method:"POST",headers:{"X-Idempotency-Key":key()},body:JSON.stringify({intent,recipientUserId:recipientUserId||undefined,recipientOrganizationId:recipientOrganizationId||undefined,businessId:businessId||undefined,serviceListingId:serviceListingId||undefined,subject,summary,details:{},terms})},token);
   setNotice("Draft saved. It is not yet submitted and creates no agreement or workspace.");
   setSelectedId(created.id);await load();
  }catch(e){setError(e instanceof ApiError?e.message:"The draft could not be saved. You can retry safely.");}
  finally{setSaving(false);}
 }
 async function action(path:string,body?:any){
  if(!token||!selected||saving)return;
  setSaving(true);setError("");setNotice("");
  try{await api("/api/v1/network-plus/requests/"+encodeURIComponent(selected.id)+path,{method:"POST",headers:{"X-Idempotency-Key":key()},body:body?JSON.stringify(body):undefined},token);setNotice("Request updated. The status and audit history have been refreshed.");const refreshed=await api<RequestRow>("/api/v1/network-plus/requests/"+encodeURIComponent(selected.id),{},token);setSelected(refreshed);if(refreshed.workspace){const ws=await api<any>("/api/v1/network-plus/requests/"+encodeURIComponent(selected.id)+"/workspace",{},token);setWorkspaceData(ws);}await load();}
  catch(e){setError(e instanceof ApiError?e.message:"The action could not be confirmed. Refresh before retrying.");}
  finally{setSaving(false);}
 }
 async function workspaceEvent(){
  if(!selected||!updateTitle.trim()||!updateBody.trim())return;
  setSaving(true);setError("");
  try{await api("/api/v1/network-plus/requests/"+selected.id+"/workspace/events",{method:"POST",headers:{"X-Idempotency-Key":key()},body:JSON.stringify({eventType:updateType,title:updateTitle,body:updateBody})},token);setUpdateTitle("");setUpdateBody("");const ws=await api<any>("/api/v1/network-plus/requests/"+selected.id+"/workspace",{},token);setWorkspaceData(ws);}
  catch(e){setError(e instanceof ApiError?e.message:"The update could not be saved.");}
  finally{setSaving(false);}
 }
 async function addMilestone(){
  if(!selected||!milestoneTitle.trim())return;
  setSaving(true);setError("");
  try{await api("/api/v1/network-plus/requests/"+selected.id+"/workspace/milestones",{method:"POST",headers:{"X-Idempotency-Key":key()},body:JSON.stringify({title:milestoneTitle,dueAt:milestoneDue||undefined})},token);setMilestoneTitle("");setMilestoneDue("");const ws=await api<any>("/api/v1/network-plus/requests/"+selected.id+"/workspace",{},token);setWorkspaceData(ws);}
  catch(e){setError(e instanceof ApiError?e.message:"The milestone could not be saved.");}
  finally{setSaving(false);}
 }
 const myParticipant=selected?.participants?.find(p=>p.consent_status!=="revoked"&&p.participant_role!=="additional_participant");
 const canAccept=selected?.isRecipientRepresentative&&(selected?.status==="submitted"||selected?.status==="under_review"||selected?.status==="clarification_requested");
 const recipientPending=selected?.participants?.some(p=>p.participant_role==="recipient_representative"&&p.consent_status==="pending");

 return <NetworkPlusAccessGuard><main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 sm:px-6">
  <header className="grid gap-2"><div className="eyebrow">Network-Plus · Requests and collaboration</div><h1 className="h1">Requests that become collaboration only by agreement.</h1><p className="muted max-w-3xl">Create a typed request, submit it to the intended recipient, and wait for explicit acceptance. Submission is not a contract, commitment or active engagement. Private request records are visible only to participants and authorized support staff.</p></header>
  {error&&<div role="alert" className="rounded-xl border border-red-500/40 p-3 text-sm">{error}</div>}
  {notice&&<div role="status" className="rounded-xl border border-[var(--border)] p-3 text-sm">{notice}</div>}
  <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
   <section className="card grid content-start gap-4">
    <div><h2 className="h2">Start a request</h2><p className="muted text-sm">The recipient must be an eligible member or a verified organization with active authorized representatives.</p></div>
    <form className="grid gap-3" onSubmit={createDraft}>
     <label className="grid gap-1 text-sm font-medium">Request type<select className="input" value={intent} onChange={e=>setIntent(e.target.value as Intent)}>{intents.map(v=><option key={v.value} value={v.value}>{v.label}</option>)}</select><span className="muted text-xs">{currentIntent?.description}</span></label>
     <fieldset className="grid gap-2 rounded-xl border p-3"><legend className="px-1 font-semibold">Choose a recipient</legend>
      <p className="muted text-xs">For a business or service request, select a published business or listing. The server resolves its authorized owner/representatives from canonical ownership records; private owner IDs are not exposed.</p>
      <label className="grid gap-1 text-sm">Published business<select className="input" value={businessId} onChange={e=>{setBusinessId(e.target.value);setServiceListingId("");setRecipientUserId("");setRecipientOrganizationId("");}}><option value="">Select a business (optional)</option>{businessChoices.map(item=><option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Published professional service<select className="input" value={serviceListingId} onChange={e=>{const item=serviceChoices.find(v=>v.id===e.target.value);setServiceListingId(e.target.value);if(item)setBusinessId(item.business_id);setRecipientUserId("");setRecipientOrganizationId("");}}><option value="">Select a service listing (optional)</option>{serviceChoices.map(item=><option key={item.id} value={item.id}>{item.title} · {item.business_name}</option>)}</select></label>
      <div className="grid gap-2 border-t pt-2"><label className="grid gap-1 text-sm">Find a verified member recipient<input className="input" value={memberQuery} onChange={e=>setMemberQuery(e.target.value)} placeholder="Search opted-in professionals"/></label><button type="button" className="btn btn-secondary w-fit" onClick={()=>void searchMembers()}>Search members</button><select aria-label="Member recipient" className="input" value={recipientUserId} onChange={e=>{setRecipientUserId(e.target.value);setRecipientOrganizationId("");setBusinessId("");setServiceListingId("");}}><option value="">No direct member recipient selected</option>{memberChoices.map(item=><option key={item.user_id} value={item.user_id}>{item.display_name}{item.professional_title?" · "+item.professional_title:""}</option>)}</select></div>
      <div className="grid gap-2 border-t pt-2"><label className="grid gap-1 text-sm">Find a verified organization recipient<input className="input" value={organizationQuery} onChange={e=>setOrganizationQuery(e.target.value)} placeholder="Search opted-in organizations"/></label><button type="button" className="btn btn-secondary w-fit" onClick={()=>void searchOrganizations()}>Search organizations</button><select aria-label="Organization recipient" className="input" value={recipientOrganizationId} onChange={e=>{setRecipientOrganizationId(e.target.value);setRecipientUserId("");setBusinessId("");setServiceListingId("");}}><option value="">No direct organization recipient selected</option>{organizationChoices.map(item=><option key={item.id} value={item.id}>{item.display_name}</option>)}</select></div>
     </fieldset>
     <label className="grid gap-1 text-sm">Subject<input required minLength={3} maxLength={180} className="input" value={subject} onChange={e=>setSubject(e.target.value)}/></label>
     <label className="grid gap-1 text-sm">Request summary<textarea required minLength={10} maxLength={500} className="input min-h-20" value={summary} onChange={e=>setSummary(e.target.value)}/></label>
     {intent==="service_request"&&<fieldset className="grid gap-3 rounded-xl border p-3"><legend className="px-1 font-semibold">Service engagement details</legend>
      <label className="grid gap-1 text-sm">Scope<textarea required className="input min-h-20" value={scope} onChange={e=>setScope(e.target.value)}/></label>
      <label className="grid gap-1 text-sm">Deliverables (one per line)<textarea required className="input min-h-20" value={deliverables} onChange={e=>setDeliverables(e.target.value)}/></label>
      <label className="grid gap-1 text-sm">Pricing / quotation<input required className="input" value={pricing} onChange={e=>setPricing(e.target.value)}/></label>
      <label className="grid gap-1 text-sm">Schedule<textarea className="input" value={schedule} onChange={e=>setSchedule(e.target.value)} placeholder="Leave blank to agree schedule with recipient"/></label>
     </fieldset>}
     {(intent==="partnership_proposal"||intent==="collaboration_request")&&<fieldset className="grid gap-3 rounded-xl border p-3"><legend className="px-1 font-semibold">Partnership and collaboration terms</legend>
      <label className="grid gap-1 text-sm">Purpose<textarea required className="input" value={purpose} onChange={e=>setPurpose(e.target.value)}/></label>
      <label className="grid gap-1 text-sm">Scope<textarea required className="input" value={scope} onChange={e=>setScope(e.target.value)}/></label>
      <label className="grid gap-1 text-sm">Contributions (one per line)<textarea required className="input" value={contributions} onChange={e=>setContributions(e.target.value)}/></label>
      <label className="grid gap-1 text-sm">Responsibilities (one per line)<textarea required className="input" value={responsibilities} onChange={e=>setResponsibilities(e.target.value)}/></label>
      <label className="grid gap-1 text-sm">Outputs (one per line)<textarea required className="input" value={outputs} onChange={e=>setOutputs(e.target.value)}/></label>
      <label className="grid gap-1 text-sm">Timeline<input required className="input" value={timeline} onChange={e=>setTimeline(e.target.value)}/></label>
      <label className="grid gap-1 text-sm">Authorized representatives (one per line)<textarea required className="input" value={representatives} onChange={e=>setRepresentatives(e.target.value)}/></label>
     </fieldset>}
     <button className="btn btn-primary w-fit" disabled={saving}>{saving?"Saving…":"Save draft"}</button>
    </form>
   </section>
   <section className="grid content-start gap-4">
    <div className="card grid gap-3"><div className="flex items-center justify-between gap-3"><h2 className="h2">My requests</h2><button className="btn btn-ghost" onClick={()=>void load()}>Refresh</button></div>
     {loading?<p className="muted">Loading requests…</p>:items.length===0?<p className="muted">No requests yet. Your submitted requests will appear here.</p>:<ul className="grid gap-2">{items.map(item=><li key={item.id}><button className={"w-full rounded-xl border p-3 text-left "+(selectedId===item.id?"border-[var(--accent)]":"border-[var(--border)]")} onClick={()=>setSelectedId(item.id)}><span className="flex flex-wrap items-center justify-between gap-2"><strong>{item.subject}</strong><span className="rounded-full bg-[var(--surface)] px-2 py-1 text-xs">{label(item.status)}</span></span><span className="mt-1 block text-xs text-[var(--muted)]">{label(item.intent)} · {item.summary}</span></button></li>)}</ul>}
    </div>
    {selected&&<section className="card grid gap-4" aria-live="polite">
     <div><div className="eyebrow">{label(selected.intent)}</div><h2 className="h2">{selected.subject}</h2><p className="muted">{selected.summary}</p><p className="mt-2 text-sm font-semibold">Status: {label(selected.status)}</p></div>
     {selected.status==="draft"&&selected.isRequester&&<button className="btn btn-primary w-fit" disabled={saving} onClick={()=>void action("/submit")}>Submit request</button>}
     {selected.isRecipientRepresentative&&selected.status==="submitted"&&<button className="btn btn-secondary w-fit" disabled={saving} onClick={()=>void action("/transitions",{status:"under_review"})}>Mark under review</button>}{canAccept&&recipientPending&&<div className="flex flex-wrap gap-2"><button className="btn btn-primary" disabled={saving} onClick={()=>void action("/transitions",{status:"accepted"})}>Explicitly accept request</button><button className="btn btn-secondary" disabled={saving} onClick={()=>void action("/transitions",{status:"clarification_requested",reason:"Please clarify the requested scope and expected outcome."})}>Request clarification</button><button className="btn btn-secondary" disabled={saving} onClick={()=>void action("/transitions",{status:"declined",reason:"The recipient declined this request."})}>Decline</button></div>}{selected.isRequester&&selected.status==="clarification_requested"&&<button className="btn btn-primary w-fit" disabled={saving} onClick={()=>void action("/transitions",{status:"submitted"})}>Resubmit clarified request</button>}{selected.isRequester&&["draft","submitted","under_review","clarification_requested"].includes(selected.status)&&<button className="btn btn-ghost w-fit" disabled={saving} onClick={()=>void action("/transitions",{status:"withdrawn"})}>Withdraw request</button>}{["accepted","disputed"].includes(selected.status)&&<button className="btn btn-secondary w-fit" disabled={saving} onClick={()=>void action("/transitions",{status:"in_progress"})}>Mark in progress</button>}{["accepted","in_progress","disputed"].includes(selected.status)&&<div className="flex flex-wrap gap-2"><button className="btn btn-secondary" disabled={saving} onClick={()=>void action("/transitions",{status:"disputed",reason:"A participant has raised a delivery or scope dispute."})}>Raise dispute</button><button className="btn btn-ghost" disabled={saving} onClick={()=>void action("/transitions",{status:"closed"})}>Close engagement</button></div>}{selected.status==="in_progress"&&<div className="grid gap-2"><label className="grid gap-1 text-sm">Completion evidence or documented not-applicable reason<textarea className="input min-h-20" required value={completionEvidence} onChange={e=>setCompletionEvidence(e.target.value)} placeholder="Summarize delivered outputs and link/reference evidence without private contact details"/></label><button className="btn btn-primary w-fit" disabled={saving||completionEvidence.trim().length<5} onClick={()=>void action("/transitions",{status:"completed",completionEvidence:[completionEvidence.trim()]})}>Submit completion for review</button></div>}{selected.status==="completed"&&<button className="btn btn-secondary w-fit" disabled={saving} onClick={()=>void action("/transitions",{status:"disputed",reason:"A participant disputes the recorded completion."})}>Dispute completion</button>}
     {selected.status==="draft"&&<p className="muted text-sm">This is a private draft. It has not been sent to the recipient.</p>}
     {selected.status==="submitted"&&<p className="muted text-sm">Awaiting the recipient’s explicit decision. No agreement or workspace exists yet.</p>}
     {selected.workspace&&<div className="grid gap-3 border-t pt-4"><div><h3 className="h2">Collaboration workspace</h3><p className="muted text-sm">Created after recipient acceptance. {selected.workspace.purpose}</p></div>
      <form className="grid gap-2" onSubmit={e=>{e.preventDefault();void addMilestone();}}><h4 className="font-semibold">Add milestone</h4><input className="input" required value={milestoneTitle} onChange={e=>setMilestoneTitle(e.target.value)} placeholder="Milestone title"/><input className="input" type="date" value={milestoneDue} onChange={e=>setMilestoneDue(e.target.value)}/><button className="btn btn-secondary w-fit" disabled={saving}>Add milestone</button></form>
      <form className="grid gap-2" onSubmit={e=>{e.preventDefault();void workspaceEvent();}}><h4 className="font-semibold">Record collaboration update</h4><select className="input" value={updateType} onChange={e=>setUpdateType(e.target.value)}><option value="update">Progress update</option><option value="blocker">Blocker</option><option value="decision">Decision</option><option value="outcome">Outcome</option></select><input className="input" required value={updateTitle} onChange={e=>setUpdateTitle(e.target.value)} placeholder="Update title"/><textarea className="input min-h-20" required value={updateBody} onChange={e=>setUpdateBody(e.target.value)} placeholder="Describe the update"/><button className="btn btn-secondary w-fit" disabled={saving}>Save update</button></form>
      <ul className="grid gap-2">{(workspaceData?.milestones||[]).map((milestone:any)=><li key={milestone.id} className="rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{milestone.title}</strong><span className="text-xs">{label(milestone.status)}</span></div><p className="muted text-xs">{milestone.due_at?new Date(milestone.due_at).toLocaleDateString():"No due date"}</p><select className="input mt-2" aria-label={"Update "+milestone.title+" status"} value={milestone.status} onChange={async e=>{try{await api("/api/v1/network-plus/requests/"+selected.id+"/workspace/milestones/"+milestone.id,{method:"PATCH",body:JSON.stringify({status:e.target.value})},token);await loadDetail(selected.id);}catch(err){setError(err instanceof ApiError?err.message:"Milestone update failed.");}}}><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></li>)}{(workspaceData?.events||[]).map((event:any,i)=><li key={i} className="rounded-lg border p-3"><strong>{label(event.event_type||"Update")}: {event.title}</strong><p className="text-sm">{event.body}</p></li>)}</ul>
     </div>}
     <div className="border-t pt-3"><h3 className="font-semibold">Request history</h3><ol className="mt-2 grid gap-2">{(selected.events||[]).map((event:any,i)=><li key={i} className="text-sm"><span className="font-medium">{label(event.event_code)}</span> <span className="muted">{event.to_status? "→ "+label(event.to_status):""}</span></li>)}</ol></div>
    </section>}
   </section>
  </div>
 </main></NetworkPlusAccessGuard>;
}
