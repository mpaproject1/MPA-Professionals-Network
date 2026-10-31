"use client";

import {HandHeart, Plus, Save, Trash2} from "lucide-react";
import {type FormEvent, useCallback, useEffect, useState} from "react";
import {api, ApiError} from "../lib/api";
import {Badge, Card} from "./ui";

type Pledge = {
 id:string; service_title:string; service_category:string; description:string; beneficiary_scopes:string[];
 availability_details:string; hours_per_week:number|string; duration_weeks:number; available_from?:string|null;
 delivery_mode:string; location_text?:string|null; status:string;
};
type Draft = Omit<Pledge,"id">;
const blank:Draft={service_title:"",service_category:"",description:"",beneficiary_scopes:["community"],availability_details:"",hours_per_week:2,duration_weeks:4,available_from:"",delivery_mode:"flexible",location_text:"",status:"active"};
const audiences=[["community","Wider community"],["mpa","MPA initiatives"],["members","Other MPA members"]];
export function VolunteerPledgePanel({token,active}:{token:string;active:boolean}){
 const [items,setItems]=useState<Pledge[]>([]),[draft,setDraft]=useState<Draft>(blank),[loading,setLoading]=useState(false),[busy,setBusy]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const load=useCallback(async()=>{if(!token||!active){setItems([]);return;}setLoading(true);setError("");try{const rows=await api<Pledge[]>("/api/v1/me/volunteer-pledges",{},token);setItems(Array.isArray(rows)?rows:[]);}catch(cause){setError(cause instanceof ApiError?cause.message:"Volunteer pledges could not be loaded.");}finally{setLoading(false);}},[token,active]);
 useEffect(()=>{void load();},[load]);
 function changeItem(id:string,key:keyof Draft,value:unknown){setItems(current=>current.map(item=>item.id===id?{...item,[key]:value}:item));}
 function toggleScope(value:string,selected:string[]){return selected.includes(value)?selected.filter(item=>item!==value):[...selected,value];}
 async function saveNew(event:FormEvent){event.preventDefault();if(!token||busy)return;setBusy("new");setError("");setNotice("");try{const saved=await api<Pledge>("/api/v1/me/volunteer-pledges",{method:"POST",body:JSON.stringify({serviceTitle:draft.service_title,serviceCategory:draft.service_category,description:draft.description,beneficiaryScopes:draft.beneficiary_scopes,availabilityDetails:draft.availability_details,hoursPerWeek:Number(draft.hours_per_week),durationWeeks:Number(draft.duration_weeks),availableFrom:draft.available_from||null,deliveryMode:draft.delivery_mode,locationText:draft.location_text,status:draft.status})},token);setItems(current=>[...current,saved]);setDraft(blank);setNotice("Your volunteer service pledge was saved.");}catch(cause){setError(cause instanceof ApiError?cause.message:"The pledge could not be saved. Check the required details and try again.");}finally{setBusy("");}}
 async function saveExisting(item:Pledge){if(!token||busy)return;setBusy(item.id);setError("");setNotice("");try{const saved=await api<Pledge>(`/api/v1/me/volunteer-pledges/${encodeURIComponent(item.id)}`,{method:"PATCH",body:JSON.stringify({serviceTitle:item.service_title,serviceCategory:item.service_category,description:item.description,beneficiaryScopes:item.beneficiary_scopes,availabilityDetails:item.availability_details,hoursPerWeek:Number(item.hours_per_week),durationWeeks:Number(item.duration_weeks),availableFrom:item.available_from||null,deliveryMode:item.delivery_mode,locationText:item.location_text,status:item.status})},token);setItems(current=>current.map(row=>row.id===item.id?saved:row));setNotice("Your volunteer service pledge was updated.");}catch(cause){setError(cause instanceof ApiError?cause.message:"The pledge could not be updated.");}finally{setBusy("");}}
 async function withdraw(item:Pledge){if(!token||busy||!window.confirm("Withdraw this volunteer service pledge? It will no longer appear as an active offer."))return;setBusy(item.id);setError("");setNotice("");try{await api(`/api/v1/me/volunteer-pledges/${encodeURIComponent(item.id)}`,{method:"DELETE"},token);setItems(current=>current.filter(row=>row.id!==item.id));setNotice("The pledge was withdrawn.");}catch(cause){setError(cause instanceof ApiError?cause.message:"The pledge could not be withdrawn.");}finally{setBusy("");}}
 if(!active)return <section aria-labelledby="volunteer-pledge-title" className="mb-7"><Card><div className="flex items-start gap-3"><HandHeart size={22}/><div><h2 id="volunteer-pledge-title" className="h2">Volunteer and professional service pledge</h2><p className="muted mt-1">When your MPA membership is active, you can list one or more services you are willing to contribute to the community, MPA initiatives or fellow members.</p></div></div></Card></section>;
 return <section aria-labelledby="volunteer-pledge-title" className="mb-7">
  <div className="mb-3 flex items-end justify-between gap-3"><div><div className="eyebrow">Your contribution</div><h2 id="volunteer-pledge-title" className="h2">Volunteer and professional service pledge</h2><p className="muted mt-1 max-w-3xl text-sm">Offer one or more services. Set who can benefit, the hours you can contribute each week and how long you are available. You can edit, pause or withdraw each pledge.</p></div><Badge tone="slate">{items.length} service{items.length===1?"":"s"}</Badge></div>
  {error?<p className="form-error mb-3" role="alert">{error}</p>:null}{notice?<p className="muted mb-3" role="status">{notice}</p>:null}
  {loading?<Card><p className="muted">Loading your saved service pledges…</p></Card>:null}
  {items.map(item=><Card key={item.id}><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><strong>{item.service_title}</strong><p className="muted text-sm">{item.service_category} · {item.hours_per_week} hours/week · {item.duration_weeks} weeks</p></div><Badge tone={item.status==="active"?"green":"slate"}>{item.status.replaceAll("_"," ")}</Badge></div>
   <div className="form-grid">
    <label>Service title<input value={item.service_title} maxLength={120} onChange={e=>changeItem(item.id,"service_title",e.target.value)}/></label>
    <label>Professional service category<input value={item.service_category} maxLength={80} placeholder="e.g. Legal advice, design, mentoring" onChange={e=>changeItem(item.id,"service_category",e.target.value)}/></label>
    <label className="sm:col-span-2">What can you offer?<textarea rows={3} maxLength={2000} value={item.description} onChange={e=>changeItem(item.id,"description",e.target.value)}/></label>
    <fieldset className="sm:col-span-2"><legend className="font-medium">Who can benefit?</legend><div className="mt-2 flex flex-wrap gap-4">{audiences.map(([value,label])=><label key={value} className="flex items-center gap-2"><input type="checkbox" checked={item.beneficiary_scopes.includes(value)} onChange={()=>changeItem(item.id,"beneficiary_scopes",toggleScope(value,item.beneficiary_scopes))}/>{label}</label>)}</div></fieldset>
    <label>Availability / preferred time<input value={item.availability_details} maxLength={500} placeholder="e.g. Weekday evenings, Saturday mornings" onChange={e=>changeItem(item.id,"availability_details",e.target.value)}/></label>
    <label>Hours per week<input type="number" min="0.5" max="60" step="0.5" value={item.hours_per_week} onChange={e=>changeItem(item.id,"hours_per_week",e.target.value)}/></label>
    <label>Active duration (weeks)<input type="number" min="1" max="104" step="1" value={item.duration_weeks} onChange={e=>changeItem(item.id,"duration_weeks",Number(e.target.value))}/></label>
    <label>Available from<input type="date" value={item.available_from||""} onChange={e=>changeItem(item.id,"available_from",e.target.value)}/></label>
    <label>Delivery mode<select value={item.delivery_mode} onChange={e=>changeItem(item.id,"delivery_mode",e.target.value)}><option value="flexible">Flexible</option><option value="remote">Remote</option><option value="in_person">In person</option><option value="hybrid">Hybrid</option></select></label>
    <label>Location (optional)<input value={item.location_text||""} maxLength={240} onChange={e=>changeItem(item.id,"location_text",e.target.value)}/></label>
    <label>Status<select value={item.status} onChange={e=>changeItem(item.id,"status",e.target.value)}><option value="active">Available</option><option value="paused">Paused</option><option value="completed">Completed</option></select></label>
   </div><div className="mt-4 flex flex-wrap gap-2"><button type="button" className="btn btn-primary" disabled={busy===item.id} onClick={()=>void saveExisting(item)}><Save size={15}/>{busy===item.id?"Saving…":"Save changes"}</button><button type="button" className="btn btn-ghost" disabled={Boolean(busy)} onClick={()=>void withdraw(item)}><Trash2 size={15}/>Withdraw pledge</button></div>
  </Card>)}
  <Card><h3 className="h3 mb-3">Add another service pledge</h3><form className="form-grid" onSubmit={saveNew}>
   <label>Service title<input required minLength={4} maxLength={120} value={draft.service_title} onChange={e=>setDraft({...draft,service_title:e.target.value})}/></label>
   <label>Professional service category<input required minLength={2} maxLength={80} placeholder="e.g. Accounting, engineering, translation" value={draft.service_category} onChange={e=>setDraft({...draft,service_category:e.target.value})}/></label>
   <label className="sm:col-span-2">What can you offer?<textarea required minLength={20} maxLength={2000} rows={3} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})} placeholder="Describe the professional service, skills and intended contribution."/></label>
   <fieldset className="sm:col-span-2"><legend className="font-medium">Who can benefit?</legend><div className="mt-2 flex flex-wrap gap-4">{audiences.map(([value,label])=><label key={value} className="flex items-center gap-2"><input type="checkbox" checked={draft.beneficiary_scopes.includes(value)} onChange={()=>setDraft({...draft,beneficiary_scopes:toggleScope(value,draft.beneficiary_scopes)})}/>{label}</label>)}</div></fieldset>
   <label>Availability / preferred time<input required maxLength={500} value={draft.availability_details} onChange={e=>setDraft({...draft,availability_details:e.target.value})} placeholder="e.g. Weekday evenings, 3 hours each Saturday"/></label>
   <label>Hours per week<input required type="number" min="0.5" max="60" step="0.5" value={draft.hours_per_week} onChange={e=>setDraft({...draft,hours_per_week:Number(e.target.value)})}/></label>
   <label>Active duration (weeks)<input required type="number" min="1" max="104" value={draft.duration_weeks} onChange={e=>setDraft({...draft,duration_weeks:Number(e.target.value)})}/></label>
   <label>Available from<input type="date" value={draft.available_from||""} onChange={e=>setDraft({...draft,available_from:e.target.value})}/></label>
   <label>Delivery mode<select value={draft.delivery_mode} onChange={e=>setDraft({...draft,delivery_mode:e.target.value})}><option value="flexible">Flexible</option><option value="remote">Remote</option><option value="in_person">In person</option><option value="hybrid">Hybrid</option></select></label>
   <label>Location (optional)<input maxLength={240} value={draft.location_text||""} onChange={e=>setDraft({...draft,location_text:e.target.value})}/></label>
   <div className="sm:col-span-2"><button type="submit" className="btn btn-primary" disabled={Boolean(busy)}><Plus size={16}/>{busy==="new"?"Saving…":"Add service pledge"}</button></div>
  </form></Card>
  <p className="muted mt-2 text-xs">Your pledge is a voluntary offer, not an assignment or promise that a service request has been accepted. MPA may contact you through the existing authorized workflows. Reporting uses aggregated categories, audience and capacity, not public personal details.</p>
 </section>;
}
