"use client";
import { BookOpenCheck, Building2, ClipboardList, CreditCard, FileBarChart, Fingerprint, HelpCircle, Mail, MessageSquareText, RefreshCw, Search, ShieldCheck, UserCog, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { OperationStatus } from "../../components/operation-status";
import { Badge, Card } from "../../components/ui";
import { api } from "../../lib/api";
import { useUiStore } from "../../lib/store";
import styles from "./admin-overview.module.css";
import { AdminPageHeader } from "./admin-page-header";

type AuditEvent = { id: string; actor_user_id?: string | null; action: string; resource_type: string; resource_id?: string | null; request_id?: string | null; outcome: string; metadata?: Record<string, unknown>; created_at: string };
type OperationalQueueRow = { Queue: string; Status: string; Requests: number; Unreviewed: number; "Average response hours": number | string | null };
type OperationalQueueSnapshot = { rows: OperationalQueueRow[]; generatedAt: string };
type Inquiry = {
  id: string;
  public_reference: string;
  inquiry_type: string;
  status: string;
  consider_non_member: boolean;
  contact_name: string;
  contact_email?: string;
  contact_phone?: string;
  intent: string;
  details: any;
  job_title?: string;
  preferred_mentor_name?: string;
};


export default function AdminPage() {
  const hydrated = useUiStore((s) => s.hydrated);
  const token = useUiStore((s) => s.token);
  const hydrateToken = useUiStore((s) => s.hydrateToken);
  const [tab, setTab] = useState<"inquiries" | "audit">("inquiries");
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [scopeResolved, setScopeResolved] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [canReviewInquiries, setCanReviewInquiries] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sectionErrors, setSectionErrors] = useState<string[]>([]);
  const [operationalQueues, setOperationalQueues] = useState<OperationalQueueSnapshot | null>(null);
  const [operationalQueueLoading, setOperationalQueueLoading] = useState(false);
  const [operationalQueueError, setOperationalQueueError] = useState("");
  const [moduleQuery, setModuleQuery] = useState("");

  useEffect(() => { hydrateToken(); }, [hydrateToken]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    setSectionErrors([]);
    const errors: string[] = [];
    const getList = async <T,>(path: string, key?: string): Promise<T[]> => {
      const payload = await api<any>(path, {}, token);
      const rows = Array.isArray(payload) ? payload : (key && Array.isArray(payload?.[key]) ? payload[key] : Array.isArray(payload?.items) ? payload.items : null);
      if (!rows) throw new Error(`The service returned an unexpected list response for ${path}.`);
      return rows as T[];
    };
    const settle = async <T,>(name: string, request: Promise<T>, apply: (value: T) => void) => {
      try { apply(await request); } catch (cause) {
        errors.push(name);
        if (cause instanceof Error && errors.length === 1) setError(cause.message);
      }
    };
    const tasks: Promise<void>[] = [
      settle("opportunity inquiries", getList<Inquiry>("/api/v1/opportunity-inquiries", "inquiries"), setInquiries),
    ];
    try {
      let claims: any = {};
      try { const segment = token.split(".")[1]; if (segment) claims = JSON.parse(atob(segment.replace(/-/g, "+").replace(/_/g, "/"))); } catch { /* Display hints only; server authorization remains authoritative. */ }
      const currentRoles = Array.isArray(claims?.roles) ? claims.roles.map((role: any) => typeof role === "string" ? role : role?.role_code).filter(Boolean) : [];
      setRoles(currentRoles);
      setIsPlatformAdmin(currentRoles.includes("system_admin") || currentRoles.includes("admin") || currentRoles.includes("platform_admin"));
      setCanReviewInquiries(currentRoles.includes("supporting_staff") || currentRoles.includes("system_admin") || currentRoles.includes("admin") || currentRoles.includes("platform_admin"));
      if (currentRoles.includes("system_admin")) {
        tasks.push(settle("audit history", getList<AuditEvent>("/api/v1/admin/audit-log?limit=100", "items"), setAuditEvents));
      } else { setAuditEvents([]); }
      setScopeResolved(true);
    } catch (cause) {
      setScopeResolved(true);
      if (cause instanceof Error) setError(cause.message);
    }
    await Promise.all(tasks);
    setSectionErrors(errors);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (hydrated && token) void load();
  }, [hydrated, token, load]);
  const canSeeOperationalQueues = roles.some((role) => ["system_admin", "admin", "platform_admin", "supporting_staff", "reviewer"].includes(role));
  const loadOperationalQueues = useCallback(async () => {
    if (!token) return;
    setOperationalQueueLoading(true);
    setOperationalQueueError("");
    try {
      const catalogue = await api<{ id: string }[]>("/api/v1/admin/reports", {}, token);
      if (!Array.isArray(catalogue) || !catalogue.some((report) => report.id === "support-demand-response")) {
        throw new Error("Your account cannot access the authoritative Support Desk queue report.");
      }
      const snapshot = await api<OperationalQueueSnapshot>("/api/v1/admin/reports/support-demand-response/run", { method: "POST", body: JSON.stringify({}) }, token);
      if (!snapshot || !Array.isArray(snapshot.rows) || !snapshot.generatedAt) {
        throw new Error("The queue report returned an incomplete response; counts cannot be confirmed.");
      }
      setOperationalQueues(snapshot);
    } catch (cause) {
      setOperationalQueues(null);
      setOperationalQueueError(cause instanceof Error ? cause.message : "Operational queue counts could not be verified.");
    } finally {
      setOperationalQueueLoading(false);
    }
  }, [token]);
  useEffect(() => {
    if (hydrated && token && canSeeOperationalQueues) void loadOperationalQueues();
  }, [hydrated, token, canSeeOperationalQueues, loadOperationalQueues]);
  const totalUnreviewed = (operationalQueues?.rows || []).reduce((sum, row) => sum + Math.max(0, Number(row.Unreviewed) || 0), 0);
  const operationalQueueLinks: Record<string, string> = { "Membership application": "/admin/membership", "Professional verification": "/verification", "Organization verification": "/organizations", "Marketplace demand": "/admin/marketplace" };
  const workspaces = [
    {title:"Organizations",desc:"Search organizations, inspect linked accounts and open verification review workflows.",href:"/admin/organizations",Icon:Building2,group:"Review & service",access:"org"},
    {title:"Account and Team",desc:"Search platform accounts, review status and manage roles with audit reasons.",href:"/admin/accounts",Icon:Users,group:"People & access",access:"admin"},
    {title:"Member records",desc:"Import approved member registers, resolve conflicts and export records.",href:"/admin/members",Icon:Users,group:"People & access",access:"admin"},
    {title:"Member catalogue",desc:"Search individual membership records and linked account status.",href:"/admin/members/catalog",Icon:Users,group:"People & access",access:"admin"},
    {title:"Membership operations",desc:"Membership plans, payment review and membership lifecycle controls.",href:"/admin/membership",Icon:ShieldCheck,group:"People & access",access:"admin"},
    {title:"Membership payment methods",desc:"Configure bank, Telebirr, cash and other manual payment instructions with finance-only access.",href:"/admin/membership/payment-methods",Icon:CreditCard,group:"People & access",access:"admin"},
    {title:"Serve-Community review",desc:"Moderate shared demand, listings and provider matching.",href:"/admin/marketplace",Icon:ClipboardList,group:"Review & service",access:"staff"},
    {title:"Support desk",desc:"Manage inquiries, handoffs and the support knowledge base.",href:"/admin/support",Icon:MessageSquareText,group:"Review & service",access:"staff"},
    {title:"Mentorship participant reports",desc:"Review confidential participant reports and record audited outcomes.",href:"/admin/mentorship-reports",Icon:ClipboardList,group:"Review & service",access:"support"},
    {title:"Mentorship interest review",desc:"Review consented mentor interest and propose specific matches.",href:"/admin/mentorship-interest",Icon:Users,group:"Review & service",access:"support"},
    {title:"Reports & exports",desc:"Generate scoped reports and audited exports.",href:"/admin/reports",Icon:FileBarChart,group:"Governance",access:"admin"},
    {title:"Reference data",desc:"Maintain governed professional options and staged imports.",href:"/admin/reference-portfolio",Icon:BookOpenCheck,group:"Governance",access:"admin"},
    {title:"Security",desc:"Manage administrator passkeys and recovery controls.",href:"/admin/security",Icon:Fingerprint,group:"Governance",access:"admin"},
    {title:"Email operations",desc:"Review delivery queues, templates and retries.",href:"/admin/email",Icon:Mail,group:"Governance",access:"admin"},
    {title:"Help, guides and demos",desc:"Manage contextual guides, launch training scenarios and find support resources.",href:"/admin/experience",Icon:HelpCircle,group:"Enablement",access:"admin"},
  ].filter((item) => (!moduleQuery.trim() || (item.title + " " + item.desc + " " + item.group).toLowerCase().includes(moduleQuery.trim().toLowerCase())) && (item.access === "org" ? roles.some(role => ["system_admin","admin","reviewer"].includes(role)) : item.access === "support" ? roles.some(role => ["system_admin","supporting_staff"].includes(role)) : item.access === "staff" ? isPlatformAdmin || roles.includes("supporting_staff") : isPlatformAdmin));


  async function decideInquiry(item: Inquiry, status: string, considerNonMember: boolean) {
    try {
      await api(`/api/v1/opportunity-inquiries/${item.id}`, { method: "PATCH", body: JSON.stringify({ status, consider_non_member: considerNonMember }) }, token);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the inquiry."); }
  }
  if (!hydrated) return <div className="auth-page"><Card><OperationStatus state="loading" title="Preparing the administrator workspace" detail="We’re checking your session and access before showing administrative tools." /></Card></div>;
  if (!token)

    return (
      <div className="auth-page">
        <Card>
          <div className="eyebrow">Platform administration</div>
          <h1 className="h1">Administrator sign-in required.</h1>
          <p className="muted">
            This workspace contains global platform controls. Reviewers should
            use their assigned workflow queues; organization access is managed
            in the organization workspace.
          </p>
          <a className="btn btn-primary" href="/login?next=/admin">
            Sign in to continue
          </a>
          <a
            className="btn btn-ghost"
            href="/dashboard"
            style={{ marginLeft: 8 }}
          >
            Personal dashboard
          </a>
        </Card>
      </div>
    );
  if (
    scopeResolved &&
    !error &&
    !isPlatformAdmin &&
    !roles.includes("supporting_staff")
  )
    return (
      <div className="auth-page">
        <Card>
          <div className="eyebrow">Platform administration</div>
          <h1 className="h1">This account has no platform-admin scope.</h1>
          <p className="muted">
            Use your personal dashboard, assigned review queues, or an
            organization workspace. Platform roles do not replace organization
            membership.
          </p>
          <a className="btn btn-primary" href="/dashboard">
            Open personal dashboard
          </a>
        </Card>
      </div>
    );
  return (
    <div className="grid">
      <AdminPageHeader eyebrow="MPA · Platform operations" title="Admin overview" description="A focused starting point for operational queues, assigned reviews and authorized platform workspaces." actions={<div className={styles.roleChips}>{roles.map((role) => <Badge key={role} tone="slate">{role.replaceAll("_", " ")}</Badge>)}</div>} />
      <section className={styles.welcome} aria-label="Operational overview">
        <div className={styles.welcomeCopy}><span className={styles.kicker}>OPERATIONS WORKSPACE</span><h2>Good administration starts with clear queues.</h2><p>Choose the workspace for the task at hand. Sensitive records stay within their existing permission boundaries and review flows.</p></div>
        <div className={styles.searchWrap}><label htmlFor="admin-workspace-search">Find a workspace</label><div className={styles.searchBox}><Search size={18} aria-hidden="true"/><input id="admin-workspace-search" value={moduleQuery} onChange={(event) => setModuleQuery(event.target.value)} placeholder="Search members, organizations, reports…" /></div></div>
      </section>
      <section className={styles.metrics} aria-label="Overview summary">
        <article className={styles.metric}><span>Opportunity inquiries</span><strong>{!canReviewInquiries ? "—" : loading ? "…" : sectionErrors.includes("opportunity inquiries") ? "Unavailable" : inquiries.length}</strong><small>{!canReviewInquiries ? "Review permission required" : loading ? "Retrieving current results" : sectionErrors.includes("opportunity inquiries") ? "Could not verify this count · retry to check" : "Records returned to this workspace"}</small></article>
        <article className={styles.metric}><span>Available workspaces</span><strong>{workspaces.length}</strong><small>Filtered by your assigned platform role</small></article>
      </section>
      {canSeeOperationalQueues && (
        <section className={styles.section} aria-labelledby="admin-operational-queues-heading">
          <div className={styles.sectionHeader}>
            <div><h2 id="admin-operational-queues-heading">Live operational queues</h2><p>Counts come from the existing audited Support Desk report, which groups authoritative membership, professional verification, organization verification and Serve-Community demand records. No counts are inferred from the first page of a catalogue.</p></div>
            <button type="button" className="btn btn-ghost" onClick={() => void loadOperationalQueues()} disabled={operationalQueueLoading}><RefreshCw size={16} aria-hidden="true"/>{operationalQueueLoading ? "Checking queues…" : "Refresh queue counts"}</button>
          </div>
          {operationalQueueLoading && !operationalQueues ? <Card><OperationStatus state="loading" title="Checking authoritative queue counts" detail="Retrieving the latest grouped counts and stored review timing from the backend report." /></Card> : operationalQueueError ? <Card><div role="alert"><strong>Operational queue counts unavailable</strong><p className="muted">{operationalQueueError} The dashboard will not substitute zero or a partial page count.</p><button type="button" className="btn btn-ghost" onClick={() => void loadOperationalQueues()} disabled={operationalQueueLoading}>Retry queue report</button></div></Card> : operationalQueues ? <>
            <div className={styles.metrics} aria-label="Authoritative review alerts">
              <article className={styles.metric}><span>Unreviewed work items</span><strong>{totalUnreviewed}</strong><small>{totalUnreviewed ? "Backend-reported items awaiting review" : "No unreviewed items reported by this snapshot"}</small></article>
              <article className={styles.metric}><span>Queue groups</span><strong>{new Set(operationalQueues.rows.map(row => row.Queue)).size}</strong><small>Across the report's supported work areas</small></article>
              <article className={styles.metric}><span>Report snapshot</span><strong>{new Date(operationalQueues.generatedAt).toLocaleTimeString()}</strong><small>{new Date(operationalQueues.generatedAt).toLocaleDateString()} · backend generation time</small></article>
            </div>
            {totalUnreviewed > 0 && <div className="field-banner" role="status"><ShieldCheck size={18} aria-hidden="true"/><span>{totalUnreviewed} unreviewed item{totalUnreviewed === 1 ? "" : "s"} reported. Open the relevant workflow below to review the actual records; this alert does not change their status.</span></div>}
            <div className={styles.moduleGrid}>
              {[...new Set(operationalQueues.rows.map(row => row.Queue))].map(queue => {
                const rows = operationalQueues.rows.filter(row => row.Queue === queue);
                const unreviewed = rows.reduce((sum, row) => sum + Math.max(0, Number(row.Unreviewed) || 0), 0);
                const requests = rows.reduce((sum, row) => sum + Math.max(0, Number(row.Requests) || 0), 0);
                return <a className={styles.moduleCard} href={operationalQueueLinks[queue] || "/admin/reports"} key={queue}><span className={styles.moduleIcon}><ClipboardList size={20} aria-hidden="true"/></span><span className={styles.moduleCopy}><small>{unreviewed ? "Needs review" : "Queue snapshot"}</small><strong>{queue}</strong><span>{requests} requests in the report; {unreviewed} unreviewed. Counts are grouped by stored status.</span></span><span className={styles.moduleArrow} aria-hidden="true">↗</span></a>;
              })}
            </div>
          </> : <Card><p className="muted">No queue report snapshot has been loaded yet.</p><button type="button" className="btn btn-ghost" onClick={() => void loadOperationalQueues()}>Load queue counts</button></Card>}
        </section>
      )}
      <section className={styles.section} aria-labelledby="admin-workspaces-heading">
        <div className={styles.sectionHeader}><div><h2 id="admin-workspaces-heading">Workspaces</h2><p>Open a focused workspace to search, review and take authorized action.</p></div><span className={styles.sectionCount}>Core administration</span></div>
        <div className={styles.moduleGrid}>
          {workspaces.map(({title,desc,href,Icon,group}) => (
            <a className={styles.moduleCard} href={href} key={href}>
              <span className={styles.moduleIcon}><Icon size={20} aria-hidden="true"/></span>
              <span className={styles.moduleCopy}><small>{group}</small><strong>{title}</strong><span>{desc}</span></span>
              <span className={styles.moduleArrow} aria-hidden="true">↗</span>
            </a>
          ))}
        </div>
        {moduleQuery.trim() && workspaces.length === 0 && <p className={styles.noResults} role="status">No available workspace matches “{moduleQuery}”. Try another search term or clear the search.</p>}
      </section>
      {error && (
        <div className="field-banner" role="alert">
          <ShieldCheck size={18} />
          <span>{error}</span>
          <button type="button" className="btn btn-ghost" onClick={() => void load()} disabled={loading}>{loading ? "Checking…" : "Retry overview"}</button>
        </div>
      )}
      {sectionErrors.length > 0 && (
        <div className="field-banner" role="status">
          <ShieldCheck size={18} />
          <span>
            These sections could not be loaded: {sectionErrors.join(", ")}.
            Other authorized sections remain available.
          </span>
        </div>
      )}
      <div className="admin-tabs" aria-label="Admin review tabs">
        {([
          ...(canReviewInquiries ? [["inquiries", "Opportunity inquiries", loading ? "…" : sectionErrors.includes("opportunity inquiries") ? "—" : inquiries.length] as [typeof tab, string, string | number]] : []),
          ...(roles.includes("system_admin") ? [["audit", "Audit history", loading ? "…" : sectionErrors.includes("audit history") ? "—" : auditEvents.length] as [typeof tab, string, string | number]] : []),
        ] as [typeof tab, string, string | number][]).map(([key, label, count]) => (
          <button type="button" key={key} className={`btn admin-tab ${tab === key ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab(key)}>
            {key === "inquiries" ? <UserCog size={16} /> : <ShieldCheck size={16} />} {label} ({count})
          </button>
        ))}
      </div>
      {tab === "audit" && roles.includes("system_admin") && (
        <Card>
          <div className="h2">Administrative audit history</div>
          <p className="muted">Read-only view of the latest 100 consequential platform events. Use the action, actor, time and resource details to investigate changes; access is restricted by the server.</p>
          {sectionErrors.includes("audit history") ? <OperationStatus state="error" title="Audit history could not be loaded" detail="Retry after confirming your administrator session and audit permissions." /> : auditEvents.length === 0 ? <p className="muted">No audit events were returned in the latest 100 records.</p> : auditEvents.map((event) => (
            <div className="case-row" key={event.id}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><b>{event.action.replaceAll("_", " ")}</b><Badge>{event.outcome}</Badge></div>
                <p className="muted">{event.created_at ? new Date(event.created_at).toLocaleString() : "Time unavailable"} · {event.resource_type || "resource"} · {event.resource_id || "No resource ID"}</p>
                <p className="muted">Actor: {event.actor_user_id || "System"}{event.request_id ? ` · Request: ${event.request_id}` : ""}</p>
                {event.metadata && Object.keys(event.metadata).length > 0 ? <details><summary>Change details</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(event.metadata, null, 2)}</pre></details> : null}
              </div>
            </div>
          ))}
        </Card>
      )}
      {tab === "inquiries" && canReviewInquiries && (
        <Card>
          <div className="h2">Public opportunity inquiries</div>
          <p className="muted">
            This is the supporting-staff inquiry workflow. Non-member
            consideration does not bypass membership, verification or ATS
            governance.
          </p>
          {inquiries.length === 0 ? (
            <p className="muted">No inquiries are waiting.</p>
          ) : (
            inquiries.map((i) => (
              <div className="case-row" key={i.id}>
                <div>
                  <div className="row" style={{ justifyContent: "flex-start" }}>
                    <b>{i.contact_name}</b>
                    <Badge>{i.inquiry_type}</Badge>
                    <Badge tone="slate">{i.status}</Badge>
                  </div>
                  <div className="muted">
                    {i.job_title ||
                      i.preferred_mentor_name ||
                      "General inquiry"}{" "}
                    · {i.contact_email || i.contact_phone}
                  </div>
                  <p className="muted">{i.intent}</p>
                  <small className="muted">
                    Reference {i.public_reference} · details{" "}
                    {i.details && Object.keys(i.details).length
                      ? "received"
                      : "not yet received"}
                  </small>
                </div>
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  <button type="button"
                    className="btn btn-ghost"
                    onClick={() => decideInquiry(i, "considering", true)}
                  >
                    Consider non-member
                  </button>
                  <button type="button"
                    className="btn btn-primary"
                    onClick={() =>
                      decideInquiry(i, "invited", i.consider_non_member)
                    }
                  >
                    Invite / continue
                  </button>
                  <button type="button"
                    className="btn btn-ghost"
                    onClick={() => decideInquiry(i, "declined", false)}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))
          )}
        </Card>
      )}
      <div className="footer-note">
        Amanah (Trust) · Tabayyun (Verification) · Satr (Confidentiality) ·
        Ihsan (Excellence)
      </div>
    </div>
  );
}
