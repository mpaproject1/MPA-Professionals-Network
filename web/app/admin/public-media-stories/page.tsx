"use client";

import Link from "next/link";
import {useCallback,useEffect,useState} from "react";
import {FormFeedback} from "../../../components/form-feedback";
import {Badge,Card} from "../../../components/ui";
import {ApiError,api} from "../../../lib/api";
import {useUiStore} from "../../../lib/store";

type Story={id:string;service_listing_id?:string|null;mentor_profile_id?:string|null;author_user_id:string;author_display_name?:string;title:string;summary:string;transcript:string;video_url:string;attribution_mode:"named"|"anonymous";attribution_name?:string|null;evidence_status:string;consent_version:string;consented_at:string;moderation_status:string;moderation_note?:string|null;created_at:string;subject_title?:string|null};

export default function PublicMediaStoriesAdminPage(){
 const token=useUiStore(s=>s.token);const hydrateToken=useUiStore(s=>s.hydrateToken);
 const [status,setStatus]=useState("pending");const [stories,setStories]=useState<Story[]>([]);
 const [notes,setNotes]=useState<Record<string,string>>({});const [busyId,setBusyId]=useState("");
 const [loading,setLoading]=useState(false);const [error,setError]=useState("");const [notice,setNotice]=useState("");
 const load=useCallback(async()=>{
  if(!token)return;setLoading(true);setError("");
  try{const rows=await api<Story[]>("/api/v1/admin/public-media-stories?status="+encodeURIComponent(status),{},token);setStories(Array.isArray(rows)?rows:[]);}
  catch(cause){setStories([]);setError(cause instanceof ApiError?cause.message:"The public story moderation queue could not be confirmed.");}
  finally{setLoading(false);}
 },[status,token]);
 useEffect(()=>{hydrateToken();},[hydrateToken]);useEffect(()=>{if(token)void load();},[load,token]);
 async function review(story:Story,next:"approved"|"rejected"){
  const note=(notes[story.id]||"").trim();if(next==="rejected"&&note.length<4){setError("Add a clear moderation reason before rejecting a story.");return;}
  setBusyId(story.id);setError("");setNotice("");
  try{await api("/api/v1/admin/public-media-stories/"+encodeURIComponent(story.id)+"/review",{method:"PATCH",body:JSON.stringify({status:next,note:note||undefined})},token);setNotice("Story "+(next==="approved"?"approved for public display.":"rejected and kept private."));await load();}
  catch(cause){setError(cause instanceof ApiError?cause.message:"The moderation decision could not be confirmed.");}
  finally{setBusyId("");}
 }
 return <main className="page-shell" style={{maxWidth:1100,margin:"0 auto",padding:"28px 18px"}}>
  <Link className="text-link" href="/admin">← Back to administration</Link>
  <div className="eyebrow" style={{marginTop:16}}>Support Desk · Moderated public media</div>
  <h1 className="h1">Participant video stories</h1>
  <p className="muted">Only authorized Support Desk or system administrator roles can review this queue. Confirm explicit consent, the video URL, transcript/captions, attribution and that the story is labelled participant-reported. Do not infer causation or publish private feedback.</p>
  {error&&<FormFeedback kind="error" message={error} onRetry={()=>void load()} retryLabel="Retry moderation queue"/>}
  {notice&&<FormFeedback kind="success" message={notice}/>}
  {!token?<Card><p>Sign in with an authorized moderation account to review public stories.</p><Link className="btn btn-primary" href="/login?next=/admin/public-media-stories">Sign in</Link></Card>:<Card>
   <div className="row" style={{justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
    <label>Moderation status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="pending">Pending review</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label>
    <button className="btn btn-ghost" type="button" disabled={loading} onClick={()=>void load()}>{loading?"Refreshing…":"Refresh queue"}</button>
   </div>
   {loading&&<p className="muted" role="status">Loading persisted stories…</p>}
   {!loading&&!stories.length&&!error&&<p className="muted">No stories are waiting in this queue for the selected status.</p>}
   <div className="grid" style={{gap:14,marginTop:12}}>
    {stories.map(story=><Card key={story.id}>
     <div className="row" style={{justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap"}}><div><h2 className="h2">{story.title}</h2><p className="muted">{story.subject_title||"Listing unavailable"} · Submitted by {story.author_display_name||"participant"} · {new Date(story.created_at).toLocaleString()}</p></div><Badge>{story.moderation_status.replaceAll("_"," ")}</Badge></div>
     <p>{story.summary}</p><p className="tagline">Attribution: {story.attribution_mode==="anonymous"?"Anonymous":story.attribution_name||"Named"} · Evidence: participant-reported · Consent version: {story.consent_version}</p>
     <p><a className="text-link" href={story.video_url} target="_blank" rel="noopener noreferrer">Open video URL in a new tab</a></p>
     <details><summary className="btn btn-ghost" style={{display:"inline-flex",cursor:"pointer"}}>Review transcript / captions</summary><p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{story.transcript}</p></details>
     <label>Moderation note<textarea rows={2} maxLength={1000} value={notes[story.id]||story.moderation_note||""} onChange={e=>setNotes(v=>({...v,[story.id]:e.target.value}))} placeholder="Record any reason or review notes."/></label>
     {story.moderation_status==="pending"&&<div className="row" style={{gap:8,flexWrap:"wrap",marginTop:12}}><button className="btn btn-primary" type="button" disabled={Boolean(busyId)} onClick={()=>void review(story,"approved")}>{busyId===story.id?"Saving…":"Approve for publication"}</button><button className="btn btn-ghost" type="button" disabled={Boolean(busyId)} onClick={()=>void review(story,"rejected")}>Reject and keep private</button></div>}
    </Card>)}
   </div>
  </Card>}
 </main>;
}
