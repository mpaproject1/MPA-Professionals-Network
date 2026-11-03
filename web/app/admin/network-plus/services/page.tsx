"use client";
import { useCallback,useEffect,useState } from "react";
import { AdminPageHeader } from "../../admin-page-header";
import { ApiError,api } from "../../../../lib/api";
import { useUiStore } from "../../../../lib/store";

type Listing={id:string;business_id:string;business_name:string;title:string;summary:string;description:string;category_code:string;subcategory_code?:string|null;listing_kind:string;structured_attributes:Record<string,any>;audience:string;delivery_mode:string;location_label?:string|null;capacity?:number|null;pricing_model:string;price_amount?:number|null;currency?:string|null;pricing_details?:Record<string,any>;remote_available:boolean;service_radius_km?:number|null;availability_status:string;lead_time_days?:number|null;active_work_limit?:number|null;timezone?:string|null;next_available_at?:string|null;geography_areas?:{id:string;label:string;level:string}[];target_audience?:string[];status:string;created_at:string};
type Queue={items:Listing[];limit:number;offset:number};
const label=(value:string)=>String(value||"").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
export default function NetworkPlusListingModerationPage(){
 const token=useUiStore(s=>s.token),hydrateToken=useUiStore(s=>s.hydrateToken),hydrated=useUiStore(s=>s.hydrated);
 const [items,setItems]=useState<Listing[]>([]),[decisions,setDecisions]=useState<Record<string,string>>({}),[reasons,setReasons]=useState<Record<string,string>>({});
 const [loading,setLoading]=useState(false),[busy,setBusy]=useState<Record<string,boolean>>({}),[error,setError]=useState(""),[notice,setNotice]=useState("");
 useEffect(()=>{hydrateToken();},[hydrateToken]);
 const load=useCallback(async()=>{if(!token)return;setLoading(true);setError("");try{const result=await api<Queue>("/api/v1/admin/network-plus/services/moderation-queue?limit=50",{},token);setItems(result.items||[]);}catch(e){setError(e instanceof ApiError?e.message:"The Network-Plus listing review queue could not be loaded.");}finally{setLoading(false);}},[token]);
 useEffect(()=>{if(hydrated&&token)void load();},[hydrated,token,load]);
 const review=async(row:Listing)=>{
  const status=decisions[row.id]||"published",reason=(reasons[row.id]||"").trim();
  if(reason.length<8){setError("Add at least eight characters explaining the moderation decision.");return;}
  setBusy(v=>({...v,[row.id]:true}));setError("");setNotice("");
  try{await api("/api/v1/admin/network-plus/services/"+encodeURIComponent(row.id)+"/moderation",{method:"POST",body:JSON.stringify({status,reason})},token);setNotice("Listing moderation decision recorded.");await load();}
  catch(e){setError(e instanceof ApiError?e.message:"The moderation decision could not be saved.");}
  finally{setBusy(v=>({...v,[row.id]:false}));}
 };
 return <main className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-6 sm:px-6">
  <AdminPageHeader eyebrow="Network-Plus · Independent review" title="Needs & Offers moderation" description="Review structured needs, offers and discovery-only product/service profiles. Publication remains separate from business verification and owner control."/>
  {error&&<div className="form-error" role="alert">{error}</div>}{notice&&<div className="form-success" role="status">{notice}</div>}
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="h2">Pending listings</h2><p className="muted text-sm">{items.length} awaiting independent review</p></div><button className="btn btn-ghost" disabled={loading} onClick={()=>void load()}>Refresh queue</button></div>
  {loading?<div className="card muted">Loading moderation queue…</div>:items.length?items.map(row=><article className="card grid gap-3" key={row.id}>
   <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="eyebrow">{label(row.listing_kind)} · {label(row.category_code)}{row.subcategory_code?" / "+label(row.subcategory_code):""}</p><h3 className="h2">{row.title}</h3><p className="muted text-sm">{row.business_name} · {label(row.audience)} · {label(row.delivery_mode)} · {row.remote_available?"Remote available":"On-site area only"} · {row.location_label||"Location not specified"}</p><p className="muted text-xs">{(row.geography_areas||[]).map(area=>area.label).join(" · ")||"No structured service area"} · {label(row.availability_status)} · {row.lead_time_days===null||row.lead_time_days===undefined?"Lead time not stated":String(row.lead_time_days)+" days lead time"}{row.service_radius_km?" · "+row.service_radius_km+" km radius":""}</p></div><span className="rounded-full border px-3 py-1 text-xs">{label(row.status)}</span></div>
   <p className="font-medium">{row.summary}</p><p className="whitespace-pre-wrap text-sm muted">{row.description}</p>
   <dl className="grid gap-2 sm:grid-cols-3 text-sm"><div><dt className="muted">Capacity</dt><dd>{row.capacity||"Not specified"}</dd></div><div><dt className="muted">Pricing information</dt><dd>{row.pricing_model==="quote"?"Discuss directly":row.pricing_model==="free"?"Free":row.pricing_model==="not_applicable"?"Not applicable":row.pricing_model==="range"?String(row.pricing_details?.minimumAmount??"")+"–"+String(row.pricing_details?.maximumAmount??"")+" "+String(row.currency||""):String(row.currency||"")+" "+String(row.price_amount||"")+(row.pricing_model==="unit"?" / "+String(row.pricing_details?.unitLabel||"unit"):row.pricing_model==="subscription"?" / "+String(row.pricing_details?.billingPeriod||"period"):"")}</dd></div><div><dt className="muted">Submitted</dt><dd>{new Date(row.created_at).toLocaleString()}</dd></div></dl>
   <details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm font-semibold">Structured category details</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(row.structured_attributes||{},null,2)}</pre></details>
   {row.listing_kind.includes("profile")&&<p className="rounded-lg bg-slate-50 p-3 text-sm">Discovery-only catalog profile. Approval does not create a product checkout, order or delivery workflow.</p>}
   <div className="grid gap-2 border-t pt-3 sm:grid-cols-[220px_1fr_auto]"><label className="grid gap-1 text-sm">Decision<select className="input" value={decisions[row.id]||"published"} onChange={e=>setDecisions(v=>({...v,[row.id]:e.target.value}))}><option value="published">Approve and publish</option><option value="changes_requested">Request changes</option><option value="rejected">Reject</option><option value="suspended">Suspend</option></select></label><label className="grid gap-1 text-sm">Reason / reviewer note<textarea className="input min-h-16" value={reasons[row.id]||""} onChange={e=>setReasons(v=>({...v,[row.id]:e.target.value}))} placeholder="Explain the decision and any required correction."/></label><button className="btn btn-primary self-end" disabled={Boolean(busy[row.id])} onClick={()=>void review(row)}>{busy[row.id]?"Saving…":"Record decision"}</button></div>
  </article>):<div className="card text-center"><h3 className="h2">No listings awaiting review</h3><p className="muted">New listings appear here only after their business is verified, approved and published.</p></div>}
 </main>;
}
