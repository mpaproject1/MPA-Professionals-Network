"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {api} from "../../../../lib/api";
import {useUiStore} from "../../../../lib/store";
import {AdminPageHeader} from "../../admin-page-header";
type DataClass="claim_metadata"|"identity_assurance_artifacts"|"raw_evidence"|"consent_and_rights_records"|"reviewer_notes"|"referral_attribution_records"|"audit_events"|"score_ledger";
type Rule={retentionDays:string;graceDays:string;retentionStart:string;expiryAction:string};
type PolicyItem={id:string;version:number;status:string;policy:{dataClasses:Partial<Record<DataClass,{retentionDays:number;graceDays:number;retentionStart:string;expiryAction:string}>>};rationale:string;change_summary:string;created_by:string;approved_by?:string|null;approval_reference?:string|null};
type Governance={active:PolicyItem|null;items:PolicyItem[];enforcement:string};
const classes:{key:DataClass;label:string;description:string}[]=[
 {key:"claim_metadata",label:"Claim metadata",description:"Claim descriptions, categories, dates and workflow metadata"},
 {key:"identity_assurance_artifacts",label:"Identity assurance artifacts",description:"Identity checks and non-member verification material"},
 {key:"raw_evidence",label:"Raw evidence",description:"Private uploaded documents, images and other source evidence"},
 {key:"consent_and_rights_records",label:"Consent and rights records",description:"Consent, media rights and permitted-use records"},
 {key:"reviewer_notes",label:"Reviewer notes",description:"Internal review rationale and clarification history"},
 {key:"referral_attribution_records",label:"Referral attribution records",description:"Member referral codes, membership/job attribution and referral milestone metadata"},
 {key:"audit_events",label:"Audit events",description:"Security, access and decision audit history"},
 {key:"score_ledger",label:"Score ledger",description:"Scoring inputs, adjustments and reversal provenance"}
];
const starts=[["created_at","Created"],["last_activity_at","Last activity"],["case_closed_at","Case closed"],["decision_finalized_at","Decision finalized"],["consent_withdrawn_at","Consent withdrawn"]];
const actions=[["hard_delete","Delete eligible content"],["anonymize","Anonymize eligible content"],["restrict_access","Restrict access"],["retain_minimal","Retain minimal record"]];
const emptyRule=():Rule=>({retentionDays:"",graceDays:"",retentionStart:"",expiryAction:""});
const emptyRules=()=>Object.fromEntries(classes.map(item=>[item.key,emptyRule()])) as Record<DataClass,Rule>;
const label=(value:string)=>value.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
export default function CommunityImpactRetentionPage(){
 const token=useUiStore(s=>s.token),hydrated=useUiStore(s=>s.hydrated),hydrateToken=useUiStore(s=>s.hydrateToken);
 const [data,setData]=useState<Governance|null>(null),[rules,setRules]=useState<Record<DataClass,Rule>>(emptyRules),[rationale,setRationale]=useState(""),[summary,setSummary]=useState("");
 const [approvalReference,setApprovalReference]=useState(""),[approvalReason,setApprovalReason]=useState(""),[activationReason,setActivationReason]=useState("");
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 useEffect(()=>{if(!hydrated)hydrateToken()},[hydrated,hydrateToken]);
 const load=useCallback(async()=>{if(!token)return;setLoading(true);setError("");try{const result=await api<Governance>("/api/v1/admin/community-impact/retention-policy",{},token);setData(result);if(result.active?.policy?.dataClasses){setRules(Object.fromEntries(classes.map(({key})=>{const item=result.active!.policy.dataClasses[key];return [key,item?{retentionDays:String(item.retentionDays),graceDays:String(item.graceDays),retentionStart:item.retentionStart,expiryAction:item.expiryAction}:emptyRule()]})) as Record<DataClass,Rule>);}}catch(e){setError(e instanceof Error?e.message:"Retention policy governance could not be loaded.");}finally{setLoading(false)}},[token]);
 useEffect(()=>{if(hydrated&&token)void load()},[hydrated,token,load]);
 const pending=useMemo(()=>data?.items.filter(item=>item.status==="in_review")||[],[data]);
 const approved=useMemo(()=>data?.items.filter(item=>item.status==="approved")||[],[data]);
 const changeRule=(key:DataClass,field:keyof Rule,value:string)=>setRules(current=>({...current,[key]:{...current[key],[field]:value}}));
 async function propose(){
  setBusy(true);setError("");setNotice("");
  try{
   const dataClasses=Object.fromEntries(classes.map(({key})=>{const item=rules[key];return [key,{retentionDays:Number(item.retentionDays),graceDays:Number(item.graceDays),retentionStart:item.retentionStart,expiryAction:item.expiryAction}]}));
   await api("/api/v1/admin/community-impact/retention-policy",{method:"POST",body:JSON.stringify({policy:{dataClasses},rationale,changeSummary:summary})},token);
   setNotice("Retention policy proposal submitted for independent approval. It is not active and no evidence will be deleted.");setRules(emptyRules());setRationale("");setSummary("");await load();
  }catch(e){setError(e instanceof Error?e.message:"The retention proposal could not be submitted.");}finally{setBusy(false)}
 }
 async function approve(id:string){
  setBusy(true);setError("");setNotice("");
  try{await api("/api/v1/admin/community-impact/retention-policy/"+encodeURIComponent(id)+"/approve",{method:"POST",body:JSON.stringify({approvalReference,reason:approvalReason})},token);setNotice("Policy approved. It still requires explicit activation.");setApprovalReference("");setApprovalReason("");await load();}
  catch(e){setError(e instanceof Error?e.message:"The retention policy could not be approved.");}finally{setBusy(false)}
 }
 async function activate(id:string){
  setBusy(true);setError("");setNotice("");
  try{await api("/api/v1/admin/community-impact/retention-policy/"+encodeURIComponent(id)+"/activate",{method:"POST",body:JSON.stringify({reason:activationReason})},token);setNotice("Policy activated. Automated evidence expiry remains disabled until evidence lifecycle integration and its release gate are completed.");setActivationReason("");await load();}
  catch(e){setError(e instanceof Error?e.message:"The retention policy could not be activated.");}finally{setBusy(false)}
 }
 if(!hydrated)return <main className="grid"><p>Loading administrator session…</p></main>;
 if(!token)return <main className="grid"><h1>Administrator sign-in required</h1><p>Sign in with an authorized MPA policy-administration account.</p></main>;
 return <main className="grid" style={{gap:20}}>
  <AdminPageHeader eyebrow="Community Impact governance" title="Evidence retention policy" description="Configure retention separately for each data class. Proposals are versioned, independently approved and explicitly activated. A policy change does not immediately delete evidence."/>
  {error?<p role="alert" className="form-error">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
  <section className="card grid" style={{gap:12}}>
   <div><h2 className="h2">Current enforcement state</h2><p className="muted">No retention duration is assumed. Automated expiry is not enabled by this policy registry.</p></div>
   <p><strong>Active policy:</strong> {data?.active?"Version "+data.active.version:"No approved policy activated"}</p>
   <p><strong>Evidence deletion:</strong> Not enabled — policy snapshots are now captured for claims and evidence, but expiry execution, legal-hold enforcement, backup expiry and validated deletion/anonymization remain a separate release gate.</p>
   {data?.active?.policy?.dataClasses?<div className="grid" style={{gap:6}}><h3>Active policy schedule</h3>{classes.map(({key,label:classLabel})=>{const item=data.active!.policy.dataClasses[key];return <p key={key}><strong>{classLabel}:</strong> {item?`${item.retentionDays} days + ${item.graceDays} grace days · ${label(item.retentionStart)} · ${label(item.expiryAction)}`:"Not defined in this older policy version; propose an updated policy before referral retention can be governed."}</p>})}</div>:null}
   <button type="button" className="btn btn-ghost" onClick={()=>void load()} disabled={loading||busy}>{loading?"Refreshing…":"Refresh policy status"}</button>
  </section>
  <section className="card grid" style={{gap:14}}>
   <div><h2 className="h2">Propose a new policy version</h2><p className="muted">Enter the period and expiry treatment approved by MPA. Every class must be completed; there is no pre-filled retention duration.</p></div>
   {classes.map(({key,label:classLabel,description})=><fieldset key={key} className="grid" style={{gap:10,border:"1px solid var(--border)",borderRadius:10,padding:14}}>
    <legend><strong>{classLabel}</strong></legend><p className="muted">{description}</p>
    <label>Retention period (days)<input type="number" min="1" step="1" value={rules[key].retentionDays} onChange={e=>changeRule(key,"retentionDays",e.target.value)} required/></label>
    <label>Grace period after expiry (days)<input type="number" min="0" max="36500" step="1" value={rules[key].graceDays} onChange={e=>changeRule(key,"graceDays",e.target.value)} required/></label>
    <label>Start counting from<select value={rules[key].retentionStart} onChange={e=>changeRule(key,"retentionStart",e.target.value)} required><option value="">Choose a start event</option>{starts.map(([value,text])=><option key={value} value={value}>{text}</option>)}</select></label>
    <label>Action at expiry<select value={rules[key].expiryAction} onChange={e=>changeRule(key,"expiryAction",e.target.value)} required><option value="">Choose an action</option>{actions.filter(([value])=>!((["audit_events","score_ledger","claim_metadata","reviewer_notes","consent_and_rights_records"].includes(key))&&value==="hard_delete")).map(([value,text])=><option key={value} value={value}>{text}</option>)}</select></label>
   </fieldset>)}
   <label>Reason for this policy change<textarea rows={3} value={rationale} onChange={e=>setRationale(e.target.value)} minLength={12} maxLength={2000} required placeholder="Record the governance/legal basis and why this policy version is needed."/></label>
   <label>Change summary<textarea rows={2} value={summary} onChange={e=>setSummary(e.target.value)} minLength={8} maxLength={1000} required placeholder="Summarize what is changing from the previous policy."/></label>
   <button type="button" className="btn btn-primary" disabled={busy||!rationale.trim()||!summary.trim()||classes.some(({key})=>!rules[key].retentionDays||!rules[key].graceDays||!rules[key].retentionStart||!rules[key].expiryAction)} onClick={()=>void propose()}>{busy?"Submitting…":"Submit policy for independent approval"}</button>
  </section>
  <section className="card grid" style={{gap:14}}>
   <div><h2 className="h2">Awaiting independent approval</h2><p className="muted">The person who proposed a policy cannot approve it. Approval requires an MPA approval reference.</p></div>
   {pending.length?pending.map(item=><article key={item.id} className="grid" style={{gap:8,borderTop:"1px solid var(--border)",paddingTop:12}}><h3>Version {item.version} · {label(item.status)}</h3><p>{item.change_summary}</p><p className="muted">{item.rationale}</p><label>Approval reference<input value={approvalReference} onChange={e=>setApprovalReference(e.target.value)} minLength={8} maxLength={240}/></label><label>Approval rationale<textarea rows={2} value={approvalReason} onChange={e=>setApprovalReason(e.target.value)} minLength={12} maxLength={2000}/></label><button type="button" className="btn btn-primary" disabled={busy||approvalReference.trim().length<8||approvalReason.trim().length<12} onClick={()=>void approve(item.id)}>Approve policy version {item.version}</button></article>):<p className="muted">No policy proposals are awaiting approval.</p>}
  </section>
  <section className="card grid" style={{gap:14}}>
   <div><h2 className="h2">Approved policy versions</h2><p className="muted">Activation is separate from approval and cannot be performed by the original proposer.</p></div>
   {approved.length?approved.map(item=><article key={item.id} className="grid" style={{gap:8,borderTop:"1px solid var(--border)",paddingTop:12}}><h3>Version {item.version} · Approved</h3><p>{item.change_summary}</p><p className="muted">Approval reference: {item.approval_reference||"Not available"}</p><label>Activation rationale<textarea rows={2} value={activationReason} onChange={e=>setActivationReason(e.target.value)} minLength={12} maxLength={2000}/></label><button type="button" className="btn btn-primary" disabled={busy||activationReason.trim().length<12} onClick={()=>void activate(item.id)}>Activate version {item.version}</button></article>):<p className="muted">No approved policies are awaiting activation.</p>}
  </section>
  <section className="card"><h2 className="h2">Data classes and legal holds</h2><p className="muted">A legal hold pauses expiry and preserves affected records. Policy versions retain their original rules for historical audit. New settings are prospective by default; existing records are not silently recalculated or deleted.</p><p className="muted">The registry does not yet run a deletion job. Evidence expiry, storage-object deletion, backup expiry, correction, withdrawal and audit minimization will be connected only after their respective data lifecycle controls are implemented and validated.</p></section>
 </main>;
}
