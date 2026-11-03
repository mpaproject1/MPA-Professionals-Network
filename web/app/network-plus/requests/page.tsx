"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { NetworkPlusAccessGuard } from "../../../components/network-plus-access-guard";
import { ApiError, api } from "../../../lib/api";
import { useUiStore } from "../../../lib/store";
import { CalendarDays, CheckCircle2, Clock3, Handshake, Heart, MessageCircle, Quote, RefreshCw, Send, ShieldCheck, XCircle } from "lucide-react";

type Intent = "service_request"|"supplier_inquiry"|"referral"|"expertise_request"|"partnership_proposal"|"collaboration_request"|"business_opportunity"|"interest"|"question"|"quote_request"|"meeting_request";
type Participant = {user_id:string;participant_role:string;consent_status:string};
type MemberChoice = {user_id:string;display_name:string;professional_title?:string};
type OrgChoice = {id:string;display_name:string};
type BusinessChoice = {id:string;display_name:string;business_kind:string};
type ServiceChoice = {id:string;business_id:string;business_name:string;title:string};
type Workspace = {id:string;purpose:string;scope:string;status:string};
type RequestRow = {isRequester?:boolean;is_requester?:boolean;requester_disposition?:"in_progress"|"completed"|"cancelled";requester_disposition_remark?:string|null;requester_disposition_updated_at?:string|null;review_due_at?:string|null;recipient_label?:string|null;requester_label?:string|null;isRecipientRepresentative?:boolean;canReview?:boolean;canAccept?:boolean;canHandoff?:boolean;recipient_response?:string|null;recipient_response_at?:string|null;id:string;intent:Intent;status:string;subject:string;summary:string;requester_user_id:string;recipient_user_id?:string|null;recipient_organization_id?:string|null;participants?:Participant[];terms?:Record<string,any>;workspace?:Workspace|null;events?:any[];clarifications?:any[];meetings?:any[]};
const intents: {value:Intent;label:string;description:string}[] = [
 {value:"service_request",label:"Service request",description:"Ask a business to deliver a defined professional service."},
 {value:"supplier_inquiry",label:"Supplier inquiry",description:"Ask about supplying goods, materials or professional capacity."},
 {value:"referral",label:"Referral",description:"Request or offer a professional introduction or referral."},
 {value:"expertise_request",label:"Expertise request",description:"Seek specialist advice, review or expertise."},
 {value:"partnership_proposal",label:"Partnership proposal",description:"Propose a structured partnership with shared contributions and outputs."},
 {value:"collaboration_request",label:"Collaboration request",description:"Propose a scoped collaboration with named responsibilities."},
  {value:"business_opportunity",label:"Business opportunity",description:"Express interest in a sponsored programme, grant or other business-support opportunity."},
 {value:"interest",label:"I’m interested",description:"A simple signal to start a professional connection."},
 {value:"question",label:"Ask a question",description:"Ask one focused question before deciding on next steps."},
 {value:"quote_request",label:"Request quotation",description:"Ask for a quotation or pricing discussion; no payment is collected."},
 {value:"meeting_request",label:"Request meeting",description:"Ask to arrange a first conversation after the recipient accepts."}
];
function key(){return crypto.randomUUID()+crypto.randomUUID();}
function lines(value:string){return value.split("\n").map(v=>v.trim()).filter(Boolean);}
function label(value:string){return value.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());}
function meetingTime(value:string,timezone:string){try{return new Intl.DateTimeFormat(undefined,{dateStyle:"medium",timeStyle:"short",timeZone:timezone}).format(new Date(value));}catch{return new Date(value).toLocaleString();}}
function meetingInstant(value:string,timezone:string){
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
 if(!match)throw new Error("Choose a valid meeting date and time.");
 const target=match.slice(1).map(Number),base=Date.UTC(target[0],target[1]-1,target[2],target[3],target[4],0);
 const format=new Intl.DateTimeFormat("en-US",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
 const partsAt=(instant:number)=>Object.fromEntries(format.formatToParts(new Date(instant)).map(part=>[part.type,Number(part.value)]));
 const localEpoch=(parts:Record<string,number>)=>Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second);
 const offsets=new Set([-36,-24,-12,0,12,24,36].map(hours=>{const sample=base+hours*60*60*1000;return localEpoch(partsAt(sample))-sample;}));
 const candidates=[...offsets].map(offset=>base-offset).filter(instant=>{const parts=partsAt(instant);return parts.year===target[0]&&parts.month===target[1]&&parts.day===target[2]&&parts.hour===target[3]&&parts.minute===target[4];});
 if(candidates.length===0)throw new Error("That local time does not exist in the selected timezone because of a clock change. Choose another time.");
 if(candidates.length>1)throw new Error("That local time occurs twice in the selected timezone because clocks move backward. Choose a time outside the repeated hour.");
 return new Date(candidates[0]).toISOString();
}

