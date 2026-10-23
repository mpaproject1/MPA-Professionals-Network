"use client";
import {ArrowRight, Bell, Bookmark, BriefcaseBusiness, FileCheck2, FileText, GraduationCap, ShieldCheck, UserRound, Users} from "lucide-react";
import Link from "next/link";
import {useCallback, useEffect, useState} from "react";
import {OperationStatus} from "../../components/operation-status";
import {Badge, Card} from "../../components/ui";
import {ApiError, api} from "../../lib/api";
import {useUiStore} from "../../lib/store";

type Me={user_id:string;display_name?:string;first_name?:string;last_name?:string;email?:string;roles?:string[];has_active_membership?:boolean;status?:string};
type Tracking={summary?:{total?:number;active?:number;nextSteps?:number;jobApplications?:number};items?:any[]};
type SavedItem={item_type:string;item_id:string;title:string;href:string};
type Inbox={items:any[];counts?:{unread?:number;action_required?:number}};
type TalentProfile={headline?:string;professional_title?:string;directory_visibility?:string;completion_percent?:number};
type Verification={items?:{id:string;status:string;program_name?:string;program_code?:string}[]};
type MembershipApplication={id:string;status:string;created_at?:string;tracking_reference?:string};
type Data={me:Me;tracking:Tracking;saved:SavedItem[];inbox:Inbox;talent:TalentProfile;verification:Verification;membership:MembershipApplication[];errors:string[]};
const shortcuts=[
 {href:"/profile",title:"Profile and portfolio",detail:"Keep your identity, education, experience and portfolio current.",icon:UserRound},
 {href:"/member/cv",title:"CV and sharing permissions",detail:"Keep a private CV and choose which of your job applications receives it; revoke access later.",icon:FileText},
 {href:"/jobs",title:"Find opportunities",detail:"Explore public opportunities and save roles to revisit.",icon:BriefcaseBusiness},
 {href:"/track",title:"Applications and requests",detail:"Check the latest status, review history and next action.",icon:FileCheck2},
 {href:"/mentorship",title:"Mentoring",detail:"Explore mentorship and follow your active requests.",icon:Users},
 {href:"/saved",title:"Saved items",detail:"Return to profiles, services and mentors you saved.",icon:Bookmark},
 {href:"/notifications",title:"Notifications and preferences",detail:"See updates, action-required messages and delivery preferences.",icon:Bell},
 {href:"/account/security",title:"Account and privacy",detail:"Review account security and the privacy controls available to you.",icon:ShieldCheck},
];
export default function MemberWorkspacePage(){
 const token=useUiStore(s=>s.token),hydrated=useUiStore(s=>s.hydrated),hydrateToken=useUiStore(s=>s.hydrateToken);
 const [data,setData]=useState<Data|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState("");
 const load=useCallback(async()=>{
  if(!token){setData(null);setLoading(false);return;} setLoading(true);setError("");
  const results=await Promise.allSettled([
   api<Me>("/api/v1/me",{},token),
   api<Tracking>("/api/v1/me/application-tracking?limit=5",{},token),
   api<SavedItem[]>("/api/v1/me/saved-items",{},token),
   api<Inbox>("/api/v1/notifications?limit=5",{},token),
   api<TalentProfile>("/api/v1/me/talent-profile",{},token),
   api<Verification>("/api/v1/me/verification/cases",{},token),
   api<MembershipApplication[]>("/api/v1/membership/applications/me",{},token),
  ]);
  const names=["Account","Application tracking","Saved items","Notifications","Professional profile","Verification","Membership applications"];
  const failures=results.flatMap((r,i)=>r.status==="rejected"?[names[i]]:[]);
  if(results[0].status==="rejected"){setError(results[0].reason instanceof ApiError?results[0].reason.message:"Your account could not be loaded.");setLoading(false);return;}
  setData({me:results[0].value as Me,tracking:results[1].status==="fulfilled"?results[1].value as Tracking:{},saved:results[2].status==="fulfilled"&&Array.isArray(results[2].value)?results[2].value as SavedItem[]:[],inbox:results[3].status==="fulfilled"?results[3].value as Inbox:{items:[]},talent:results[4].status==="fulfilled"?results[4].value as TalentProfile:{},verification:results[5].status==="fulfilled"?results[5].value as Verification:{items:[]},membership:results[6].status==="fulfilled"&&Array.isArray(results[6].value)?results[6].value as MembershipApplication[]:[],errors:failures.filter(name=>name!=="Account")});
  setLoading(false);
 },[token]);
 useEffect(()=>{if(!hydrated)hydrateToken();},[hydrated,hydrateToken]);
 useEffect(()=>{if(hydrated)void load();},[hydrated,load]);
 if(!hydrated)return <main className="mx-auto max-w-6xl px-4 py-10"><OperationStatus state="loading" title="Preparing your workspace" detail="Restoring your sign-in state before loading private account information."/></main>;
 if(!token)return <main className="mx-auto max-w-3xl px-4 py-16"><Card><div className="eyebrow">Personal workspace</div><h1 className="h1">What should I do next?</h1><p className="muted">Sign in to bring your profile, applications, saved items and notifications together in one private place. You can still browse public opportunities before joining.</p><div className="row" style={{flexWrap:"wrap"}}><Link className="btn btn-primary" href="/login?next=/member">Sign in</Link><Link className="btn btn-ghost" href="/jobs">Browse opportunities</Link></div></Card></main>;
 const me=data?.me; const name=me?.display_name||[me?.first_name,me?.last_name].filter(Boolean).join(" ")||me?.email||"there"; const active=Boolean(me?.has_active_membership);
 const applications=Number(data?.tracking?.summary?.total||0),needsAction=Number(data?.tracking?.summary?.nextSteps||0)+Number(data?.inbox?.counts?.action_required||0);
 return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
  <header className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><div className="eyebrow">Your MPA workspace</div><h1 className="h1">What should I do next, {name}?</h1><p className="muted max-w-3xl">Your profile, opportunities, applications and next steps — in one place. Review sharing settings before making your professional details visible. The current profile and application flows support scoped visibility, but a dedicated CV vault and recipient-by-recipient CV approval screen are not yet implemented.</p></div><button type="button" className="btn btn-ghost" onClick={()=>void load()} disabled={loading}>{loading?"Checking updates…":"Refresh my workspace"}</button></header>
  {error&&<Card><p className="form-error" role="alert">{error}</p><button type="button" className="btn btn-ghost" onClick={()=>void load()} disabled={loading}>Try again</button></Card>}
  {loading&&!data&&<OperationStatus state="loading" title="Loading your personal workspace" detail="We are checking your own applications, saved items, notifications and profile. Other people's private records are not included."/>}
  {data?.errors.length?<Card><p className="muted">Some information could not be loaded: {data.errors.join(", ")}. Available sections are still shown; retry to check again.</p><button type="button" className="btn btn-ghost" onClick={()=>void load()} disabled={loading}>Retry loading</button></Card>:null}
  {data&&<>
   <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Personal overview">
    <Card><p className="muted">Applications and requests</p><p className="text-3xl font-semibold">{applications}</p><Link href="/track" className="inline-flex items-center gap-2 text-sm">View progress <ArrowRight size={15}/></Link></Card>
    <Card><p className="muted">Needs your attention</p><p className="text-3xl font-semibold">{needsAction}</p><Link href="/notifications" className="inline-flex items-center gap-2 text-sm">Open action center <ArrowRight size={15}/></Link></Card>
    <Card><p className="muted">Saved items</p><p className="text-3xl font-semibold">{data.saved.length}</p><Link href="/saved" className="inline-flex items-center gap-2 text-sm">Return to saved items <ArrowRight size={15}/></Link></Card>
    <Card><p className="muted">Membership</p><p className="text-lg font-semibold">{active?"Active member":"Not currently active"}</p><Badge tone={active?"green":"slate"}>{active?"Member benefits available":"Public access available"}</Badge><p className="muted mt-2 text-sm">{active?"Review your member services and verification eligibility.":"You can still maintain your own profile and use public features."}</p><Link href="/membership" className="inline-flex items-center gap-2 text-sm">Membership options <ArrowRight size={15}/></Link></Card>
   </section>
   {!active?<Card><div className="flex flex-wrap items-start justify-between gap-3"><div className="max-w-3xl"><h2 className="h2">Build your professional record first</h2><p className="muted">You do not need active membership to update your own profile or explore public opportunities. Membership is required only for member-only actions such as requesting professional verification. Eligibility is checked by the service when you take that action.</p></div><Link className="btn btn-primary" href="/membership">See membership benefits</Link></div></Card>:null}
   <section className="mt-6"><h2 className="h2 mb-3">Your next steps</h2><div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">{shortcuts.map(item=>{const Icon=item.icon;return <Card key={item.href}><Icon size={22}/><h3 className="mt-3 font-semibold">{item.title}</h3><p className="muted mt-1">{item.detail}</p><Link href={item.href} className="mt-4 inline-flex items-center gap-2 text-sm">Open <ArrowRight size={15}/></Link></Card>})}</div></section>
   <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2"><Card><div className="flex items-center justify-between gap-3"><h2 className="h2">Application progress</h2><Link href="/track" className="text-sm">View all</Link></div>{data.tracking.items?.length?data.tracking.items.slice(0,4).map((item:any)=><div className="case-row" key={String(item.id||item.reference)}><div><b>{item.title||item.program_name||item.reference||"Application"}</b><p className="muted">{String(item.status||"Status unavailable").replaceAll("_"," ")}{item.nextAction?" · "+item.nextAction:""}</p></div></div>):<p className="muted">No recent application updates were returned. You can still browse opportunities and check your saved items.</p>}</Card>
   <Card><div className="flex items-center justify-between gap-3"><h2 className="h2">Recent notifications</h2><Link href="/notifications" className="text-sm">Open inbox</Link></div>{data.inbox.items?.length?data.inbox.items.slice(0,4).map((item:any)=><div className="case-row" key={item.id}><div><b>{item.title||"Update"}</b><p className="muted">{item.body||"Open notifications to review details."}</p>{item.actionUrl?<Link href={item.actionUrl} className="text-sm">Take action <ArrowRight size={14}/></Link>:null}</div></div>):<p className="muted">You have no recent notifications in this view.</p>}</Card></section>
   <Card><div className="flex items-start gap-3"><GraduationCap size={22}/><div><h2 className="h2">Mentoring and professional growth</h2><p className="muted">Explore mentoring, services and learning opportunities that are actually available in the network. We do not mark a learning activity complete unless the platform records that outcome.</p><div className="row mt-3" style={{flexWrap:"wrap"}}><Link className="btn btn-secondary" href="/mentorship">Explore mentoring</Link><Link className="btn btn-ghost" href="/services">Explore services</Link></div></div></div></Card>
   <p className="muted mt-5 text-sm">Privacy note: this page requests your own account data and server-scoped applications, notifications and saved items. Employer access to your professional details must follow the platform's sharing and authorization rules.</p>
  </>}
 </main>;
}
