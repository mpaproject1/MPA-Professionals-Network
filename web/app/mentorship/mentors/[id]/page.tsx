"use client";
import {ArrowLeft,Bookmark,HeartHandshake,Languages,RefreshCw} from "lucide-react";
import Link from "next/link";
import {useParams} from "next/navigation";
import {useCallback,useEffect,useState} from "react";
import {ImpactListingBanner} from "../../../../components/impact-listing-banner";
import {PublicMediaStories} from "../../../../components/public-media-stories";
import {useUiStore} from "../../../../lib/store";
import { OperationStatus } from "../../../../components/operation-status";
import {Badge, Card} from "../../../../components/ui";
import {ApiError, api} from "../../../../lib/api";
import {useSavedDiscoveryItems} from "../../../../lib/use-saved-discovery-items";

type Mentor={id:string;user_id:string;display_name:string;approved_banner_url?:string|null;approved_banner_alt?:string|null;video_url?:string|null;headline?:string|null;bio?:string|null;expertise?:string[]|string;languages?:string[]|string;mentoring_modes?:string[]|string;max_active_mentees?:number;availability?:{day_of_week:number;start_time:string;end_time:string;timezone:string}[]|string};
function values(v:unknown):string[]{if(Array.isArray(v))return v.map(String);if(typeof v==="string"){try{const x=JSON.parse(v);if(Array.isArray(x))return x.map(String)}catch{}return v?[v]:[]}return []}
function availabilityLabel(value:unknown):string{let rows:unknown=value;if(typeof value==="string"){try{rows=JSON.parse(value)}catch{return ""}}if(!Array.isArray(rows))return "";const days=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];return rows.map((item:any)=>{if(!item||typeof item!=="object")return "";return (days[Number(item.day_of_week)]||"Day")+" "+String(item.start_time||"").slice(0,5)+"–"+String(item.end_time||"").slice(0,5)+(item.timezone?" "+item.timezone:"")}).filter(Boolean).join(" · ")}
export default function PublicMentorProfile(){
 const params=useParams<{id:string}>();const id=String(params.id||"");const saved=useSavedDiscoveryItems();const token=useUiStore(s=>s.token);
 const [item,setItem]=useState<Mentor|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState("");
 const load=useCallback(async()=>{if(!id)return;setLoading(true);setError("");try{setItem(await api<Mentor>(`/api/v1/mentors/${encodeURIComponent(id)}`));}catch(e){setItem(null);setError(e instanceof ApiError?e.message:"This mentor profile is unavailable to your account.");}finally{setLoading(false);}},[id]);
 useEffect(()=>{void load();},[load]);
 return <main className="grid" style={{gap:18}}><Link href="/mentorship" className="btn btn-ghost"><ArrowLeft size={16}/> Back to mentorship</Link>
 {loading?<Card><OperationStatus state="loading" title="Loading mentor profile" detail="We’re retrieving the approved mentor’s published expertise, languages and mentoring modes. No match or mentorship request is being created." /></Card>
 :error?<Card><h1 className="h2">Mentor unavailable</h1><p role="alert" className="form-error">{error}</p><button className="btn btn-primary" type="button" onClick={()=>void load()}>Retry</button></Card>
 :item&&<Card><ImpactListingBanner variant="mentorship" eyebrow="Approved mentor profile" title={item.display_name} description={item.headline||"Professional mentor"} imageUrl={item.approved_banner_url} imageAlt={item.approved_banner_alt||item.display_name}/>{item.video_url&&<p><a href={item.video_url} target="_blank" rel="noopener noreferrer">Watch the mentor video</a></p>}<div className="row"><div className="avatar"><HeartHandshake size={23}/></div><div style={{flex:1,minWidth:0}}><div className="eyebrow">Approved mentor profile</div><h1 className="h1">{item.display_name}</h1><p className="tagline">{item.headline||"Mentor"}</p></div><button className="btn btn-ghost" type="button" disabled={!saved.signedIn||saved.isSaving("mentor",item.user_id)} aria-pressed={saved.isSaved("mentor",item.user_id)} onClick={()=>void saved.toggle("mentor",item.user_id)}><Bookmark size={16}/>{saved.isSaved("mentor",item.user_id)?"Saved":"Save mentor"}</button></div>
 {item.bio&&<p className="muted" style={{whiteSpace:"pre-wrap",marginTop:16}}>{item.bio}</p>}
 {values(item.expertise).length>0&&<div><h2 className="h2">Expertise</h2><div className="row" style={{flexWrap:"wrap"}}>{values(item.expertise).map(x=><Badge key={x}>{x}</Badge>)}</div></div>}
 {values(item.languages).length>0&&<p className="tagline"><Languages size={15}/> Languages: {values(item.languages).join(", ")}</p>}
 {values(item.mentoring_modes).length>0&&<p className="tagline">Mentoring modes: {values(item.mentoring_modes).join(", ")}</p>}
 {availabilityLabel(item.availability)&&<p className="tagline">Availability: {availabilityLabel(item.availability)}</p>}
 <p className="muted">Mentorship requests still use the MPA mentorship workflow, eligibility checks and mentor acceptance process.</p><Link className="btn btn-primary" href="/mentorship">Open mentorship workspace</Link>{saved.savedError&&<p aria-live="polite" aria-atomic="true" className="form-error">{saved.savedError}</p>}</Card>}
 {item&&<PublicMediaStories subjectType="mentor" subjectId={item.user_id} token={token}/>} 
 </main>;
}
