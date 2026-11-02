"use client";

import {ArrowRight, ClipboardCopy, RefreshCw, ShieldCheck} from "lucide-react";
import Link from "next/link";
import {useCallback, useEffect, useRef, useState} from "react";
import {EmptyState} from "../../components/empty-state";
import {FormFeedback} from "../../components/form-feedback";
import {OperationStatus} from "../../components/operation-status";
import {Badge, Card} from "../../components/ui";
import {api} from "../../lib/api";
import {humanStatus} from "../../lib/status-labels";
import {useUiStore} from "../../lib/store";

type Item = {
  id: string;
  trackingReference?: string;
  type: string;
  title: string;
  subtitle?: string;
  status: string;
  statusLabel: string;
  updatedAt: string;
  submittedAt: string | null;
  nextAction: string;
  responsibility?: "member_action" | "mpa_action" | "external_response" | "in_progress" | "completed" | "closed" | "unknown";
  href?: string;
  category?: string;
  recordId?: string;
  createdAt?: string | null;
  description?: string;
  details?: Record<string, unknown>;
};
type Tracking = {
  items: Item[];
  summary: { total: number; active: number; nextSteps: number; jobApplications: number; memberships?: number; organizations?: number };
  counts?: { needsAttention?: number; waiting?: number; inProgress?: number; completed?: number };
  errors?: { source: string; category: string; message: string }[];
  totalFiltered?: number;
  history?: { status: string; at: string | null }[];
  limit: number;
  offset: number;
  hasMore: boolean;
};
type PublicInquiry = {
  jobTitle?: string;
  status: string;
  reference: string;
  nextStep: string;
};
type JobProgress = {
  application: { id: string; status: string; offer?: { amount?: number | string | null; currency?: string | null; terms?: string | null; approvalStatus?: string | null } };
  events: { from_status?: string | null; to_status: string; note?: string | null; created_at: string }[];
  interviews: { id: string; scheduled_start: string; scheduled_end: string; timezone?: string; mode: string; location_text?: string | null; meeting_url?: string | null; status: string; agenda?: string | null; isParticipant?: boolean; participants: { role: string; response: string }[]; change_proposals?: { id:string; proposedStart:string; proposedEnd:string; timezone:string; mode:string; locationText?:string|null; meetingUrl?:string|null; note?:string|null; status:string; createdAt:string; canDecide:boolean }[] }[];
};
const PAGE_SIZE = 20;

function actionFor(item: Item) {
  if (["completed", "closed"].includes(item.responsibility || "") || item.nextAction === "No action required") return null;
  const href = item.href && item.href.startsWith("/") && !item.href.startsWith("//") ? item.href : ({ membership: "/membership", organization: "/organizations", job: "/jobs" }[item.type] || "/dashboard");
  return { href, label: item.responsibility === "member_action" ? "Continue and respond" : "Open " + (item.category || item.type).toLowerCase() };
}

function dateLabel(value?: string | null, includeTime = false) {
  if (!value) return "Not yet submitted";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return includeTime ? date.toLocaleString() : date.toLocaleDateString();
}

