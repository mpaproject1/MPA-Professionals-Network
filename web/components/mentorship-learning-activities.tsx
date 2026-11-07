"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import "./mentorship-learning.css";
import { FormFeedback } from "./form-feedback";
import { Badge, Card } from "./ui";

type Review = { id: string; decision: "accepted" | "changes_requested"; feedback: string; strengths?:string|null; areasToImprove?:string|null; recommendedNextAction?:string|null; furtherResources?:string|null; overallAssessment?:string|null; createdAt: string };
type Submission = { id: string; version: number; response: string; status: string; submittedAt: string; reviews: Review[] };
type Activity = { id: string; title: string; instructions: string; due_at?: string | null; status: string; goal_id?:string|null; goal_title?:string|null; submissions: Submission[] };
type Goal={id:string;title:string;status:string};

export function MentorshipLearningActivities({ mentorshipId, role, token }: { mentorshipId: string; role: "mentor" | "mentee"; token: string }) {
  const [activities, setActivities] = useState<Activity[]>([]);\n  const [goals,setGoals]=useState<Goal[]>([]);\n  const [goalId,setGoalId]=useState("");\n  const [view,setView]=useState<"assigned"|"review"|"completed">("assigned");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, {strengths:string;areasToImprove:string;recommendedNextAction:string;furtherResources:string;overallAssessment:string}>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api<Activity[]>(`/api/v1/mentorship/${encodeURIComponent(mentorshipId)}/activities`, {}, token);
      setActivities(Array.isArray(result) ? result : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your learning activities could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [mentorshipId, token]);

  useEffect(() => { void load(); }, [load]);

  async function createActivity(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy("create");
    setError("");
    try {
      await api(`/api/v1/mentorship/${encodeURIComponent(mentorshipId)}/activities`, {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), instructions: instructions.trim(), dueAt: dueAt ? new Date(dueAt).toISOString() : null, goalId:goalId||null }),
      }, token);
      setTitle("");
      setInstructions("");
      setDueAt("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The learning activity could not be saved.");
    } finally {
      setBusy("");
    }
  }

  async function submitWork(activityId: string) {
    if (busy) return;
    const response = (responses[activityId] || "").trim();
    if (response.length < 10) { setError("Describe your practical work in at least 10 characters."); return; }
    setBusy(activityId);
    setError("");
    try {
      await api(`/api/v1/mentorship-activities/${encodeURIComponent(activityId)}/submissions`, { method: "POST", body: JSON.stringify({ response }) }, token);
      setResponses(current => ({ ...current, [activityId]: "" }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your submission could not be saved.");
    } finally {
      setBusy("");
    }
  }

  async function reviewWork(submissionId: string, decision: "accepted" | "changes_requested") {
    if (busy) return;
    const assessment=feedback[submissionId]||{strengths:"",areasToImprove:"",recommendedNextAction:"",furtherResources:"",overallAssessment:""};
    if(assessment.strengths.trim().length<3||assessment.areasToImprove.trim().length<3||assessment.recommendedNextAction.trim().length<3||!assessment.overallAssessment){setError("Complete strengths, improvement areas, next action and overall assessment before recording the review.");return;}
    setBusy(submissionId);
    setError("");
    try {
      await api(`/api/v1/mentorship-learning-submissions/${encodeURIComponent(submissionId)}/review`, { method: "POST", body: JSON.stringify({ decision, structuredFeedback: assessment }) }, token);
      setFeedback(current => ({ ...current, [submissionId]: {strengths:"",areasToImprove:"",recommendedNextAction:"",furtherResources:"",overallAssessment:""} }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your review could not be saved.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mentorship-learning">
    <Card>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div><div className="eyebrow">Practical learning</div><h3 className="h2">Activities and assignments</h3><p className="muted">Activities are set by your assigned mentor. Submissions are versioned, and mentor feedback remains attached to each review.</p></div>
        <button type="button" className="btn btn-ghost" onClick={() => void load()} disabled={loading}>Refresh activities</button>\n        <nav className="row" aria-label="Learning activity views" style={{gap:6,flexWrap:"wrap"}}>{([{id:"assigned",label:"Assigned to me"},{id:"review",label:"Submitted for review"},{id:"completed",label:"Completed learning"}] as const).map(item=><button key={item.id} type="button" className={view===item.id?"btn btn-primary":"btn btn-ghost"} aria-pressed={view===item.id} onClick={()=>setView(item.id)}>{item.label}</button>)}</nav>
      </div>
      {error ? <FormFeedback kind="error" message={error} onRetry={() => void load()} retryLabel="Retry" /> : null}
      {role === "mentor" ? <form className="grid" style={{ gap: 8, marginTop: 12 }} onSubmit={createActivity}>
        <b>Create a learning activity</b>
        <label>Activity title<input required minLength={4} maxLength={180} value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Prepare a stakeholder engagement plan" /></label>
        <label>Instructions and expected practical work<textarea required minLength={10} maxLength={4000} rows={3} value={instructions} onChange={event => setInstructions(event.target.value)} placeholder="Describe the task, expected output and how it supports the agreed mentorship goal." /></label>
        <label>Connect to an agreed goal<select value={goalId} onChange={event=>setGoalId(event.target.value)}><option value="">No linked goal</option>{goals.filter(goal=>!["achieved","cancelled","not_achieved"].includes(goal.status)).map(goal=><option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></label>\n        <label>Due date (optional)<input type="date" value={dueAt} onChange={event => setDueAt(event.target.value)} /></label>
        <button className="btn btn-primary" type="submit" disabled={busy === "create"}>{busy === "create" ? "Saving activity…" : "Publish activity"}</button>
      </form> : null}
      {loading && activities.length === 0 ? <p className="muted">Loading your saved activities…</p> : null}
      {!loading && activities.length === 0 ? <p className="muted">{role === "mentor" ? "No activities have been published yet. Create a practical activity connected to the agreed goal when appropriate." : "Your mentor has not published an activity yet. Your learning path will update when one is assigned."}</p> : null}
      <div className="grid" style={{ gap: 10, marginTop: 12 }}>
        {activities.filter(activity=>{const latest=activity.submissions?.[0];if(view==="review")return role==="mentor"&&latest?.status==="submitted";if(view==="completed")return latest?.status==="accepted";return role==="mentor"?true:latest?.status!=="accepted";}).map(activity => {
          const latest = activity.submissions?.[0];
          return <section className="case-row" key={activity.id}>
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}><b>{activity.title}</b><Badge>{activity.status}</Badge></div>
            <p>{activity.instructions}</p>\n            {activity.goal_title?<p className="muted">Linked goal: {activity.goal_title}</p>:null}
            {activity.due_at ? <p className="muted">Due {new Date(activity.due_at).toLocaleDateString()}</p> : null}
            {activity.submissions?.length > 1 ? <details className="case-row"><summary>Previous submissions and feedback ({activity.submissions.length - 1})</summary><div className="grid" style={{gap:8,marginTop:10}}>{activity.submissions.slice(1).map(submission=><div key={submission.id}><div className="row" style={{justifyContent:"space-between",flexWrap:"wrap"}}><b>Version {submission.version}</b><Badge>{submission.status.replaceAll("_"," ")}</Badge></div><p>{submission.response}</p>{submission.reviews.map(review=><div className="case-row" key={review.id}><b>{review.decision.replaceAll("_"," ")}</b>{review.strengths?<><p><b>Strengths:</b> {review.strengths}</p><p><b>Areas to improve:</b> {review.areasToImprove}</p><p><b>Next action:</b> {review.recommendedNextAction}</p>{review.furtherResources?<p><b>Resources:</b> {review.furtherResources}</p>:null}<p><b>Assessment:</b> {(review.overallAssessment||"").replaceAll("_"," ")}</p></>:<p>{review.feedback}</p>}<p className="muted">{new Date(review.createdAt).toLocaleString()}</p></div>)}</div>)}</div></details> : null}
            {latest ? <div className="grid" style={{ gap: 8 }}>
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}><b>Latest submission · v{latest.version}</b><Badge>{latest.status.replaceAll("_", " ")}</Badge></div>
              <p>{latest.response}</p>
              <p className="muted">Submitted {new Date(latest.submittedAt).toLocaleString()}</p>
              {latest.reviews.map(review => <div className="case-row" key={review.id}><div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}><b>Mentor feedback</b><Badge>{review.decision.replaceAll("_", " ")}</Badge></div><p>{review.feedback}</p><p className="muted">{new Date(review.createdAt).toLocaleString()}</p></div>)}
              {role === "mentor" && latest.status !== "accepted" ? <div className="grid" style={{ gap: 8 }}>
                <div className="grid grid-2" style={{gap:8}}><label>Strengths demonstrated<textarea required minLength={3} maxLength={1200} rows={2} value={feedback[latest.id]?.strengths||""} onChange={event=>setFeedback(current=>({...current,[latest.id]:{strengths:event.target.value,areasToImprove:current[latest.id]?.areasToImprove||"",recommendedNextAction:current[latest.id]?.recommendedNextAction||"",furtherResources:current[latest.id]?.furtherResources||"",overallAssessment:current[latest.id]?.overallAssessment||""}}))}/></label><label>Areas to improve<textarea required minLength={3} maxLength={1200} rows={2} value={feedback[latest.id]?.areasToImprove||""} onChange={event=>setFeedback(current=>({...current,[latest.id]:{strengths:current[latest.id]?.strengths||"",areasToImprove:event.target.value,recommendedNextAction:current[latest.id]?.recommendedNextAction||"",furtherResources:current[latest.id]?.furtherResources||"",overallAssessment:current[latest.id]?.overallAssessment||""}}))}/></label><label>Recommended next action<textarea required minLength={3} maxLength={1200} rows={2} value={feedback[latest.id]?.recommendedNextAction||""} onChange={event=>setFeedback(current=>({...current,[latest.id]:{strengths:current[latest.id]?.strengths||"",areasToImprove:current[latest.id]?.areasToImprove||"",recommendedNextAction:event.target.value,furtherResources:current[latest.id]?.furtherResources||"",overallAssessment:current[latest.id]?.overallAssessment||""}}))}/></label><label>Further resources (optional)<textarea maxLength={1200} rows={2} value={feedback[latest.id]?.furtherResources||""} onChange={event=>setFeedback(current=>({...current,[latest.id]:{strengths:current[latest.id]?.strengths||"",areasToImprove:current[latest.id]?.areasToImprove||"",recommendedNextAction:current[latest.id]?.recommendedNextAction||"",furtherResources:event.target.value,overallAssessment:current[latest.id]?.overallAssessment||""}}))}/></label><label>Overall assessment<select required value={feedback[latest.id]?.overallAssessment||""} onChange={event=>setFeedback(current=>({...current,[latest.id]:{strengths:current[latest.id]?.strengths||"",areasToImprove:current[latest.id]?.areasToImprove||"",recommendedNextAction:current[latest.id]?.recommendedNextAction||"",furtherResources:current[latest.id]?.furtherResources||"",overallAssessment:event.target.value}}))}><option value="">Choose assessment</option><option value="exceeds_expectations">Exceeds expectations</option><option value="meets_expectations">Meets expectations</option><option value="developing">Developing</option><option value="needs_support">Needs support</option></select></label></div>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><button type="button" className="btn btn-primary" disabled={busy === latest.id} onClick={() => void reviewWork(latest.id, "accepted")}>Accept work</button><button type="button" className="btn btn-ghost" disabled={busy === latest.id} onClick={() => void reviewWork(latest.id, "changes_requested")}>Request improvement</button></div>
              </div> : null}
            </div> : null}
            {role === "mentee" && latest?.status !== "accepted" ? <div className="grid" style={{ gap: 8 }}>
              <label>{latest ? "Resubmit improved work" : "Submit your practical work"}<textarea minLength={10} maxLength={10000} rows={3} value={responses[activity.id] || ""} onChange={event => setResponses(current => ({ ...current, [activity.id]: event.target.value }))} placeholder="Describe or paste your work. A new submission is saved as a new version." /></label>
              <button type="button" className="btn btn-primary" disabled={busy === activity.id} onClick={() => void submitWork(activity.id)}>{busy === activity.id ? "Submitting…" : latest ? "Submit new version" : "Submit work"}</button>
            </div> : null}
          </section>;
        })}
      </div>
    </Card>
    </div>
  );
}
