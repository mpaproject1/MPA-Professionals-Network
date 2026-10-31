"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {Copy,RefreshCw,Share2,Users,BriefcaseBusiness,CheckCircle2,LockKeyhole} from "lucide-react";
import {api} from "../../lib/api";
import {useUiStore} from "../../lib/store";

type ReferralItem={id:string;referral_type:"membership"|"employment";status:string;created_at:string;job_id?:string|null;job_title?:string|null;referred_person:string};
type Dashboard={code:{code:string;status:string;shareUrl:string};counts:{referral_type:string;status:string;count:number}[];items:ReferralItem[];score:number;scoringActive:boolean};
const labels:Record<string,string>={registered:"Registered",membership_activated:"Active member",application_submitted:"Application submitted",shortlisted:"Shortlisted",interview:"Interview",offer_accepted:"Offer accepted",employment_reported:"Outcome awaiting review",employment_verified:"Employment verified",declined:"Declined",withdrawn:"Withdrawn",disputed:"Under review"};
export default function ReferralsPage(){
 const token=useUiStore(s=>s.token),hydrated=useUiStore(s=>s.hydrated),hydrateToken=useUiStore(s=>s.hydrateToken);
 const [data,setData]=useState<Dashboard|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const load=useCallback(async()=>{if(!token)return;setLoading(true);setError("");try{setData(await api<Dashboard>("/api/v1/me/referrals",{},token));}catch(e){setError(e instanceof Error?e.message:"Referral information could not be loaded.");}finally{setLoading(false);}},[token]);
 useEffect(()=>{if(!hydrated)hydrateToken();},[hydrated,hydrateToken]);
 useEffect(()=>{if(hydrated&&token)void load();else if(hydrated){setLoading(false);setError("Sign in with an active MPA membership to manage your referral links.");}},[hydrated,token,load]);
 const totals=useMemo(()=>({membership:data?.counts.filter(x=>x.referral_type==="membership").reduce((n,x)=>n+x.count,0)||0,employment:data?.counts.filter(x=>x.referral_type==="employment").reduce((n,x)=>n+x.count,0)||0,active:data?.counts.filter(x=>x.status==="membership_activated").reduce((n,x)=>n+x.count,0)||0,verified:data?.counts.filter(x=>x.status==="employment_verified").reduce((n,x)=>n+x.count,0)||0}),[data]);
 const share=async(kind:"membership"|"employment",jobId?:string)=>{if(!data)return;const base=window.location.origin;const url=kind==="membership"?base+"/register?ref="+encodeURIComponent(data.code.code):base+"/jobs/"+encodeURIComponent(jobId||"")+"?ref="+encodeURIComponent(data.code.code);try{await navigator.clipboard.writeText(url);setNotice("Referral link copied. Share it with the person you are inviting.");}catch{setNotice(url);}};
 if(loading)return <main className="container page-shell"><p>Loading your referral workspace…</p></main>;
 return <main className="container page-shell" style={{maxWidth:1040}}>
  <header className="page-heading"><p className="eyebrow">Member engagement</p><h1>My referrals</h1><p className="muted">Invite professionals to MPA and recommend candidates for specific job opportunities. Membership and employment outcomes are tracked separately.</p></header>
  {error&&<div className="form-error" role="alert">{error}</div>}
  {data&&<>
   <section className="card" style={{padding:22,marginBottom:18}}>
    <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">Your member referral code</p><h2 className="h2" style={{letterSpacing:".08em"}}>{data.code.code}</h2><p className="muted">This code belongs to your active membership. Do not share account credentials.</p></div><span className="badge">{data.code.status}</span></div>
    <div className="flex flex-wrap gap-2" style={{marginTop:12}}><button className="btn btn-primary" onClick={()=>void share("membership")}><Copy size={16}/> Copy membership invitation</button><button className="btn btn-ghost" onClick={()=>{void navigator.clipboard.writeText(data.code.code).then(()=>setNotice("Your referral code is copied. Use it when sharing a specific job vacancy."));}}><BriefcaseBusiness size={16}/> Copy code for a job referral</button><button className="btn btn-ghost" onClick={()=>void load()}><RefreshCw size={16}/> Refresh</button></div>
    <p className="muted" style={{marginTop:10}}>For a job referral, open the specific vacancy and use its share option. The code must be attached to that job's application; a membership registration link does not verify employment.</p>
   </section>
   {notice&&<p className="form-success" role="status">{notice}</p>}
   <section className="grid grid-2" style={{gap:14,marginBottom:18}}>
    <article className="card" style={{padding:18}}><Users/><h3 className="h3">Membership invitations</h3><p className="h1">{totals.membership}</p><p className="muted">Attributed registrations</p><p className="muted">{totals.active} activated memberships</p></article>
    <article className="card" style={{padding:18}}><BriefcaseBusiness/><h3 className="h3">Employment referrals</h3><p className="h1">{totals.employment}</p><p className="muted">Attributed job applications</p><p className="muted">{totals.verified} independently verified employment outcomes</p></article>
   </section>
   <section className="card" style={{padding:18,marginBottom:18}}><div className="flex items-center gap-2"><LockKeyhole/><h2 className="h3">Community Impact recognition</h2></div><p className="h1">{data.score} points</p><p className="muted">{data.scoringActive?"Points are calculated from MPA's active approved scoring policy.":"Scoring is not active yet. No points are awarded until MPA approves and activates a scoring policy."}</p></section>
   <section className="card" style={{padding:18}}><h2 className="h2">Referral activity</h2>{data.items.length===0?<p className="muted">No referrals have been attributed yet. Share your invitation link to get started.</p>:<div className="table-wrap"><table><thead><tr><th>Person</th><th>Purpose</th><th>Opportunity</th><th>Status</th><th>Date</th></tr></thead><tbody>{data.items.map(item=><tr key={item.id}><td>{item.referred_person}</td><td>{item.referral_type==="membership"?"Membership":"Employment"}</td><td>{item.job_title||"—"}</td><td><span className="badge">{labels[item.status]||item.status}</span></td><td>{new Date(item.created_at).toLocaleDateString()}</td></tr>)}</tbody></table></div>}<p className="muted" style={{marginTop:12}}>Names and individual progress appear only when the referred person has opted in. Otherwise, the record is shown as private. You cannot access their membership documents, payments or hiring evidence.</p></section>
  </>}
 </main>;
}
