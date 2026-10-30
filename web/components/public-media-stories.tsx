"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../lib/api";
import { Card } from "./ui";

type SubjectType="service"|"mentor";
type PublicStory={id:string;title:string;summary:string;transcript:string;video_url:string;attribution_mode:"named"|"anonymous";attribution_name?:string|null;evidence_status:"participant_reported";created_at:string};
type OwnStory={id:string;service_listing_id?:string|null;mentor_profile_id?:string|null;title:string;moderation_status:string;moderation_note?:string|null;consented_at:string;consent_withdrawn_at?:string|null;created_at:string};

const CONSENT_VERSION="public-media-story-v1";
export function PublicMediaStories({subjectType,subjectId,token}:{subjectType:SubjectType;subjectId:string;token?:string|null}){
 const [stories,setStories]=useState<PublicStory[]>([]);
 const [mine,setMine]=useState<OwnStory[]>([]);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [title,setTitle]=useState("");
 const [summary,setSummary]=useState("");
 const [transcript,setTranscript]=useState("");
 const [videoUrl,setVideoUrl]=useState("");
 const [attributionMode,setAttributionMode]=useState<"named"|"anonymous">("anonymous");
 const [attributionName,setAttributionName]=useState("");
 const [consentGiven,setConsentGiven]=useState(false);
 const [withdrawingId,setWithdrawingId]=useState("");
 const [submissionKey,setSubmissionKey]=useState("");
 const [submissionUncertain,setSubmissionUncertain]=useState(false);
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  const path=subjectType==="service"?"/api/v1/services/"+encodeURIComponent(subjectId)+"/stories":"/api/v1/mentors/"+encodeURIComponent(subjectId)+"/stories";
  try{const rows=await api<PublicStory[]>(path,{},token||undefined);setStories(Array.isArray(rows)?rows:[]);}
  catch(e){setStories([]);setError(e instanceof ApiError?e.message:"Approved stories could not be loaded.");}
  if(token){
   try{const params=new URLSearchParams({subjectType,subjectId});const own=await api<OwnStory[]>("/api/v1/me/public-media-stories?"+params.toString(),{},token);setMine(Array.isArray(own)?own:[]);}
   catch(e){setMine([]);setError(current=>current||(e instanceof ApiError?e.message:"Your consent records could not be loaded."));}
  }else setMine([]);
  setLoading(false);
 },[subjectType,subjectId,token]);
 useEffect(()=>{void load();},[load]);
 async function submit(e:FormEvent){
  e.preventDefault();if(!token||saving)return;
  setSaving(true);setError("");setNotice("");
  try{
   const path=subjectType==="service"?"/api/v1/services/"+encodeURIComponent(subjectId)+"/stories":"/api/v1/mentors/"+encodeURIComponent(subjectId)+"/stories";
   const key=submissionKey||crypto.randomUUID();if(!submissionKey)setSubmissionKey(key);
   await api(path,{method:"POST",headers:{"x-idempotency-key":key},body:JSON.stringify({title,summary,transcript,videoUrl,attributionMode,attributionName:attributionMode==="named"?attributionName:null,consentGiven,consentVersion:CONSENT_VERSION})},token);
   setSubmissionKey("");setSubmissionUncertain(false);
   setTitle("");setSummary("");setTranscript("");setVideoUrl("");setAttributionName("");setAttributionMode("anonymous");setConsentGiven(false);
   setNotice("Story submitted for moderation. It will not appear publicly unless approved; it is labelled participant-reported.");
   await load();
  }catch(e){const uncertain=e instanceof ApiError&&(e.status===0||e.status>=500||e.code==="INVALID_RESPONSE");setSubmissionUncertain(uncertain);if(!uncertain)setSubmissionKey("");setError(e instanceof ApiError?e.message:"Story submission failed. Your consent and story were not confirmed as saved.");}
  finally{setSaving(false);}
 }
 async function withdraw(storyId:string){
  if(!token||withdrawingId)return;
  setWithdrawingId(storyId);setError("");setNotice("");
  try{await api("/api/v1/public-media-stories/"+encodeURIComponent(storyId)+"/withdraw",{method:"POST"},token);setNotice("Publication consent withdrawn. The story is no longer public.");await load();}
  catch(e){setError(e instanceof ApiError?e.message:"Consent withdrawal could not be confirmed.");}
  finally{setWithdrawingId("");}
 }
 return <section className="grid" style={{gap:12,marginTop:18}} aria-labelledby={"public-stories-"+subjectType}>
  <div><h2 className="h2" id={"public-stories-"+subjectType}>Stories & outcomes</h2><p className="muted">Stories are optional. Videos open on their provider page; nothing autoplays. Published accounts are participant-reported, not proof of causation.</p></div>
  {loading?<Card><p className="muted" role="status">Loading approved stories…</p></Card>:stories.length?stories.map(story=><Card key={story.id}>
   <div className="grid" style={{gap:8}}><h3 className="h2">{story.title}</h3><p>{story.summary}</p><div className="tagline">{story.attribution_mode==="anonymous"?"Anonymous participant":story.attribution_name||"Participant"} · Participant-reported</div><a className="btn btn-primary" href={story.video_url} target="_blank" rel="noopener noreferrer">Watch video story</a><details><summary className="btn btn-ghost" style={{display:"inline-flex",cursor:"pointer"}}>Read transcript / captions</summary><p className="muted" style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{story.transcript}</p></details></div>
  </Card>):<Card><p className="muted">No approved stories yet. A story is never required for a listing or mentor profile.</p></Card>}
  {token&&<Card><h3 className="h2">Share your experience</h3><p className="muted">Only participants with a completed, accepted service engagement or completed mentorship can submit. Your story stays private until moderator approval. You can withdraw consent later.</p>
   <form className="form-stack" onSubmit={submit}>
    <label>Story title<input disabled={saving||submissionUncertain} required minLength={4} maxLength={120} value={title} onChange={e=>setTitle(e.target.value)} /></label>
    <label>What outcome did you experience?<textarea disabled={saving||submissionUncertain} required minLength={20} maxLength={1200} rows={3} value={summary} onChange={e=>setSummary(e.target.value)} placeholder="Describe your experience in your own words." /></label>
    <label>Video URL (YouTube or Vimeo)<input disabled={saving||submissionUncertain} required type="url" inputMode="url" maxLength={2048} value={videoUrl} onChange={e=>setVideoUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" /></label>
    <label>Transcript or captions<textarea disabled={saving||submissionUncertain} required minLength={20} maxLength={12000} rows={4} value={transcript} onChange={e=>setTranscript(e.target.value)} placeholder="Provide a transcript or captions for accessibility." /></label>
    <label>Public attribution<select disabled={saving||submissionUncertain} value={attributionMode} onChange={e=>setAttributionMode(e.target.value as "named"|"anonymous")}><option value="anonymous">Anonymous participant</option><option value="named">Use an approved display name</option></select></label>
    {attributionMode==="named"&&<label>Display name<input disabled={saving||submissionUncertain} required minLength={1} maxLength={120} value={attributionName} onChange={e=>setAttributionName(e.target.value)} /></label>}
    <label className="row" style={{alignItems:"flex-start",gap:10}}><input disabled={saving||submissionUncertain} type="checkbox" required checked={consentGiven} onChange={e=>setConsentGiven(e.target.checked)} /><span>I explicitly consent to public publication of this video URL, story summary, transcript and selected attribution after moderation. I understand this is my reported experience, and I can withdraw publication consent.</span></label>
    <button className="btn btn-primary" type="submit" disabled={saving}>{saving?"Submitting…":submissionUncertain?"Retry same submission":"Submit story for review"}</button>
   </form>
   {mine.length>0&&<div className="grid" style={{gap:8,marginTop:16}}><h4 className="h2">Your stories and consent</h4>{mine.map(story=><div className="case-row" key={story.id}><b>{story.title}</b><div className="tagline">Status: {story.moderation_status.replaceAll("_"," ")}{story.consent_withdrawn_at?" · consent withdrawn":""}</div>{story.moderation_note&&<p className="muted">{story.moderation_note}</p>}{!story.consent_withdrawn_at&&story.moderation_status!=="withdrawn"&&<button className="btn btn-ghost" type="button" disabled={Boolean(withdrawingId)} onClick={()=>void withdraw(story.id)}>{withdrawingId===story.id?"Withdrawing…":"Withdraw publication consent"}</button>}</div>)}</div>}
  </Card>}
  {error&&<p className="form-error" role="alert">{error}</p>}{notice&&<p className="form-success" role="status">{notice}</p>}
 </section>;
}
