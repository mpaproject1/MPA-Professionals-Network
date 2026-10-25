"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FormFeedback } from "../../../components/form-feedback";
import { Badge, Card } from "../../../components/ui";
import { ApiError, api } from "../../../lib/api";
import { useUiStore } from "../../../lib/store";

type InterestItem = {
  interest_id: string;
  request_id: string;
  mentor_user_id: string;
  interest_status: string;
  interest_created_at: string;
  goals: string;
  topics: unknown;
  preferred_modes: unknown;
  preferred_languages: unknown;
  mentee_name: string;
  mentor_name: string;
  mentor_headline?: string | null;
};

function displayList(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ") || "Not specified";
  if (typeof value === "string") {
    try { const parsed: unknown = JSON.parse(value); if (Array.isArray(parsed)) return parsed.map((item) => String(item)).join(", ") || "Not specified"; } catch { return value || "Not specified"; }
    return value || "Not specified";
  }
  return "Not specified";
}

export default function MentorshipInterestReviewPage() {
  const token = useUiStore((s) => s.token);
  const hydrateToken = useUiStore((s) => s.hydrateToken);
  const [items, setItems] = useState<InterestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError("");
    try {
      const rows = await api<InterestItem[]>("/api/v1/admin/mentorship-interest", {}, token);
      setItems(Array.isArray(rows) ? rows : []);
    } catch (cause) {
      setItems([]);
      setError(cause instanceof ApiError ? cause.message : "The matching-team interest queue could not be confirmed.");
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { hydrateToken(); }, [hydrateToken]);
  useEffect(() => { if (token) void load(); }, [load, token]);

  async function act(item: InterestItem, action: "propose" | "review") {
    setBusyId(item.interest_id); setError(""); setNotice("");
    try {
      const result = await api<any>("/api/v1/admin/mentorship-interest/" + encodeURIComponent(item.interest_id) + "/" + action, { method: "POST" }, token);
      setNotice(result.nextAction || (action === "propose" ? "A specific match proposal was created." : "Interest marked reviewed."));
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The matching-team action could not be confirmed. Refresh the queue before retrying.");
    } finally { setBusyId(""); }
  }

  return <main className="page-shell" style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 18px" }}>
    <Link className="text-link" href="/admin">← Back to administration</Link>
    <div className="eyebrow" style={{ marginTop: 16 }}>Support Desk · Matching decisions</div>
    <h1 className="h1">Mentorship interest review</h1>
    <p className="muted">This queue shows only explicit expressions of interest from eligible approved mentors for requests whose owners opted into the minimized mentor pool. The matching team sees participant names needed for review, but no contact addresses. Proposing a match does not start a relationship: the mentor must respond and the mentee must accept that specific match.</p>
    {error && <FormFeedback kind="error" message={error} onRetry={() => void load()} retryLabel="Retry interest queue" />}
    {notice && <FormFeedback kind="success" message={notice} />}
    {!token ? <Card><p>Sign in with an authorized Support Desk or system administrator account to review mentor interests.</p><Link className="btn btn-primary" href="/login?next=/admin/mentorship-interest">Sign in</Link></Card> : <Card>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <p className="muted">{loading ? "Refreshing saved interest records…" : items.length + " pending interest record(s)"}</p>
        <button className="btn btn-ghost" type="button" disabled={loading} onClick={() => void load()}>{loading ? "Refreshing…" : "Refresh queue"}</button>
      </div>
      {!loading && items.length === 0 && !error && <p className="muted">No pending eligible mentor interests were returned.</p>}
      <div className="grid" style={{ gap: 12, marginTop: 12 }}>
        {items.map((item) => <section className="case-row" key={item.interest_id}>
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}><b>Interest {item.interest_id}</b><Badge>{item.interest_status}</Badge></div>
          <p><b>Participant:</b> {item.mentee_name} · <b>Interested mentor:</b> {item.mentor_name}{item.mentor_headline ? " — " + item.mentor_headline : ""}</p>
          <p><b>Goal:</b> {item.goals}</p>
          <p className="muted">Topics: {displayList(item.topics)} · Modes: {displayList(item.preferred_modes)} · Languages: {displayList(item.preferred_languages)}</p>
          <p className="muted">Interest recorded {new Date(item.interest_created_at).toLocaleString()} · Request reference {item.request_id}</p>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-primary" type="button" disabled={busyId === item.interest_id} onClick={() => void act(item, "propose")}>Propose this mentor</button>
            <button className="btn btn-ghost" type="button" disabled={busyId === item.interest_id} onClick={() => void act(item, "review")}>Review without proposing</button>
          </div>
        </section>)}
      </div>
    </Card>}
  </main>;
}