export default function Track() {
  const token = useUiStore((state) => state.token);
  const hydrated = useUiStore((state) => state.hydrated);
  const [data, setData] = useState<Tracking | null>(null);
  const dataRef = useRef<Tracking | null>(null);
  const [publicInquiry, setPublicInquiry] = useState<PublicInquiry | null>(null);
  const [publicRef, setPublicRef] = useState("");
  const [publicToken, setPublicToken] = useState("");
  const [publicLookupFinished, setPublicLookupFinished] = useState(false);
  const [jobProgress, setJobProgress] = useState<Record<string, JobProgress>>({});
  const [progressErrors, setProgressErrors] = useState<Record<string, string>>({});
  const [interviewAction, setInterviewAction] = useState("");
  const [applicationAction, setApplicationAction] = useState("");
  const [changeDrafts, setChangeDrafts] = useState<Record<string,{start:string;end:string;mode:string;note:string}>>({});
  const [error, setError] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [progressView, setProgressView] = useState<"all" | "attention" | "waiting" | "progress" | "history">("all");

  async function copyReference(value: string) { const ref=String(value||"").trim(); if(!ref){setCopyNotice("No display reference is available yet.");return;} try { await navigator.clipboard.writeText(ref); setCopyNotice("Reference copied to clipboard."); } catch { setCopyNotice("Clipboard access is unavailable. Select the displayed reference and copy it manually."); } }
  async function respondToInterview(interviewId: string, status: "accepted" | "declined") {
    if (!token || interviewAction) return;
    if (status === "declined" && typeof window !== "undefined" && !window.confirm("Decline this interview invitation? The recruiting team will be notified.")) return;
    setInterviewAction(interviewId); setError("");
    try {
      await api("/api/v1/job-interviews/" + encodeURIComponent(interviewId) + "/response", { method: "POST", body: JSON.stringify({ status }) }, token);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your interview response could not be confirmed. Refresh the timeline before retrying.");
    } finally { setInterviewAction(""); }
  }
  async function proposeInterviewChange(interviewId: string) {
    if (!token || interviewAction) return;
    const draft = changeDrafts[interviewId];
    if (!draft?.start || !draft?.end) { setError("Choose a proposed start and end time."); return; }
    setInterviewAction(interviewId); setError("");
    try {
      await api("/api/v1/job-interviews/" + encodeURIComponent(interviewId) + "/change-proposals", { method: "POST", body: JSON.stringify({ proposedStart: new Date(draft.start).toISOString(), proposedEnd: new Date(draft.end).toISOString(), timezone: "Africa/Addis_Ababa", mode: draft.mode, note: draft.note.trim() || undefined }) }, token);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your interview time proposal could not be saved.");
    } finally { setInterviewAction(""); }
  }
  async function decideInterviewChange(proposalId: string, decision: "accepted" | "declined") {
    if (!token || interviewAction) return;
    if (decision === "declined" && typeof window !== "undefined" && !window.confirm("Decline the proposed interview time? The original schedule will remain in place.")) return;
    setInterviewAction(proposalId); setError("");
    try {
      await api("/api/v1/job-interview-change-proposals/" + encodeURIComponent(proposalId) + "/decision", { method: "POST", body: JSON.stringify({ decision }) }, token);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your decision could not be confirmed.");
    } finally { setInterviewAction(""); }
  }
  async function respondToOffer(applicationId: string, status: "accepted" | "withdrawn") {
    if (!token || applicationAction) return;
    const message = status === "accepted" ? "Accept this approved employment offer?" : "Withdraw this job application? This cannot be undone from this page.";
    if (typeof window !== "undefined" && !window.confirm(message)) return;
    setApplicationAction(applicationId); setError("");
    try {
      await api("/api/v1/job-applications/" + encodeURIComponent(applicationId) + "/respond", { method: "POST", body: JSON.stringify({ status }) }, token);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your application response could not be confirmed. Refresh the timeline before retrying.");
    } finally { setApplicationAction(""); }
  }

  const load = useCallback(async (append = false) => {
    if (!token) {
      dataRef.current = null;
      setData(null);
      setLoading(false);
      return;
    }
    const offset = append ? (dataRef.current?.items.length || 0) : 0;
    setLoading(true);
    setError("");
    try {
      const page = await api<Tracking>(
        `/api/v1/me/progress?limit=${PAGE_SIZE}&offset=${offset}&view=${progressView}`,
        {},
        token,
      );
      if (!page || !Array.isArray(page.items) || !page.summary) {
        throw new Error("The tracking service returned an unexpected response. Please retry.");
      }
      const next = append && dataRef.current
        ? { ...page, items: [...dataRef.current.items, ...page.items] }
        : page;
      dataRef.current = next;
      setData(next);
      const jobItems = page.items.filter((item) => item.type === "job" || item.type === "job_application");
      if (jobItems.length) {
        const progressRows = await Promise.all(jobItems.map(async (item) => {
          try {
            const progress = await api<JobProgress>("/api/v1/job-applications/" + encodeURIComponent(item.recordId || item.id) + "/progress", {}, token);
            setProgressErrors((current) => { const next = { ...current }; delete next[item.id]; return next; });
            return [item.id, progress] as const;
          } catch (cause) {
            setProgressErrors((current) => ({ ...current, [item.id]: cause instanceof Error ? cause.message : "Job progress details could not be loaded." }));
            return null;
          }
        }));
        setJobProgress((current) => ({ ...current, ...Object.fromEntries(progressRows.filter((row): row is readonly [string, JobProgress] => Boolean(row))) }));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your application progress could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [token, progressView]);

  useEffect(() => {
    void load();
    const query = new URLSearchParams(window.location.search);
    const reference = query.get("ref") || "";
    const continuationToken = query.get("token") || "";
    setPublicRef(reference);
    setPublicToken(continuationToken);
    if (reference && continuationToken) {
      api<PublicInquiry>(
        `/api/v1/public/opportunity-inquiries/${encodeURIComponent(reference)}/details?token=${encodeURIComponent(continuationToken)}`,
      )
        .then(setPublicInquiry)
        .catch(() => setError("This private inquiry could not be opened. Check the reference and private continuation link, then try again."));
    }
    setPublicLookupFinished(true);
  }, [load]);

  if (!publicRef && !publicToken && !hydrated) {
    return <div className="auth-page"><Card><h1 className="h1">Restoring your session…</h1><p className="muted">Please wait while we check your sign-in.</p></Card></div>;
  }

  if (publicInquiry) {
    return (
      <div className="auth-page">
        <Card>
          <div className="eyebrow">Private inquiry tracking</div>
          <h1 className="h1">{publicInquiry.jobTitle || "Mentorship"} · {humanStatus(publicInquiry.status)}</h1>
          <p className="muted">Reference <b>{publicInquiry.reference}</b>. {publicInquiry.nextStep}</p><button type="button" className="btn btn-ghost" onClick={()=>void copyReference(publicInquiry.reference)}><ClipboardCopy size={15}/> Copy reference</button>{copyNotice&&<p className="muted" role="status">{copyNotice}</p>}
          <div className="tracker-line">
            <span className="timeline-dot" />
            <div><b>{publicInquiry.status}</b><p className="muted">Only someone with this private continuation link and authorized reviewers can view this inquiry.</p></div>
          </div>
          <Link className="btn btn-primary" href={`/apply/opportunity?ref=${encodeURIComponent(publicRef)}&token=${encodeURIComponent(publicToken)}`} style={{ marginTop: 16 }}>
            Continue request <ArrowRight size={16} />
          </Link>
        </Card>
      </div>
    );
  }

  if (!token && publicLookupFinished) {
    return (
      <div className="auth-page">
        <Card>
          <div className="eyebrow">Application tracking</div>
          <h1 className="h1">Know where your application stands.</h1>
          <p className="muted">Sign in to see membership, organization and job applications in one timeline. We show current status and the next useful action without exposing reviewer-only notes.</p>
          {error && <FormFeedback kind="error" message={error} onRetry={() => window.location.reload()} retryLabel="Try private link again" />}
          <div className="landing-actions">
            <Link className="btn btn-primary" href="/login?next=/track">Sign in to track</Link>
            <Link className="btn btn-ghost" href="/register">Create account</Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid" style={{ gap: 18 }}>
      <header className="row" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow">My applications</div>
          <h1 className="h1">Progress you can see</h1>
          <p className="muted">See the latest status, last update and next step for your own applications.</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={16} /> {loading ? "Checking status…" : "Check latest status"}
        </button>
      </header>

      {error && <FormFeedback kind="error" message={error} onRetry={() => void load()} retryLabel="Check status again" />}
      {loading && data && <OperationStatus state="loading" title="Checking for the latest updates" detail="We’re retrieving your current application statuses and next steps. You can keep this page open; actions that depend on this refresh are temporarily paused." />}

      <div className="grid grid-3">
        {([
          ["total", "All applications"],
          ["active", "In progress"],
          ["jobApplications", "Job applications"],
        ] as const).map(([key, label]) => (
          <Card key={key}>
            <div className="eyebrow">{label}</div>
            <div className="metric">{data?.summary?.[key] ?? "—"}</div>
          </Card>
        ))}
      </div>

      <nav className="row" aria-label="Progress filters" style={{ gap: 8, flexWrap: "wrap" }}>{([["all","All"],["attention","Needs my attention"],["waiting","Waiting for response"],["progress","In progress"],["history","History"]] as const).map(([value,label])=><button key={value} type="button" className={progressView===value?"btn btn-primary":"btn btn-ghost"} aria-pressed={progressView===value} onClick={()=>setProgressView(value)}>{label}</button>)}</nav>\n      {data?.errors?.length ? <div className="case-row" role="status"><b>Some progress sections are temporarily unavailable.</b><p className="muted">{data.errors.map(e=>e.category).filter((v,i,a)=>a.indexOf(v)===i).join(", ")} could not be loaded. Other records remain visible; refresh to retry.</p></div> : null}\n      <section className="grid" aria-label="Member progress" style={{ gap: 12 }}>
        {loading && !data && <Card><OperationStatus state="loading" title="Loading your application progress" detail="We’re gathering your membership, organization and job application updates. Your saved applications are not being changed." /></Card>}
        {(data?.items || []).map((item) => {
          const action = actionFor(item);
          return (
            <Card key={`${item.type}-${item.id}`}>
              <div className="row" style={{ alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                  <Badge>{item.type.replaceAll("_", " ")}</Badge>
                  <h2 className="h2" style={{ margin: "8px 0 4px" }}>{item.title}</h2>
                  <p className="muted" style={{ margin: 0 }}>{item.subtitle || item.description || item.category}</p>
                  <p className="muted" style={{ margin: "4px 0 0" }}>Reference: {item.trackingReference || "Not assigned yet"}</p>{item.trackingReference&&<button type="button" className="btn btn-ghost" onClick={()=>void copyReference(item.trackingReference||"")}><ClipboardCopy size={15}/> Copy reference</button>}{copyNotice&&<p className="muted" role="status">{copyNotice}</p>}
                </div>
                <span className="badge">{item.statusLabel || humanStatus(item.status)}</span>
              </div>
              <div className="track-card-grid">
                <div><span>Last updated</span><b>{dateLabel(item.updatedAt, true)}</b></div>
                <div><span>What happens next</span><b>{item.nextAction || (item.responsibility === "member_action" ? "Your response is needed" : item.responsibility === "external_response" ? "Waiting for another participant" : item.responsibility === "mpa_action" ? "Waiting for MPA review" : "Continue your journey")}</b></div>
              </div>
              <div className="tracker-line">
                <span className="timeline-dot" />
                <div><b>{item.statusLabel || humanStatus(item.status)}</b><p className="muted">Started {dateLabel(item.submittedAt || item.createdAt)}</p></div>
              </div>
              {item.history?.length ? <details className="case-row"><summary>View recorded history ({item.history.length})</summary><ol className="grid" style={{gap:8,marginTop:10}}>{item.history.map((event,index)=><li key={index}><b>{humanStatus(event.status)}</b><p className="muted">{dateLabel(event.at,true)}</p></li>)}</ol></details> : null}
              {item.type === "job" && progressErrors[item.id] && <FormFeedback kind="error" message={progressErrors[item.id]} onRetry={() => void load()} retryLabel="Refresh job progress" />}
              {item.type === "job" && jobProgress[item.id] && <section className="grid" aria-label="Job application details" style={{ gap: 10, marginTop: 12 }}>
                <div className="case-row"><b>Recruitment history</b>{jobProgress[item.id].events.length ? jobProgress[item.id].events.map((event, index) => <div className="tracker-line" key={index}><span className="timeline-dot" /><div><b>{humanStatus(event.to_status)}</b><p className="muted">{dateLabel(event.created_at, true)}</p></div></div>) : <p className="muted">No additional stage events have been recorded yet.</p>}</div>
                {jobProgress[item.id].interviews.length > 0 && <div className="case-row"><b>Interview schedule</b>{jobProgress[item.id].interviews.map((interview) => {
                  const candidateParticipant = interview.participants.find((participant) => participant.role === "candidate");
                  return <div key={interview.id} style={{ display: "grid", gap: 6, marginTop: 10 }}>
                    <Badge>{humanStatus(interview.status)}</Badge>
                    <b>{dateLabel(interview.scheduled_start, true)} – {dateLabel(interview.scheduled_end, true)}</b>
                    <p className="muted">{interview.mode.replaceAll("_", " ")}{interview.timezone ? " · " + interview.timezone : ""}{interview.location_text ? " · " + interview.location_text : ""}</p>
                    {interview.agenda && <p className="muted">Agenda: {interview.agenda}</p>}
                    {interview.meeting_url && <a href={interview.meeting_url} target="_blank" rel="noreferrer">Open meeting link</a>}
                    {candidateParticipant?.response === "pending" && ["scheduled", "confirmed"].includes(interview.status) && interviewAction !== interview.id && <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><button type="button" className="btn btn-primary" onClick={() => void respondToInterview(interview.id, "accepted")}>Confirm interview</button><button type="button" className="btn btn-ghost" onClick={() => void respondToInterview(interview.id, "declined")}>Decline invitation</button></div>}
                    {interviewAction === interview.id && <p className="muted" role="status">Saving your interview response…</p>}
                    {candidateParticipant && candidateParticipant.response !== "pending" && <p className="muted">Your response: {humanStatus(candidateParticipant.response)}</p>}
                    {(interview.change_proposals||[]).map(proposal=><div className="case-row" key={proposal.id}><div className="row" style={{justifyContent:"space-between",flexWrap:"wrap"}}><b>Proposed interview time</b><Badge>{humanStatus(proposal.status)}</Badge></div><p className="muted">{dateLabel(proposal.proposedStart,true)} – {dateLabel(proposal.proposedEnd,true)} · {proposal.timezone} · {proposal.mode.replaceAll("_"," ")}</p>{proposal.note&&<p>{proposal.note}</p>}{proposal.status==="pending"&&proposal.canDecide&&<div className="row" style={{gap:8,flexWrap:"wrap"}}><button type="button" className="btn btn-primary" disabled={interviewAction===proposal.id} onClick={()=>void decideInterviewChange(proposal.id,"accepted")}>Accept new time</button><button type="button" className="btn btn-ghost" disabled={interviewAction===proposal.id} onClick={()=>void decideInterviewChange(proposal.id,"declined")}>Keep original time</button></div>}{proposal.status==="pending"&&!proposal.canDecide&&<p className="muted">Waiting for the other participant to respond. The original time remains active.</p>}</div>)}
                    {interview.isParticipant&&["scheduled","confirmed"].includes(interview.status)&&!(interview.change_proposals||[]).some(proposal=>proposal.status==="pending")&&<form className="form-stack" onSubmit={e=>{e.preventDefault();void proposeInterviewChange(interview.id)}}><b>Propose a different time</b><label>New start time<input required type="datetime-local" disabled={interviewAction===interview.id} value={changeDrafts[interview.id]?.start||""} onChange={e=>setChangeDrafts(current=>({...current,[interview.id]:{start:e.target.value,end:current[interview.id]?.end||"",mode:current[interview.id]?.mode||interview.mode,note:current[interview.id]?.note||""}}))}/></label><label>New end time<input required type="datetime-local" disabled={interviewAction===interview.id} value={changeDrafts[interview.id]?.end||""} onChange={e=>setChangeDrafts(current=>({...current,[interview.id]:{start:current[interview.id]?.start||"",end:e.target.value,mode:current[interview.id]?.mode||interview.mode,note:current[interview.id]?.note||""}}))}/></label><label>Format<select disabled={interviewAction===interview.id} value={changeDrafts[interview.id]?.mode||interview.mode} onChange={e=>setChangeDrafts(current=>({...current,[interview.id]:{start:current[interview.id]?.start||"",end:current[interview.id]?.end||"",mode:e.target.value,note:current[interview.id]?.note||""}}))}><option value="online">Online</option><option value="onsite">On-site</option><option value="phone">Phone</option></select></label><label>Reason / note<textarea rows={2} disabled={interviewAction===interview.id} value={changeDrafts[interview.id]?.note||""} onChange={e=>setChangeDrafts(current=>({...current,[interview.id]:{start:current[interview.id]?.start||"",end:current[interview.id]?.end||"",mode:current[interview.id]?.mode||interview.mode,note:e.target.value}}))}/></label><button type="submit" className="btn btn-ghost" disabled={interviewAction===interview.id}>{interviewAction===interview.id?"Sending proposal…":"Propose new time"}</button></form>}
                  </div>;
                })}</div>}
                {jobProgress[item.id].application.status === "offer" && <div className="case-row"><b>Employment offer</b><p className="muted">{jobProgress[item.id].application.offer?.currency || ""} {jobProgress[item.id].application.offer?.amount ?? "Amount not specified"} · approval: {humanStatus(jobProgress[item.id].application.offer?.approvalStatus || "not required")}</p>{jobProgress[item.id].application.offer?.terms && <p>{jobProgress[item.id].application.offer?.terms}</p>}{jobProgress[item.id].application.offer?.approvalStatus === "pending" ? <p className="muted">The offer must be approved by the employer before you can respond.</p> : jobProgress[item.id].application.offer?.approvalStatus === "rejected" ? <p className="muted">This proposed offer was not approved.</p> : <button type="button" className="btn btn-primary" disabled={applicationAction === item.id} onClick={() => void respondToOffer(item.id, "accepted")}>{applicationAction === item.id ? "Saving response…" : "Accept approved offer"}</button>}</div>}
                {["submitted", "screening", "shortlisted", "interview", "offer", "accepted"].includes(jobProgress[item.id].application.status) && <button type="button" className="btn btn-ghost" disabled={applicationAction === item.id} onClick={() => void respondToOffer(item.id, "withdrawn")}>{applicationAction === item.id ? "Saving response…" : "Withdraw application"}</button>}
              </section>}
              {action && <div className="row" style={{ marginTop: 12 }}><Link className="btn btn-ghost" href={action.href}>{action.label} <ArrowRight size={15} /></Link></div>}
            </Card>
          );
        })}
        {!loading && !error && data?.items.length === 0 && (
          <div>
            <EmptyState title="No progress records to show yet" description="When you apply, request a service, submit a claim, join an initiative or begin mentorship, its progress will appear here." actionHref="/membership" actionLabel="Explore membership" />
            <p className="mt-2"><Link className="btn btn-ghost" href="/jobs">Browse opportunities</Link></p>
          </div>
        )}
        {data?.hasMore && (
          <div className="row" style={{ justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn btn-ghost" type="button" onClick={() => void load(true)} disabled={loading}>
              {loading ? "Loading applications…" : "Load more applications"}
            </button>
            <span className="muted">Showing {data.items.length} of {data.totalFiltered ?? data.summary.total}</span>
          </div>
        )}
      </section>
      <div className="footer-note"><ShieldCheck size={15} /> Private review notes and evidence remain protected by account permissions.</div>
    </div>
  );
}