export default function NetworkPlusRequestsPage(){
 const token=useUiStore(s=>s.token);
 const [items,setItems]=useState<RequestRow[]>([]);
 const [selectedId,setSelectedId]=useState("");
 const [selected,setSelected]=useState<RequestRow|null>(null);
 const [workspaceData,setWorkspaceData]=useState<any>(null);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const [dispositionFilter,setDispositionFilter]=useState("in_progress"),[closureRemark,setClosureRemark]=useState("");
 const [recipientWithdrawalReason,setRecipientWithdrawalReason]=useState("");
 const [intent,setIntent]=useState<Intent>("service_request");
 const [requestStep,setRequestStep]=useState(1);
 const [recipientUserId,setRecipientUserId]=useState(""),[recipientOrganizationId,setRecipientOrganizationId]=useState("");
 const [memberQuery,setMemberQuery]=useState(""),[memberChoices,setMemberChoices]=useState<MemberChoice[]>([]);
 const [organizationQuery,setOrganizationQuery]=useState(""),[organizationChoices,setOrganizationChoices]=useState<OrgChoice[]>([]);
 const [businessChoices,setBusinessChoices]=useState<BusinessChoice[]>([]),[serviceChoices,setServiceChoices]=useState<ServiceChoice[]>([]);
 const [businessId,setBusinessId]=useState(""),[serviceListingId,setServiceListingId]=useState("");
 const [subject,setSubject]=useState(""),[summary,setSummary]=useState("");
 const [scope,setScope]=useState(""),[deliverables,setDeliverables]=useState("");
 const [pricing,setPricing]=useState("Quotation requested"),[schedule,setSchedule]=useState("");
 const [purpose,setPurpose]=useState(""),[contributions,setContributions]=useState(""),[responsibilities,setResponsibilities]=useState(""),[outputs,setOutputs]=useState(""),[timeline,setTimeline]=useState(""),[representatives,setRepresentatives]=useState("");
 const [opportunityType,setOpportunityType]=useState(""),[eligibility,setEligibility]=useState(""),[selectionProcess,setSelectionProcess]=useState(""),[opportunityDeadline,setOpportunityDeadline]=useState(""),[opportunityValue,setOpportunityValue]=useState("");
 const [updateTitle,setUpdateTitle]=useState(""),[updateBody,setUpdateBody]=useState(""),[updateType,setUpdateType]=useState("update");
 const [milestoneTitle,setMilestoneTitle]=useState(""),[milestoneDue,setMilestoneDue]=useState("");
 const [completionEvidence,setCompletionEvidence]=useState("");
 const [contactPeerId,setContactPeerId]=useState(""),[contactField,setContactField]=useState("email"),[contactValue,setContactValue]=useState(""),[contactHandoff,setContactHandoff]=useState<any>({fields:[]});
 const [meetingPlace,setMeetingPlace]=useState("online"),[meetingPlaceDetails,setMeetingPlaceDetails]=useState(""),[meetingDateTime,setMeetingDateTime]=useState(""),[meetingDuration,setMeetingDuration]=useState("30"),[meetingTimezone,setMeetingTimezone]=useState("Africa/Addis_Ababa");
 const [clarificationTopic,setClarificationTopic]=useState("scope"),[clarificationQuestion,setClarificationQuestion]=useState(""),[clarificationAnswer,setClarificationAnswer]=useState("");
 const [questionAnswer,setQuestionAnswer]=useState("");
 useEffect(()=>{const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;if(zone)setMeetingTimezone(zone);},[]);


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
 useEffect(()=>{if(selectedId)void loadDetail(selectedId);else {setSelected(null);setWorkspaceData(null);}},[selectedId,loadDetail]);
 useEffect(()=>{if(selected?.workspace&&token)void api<any>("/api/v1/network-plus/requests/"+encodeURIComponent(selected.id)+"/workspace",{},token).then(setWorkspaceData).catch(()=>setWorkspaceData(null));else setWorkspaceData(null);},[selected?.id,selected?.workspace?.id,token]);
 const acceptedRecipient=selected?.participants?.find(p=>p.participant_role==="recipient_representative"&&p.consent_status==="accepted");
 const handoffPeerId=selected?.isRequester?(contactPeerId||acceptedRecipient?.user_id||selected?.recipient_user_id||""):(selected?.requester_user_id||"");
 useEffect(()=>{if(!token||!selected||!selected.canHandoff||!["accepted","in_progress","completed","closed"].includes(selected.status)||!handoffPeerId){setContactHandoff({fields:[]});return;}api<any>("/api/v1/network-plus/requests/"+encodeURIComponent(selected.id)+"/contact-handoff?peerUserId="+encodeURIComponent(handoffPeerId),{},token).then(setContactHandoff).catch(()=>setContactHandoff({fields:[]}));},[selected?.id,selected?.status,handoffPeerId,token]);
 useEffect(()=>{setContactPeerId(selected?.isRequester?(acceptedRecipient?.user_id||selected?.recipient_user_id||""):(selected?.requester_user_id||""));},[selected?.id,selected?.isRequester,selected?.recipient_user_id,selected?.requester_user_id,acceptedRecipient?.user_id]);
 useEffect(()=>{try{const params=new URLSearchParams(window.location.search),listingId=params.get("listingId"),requestedIntent=params.get("action") as Intent|null;if(requestedIntent&&intents.some(v=>v.value===requestedIntent))setIntent(requestedIntent);if(listingId){setServiceListingId(listingId);const listing=serviceChoices.find(v=>v.id===listingId);if(listing){setBusinessId(listing.business_id);setSubject((requestedIntent?label(requestedIntent):"Connection request")+" · "+listing.title);setSummary("I would like to connect regarding "+listing.title+". Please let me know the appropriate next step.");}}}catch{}},[serviceChoices]);

 const currentIntent=useMemo(()=>intents.find(v=>v.value===intent),[intent]);
 const isLightweight=["interest","question","quote_request","meeting_request"].includes(intent);
 const requestStepNames=["Choose action","Describe request","Choose recipient","Review and save"];
 const selectedRecipientLabel=serviceListingId?(serviceChoices.find(v=>v.id===serviceListingId)?.business_name||businessChoices.find(v=>v.id===businessId)?.display_name||"Selected listing"):businessId?(businessChoices.find(v=>v.id===businessId)?.display_name||"Selected business"):recipientUserId?(memberChoices.find(v=>v.user_id===recipientUserId)?.display_name||"Selected member"):recipientOrganizationId?(organizationChoices.find(v=>v.id===recipientOrganizationId)?.display_name||"Selected organization"):"No recipient selected";
 function continueRequestStep(){setError("");if(requestStep===2&&(subject.trim().length<3||summary.trim().length<10)){setError("Add a subject and a short request summary before continuing.");return;}if(requestStep===3&&!serviceListingId&&!businessId&&!recipientUserId&&!recipientOrganizationId){setError("Choose a published listing, business, verified member or verified organization.");return;}setRequestStep(step=>Math.min(4,step+1));}
 function previousRequestStep(){setError("");setRequestStep(step=>Math.max(1,step-1));}

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
  if(isLightweight&&(subject.trim().length<3||summary.trim().length<10||(!serviceListingId&&!businessId&&!recipientUserId&&!recipientOrganizationId))){setError("Complete the request details and choose one recipient before saving.");return;}
  setSaving(true);setError("");setNotice("");
  try{
   let terms:Record<string,any>={};
   if(intent==="service_request")terms={scope,deliverables:lines(deliverables),pricing:{proposal:pricing},schedule:{requested:schedule||"To be agreed"}};
   if(intent==="partnership_proposal"||intent==="collaboration_request")terms={purpose,scope,contributions:lines(contributions),responsibilities:lines(responsibilities),outputs:lines(outputs),timeline:{proposed:timeline},authorizedRepresentatives:lines(representatives)};
   if(intent==="business_opportunity")terms={opportunityType,eligibility,selectionProcess,deadline:opportunityDeadline||null,value:opportunityValue||null};
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

 async function updateDisposition(disposition:"in_progress"|"completed"|"cancelled"){
  if(!token||!selected||!selected.isRequester||saving)return;
  const remark=closureRemark.trim();
  if(disposition!=="in_progress"&&remark.length<5){setError("Add a short closing remark (at least 5 characters).");return;}
  if(disposition==="in_progress"&&selected.requester_disposition!=="in_progress"&&remark.length<5){setError("Add a short remark explaining why you are reopening this request.");return;}
  setSaving(true);setError("");setNotice("");
  try{
   await api("/api/v1/network-plus/requests/"+encodeURIComponent(selected.id)+"/disposition",{method:"POST",headers:{"X-Idempotency-Key":key()},body:JSON.stringify({disposition,remark})},token);
   setClosureRemark("");setNotice(disposition==="in_progress"&&selected.requester_disposition!=="in_progress"?"Request reopened. Earlier closure history is preserved.":"Your connection outcome was saved separately from the platform request status.");
   const refreshed=await api<RequestRow>("/api/v1/network-plus/requests/"+encodeURIComponent(selected.id),{},token);setSelected(refreshed);await load();
  }catch(e){setError(e instanceof ApiError?e.message:"The disposition could not be saved. Refresh before retrying.");}
  finally{setSaving(false);}
 }
 async function refreshContactHandoff(){
  if(!token||!selected||!handoffPeerId)return;
  try{const result=await api<any>("/api/v1/network-plus/requests/"+encodeURIComponent(selected.id)+"/contact-handoff?peerUserId="+encodeURIComponent(handoffPeerId),{},token);setContactHandoff(result);}
  catch(e){setError(e instanceof ApiError?e.message:"Contact consent status could not be refreshed.");}
 }
 async function saveContactConsent(decision:"accept"|"decline"|"revoke",fieldOverride?:string){
  if(!token||!selected||!handoffPeerId)return;
  setSaving(true);setError("");setNotice("");
  try{const field=fieldOverride||contactField;const result=await api<any>("/api/v1/network-plus/requests/"+encodeURIComponent(selected.id)+"/contact-consent",{method:"POST",body:JSON.stringify({field,decision,value:decision==="accept"?contactValue:undefined,peerUserId:handoffPeerId})},token);setContactHandoff(result);setContactValue("");setNotice(decision==="accept"?"Your consent was saved. The selected contact field is released only after the other participant also consents.":"Your contact-sharing preference was updated.");}
  catch(e){setError(e instanceof ApiError?e.message:"Contact consent could not be updated.");}
  finally{setSaving(false);}
 }
 async function proposeMeeting(e:FormEvent){
  e.preventDefault();if(!token||!selected||!meetingDateTime)return;
  setSaving(true);setError("");setNotice("");
  try{const startsAt=meetingInstant(meetingDateTime,meetingTimezone);await api("/api/v1/network-plus/requests/"+encodeURIComponent(selected.id)+"/meetings",{method:"POST",headers:{"X-Idempotency-Key":key()},body:JSON.stringify({peerUserId:handoffPeerId||undefined,placeType:meetingPlace,placeDetails:meetingPlaceDetails,startsAt,timezone:meetingTimezone,durationMinutes:Number(meetingDuration)})},token);setNotice("Meeting proposal sent privately. It is not confirmed until the other participant accepts.");setMeetingDateTime("");await loadDetail(selected.id);}
  catch(e){setError(e instanceof ApiError?e.message:e instanceof Error?e.message:"Meeting proposal could not be sent.");}
  finally{setSaving(false);}
 }
 async function meetingResponse(meetingId:string,decision:"accept"|"counter"|"decline"){
  if(!token||!selected)return;
  setSaving(true);setError("");setNotice("");
  try{const body:any={decision};if(decision==="counter"){if(!meetingDateTime)throw new Error("Choose a valid alternative meeting time.");const startsAt=meetingInstant(meetingDateTime,meetingTimezone);Object.assign(body,{placeType:meetingPlace,placeDetails:meetingPlaceDetails,startsAt,timezone:meetingTimezone,durationMinutes:Number(meetingDuration)});}await api("/api/v1/network-plus/requests/"+encodeURIComponent(selected.id)+"/meetings/"+encodeURIComponent(meetingId)+"/respond",{method:"POST",body:JSON.stringify(body)},token);setNotice(decision==="accept"?"The meeting handoff is confirmed.":decision==="counter"?"Your alternative time was sent.":"The meeting proposal was declined.");await loadDetail(selected.id);}
  catch(e){setError(e instanceof ApiError?e.message:e instanceof Error?e.message:"Meeting response failed.");}
  finally{setSaving(false);}
 }

 async function answerQuestion(e:FormEvent){
  e.preventDefault();if(!token||!selected)return;
  setSaving(true);setError("");setNotice("");
  try{await api("/api/v1/network-plus/requests/"+encodeURIComponent(selected.id)+"/answer",{method:"POST",body:JSON.stringify({answer:questionAnswer})},token);setQuestionAnswer("");setNotice("Your answer was sent privately to the requester.");await loadDetail(selected.id);await load();}
  catch(e){setError(e instanceof ApiError?e.message:"The question could not be answered.");}
  finally{setSaving(false);}
 }
 async function askClarification(e:FormEvent){
  e.preventDefault();if(!token||!selected)return;
  setSaving(true);setError("");setNotice("");
  try{await api("/api/v1/network-plus/requests/"+encodeURIComponent(selected.id)+"/clarifications",{method:"POST",body:JSON.stringify({promptCode:clarificationTopic,question:clarificationQuestion})},token);setClarificationQuestion("");setNotice("Clarification sent privately to the requester.");await loadDetail(selected.id);await load();}
  catch(e){setError(e instanceof ApiError?e.message:"Clarification could not be sent.");}
  finally{setSaving(false);}
 }
 async function answerClarification(e:FormEvent,clarificationId:string){
  e.preventDefault();if(!token||!selected)return;
  setSaving(true);setError("");setNotice("");
  try{await api("/api/v1/network-plus/requests/"+encodeURIComponent(selected.id)+"/clarifications/"+encodeURIComponent(clarificationId)+"/respond",{method:"POST",body:JSON.stringify({answer:clarificationAnswer})},token);setClarificationAnswer("");setNotice("Your clarification was sent. The request returned to the recipient’s review queue.");await loadDetail(selected.id);await load();}
  catch(e){setError(e instanceof ApiError?e.message:"Clarification response could not be sent.");}
  finally{setSaving(false);}
 }
 async function enableWorkspace(){
  if(!token||!selected||saving)return;
  setSaving(true);setError("");setNotice("");
  try{
   await api("/api/v1/network-plus/requests/"+encodeURIComponent(selected.id)+"/workspace",{method:"POST",headers:{"X-Idempotency-Key":key()},body:JSON.stringify({})},token);
   const refreshed=await api<RequestRow>("/api/v1/network-plus/requests/"+encodeURIComponent(selected.id),{},token);
   setSelected(refreshed);
   const ws=await api<any>("/api/v1/network-plus/requests/"+encodeURIComponent(selected.id)+"/workspace",{},token);
   setWorkspaceData(ws);setNotice("Optional collaboration workspace enabled for this accepted request.");
   await load();
  }catch(e){setError(e instanceof ApiError?e.message:"The optional workspace could not be enabled.");}
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
 const canAccept=selected?.canAccept&&(selected?.status==="submitted"||selected?.status==="under_review"||selected?.status==="clarification_requested");
 const recipientPending=selected?.participants?.some(p=>p.participant_role==="recipient_representative"&&p.consent_status==="pending");
 const myRequests=items.filter(item=>item.is_requester===true);
 const visibleMyRequests=myRequests.filter(item=>{
  const disposition=item.requester_disposition||"in_progress";
  if(dispositionFilter==="awaiting")return ["submitted","under_review","clarification_requested"].includes(item.status);
  return dispositionFilter==="all"||disposition===dispositionFilter;
 });
 const receivedRequests=items.filter(item=>item.is_requester===false);


 return <NetworkPlusAccessGuard><main className="np-requests-workspace">
  <header className="grid gap-2"><div className="flex items-center gap-2"><Handshake className="h-5 w-5 text-[var(--accent)]" aria-hidden="true"/><div className="eyebrow">Network-Plus · Requests and collaboration</div></div><h1 className="h1">Requests that become collaboration only by agreement.</h1><p className="muted max-w-3xl">Create a typed request, submit it to the intended recipient, and wait for explicit acceptance. Submission is not a contract, commitment or active engagement. Private request records are visible only to participants and authorized support staff.</p></header>
  {error&&<div role="alert" className="rounded-xl border border-red-500/40 p-3 text-sm">{error}</div>}
  {notice&&<div role="status" className="rounded-xl border border-[var(--border)] p-3 text-sm">{notice}</div>}
  <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
   <section className="card grid content-start gap-4">
    <div><h2 className="h2">Start a request</h2><p className="muted text-sm">The recipient must be an eligible member or a verified organization with active authorized representatives.</p></div>
    <form className="grid gap-3" onSubmit={createDraft}>
     {isLightweight&&<div className="grid gap-2 rounded-xl border border-[var(--border)] p-3"><div className="flex items-center justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wide muted">Step {requestStep} of 4</p><h3 className="font-semibold">{requestStepNames[requestStep-1]}</h3></div><span className="text-sm font-semibold tabular-nums">{requestStep*25}%</span></div><div role="progressbar" aria-label="Request wizard progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={requestStep*25} className="h-1.5 overflow-hidden rounded-full bg-[var(--surface)]"><div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{width:(requestStep*25)+"%"}}/></div><div className="grid grid-cols-4 gap-1">{requestStepNames.map((name,index)=><span key={name} className={index+1===requestStep?"text-xs font-semibold":"text-xs muted"}>{index+1}. {name}</span>)}</div></div>}
     {(!isLightweight||requestStep===1)&&<label className="grid gap-1 text-sm font-medium">Request type<select className="input" value={intent} onChange={e=>{setIntent(e.target.value as Intent);setRequestStep(1);}}>{intents.map(v=><option key={v.value} value={v.value}>{v.label}</option>)}</select><span className="muted text-xs">{currentIntent?.description}</span></label>}
     {isLightweight&&requestStep===1&&<div className="flex items-start gap-3 rounded-xl bg-[var(--surface)] p-3">{intent==="interest"?<Heart className="mt-0.5 h-5 w-5 text-[var(--accent)]"/>:intent==="question"?<MessageCircle className="mt-0.5 h-5 w-5 text-[var(--accent)]"/>:intent==="quote_request"?<Quote className="mt-0.5 h-5 w-5 text-[var(--accent)]"/>:<CalendarDays className="mt-0.5 h-5 w-5 text-[var(--accent)]"/>}<div><strong>{currentIntent?.label}</strong><p className="muted text-sm">{currentIntent?.description}</p></div></div>}
     {(!isLightweight||requestStep===3)&&<fieldset className="grid gap-2 rounded-xl border p-3"><legend className="px-1 font-semibold">Choose a recipient</legend>
      <p className="muted text-xs">For a business or service request, select a published business or listing. The server resolves its authorized owner/representatives from canonical ownership records; private owner IDs are not exposed.</p>
      <label className="grid gap-1 text-sm">Published business<select className="input" value={businessId} onChange={e=>{setBusinessId(e.target.value);setServiceListingId("");setRecipientUserId("");setRecipientOrganizationId("");}}><option value="">Select a business (optional)</option>{businessChoices.map(item=><option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Published professional service<select className="input" value={serviceListingId} onChange={e=>{const item=serviceChoices.find(v=>v.id===e.target.value);setServiceListingId(e.target.value);if(item)setBusinessId(item.business_id);setRecipientUserId("");setRecipientOrganizationId("");}}><option value="">Select a service listing (optional)</option>{serviceListingId&&!serviceChoices.some(item=>item.id===serviceListingId)&&<option value={serviceListingId}>Selected opportunity listing</option>}{serviceChoices.map(item=><option key={item.id} value={item.id}>{item.title} · {item.business_name}</option>)}</select></label>
      <div className="grid gap-2 border-t pt-2"><label className="grid gap-1 text-sm">Find a verified member recipient<input className="input" value={memberQuery} onChange={e=>setMemberQuery(e.target.value)} placeholder="Search opted-in professionals"/></label><button type="button" className="btn btn-secondary w-fit" onClick={()=>void searchMembers()}>Search members</button><select aria-label="Member recipient" className="input" value={recipientUserId} onChange={e=>{setRecipientUserId(e.target.value);setRecipientOrganizationId("");setBusinessId("");setServiceListingId("");}}><option value="">No direct member recipient selected</option>{memberChoices.map(item=><option key={item.user_id} value={item.user_id}>{item.display_name}{item.professional_title?" · "+item.professional_title:""}</option>)}</select></div>
      <div className="grid gap-2 border-t pt-2"><label className="grid gap-1 text-sm">Find a verified organization recipient<input className="input" value={organizationQuery} onChange={e=>setOrganizationQuery(e.target.value)} placeholder="Search opted-in organizations"/></label><button type="button" className="btn btn-secondary w-fit" onClick={()=>void searchOrganizations()}>Search organizations</button><select aria-label="Organization recipient" className="input" value={recipientOrganizationId} onChange={e=>{setRecipientOrganizationId(e.target.value);setRecipientUserId("");setBusinessId("");setServiceListingId("");}}><option value="">No direct organization recipient selected</option>{organizationChoices.map(item=><option key={item.id} value={item.id}>{item.display_name}</option>)}</select></div>
     </fieldset>}
     {(!isLightweight||requestStep===2)&&<>
     <label className="grid gap-1 text-sm">Subject<input required minLength={3} maxLength={180} className="input" value={subject} onChange={e=>setSubject(e.target.value)}/></label>
     <label className="grid gap-1 text-sm">Request summary<textarea required minLength={10} maxLength={500} className="input min-h-20" value={summary} onChange={e=>setSummary(e.target.value)}/></label>
     </>}
     {!isLightweight&&<>
     {intent==="service_request"&&<fieldset className="grid gap-3 rounded-xl border p-3"><legend className="px-1 font-semibold">Service engagement details</legend>
      <label className="grid gap-1 text-sm">Scope<textarea required className="input min-h-20" value={scope} onChange={e=>setScope(e.target.value)}/></label>
      <label className="grid gap-1 text-sm">Deliverables (one per line)<textarea required className="input min-h-20" value={deliverables} onChange={e=>setDeliverables(e.target.value)}/></label>
      <label className="grid gap-1 text-sm">Pricing / quotation<input required className="input" value={pricing} onChange={e=>setPricing(e.target.value)}/></label>
      <label className="grid gap-1 text-sm">Schedule<textarea className="input" value={schedule} onChange={e=>setSchedule(e.target.value)} placeholder="Leave blank to agree schedule with recipient"/></label>
     </fieldset>}
     {intent==="business_opportunity"&&<fieldset className="grid gap-3 rounded-xl border p-3"><legend className="px-1 font-semibold">Opportunity details</legend>
      <label className="grid gap-1 text-sm">Opportunity type<input required className="input" value={opportunityType} onChange={e=>setOpportunityType(e.target.value)} placeholder="Grant, seed support, accelerator, programme"/></label>
      <label className="grid gap-1 text-sm">Eligibility<textarea required className="input min-h-20" value={eligibility} onChange={e=>setEligibility(e.target.value)}/></label>
      <label className="grid gap-1 text-sm">Selection process<textarea required className="input min-h-20" value={selectionProcess} onChange={e=>setSelectionProcess(e.target.value)}/></label>
      <label className="grid gap-1 text-sm">Deadline<input type="date" className="input" value={opportunityDeadline} onChange={e=>setOpportunityDeadline(e.target.value)}/></label>
      <label className="grid gap-1 text-sm">Value / compensation (optional)<input className="input" value={opportunityValue} onChange={e=>setOpportunityValue(e.target.value)}/></label>
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
     </>}
     {isLightweight&&requestStep===4&&<div className="grid gap-2 rounded-xl border border-[var(--border)] p-3"><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-[var(--accent)]"/><h3 className="font-semibold">Review your connection request</h3></div><p className="muted text-xs">This saves a private draft. Nothing is sent until you submit it from the request details.</p><dl className="grid gap-2 text-sm"><div><dt className="muted text-xs">Action</dt><dd className="font-semibold">{currentIntent?.label}</dd></div><div><dt className="muted text-xs">Subject</dt><dd>{subject}</dd></div><div><dt className="muted text-xs">Summary</dt><dd>{summary}</dd></div><div><dt className="muted text-xs">Recipient</dt><dd>{selectedRecipientLabel}</dd></div></dl></div>}
     {isLightweight&&<div className="flex items-center justify-between gap-2">{requestStep>1?<button type="button" className="btn btn-secondary" onClick={previousRequestStep}>Back</button>:<span/>}{requestStep<4&&<button type="button" className="btn btn-primary" onClick={continueRequestStep}>Continue</button>}</div>}
     {(!isLightweight||requestStep===4)&&<button type="submit" className="btn btn-primary w-fit" disabled={saving}>{saving?"Saving…":"Save draft"}</button>}
    </form>
   </section>
   <section className="grid content-start gap-4">
    <div className="card grid gap-3"><div className="flex items-center justify-between gap-3"><h2 className="h2">My Requests</h2><button type="button" className="btn btn-ghost" onClick={()=>void load()}>Refresh</button></div>
     <div className="flex flex-wrap gap-2" role="group" aria-label="Filter my requests">{[{value:"in_progress",label:"In progress"},{value:"awaiting",label:"Awaiting response"},{value:"completed",label:"Completed"},{value:"cancelled",label:"Cancelled"},{value:"all",label:"All"}].map(tab=><button key={tab.value} type="button" className={dispositionFilter===tab.value?"btn btn-primary":"btn btn-ghost"} aria-pressed={dispositionFilter===tab.value} onClick={()=>setDispositionFilter(tab.value)}>{tab.label}</button>)}</div>
     {loading?<p className="muted">Loading requests…</p>:myRequests.length===0?<p className="muted">No initiated requests yet. Every submitted connection request will remain here, even if its listing is later removed.</p>:visibleMyRequests.length===0?<p className="muted">No requests in this view.</p>:<ul className="grid gap-2">{visibleMyRequests.map(item=><li key={item.id}><button type="button" className={"w-full rounded-xl border p-3 text-left "+(selectedId===item.id?"border-[var(--accent)]":"border-[var(--border)]")} onClick={()=>setSelectedId(item.id)}><span className="flex flex-wrap items-center justify-between gap-2"><strong>{item.subject}</strong><span className="rounded-full bg-[var(--surface)] px-2 py-1 text-xs">{label(item.requester_disposition||"in_progress")}</span></span><span className="mt-1 block text-xs text-[var(--muted)]">{label(item.intent)} · {label(item.status)} · {item.summary}</span>{item.recipient_label&&<span className="mt-1 block text-xs muted">With {item.recipient_label}</span>}{item.requester_disposition_remark&&<span className="mt-1 block text-xs muted">Last remark: {item.requester_disposition_remark}</span>}<span className="mt-1 block text-xs muted">Updated {new Date(item.updated_at).toLocaleDateString()}</span>{item.review_due_at&&<span className="mt-1 block text-xs muted">Review due {new Date(item.review_due_at).toLocaleDateString()}</span>}</button></li>)}</ul>}
    </div>
    {receivedRequests.length>0&&<div className="card grid gap-2"><h2 className="h2">Requests received</h2><ul className="grid gap-2">{receivedRequests.map(item=><li key={item.id}><button type="button" className="w-full rounded-xl border border-[var(--border)] p-3 text-left" onClick={()=>setSelectedId(item.id)}><strong>{item.subject}</strong><span className="block text-xs muted">{label(item.intent)} · {label(item.status)}{item.requester_label?" · From "+item.requester_label:""}</span></button></li>)}</ul></div>}
    {selected&&<section className="card grid gap-4" aria-live="polite">
     <div><div className="eyebrow">{label(selected.intent)}</div><h2 className="h2">{selected.subject}</h2><p className="muted">{selected.summary}</p><p className="mt-2 text-sm font-semibold">Status: {label(selected.status)}</p></div>
     {selected.status==="draft"&&selected.isRequester&&<button type="button" className="btn btn-primary w-fit" disabled={saving} onClick={()=>void action("/submit")}><Send className="mr-1 h-4 w-4"/>Submit request</button>}
     {selected.isRequester&&selected.status!=="draft"&&<div className="rounded-xl border border-[var(--border)] p-3 grid gap-3"><div><h3 className="font-semibold">Your connection outcome</h3><p className="muted text-sm">This is your report about the connection—not a verified sale, contract, investment or payment. Platform request status is shown separately above.</p><p className="mt-1 text-sm">Current disposition: <strong>{label(selected.requester_disposition||"in_progress")}</strong></p>{selected.requester_disposition_remark&&<p className="mt-1 text-sm muted">Last remark: {selected.requester_disposition_remark}</p>}</div><label className="grid gap-1 text-sm">Short remark <textarea className="input min-h-20" maxLength={500} value={closureRemark} onChange={e=>setClosureRemark(e.target.value)} placeholder="What happened with this connection? Avoid private negotiation or transaction details." /></label><div className="flex flex-wrap gap-2"><button type="button" className="btn btn-secondary" disabled={saving} onClick={()=>void updateDisposition("in_progress")}>{selected.requester_disposition==="completed"||selected.requester_disposition==="cancelled"?"Reopen as In progress":"Keep In progress"}</button><button type="button" className="btn btn-primary" disabled={saving} onClick={()=>void updateDisposition("completed")}>Mark Completed</button><button type="button" className="btn btn-ghost" disabled={saving} onClick={()=>void updateDisposition("cancelled")}>Cancel request outcome</button></div><p className="text-xs muted">Completed and Cancelled require a short remark. Reopening a closed item also requires a remark; earlier history remains below.</p></div>}
     {selected.canReview&&selected.status==="submitted"&&<button type="button" className="btn btn-secondary w-fit" disabled={saving} onClick={()=>void action("/transitions",{status:"under_review"})}><Clock3 className="mr-1 h-4 w-4"/>Mark under review</button>}     {selected.isRecipientRepresentative&&["accepted","in_progress","disputed"].includes(selected.status)&&<div className="rounded-xl border border-[var(--border)] p-3 grid gap-2"><h3 className="font-semibold">Withdraw from this connection</h3><label className="grid gap-1 text-sm">Reason <textarea className="input min-h-16" maxLength={500} value={recipientWithdrawalReason} onChange={e=>setRecipientWithdrawalReason(e.target.value)} placeholder="Briefly explain why the recipient is withdrawing." /></label><button type="button" className="btn btn-ghost w-fit" disabled={saving||recipientWithdrawalReason.trim().length<5} onClick={()=>void action("/transitions",{status:"recipient_withdrawn",reason:recipientWithdrawalReason.trim()})}>Withdraw recipient acceptance</button></div>}{canAccept&&recipientPending&&<button type="button" className="btn btn-primary w-fit" disabled={saving} onClick={()=>void action("/transitions",{status:"accepted"})}><CheckCircle2 className="mr-1 h-4 w-4"/>Explicitly accept request</button>}{selected.canReview&&recipientPending&&<div className="flex flex-wrap gap-2"><button type="button" className="btn btn-secondary" disabled={saving} onClick={()=>void action("/transitions",{status:"declined",reason:"The recipient declined this request."})}><XCircle className="mr-1 h-4 w-4"/>Decline</button></div>}{selected.isRequester&&selected.status==="clarification_requested"&&!(selected.clarifications||[]).some((item:any)=>item.status==="open")&&<button type="button" className="btn btn-primary w-fit" disabled={saving} onClick={()=>void action("/transitions",{status:"submitted"})}>Resubmit clarified request</button>}{selected.isRequester&&["draft","submitted","under_review","clarification_requested"].includes(selected.status)&&<button type="button" className="btn btn-ghost w-fit" disabled={saving} onClick={()=>void action("/transitions",{status:"withdrawn"})}>Withdraw request</button>}{["accepted","disputed"].includes(selected.status)&&<button type="button" className="btn btn-secondary w-fit" disabled={saving} onClick={()=>void action("/transitions",{status:"in_progress"})}>Mark in progress</button>}{["accepted","in_progress","disputed"].includes(selected.status)&&<div className="flex flex-wrap gap-2"><button type="button" className="btn btn-secondary" disabled={saving} onClick={()=>void action("/transitions",{status:"disputed",reason:"A participant has raised a delivery or scope dispute."})}>Raise dispute</button><button type="button" className="btn btn-ghost" disabled={saving} onClick={()=>void action("/transitions",{status:"closed"})}>Close engagement</button></div>}{selected.status==="in_progress"&&<div className="grid gap-2"><label className="grid gap-1 text-sm">Completion evidence or documented not-applicable reason<textarea className="input min-h-20" required value={completionEvidence} onChange={e=>setCompletionEvidence(e.target.value)} placeholder="Summarize delivered outputs and link/reference evidence without private contact details"/></label><button type="button" className="btn btn-primary w-fit" disabled={saving||completionEvidence.trim().length<5} onClick={()=>void action("/transitions",{status:"completed",completionEvidence:[completionEvidence.trim()]})}>Submit completion for review</button></div>}{selected.status==="completed"&&<button type="button" className="btn btn-secondary w-fit" disabled={saving} onClick={()=>void action("/transitions",{status:"disputed",reason:"A participant disputes the recorded completion."})}>Dispute completion</button>}
     
     {selected.recipient_response&&<div className="rounded-xl border border-[var(--border)] p-3"><div className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-[var(--accent)]"/><strong>Recipient answer</strong></div><p className="mt-2 text-sm">{selected.recipient_response}</p></div>}
     {selected.canReview&&selected.intent==="question"&&["submitted","under_review"].includes(selected.status)&&!selected.recipient_response_at&&<form className="grid gap-2 rounded-xl border border-[var(--border)] p-3" onSubmit={answerQuestion}><div className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-[var(--accent)]"/><h3 className="font-semibold">Answer the question</h3></div><p className="muted text-xs">Send one private response. This does not release contact details or create an agreement.</p><textarea className="input min-h-20" required minLength={3} maxLength={2000} value={questionAnswer} onChange={e=>setQuestionAnswer(e.target.value)} placeholder="Write a concise answer to the requester"/><button className="btn btn-primary w-fit" disabled={saving}>Send answer</button></form>}
     {selected.canReview&&["submitted","under_review"].includes(selected.status)&&<form className="grid gap-2 rounded-xl border border-[var(--border)] p-3" onSubmit={askClarification}><div className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-[var(--accent)]"/><h3 className="font-semibold">Ask for clarification</h3></div><p className="muted text-xs">Choose a topic and ask one focused question. This is a private request response, not a chat thread.</p><select className="input" value={clarificationTopic} onChange={e=>setClarificationTopic(e.target.value)}><option value="scope">Scope</option><option value="budget">Budget</option><option value="timeline">Timeline</option><option value="quantity">Quantity</option><option value="location">Location</option><option value="availability">Availability</option><option value="eligibility">Eligibility</option><option value="other">Other</option></select><textarea className="input min-h-20" required minLength={3} maxLength={1200} value={clarificationQuestion} onChange={e=>setClarificationQuestion(e.target.value)} placeholder="What specific detail would help you decide?"/><button className="btn btn-secondary w-fit" disabled={saving}>Send clarification</button></form>}
     {(selected.clarifications||[]).map((item:any)=><div key={item.id} className="rounded-xl border border-[var(--border)] p-3"><div className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-[var(--accent)]"/><strong>Clarification · {label(item.prompt_code)}</strong><span className="ml-auto text-xs muted">{label(item.status)}</span></div><p className="mt-2 text-sm">{item.question}</p>{item.answer&&<p className="mt-2 rounded-lg bg-[var(--surface)] p-2 text-sm"><strong>Response:</strong> {item.answer}</p>}{selected.isRequester&&item.status==="open"&&selected.status==="clarification_requested"&&<form className="mt-3 grid gap-2" onSubmit={e=>void answerClarification(e,item.id)}><textarea className="input min-h-20" required minLength={3} maxLength={2000} value={clarificationAnswer} onChange={e=>setClarificationAnswer(e.target.value)} placeholder="Provide the requested clarification"/><button className="btn btn-primary w-fit" disabled={saving}>Send response</button></form>}</div>)}
     {selected.canHandoff&&["accepted","in_progress","completed","closed"].includes(selected.status)&&<section className="grid gap-3 rounded-xl border border-[var(--border)] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[var(--accent)]"/><h3 className="font-semibold">Contact sharing · field-by-field consent</h3></div><button type="button" className="btn btn-ghost text-xs" disabled={saving} onClick={()=>void refreshContactHandoff()}><RefreshCw className="mr-1 h-3.5 w-3.5"/>Refresh consent</button></div><p className="muted text-xs">Your contact values are encrypted. A field is released only after both participants accept that same field. You can revoke your consent later.</p>{selected.isRequester&&(selected.participants||[]).filter(p=>p.participant_role==="recipient_representative"&&p.consent_status==="accepted").length>1&&<label className="grid gap-1 text-sm">Recipient representative<select className="input" value={handoffPeerId} onChange={e=>setContactPeerId(e.target.value)}>{(selected.participants||[]).filter(p=>p.participant_role==="recipient_representative"&&p.consent_status==="accepted").map((p,i)=><option key={p.user_id} value={p.user_id}>Accepted representative {i+1}</option>)}</select></label>}<div className="grid gap-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"><label className="grid gap-1 text-sm">Contact field<select className="input" value={contactField} onChange={e=>setContactField(e.target.value)}><option value="email">Email</option><option value="phone">Phone</option><option value="whatsapp">WhatsApp</option><option value="website">Website</option><option value="business_location">Business location</option></select></label><label className="grid gap-1 text-sm">Your value<input className="input" type={contactField==="email"?"email":contactField==="phone"||contactField==="whatsapp"?"tel":contactField==="website"?"url":"text"} value={contactValue} onChange={e=>setContactValue(e.target.value)} placeholder={"Enter your "+label(contactField).toLowerCase()}/></label></div><div className="flex flex-wrap gap-2"><button type="button" className="btn btn-primary" disabled={saving||!contactValue.trim()||!handoffPeerId} onClick={()=>void saveContactConsent("accept")}><ShieldCheck className="mr-1 h-4 w-4"/>Consent to share</button><button type="button" className="btn btn-ghost" disabled={saving||!handoffPeerId} onClick={()=>void saveContactConsent("decline")}>Do not share</button></div><ul className="grid gap-2">{(contactHandoff.fields||[]).map((field:any)=><li key={field.field} className="rounded-lg bg-[var(--surface)] p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{label(field.field)}</strong><span className="text-xs muted">You: {label(field.yourStatus)} · Other party: {label(field.peerStatus)}</span></div>{field.sharedWithYou?<p className="mt-2 break-all"><CheckCircle2 className="mr-1 inline h-4 w-4 text-emerald-600"/>{field.sharedWithYou}</p>:<p className="muted mt-1 text-xs">{field.released?"Shared":"Not released — both parties must consent."}</p>}{field.yourStatus==="accepted"&&<button type="button" className="btn btn-ghost mt-1 text-xs" disabled={saving} onClick={()=>void saveContactConsent("revoke",field.field)}>Revoke {label(field.field)} consent</button>}</li>)}</ul></section>}
     {selected.canHandoff&&["accepted","in_progress"].includes(selected.status)&&<section className="grid gap-3 rounded-xl border border-[var(--border)] p-3"><div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[var(--accent)]"/><h3 className="font-semibold">First meeting handoff</h3></div><p className="muted text-xs">Agree one meeting time. Network-Plus does not manage attendance or recurring calendars.</p>{(selected.meetings||[]).map((meeting:any)=>{const isProposer=selected.isRequester?meeting.proposer_user_id===selected.requester_user_id:meeting.proposer_user_id!==selected.requester_user_id;const canRespond=(meeting.status==="proposed"&&!isProposer)||(meeting.status==="countered"&&isProposer);return <div key={meeting.id} className="rounded-lg bg-[var(--surface)] p-3 text-sm"><div className="flex items-center justify-between gap-2"><strong>Meeting · {label(meeting.status)}</strong>{meeting.status==="confirmed"&&<CheckCircle2 className="h-4 w-4 text-emerald-600"/>}</div><p className="mt-1">{meetingTime(meeting.status==="confirmed"?meeting.confirmed_starts_at:meeting.status==="countered"?meeting.counter_starts_at:meeting.starts_at,meeting.status==="confirmed"?meeting.confirmed_timezone:meeting.status==="countered"?meeting.counter_timezone:meeting.timezone)} · {meeting.status==="confirmed"?meeting.confirmed_timezone:meeting.status==="countered"?meeting.counter_timezone:meeting.timezone}</p><p className="muted">{label(meeting.status==="confirmed"?meeting.confirmed_place_type:meeting.status==="countered"?meeting.counter_place_type:meeting.place_type)} · {meeting.status==="confirmed"?meeting.confirmed_duration_minutes:meeting.status==="countered"?meeting.counter_duration_minutes:meeting.duration_minutes} minutes</p>{canRespond&&<div className="mt-2 flex flex-wrap gap-2"><button type="button" className="btn btn-primary" disabled={saving} onClick={()=>void meetingResponse(meeting.id,"accept")}>Accept time</button><button type="button" className="btn btn-ghost" disabled={saving} onClick={()=>void meetingResponse(meeting.id,"decline")}>Decline</button></div>}</div>;})}{!(selected.meetings||[]).some((meeting:any)=>["proposed","countered","confirmed"].includes(meeting.status))&&<form className="grid gap-2" onSubmit={proposeMeeting}><label className="grid gap-1 text-sm">Meeting place<select className="input" value={meetingPlace} onChange={e=>setMeetingPlace(e.target.value)}><option value="office">Business office</option><option value="coffee">Coffee shop / public place</option><option value="online">Online</option><option value="other">Other agreed place</option></select></label><input className="input" value={meetingPlaceDetails} onChange={e=>setMeetingPlaceDetails(e.target.value)} maxLength={500} placeholder="Optional public place details; do not enter private contact information"/><label className="grid gap-1 text-sm">Date and time<input className="input" type="datetime-local" required value={meetingDateTime} onChange={e=>setMeetingDateTime(e.target.value)}/></label><div className="grid grid-cols-2 gap-2"><label className="grid gap-1 text-sm">Duration<select className="input" value={meetingDuration} onChange={e=>setMeetingDuration(e.target.value)}>{["15","30","45","60","90","120"].map(v=><option key={v} value={v}>{v} minutes</option>)}</select></label><label className="grid gap-1 text-sm">Timezone<input className="input" value={meetingTimezone} onChange={e=>setMeetingTimezone(e.target.value)} placeholder="Africa/Addis_Ababa"/></label></div><button className="btn btn-primary w-fit" disabled={saving||!handoffPeerId}><CalendarDays className="mr-1 h-4 w-4"/>Propose meeting</button></form>}{(selected.meetings||[]).some((meeting:any)=>meeting.status==="proposed"&&(selected.isRequester?meeting.proposer_user_id!==selected.requester_user_id:meeting.proposer_user_id===selected.requester_user_id))&&<form className="grid gap-2 border-t pt-3" onSubmit={e=>{e.preventDefault();const meeting=selected.meetings?.find((m:any)=>m.status==="proposed");if(meeting)void meetingResponse(meeting.id,"counter");}}><strong>Suggest another time</strong><input className="input" type="datetime-local" required value={meetingDateTime} onChange={e=>setMeetingDateTime(e.target.value)}/><button className="btn btn-secondary w-fit" disabled={saving}>Send alternative time</button></form>}</section>}
{selected.status==="draft"&&<p className="muted text-sm">This is a private draft. It has not been sent to the recipient.</p>}
     {selected.status==="submitted"&&<p className="muted text-sm">Awaiting the recipient’s explicit decision. No agreement or workspace exists yet.</p>}
     {!selected.workspace&&["accepted","in_progress","disputed"].includes(selected.status)&&!["referral","business_opportunity","interest","question","quote_request","meeting_request"].includes(selected.intent)&&(selected.isRequester||selected.isRecipientRepresentative)&&<div className="border-t pt-3"><p className="muted text-sm">This connection can stay lightweight. A shared workspace is optional and starts only when an accepted participant chooses it.</p><button type="button" className="btn btn-secondary mt-2" disabled={saving} onClick={()=>void enableWorkspace()}>Start optional collaboration workspace</button></div>}
     {selected.workspace&&<div className="grid gap-3 border-t pt-4"><div><h3 className="h2">Collaboration workspace</h3><p className="muted text-sm">Optional shared workspace enabled by an accepted participant. {selected.workspace.purpose}</p></div>
      <form className="grid gap-2" onSubmit={e=>{e.preventDefault();void addMilestone();}}><h4 className="font-semibold">Add milestone</h4><input className="input" required value={milestoneTitle} onChange={e=>setMilestoneTitle(e.target.value)} placeholder="Milestone title"/><input className="input" type="date" value={milestoneDue} onChange={e=>setMilestoneDue(e.target.value)}/><button type="submit" className="btn btn-secondary w-fit" disabled={saving}>Add milestone</button></form>
      <form className="grid gap-2" onSubmit={e=>{e.preventDefault();void workspaceEvent();}}><h4 className="font-semibold">Record collaboration update</h4><select className="input" value={updateType} onChange={e=>setUpdateType(e.target.value)}><option value="update">Progress update</option><option value="blocker">Blocker</option><option value="decision">Decision</option><option value="outcome">Outcome</option></select><input className="input" required value={updateTitle} onChange={e=>setUpdateTitle(e.target.value)} placeholder="Update title"/><textarea className="input min-h-20" required value={updateBody} onChange={e=>setUpdateBody(e.target.value)} placeholder="Describe the update"/><button type="submit" className="btn btn-secondary w-fit" disabled={saving}>Save update</button></form>
      <ul className="grid gap-2">{(workspaceData?.milestones||[]).map((milestone:any)=><li key={milestone.id} className="rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{milestone.title}</strong><span className="text-xs">{label(milestone.status)}</span></div><p className="muted text-xs">{milestone.due_at?new Date(milestone.due_at).toLocaleDateString():"No due date"}</p><select className="input mt-2" aria-label={"Update "+milestone.title+" status"} value={milestone.status} onChange={async e=>{try{await api("/api/v1/network-plus/requests/"+selected.id+"/workspace/milestones/"+milestone.id,{method:"PATCH",body:JSON.stringify({status:e.target.value})},token);await loadDetail(selected.id);}catch(err){setError(err instanceof ApiError?err.message:"Milestone update failed.");}}}><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></li>)}{(workspaceData?.events||[]).map((event:any,i:number)=><li key={i} className="rounded-lg border p-3"><strong>{label(event.event_type||"Update")}: {event.title}</strong><p className="text-sm">{event.body}</p></li>)}</ul>
     </div>}
     <div className="border-t pt-3"><h3 className="font-semibold">Request history</h3><ol className="mt-2 grid gap-2">{(selected.events||[]).map((event:any,i)=><li key={i} className="text-sm"><span className="font-medium">{label(event.event_code)}</span> <span className="muted">{event.to_status? "→ "+label(event.to_status):""}</span>{event.metadata?.disposition&&<p className="muted mt-1">{label(event.metadata.previousDisposition||"")} → {label(event.metadata.disposition)}{event.metadata.remark?": "+event.metadata.remark:""}</p>}{event.event_code==="request.review_reminder_sent"&&<p className="muted mt-1">A review reminder was sent to you.</p>}</li>)}</ol></div>
    </section>}
   </section>
  </div>
 </main></NetworkPlusAccessGuard>;
}
