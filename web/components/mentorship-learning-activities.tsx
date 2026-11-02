"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { FormFeedback } from "./form-feedback";
import { Badge, Card } from "./ui";
import { api } from "../lib/api";

type Review = { id: string; decision: "accepted" | "changes_requested"; feedback: string; createdAt: string };
type Submission = { id: string; version: number; response: string; status: string; submittedAt: string; reviews: Review[] };
type Activity = { id: string; title: string; instructions: string; due_at?: string | null; status: string; submissions: Submission[] };

export function MentorshipLearningActivities({ mentorshipId, role, token }: { mentorshipId: string; role: "mentor" | "mentee"; token: string }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});

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
        body: JSON.stringify({ title: title.trim(), instructions: instructions.trim(), dueAt: dueAt ? new Date(dueAt).toISOString() : null }),
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
    const note = (feedback[submissionId] || "").trim();
    if (note.length < 5) { setError("Add specific feedback before recording your review."); return; }
    setBusy(submissionId);
    setError("");
    try {
      await api(`/api/v1/mentorship-learning-submissions/${encodeURIComponent(submissionId)}/review`, { method: "POST", body: JSON.stringify({ decision, feedback: note }) }, token);
      setFeedback(current => ({ ...current, [submissionId]: "" }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your review could not be saved.");
    } finally {
      setBusy("");
    }
  }

  return (
    <Card>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div><div className="eyebrow">Practical learning</div><h3 className="h2">Activities and assignments</h3><p className="muted">Activities are set by your assigned mentor. Submissions are versioned, and mentor feedback remains attached to each review.</p></div>
        <button type="button" className="btn btn-ghost" onClick={() => void load()} disabled={loading}>Refresh activities</button>
      </div>
      {error ? <FormFeedback kind="error" message={error} onRetry={() => void load()} retryLabel="Retry" /> : null}
      {role === "mentor" ? <form className="grid" style={{ gap: 8, marginTop: 12 }} onSubmit={createActivity}>
        <b>Create a learning activity</b>
        <label>Activity title<input required minLength={4} maxLength={180} value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Prepare a stakeholder engagement plan" /></label>
        <label>Instructions and expected practical work<textarea required minLength={10} maxLength={4000} rows={3} value={instructions} onChange={event => setInstructions(event.target.value)} placeholder="Describe the task, expected output and how it supports the agreed mentorship goal." /></label>
        <label>Due date (optional)<input type="date" value={dueAt} onChange={event => setDueAt(event.target.value)} /></label>
        <button className="btn btn-primary" type="submit" disabled={busy === "create"}>{busy === "create" ? "Saving activity…" : "Publish activity"}</button>
      </form> : null}
      {loading && activities.length === 0 ? <p className="muted">Loading your saved activities…</p> : null}
      {!loading && activities.length === 0 ? <p className="muted">{role === "mentor" ? "No activities have been published yet. Create a practical activity connected to the agreed goal when appropriate." : "Your mentor has not published an activity yet. Your learning path will update when one is assigned."}</p> : null}
      <div className="grid" style={{ gap: 10, marginTop: 12 }}>
        {activities.map(activity => {
          const latest = activity.submissions?.[0];
          return <section className="case-row" key={activity.id}>
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}><b>{activity.title}</b><Badge>{activity.status}</Badge></div>
            <p>{activity.instructions}</p>
            {activity.due_at ? <p className="muted">Due {new Date(activity.due_at).toLocaleDateString()}</p> : null}
            {latest ? <div className="grid" style={{ gap: 8 }}>
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}><b>Latest submission · v{latest.version}</b><Badge>{latest.status.replaceAll("_", " ")}</Badge></div>
              <p>{latest.response}</p>
              <p className="muted">Submitted {new Date(latest.submittedAt).toLocaleString()}</p>
              {latest.reviews.map(review => <div className="case-row" key={review.id}><div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}><b>Mentor feedback</b><Badge>{review.decision.replaceAll("_", " ")}</Badge></div><p>{review.feedback}</p><p className="muted">{new Date(review.createdAt).toLocaleString()}</p></div>)}
              {role === "mentor" && latest.status !== "accepted" ? <div className="grid" style={{ gap: 8 }}>
                <label>Review and guidance<textarea minLength={5} maxLength={3000} rows={2} value={feedback[latest.id] || ""} onChange={event => setFeedback(current => ({ ...current, [latest.id]: event.target.value }))} placeholder="What is strong? What should the mentee improve?" /></label>
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
  );
}
