"use client";

import { ArrowRight, ClipboardCopy, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FormFeedback } from "../../components/form-feedback";
import { OperationStatus } from "../../components/operation-status";
import { Badge, Card } from "../../components/ui";
import { api } from "../../lib/api";
import { humanStatus } from "../../lib/status-labels";
import { useUiStore } from "../../lib/store";

type Item = {
  id: string;
  trackingReference?: string;
  type: string;
  title: string;
  subtitle: string;
  status: string;
  statusLabel: string;
  updatedAt: string;
  submittedAt: string | null;
  nextAction: string;
  details: Record<string, unknown>;
};
type Tracking = {
  items: Item[];
  summary: { total: number; active: number; nextSteps: number; jobApplications: number };
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
const PAGE_SIZE = 20;

function actionFor(item: Item) {
  if (item.nextAction === "No action required") return null;
  if (item.type === "membership") return { href: "/membership", label: "Open membership" };
  if (item.type === "organization") return { href: "/organizations", label: "Open organization" };
  if (item.type === "job") return { href: "/jobs", label: "Open opportunities" };
  return { href: "/dashboard", label: "Open dashboard" };
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
  const [error, setError] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const [loading, setLoading] = useState(true);

  async function copyReference(value: string) { const ref=String(value||"").trim(); if(!ref){setCopyNotice("No display reference is available yet.");return;} try { await navigator.clipboard.writeText(ref); setCopyNotice("Reference copied to clipboard."); } catch { setCopyNotice("Clipboard access is unavailable. Select the displayed reference and copy it manually."); } }

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
        `/api/v1/me/application-tracking?limit=${PAGE_SIZE}&offset=${offset}`,
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your application progress could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [token]);

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

      <section className="grid" aria-label="Application progress" style={{ gap: 12 }}>
        {loading && !data && <Card><OperationStatus state="loading" title="Loading your application progress" detail="We’re gathering your membership, organization and job application updates. Your saved applications are not being changed." /></Card>}
        {(data?.items || []).map((item) => {
          const action = actionFor(item);
          return (
            <Card key={`${item.type}-${item.id}`}>
              <div className="row" style={{ alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                  <Badge>{item.type.replaceAll("_", " ")}</Badge>
                  <h2 className="h2" style={{ margin: "8px 0 4px" }}>{item.title}</h2>
                  <p className="muted" style={{ margin: 0 }}>{item.subtitle}</p>
                  <p className="muted" style={{ margin: "4px 0 0" }}>Reference: {item.trackingReference || "Not assigned yet"}</p>{item.trackingReference&&<button type="button" className="btn btn-ghost" onClick={()=>void copyReference(item.trackingReference||"")}><ClipboardCopy size={15}/> Copy reference</button>}{copyNotice&&<p className="muted" role="status">{copyNotice}</p>}
                </div>
                <span className="badge">{item.statusLabel || humanStatus(item.status)}</span>
              </div>
              <div className="track-card-grid">
                <div><span>Last updated</span><b>{dateLabel(item.updatedAt, true)}</b></div>
                <div><span>Next step</span><b>{item.nextAction || "Check back for updates"}</b></div>
              </div>
              <div className="tracker-line">
                <span className="timeline-dot" />
                <div><b>{item.statusLabel || humanStatus(item.status)}</b><p className="muted">Submitted {dateLabel(item.submittedAt)}</p></div>
              </div>
              {action && <div className="row" style={{ marginTop: 12 }}><Link className="btn btn-ghost" href={action.href}>{action.label} <ArrowRight size={15} /></Link></div>}
            </Card>
          );
        })}
        {!loading && !error && data?.items.length === 0 && (
          <Card>
            <h2 className="h2">No applications to show yet</h2>
            <p className="muted">When you submit a membership, organization or job application, its progress will appear here.</p>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <Link className="btn btn-primary" href="/membership">Explore membership</Link>
              <Link className="btn btn-ghost" href="/jobs">Browse opportunities</Link>
            </div>
          </Card>
        )}
        {data?.hasMore && (
          <div className="row" style={{ justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn btn-ghost" type="button" onClick={() => void load(true)} disabled={loading}>
              {loading ? "Loading applications…" : "Load more applications"}
            </button>
            <span className="muted">Showing {data.items.length} of {data.summary.total}</span>
          </div>
        )}
      </section>
      <div className="footer-note"><ShieldCheck size={15} /> Private review notes and evidence remain protected by account permissions.</div>
    </div>
  );
}
