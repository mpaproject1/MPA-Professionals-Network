"use client";
import {
  BookOpenCheck,
  Building2,
  ClipboardList,
  Edit3,
  FileBarChart,
  Fingerprint,
  FlaskConical,
  HelpCircle,
  Mail,
  MessageSquareText,
  PauseCircle,
  PlayCircle,
  Save,
  Search,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useState } from "react";
import { OperationStatus } from "../../components/operation-status";
import { Badge, Card } from "../../components/ui";
import { api } from "../../lib/api";
import { useUiStore } from "../../lib/store";
import styles from "./admin-overview.module.css";
import { AdminPageHeader } from "./admin-page-header";
import { type ManagedRole, type ManagedUser, UsersTable } from "./users-table";

type Demo = {
  id: string;
  case_key: string;
  title: string;
  business_area: string;
  persona: string;
  description: string;
  start_path: string;
  scenario: any;
  active: boolean;
};
type Guide = {
  id: string;
  guide_key: string;
  route_pattern: string;
  title: string;
  description: string;
  steps: any[];
  active: boolean;
};
type CurrentUser = { user_id: string; roles: string[] };
type ManagedPermission = { permission_code: string; area: string; label: string; description: string; sensitive: boolean; system_only: boolean };
type AuditEvent = { id: string; actor_user_id?: string | null; action: string; resource_type: string; resource_id?: string | null; request_id?: string | null; outcome: string; metadata?: Record<string, unknown>; created_at: string };
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
  const [tab, setTab] = useState<"cases" | "guides" | "inquiries" | "users" | "audit">("cases");
  const [cases, setCases] = useState<Demo[]>([]);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roleCatalog, setRoleCatalog] = useState<ManagedRole[]>([]);
  const [permissionCatalog, setPermissionCatalog] = useState<ManagedPermission[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [scopeResolved, setScopeResolved] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [canReviewInquiries, setCanReviewInquiries] = useState(false);
  const [error, setError] = useState("");
  const [sectionErrors, setSectionErrors] = useState<string[]>([]);
  const [moduleQuery, setModuleQuery] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [userStatus, setUserStatus] = useState("");
  const [editing, setEditing] = useState<Demo | null>(null);

  useEffect(() => { hydrateToken(); }, [hydrateToken]);

  const load = useCallback(async () => {
    if (!token) return;
    setError("");
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
      settle("demo cases", getList<Demo>("/api/v1/experience/demo-cases", "cases"), setCases),
      settle("user guides", getList<Guide>("/api/v1/experience/guides", "guides"), setGuides),
      settle("opportunity inquiries", getList<Inquiry>("/api/v1/opportunity-inquiries", "inquiries"), setInquiries),
    ];
    if (userQuery.trim() || userStatus) {
      const params = new URLSearchParams();
      if (userQuery.trim()) params.set("q", userQuery.trim());
      if (userStatus) params.set("status", userStatus);
      params.set("limit", "200");
      tasks.push(settle("users", getList<ManagedUser>(`/api/v1/admin/users?${params.toString()}`, "users"), setUsers));
    } else {
      tasks.push(settle("users", getList<ManagedUser>("/api/v1/admin/users?limit=200", "users"), setUsers));
    }
    try {
      const catalog = await api<any>("/api/v1/admin/roles", {}, token);
      const normalizedCatalog = Array.isArray(catalog) ? catalog : (Array.isArray(catalog?.roles) ? catalog.roles : []);
      setRoleCatalog(normalizedCatalog as ManagedRole[]);
      let claims: any = {};
      try { const segment = token.split(".")[1]; if (segment) claims = JSON.parse(atob(segment.replace(/-/g, "+").replace(/_/g, "/"))); } catch { /* Display hints only; server authorization remains authoritative. */ }
      const currentRoles = Array.isArray(claims?.roles) ? claims.roles.map((role: any) => typeof role === "string" ? role : role?.role_code).filter(Boolean) : [];
      setRoles(currentRoles);
      setCurrentUserId(String(claims?.sub ?? claims?.user_id ?? ""));
      setIsPlatformAdmin(currentRoles.includes("system_admin") || currentRoles.includes("admin") || currentRoles.includes("platform_admin"));
      setCanReviewInquiries(currentRoles.includes("supporting_staff") || currentRoles.includes("system_admin") || currentRoles.includes("admin") || currentRoles.includes("platform_admin"));
      if (currentRoles.includes("system_admin")) {
        try { const permissions = await api<ManagedPermission[]>("/api/v1/admin/permissions", {}, token); setPermissionCatalog(Array.isArray(permissions) ? permissions : []); }
        catch { errors.push("permission catalog"); }
        tasks.push(settle("audit history", getList<AuditEvent>("/api/v1/admin/audit-log?limit=100", "items"), setAuditEvents));
      } else { setPermissionCatalog([]); setAuditEvents([]); }
      setScopeResolved(true);
    } catch (cause) {
      setScopeResolved(true);
      if (cause instanceof Error) setError(cause.message);
    }
    await Promise.all(tasks);
    setSectionErrors(errors);
  }, [token, userQuery, userStatus]);

  useEffect(() => {
    if (hydrated && token) void load();
  }, [hydrated, token, load]);
  const workspaces = [
    {title:"Organizations",desc:"Search organizations, inspect linked accounts and open verification review workflows.",href:"/admin/organizations",Icon:Building2,group:"Review & service",access:"org"},
    {title:"Accounts & roles",desc:"Search platform accounts, review status and manage roles with audit reasons.",href:"#account-governance",Icon:Users,group:"People & access",access:"admin"},
    {title:"Member records",desc:"Import approved member registers, resolve conflicts and export records.",href:"/admin/members",Icon:Users,group:"People & access",access:"admin"},
    {title:"Member catalogue",desc:"Search individual membership records and linked account status.",href:"/admin/members/catalog",Icon:Users,group:"People & access",access:"admin"},
    {title:"Membership operations",desc:"Membership plans, payment review and membership lifecycle controls.",href:"/admin/membership",Icon:ShieldCheck,group:"People & access",access:"admin"},
    {title:"Serve-Community review",desc:"Moderate shared demand, listings and provider matching.",href:"/admin/marketplace",Icon:ClipboardList,group:"Review & service",access:"staff"},
    {title:"Support desk",desc:"Manage inquiries, handoffs and the support knowledge base.",href:"/admin/support",Icon:MessageSquareText,group:"Review & service",access:"staff"},
    {title:"Reports & exports",desc:"Generate scoped reports and audited exports.",href:"/admin/reports",Icon:FileBarChart,group:"Governance",access:"admin"},
    {title:"Reference data",desc:"Maintain governed professional options and staged imports.",href:"/admin/reference-portfolio",Icon:BookOpenCheck,group:"Governance",access:"admin"},
    {title:"Security",desc:"Manage administrator passkeys and recovery controls.",href:"/admin/security",Icon:Fingerprint,group:"Governance",access:"admin"},
    {title:"Email operations",desc:"Review delivery queues, templates and retries.",href:"/admin/email",Icon:Mail,group:"Governance",access:"admin"},
  ].filter((item) => (!moduleQuery.trim() || (item.title + " " + item.desc + " " + item.group).toLowerCase().includes(moduleQuery.trim().toLowerCase())) && (item.access === "org" ? roles.some(role => ["system_admin","admin","reviewer"].includes(role)) : item.access === "staff" ? isPlatformAdmin || roles.includes("supporting_staff") : isPlatformAdmin));


  async function patchCase(item: Demo, active: boolean) {
    try {
      await api(`/api/v1/admin/experience/demo-cases/${item.id}`, { method: "PATCH", body: JSON.stringify({ active }) }, token);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the demo case."); }
  }
  async function patchGuide(item: Guide, active: boolean) {
    try {
      await api(`/api/v1/admin/experience/guides/${item.id}`, { method: "PATCH", body: JSON.stringify({ active }) }, token);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the guide."); }
  }
  async function decideInquiry(item: Inquiry, status: string, considerNonMember: boolean) {
    try {
      await api(`/api/v1/opportunity-inquiries/${item.id}`, { method: "PATCH", body: JSON.stringify({ status, consider_non_member: considerNonMember }) }, token);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the inquiry."); }
  }
  function launch(item: Demo) {
    if (!item.active) return;
    if (typeof window !== "undefined") window.location.assign(item.start_path || "/");
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
      <AdminPageHeader eyebrow="MPA · Platform operations" title="Admin overview" description="A single starting point for account governance, member records, organization review, community moderation and platform controls." actions={<div className={styles.roleChips}>{roles.map((role) => <Badge key={role} tone="slate">{role.replaceAll("_", " ")}</Badge>)}</div>} />
      <section className={styles.welcome} aria-label="Operational overview">
        <div className={styles.welcomeCopy}><span className={styles.kicker}>OPERATIONS WORKSPACE</span><h2>Good administration starts with clear queues.</h2><p>Choose the workspace for the task at hand. Sensitive records stay within their existing permission boundaries and review flows.</p></div>
        <div className={styles.searchWrap}><label htmlFor="admin-workspace-search">Find a workspace</label><div className={styles.searchBox}><Search size={18} aria-hidden="true"/><input id="admin-workspace-search" value={moduleQuery} onChange={(event) => setModuleQuery(event.target.value)} placeholder="Search members, organizations, reports…" /></div></div>
      </section>
      <section className={styles.metrics} aria-label="Loaded operational records">
        <article className={styles.metric}><span>Account records loaded</span><strong>{isPlatformAdmin ? users.length : "—"}</strong><small>{isPlatformAdmin ? "Up to 200 accounts · current query" : "Platform administrator access required"}</small></article>
        <article className={styles.metric}><span>Experience scenarios</span><strong>{isPlatformAdmin ? cases.length : "—"}</strong><small>Configured walkthrough scenarios</small></article>
        <article className={styles.metric}><span>Contextual guides</span><strong>{isPlatformAdmin ? guides.length : "—"}</strong><small>Configured user guides</small></article>
        <article className={styles.metric}><span>Opportunity inquiries</span><strong>{canReviewInquiries ? inquiries.length : "—"}</strong><small>Records returned to this workspace</small></article>
      </section>
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
      <section className={styles.section} id="account-governance" aria-labelledby="admin-governance-heading">
        <div className={styles.sectionHeader}><div><h2 id="admin-governance-heading">Experience & governance tools</h2><p>Less-frequent configuration tools are kept below the operational workspaces.</p></div></div>
      </section>
      {error && (
        <div className="field-banner">
          <ShieldCheck size={18} />
          <span>{error}</span>
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
      <div className="admin-tabs">
        {(
          [
            ...(isPlatformAdmin
              ? [
                  ["cases", "Demo cases", cases.length],
                  ["guides", "User guides", guides.length],
                  ["users", "Users & roles", users.length],
                  ...(roles.includes("system_admin") ? [["audit", "Audit history", auditEvents.length] as [typeof tab, string, number]] : []),
                ]
              : []),
            ...(canReviewInquiries
              ? [["inquiries", "Opportunity inquiries", inquiries.length]]
              : []),
          ] as [typeof tab, string, number][]
        ).map(([key, label, count]) => (
          <button type="button"
            key={key}
            className={
              `btn admin-tab ${tab === key ? "btn-primary" : "btn-ghost"}`
            }
            onClick={() => setTab(key)}
          >
            {key === "cases" ? (
              <FlaskConical size={16} />
            ) : key === "guides" ? (
              <HelpCircle size={16} />
            ) : key === "inquiries" ? (
              <UserCog size={16} />
            ) : (
              <ShieldCheck size={16} />
            )}{" "}
            {label} ({count})
          </button>
        ))}
      </div>
      {tab === "cases" && (
        <Card>
          <div className="row">
            <div>
              <div className="h2">Business scenario catalogue</div>
              <div className="muted">
                Controlled experiences for training, UAT and stakeholder
                walkthroughs.
              </div>
            </div>
          </div>
          {cases.map((d) => (
            <div className="case-row" key={d.id}>
              <div>
                <div className="row" style={{ justifyContent: "flex-start" }}>
                  <b>{d.title}</b>
                  <Badge tone={d.active ? "green" : "slate"}>
                    {d.active ? "Active" : "Paused"}
                  </Badge>
                </div>
                <div className="muted">
                  {d.business_area} · {d.persona}
                </div>
                <p className="muted">{d.description}</p>
              </div>
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-ghost" onClick={() => setEditing(d)}>
                  <Edit3 size={15} /> Edit
                </button>
                <button type="button"
                  className="btn btn-primary"
                  onClick={() => launch(d)}
                  disabled={!d.active}
                >
                  <PlayCircle size={15} /> Play
                </button>
                <button type="button"
                  className="btn btn-ghost"
                  onClick={() => patchCase(d, !d.active)}
                >
                  {d.active ? (
                    <PauseCircle size={15} />
                  ) : (
                    <PlayCircle size={15} />
                  )}{" "}
                  {d.active ? "Pause" : "Activate"}
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}
      {tab === "guides" && (
        <Card>
          <div className="h2">Contextual walkthroughs</div>
          <p className="muted">
            Guides spotlight real controls and explain each workspace
            step-by-step.
          </p>
          {guides.map((g) => (
            <div className="case-row" key={g.id}>
              <div>
                <div className="row" style={{ justifyContent: "flex-start" }}>
                  <b>{g.title}</b>
                  <Badge>{g.route_pattern}</Badge>
                </div>
                <div className="muted">{g.description}</div>
                <small className="muted">{g.steps.length} guided steps</small>
              </div>
              <button type="button"
                className="btn btn-ghost"
                onClick={() => patchGuide(g, !g.active)}
              >
                {g.active ? (
                  <PauseCircle size={15} />
                ) : (
                  <PlayCircle size={15} />
                )}{" "}
                {g.active ? "Disable" : "Enable"}
              </button>
            </div>
          ))}
        </Card>
      )}
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
      {tab === "users" && isPlatformAdmin && (
        <Card>
          <div className="h2">Accounts and platform roles</div>
          <p className="muted">
            Account records are retained for audit and history. Suspend or
            disable access rather than deleting an account. Each action needs a
            reason in that account’s row. Invitations are not implemented yet.
          </p>
          <form
            className="row"
            style={{ flexWrap: "wrap", margin: "14px 0" }}
            onSubmit={(event) => {
              event.preventDefault();
              void load();
            }}
          >
            <label style={{ flex: "1 1 240px" }}>
              Search accounts
              <input
                value={userQuery}
                onChange={(event) => setUserQuery(event.target.value)}
                placeholder="Email or username"
              />
            </label>
            <label>
              Status
              <select
                value={userStatus}
                onChange={(event) => setUserStatus(event.target.value)}
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>
            <button className="btn btn-primary" type="submit">
              <Search size={15} /> Search
            </button>
          </form>
          <p className="muted">
            Showing up to 200 matching accounts. “Remove role” changes a
            platform role only; organization/job roles remain in their own
            scoped workspaces.
          </p>
          <UsersTable
            users={users}
            roleCatalog={roleCatalog}
            permissionCatalog={permissionCatalog}
            currentRoles={roles}
            currentUserId={currentUserId}
            token={token}
            onChanged={load}
            onError={setError}
            usersLoadFailed={sectionErrors.includes('users')}
          />
        </Card>
      )}
      {editing && (
        <CaseEditor
          demo={editing}
          token={token}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
      <div className="footer-note">
        Amanah (Trust) · Tabayyun (Verification) · Satr (Confidentiality) ·
        Ihsan (Excellence)
      </div>
    </div>
  );
}
function CaseEditor({
  demo,
  token,
  onClose,
  onSaved,
}: {
  demo: Demo;
  token: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(demo.title),
    [description, setDescription] = useState(demo.description),
    [persona, setPersona] = useState(demo.persona),
    [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await api(
        `/api/v1/admin/experience/demo-cases/${demo.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ title, description, persona }),
        },
        token,
      );
      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="guide-overlay">
      <button type="button" className="guide-dim" aria-label="Close guide overlay" onClick={onClose} />
      <aside className="guide-card">
        <div className="row">
          <b>Edit demo case</b>
          <button type="button" className="icon-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={field}
          />
        </label>
        <label>
          Persona
          <input
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            style={field}
          />
        </label>
        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            style={field}
          />
        </label>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          <Save size={15} /> {saving ? "Saving…" : "Save changes"}
        </button>
      </aside>
    </div>
  );
}
const field: CSSProperties = {
  padding: 10,
  border: "1px solid var(--border)",
  borderRadius: 10,
  background: "var(--bg)",
  color: "var(--text)",
};
