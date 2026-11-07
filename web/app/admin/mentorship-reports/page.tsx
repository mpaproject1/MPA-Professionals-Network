"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FormFeedback } from "../../../components/form-feedback";
import { Badge, Card } from "../../../components/ui";
import { ApiError, api } from "../../../lib/api";
import { useUiStore } from "../../../lib/store";
import "../mentorship-admin.css";

type ParticipantReport = {
  id: string; mentorship_id: string; session_id?: string | null; reporter_user_id: string;
  reporter_name?: string | null; category: string; description: string; status: string;
  created_at: string; reviewed_at?: string | null; resolution_note?: string | null;
};

export default function MentorshipReportsPage() {
  const token = useUiStore((s) => s.token);
  const hydrateToken = useUiStore((s) => s.hydrateToken);
  const [reports, setReports] = useState<ParticipantReport[]>([]);
  const [status, setStatus] = useState("open");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError("");
    try {
      const result = await api<ParticipantReport[]>("/api/v1/admin/mentorship-reports?status=" + encodeURIComponent(status) + "&limit=50&offset=0", {}, token);
      setReports(Array.isArray(result) ? result : []);
    } catch (cause) {
      setReports([]);
      setError(cause instanceof ApiError ? cause.message : "The confidential report queue could not be confirmed.");
    } finally { setLoading(false); }
  }, [status, token]);

  useEffect(() => { hydrateToken(); }, [hydrateToken]);
  useEffect(() => { if (token) void load(); }, [load, token]);

  async function update(report: ParticipantReport, nextStatus: "reviewing" | "resolved" | "closed") {
    const resolutionNote = (notes[report.id] || "").trim();
    if (nextStatus === "resolved" && resolutionNote.length < 4) { setError("Add a resolution note before resolving a report."); return; }
    setBusyId(report.id); setError(""); setNotice("");
    try {
      await api("/api/v1/admin/mentorship-reports/" + encodeURIComponent(report.id), { method: "PATCH", body: JSON.stringify({ status: nextStatus, resolutionNote: resolutionNote || undefined }) }, token);
      setNotice("Report status saved as " + nextStatus + ".");
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The report update could not be confirmed.");
    } finally { setBusyId(""); }
  }

  return <main className="page-shell mpa-mentorship-admin" style={{ maxWidth: 1240, margin: "0 auto", padding: "22px 16px" }}>
    <Link className="text-link" href="/admin">← Administration</Link><nav className="mentorship-admin-nav" aria-label="Mentorship administration"><Link href="/admin/mentorship-interest" >Matching queue</Link><Link href="/admin/mentorship-reports" aria-current="page">Confidential reports</Link></nav>
    <div className="eyebrow" style={{ marginTop: 16 }}>Support Desk · Confidential queue</div>
    <h1 className="h1">Mentorship participant reports</h1>
    <p className="muted">Only authorized Support Desk staff can access this queue. Reporter identity comes from the authenticated account; no contact address is collected by the report form. Keep report details confidential and record decisions.</p>
    {error && <FormFeedback kind="error" message={error} onRetry={() => void load()} retryLabel="Retry report queue" />}
    {notice && <FormFeedback kind="success" message={notice} />}
    {!token ? <Card><p>Sign in with an authorized Support Desk or system administrator account to review reports.</p><Link className="btn btn-primary" href="/login?next=/admin/mentorship-reports">Sign in</Link></Card> : <Card>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <label>Queue status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="open">Open</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option><option value="closed">Closed</option><option value="all">All statuses</option></select></label>
        <button className="btn btn-ghost" type="button" disabled={loading} onClick={() => void load()}>{loading ? "Refreshing…" : "Refresh queue"}</button>
      </div>
      {loading && <p className="muted">Loading persisted participant reports…</p>}
      {!loading && reports.length === 0 && !error && <p className="muted">No reports were returned for this filter. This is a confirmed empty result, not a failed load.</p>}
      <div className="grid" style={{ gap: 12, marginTop: 12 }}>
        {reports.map((report) => <section className="case-row" key={report.id}>
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}><b>{report.category.replaceAll("_", " ")}</b><Badge>{report.status}</Badge></div>
          <p>{report.description}</p>
          <p className="muted">Report reference: {report.id} · Mentorship: {report.mentorship_id}{report.session_id ? " · Session: " + report.session_id : ""}</p>
          <p className="muted">Submitted by {report.reporter_name || "Participant"} · {new Date(report.created_at).toLocaleString()}</p>
          {report.resolution_note && <p><b>Resolution note:</b> {report.resolution_note}</p>}
          <label>Review / resolution note<textarea maxLength={2000} value={notes[report.id] ?? report.resolution_note ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [report.id]: event.target.value }))} placeholder="Record the action taken. A note is required to resolve." /></label>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {report.status === "open" && <button className="btn btn-ghost" type="button" disabled={busyId === report.id} onClick={() => void update(report, "reviewing")}>Start review</button>}
            {!["resolved", "closed"].includes(report.status) && <button className="btn btn-primary" type="button" disabled={busyId === report.id} onClick={() => void update(report, "resolved")}>Resolve report</button>}
            {report.status !== "closed" && <button className="btn btn-ghost" type="button" disabled={busyId === report.id} onClick={() => void update(report, "closed")}>Close report</button>}
          </div>
        </section>)}
      </div>
    </Card>}
  </main>;
}
