"use client";

import { Building2, ChevronDown, RefreshCw, Search, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { FormFeedback } from "../../../components/form-feedback";
import { OperationStatus } from "../../../components/operation-status";
import { Badge, Card } from "../../../components/ui";
import { ApiError, api } from "../../../lib/api";
import { useUiStore } from "../../../lib/store";
import { AdminPageHeader } from "../admin-page-header";
import styles from "./organizations.module.css";

type Account = { userId: string; email: string; username: string; accountStatus: string; role: string; membershipStatus: string };
type Organization = {
 id: string; tracking_reference?: string | null; legal_name: string; display_name: string;
 organization_type?: string | null; email?: string | null; phone?: string | null;
 verification_status?: string | null; review_status: string; public_visible: boolean;
 created_at: string; updated_at?: string | null; verification_submitted_at?: string | null;
 account_count: number; active_account_count: number; accounts: Account[];
};
type Result = { items: Organization[]; total: number; limit: number; offset: number; hasMore: boolean };

const statuses = [
 { value: "", label: "All statuses" }, { value: "submitted", label: "Submitted for review" },
 { value: "pending", label: "Pending" }, { value: "verified", label: "Verified" },
 { value: "correction_required", label: "Correction required" }, { value: "rejected", label: "Rejected" },
 { value: "draft", label: "Draft" }, { value: "unverified", label: "Unverified" },
];
function statusTone(value: string): "green" | "gold" | "slate" { return value === "verified" ? "green" : ["submitted", "pending", "correction_required"].includes(value) ? "gold" : "slate"; }

export default function AdminOrganizationsPage() {
 const token = useUiStore(s => s.token);
 const hydrated = useUiStore(s => s.hydrated);
 const hydrateToken = useUiStore(s => s.hydrateToken);
 const [result, setResult] = useState<Result | null>(null);
 const [q, setQ] = useState("");
 const [status, setStatus] = useState("");
 const [page, setPage] = useState(0);
 const [expanded, setExpanded] = useState<string | null>(null);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState("");
 const [notice, setNotice] = useState("");

 const load = useCallback(async () => {
  if (!token) return;
  setBusy(true); setError("");
  try {
   const params = new URLSearchParams({ q, status, limit: "25", offset: String(page * 25) });
   const data = await api<Result>(`/api/v1/admin/organizations?${params.toString()}`, {}, token);
   setResult(data);
   if (expanded && !data.items.some(item => item.id === expanded)) setExpanded(null);
  } catch (e) {
   setError(e instanceof ApiError || e instanceof Error ? e.message : "Organization catalogue could not be loaded.");
  } finally { setBusy(false); }
 }, [token, q, status, page, expanded]);

 useEffect(() => { hydrateToken(); }, [hydrateToken]);
 useEffect(() => { if (hydrated && token) void load(); }, [hydrated, token, load]);

 if (!hydrated) return <div className="grid" style={{ gap: 16 }}><h1 className="h1">Organization administration</h1><Card><OperationStatus state="loading" title="Preparing organization catalogue" detail="Checking your session before loading private organization and account relationships." /></Card></div>;
 if (!token) return <div className="grid" style={{ gap: 16 }}><h1 className="h1">Organization administration</h1><Card><p>Sign in with an authorized administrator account to access organization records.</p><a className="btn btn-primary" href="/login?next=/admin/organizations">Sign in</a></Card></div>;

 return <div className="grid" style={{ gap: 18, minWidth: 0 }}>
  <AdminPageHeader eyebrow="Administration · Organization governance" title="Organizations & accounts" description="Search the organization register, inspect verification state and review each organization's account relationships separately. This catalogue is read-only; verification decisions and account changes remain in their existing audited workflows." actions={<><a className="btn btn-ghost" href="/admin">Admin overview</a><a className="btn btn-ghost" href="/organizations">Organization review workspace</a></>} />
  {error && <FormFeedback kind="error" message={error} onRetry={() => void load()} retryLabel="Retry loading" />}
  {notice && <FormFeedback kind="success" message={notice} />}
  <section className={styles.stats} aria-label="Organization register summary">
   <Card><span className={styles.statLabel}>Matching organizations</span><strong>{result?.total ?? "—"}</strong><small>Current search and status filter</small></Card>
   <Card><span className={styles.statLabel}>Verified on this page</span><strong>{result?.items.filter(item => item.review_status === "verified").length ?? "—"}</strong><small>Among the loaded records</small></Card>
   <Card><span className={styles.statLabel}>Accounts linked on this page</span><strong>{result?.items.reduce((sum, item) => sum + item.account_count, 0) ?? "—"}</strong><small>Organization membership relationships</small></Card>
  </section>
  <Card>
   <div className={styles.filters}>
    <label className={styles.searchLabel} htmlFor="organization-search">Search organization register
     <span className={styles.searchBox}><Search size={17} aria-hidden="true"/><input id="organization-search" value={q} onChange={event => { setQ(event.target.value); setPage(0); }} placeholder="Name, reference or contact email" /></span>
    </label>
    <label className={styles.statusFilter} htmlFor="organization-status">Verification status
     <select id="organization-status" value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}>
      {statuses.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
     </select>
    </label>
    <button className="btn btn-ghost" type="button" onClick={() => void load()} disabled={busy}><RefreshCw size={16} aria-hidden="true"/>{busy ? "Refreshing…" : "Refresh"}</button>
   </div>
   <div className={styles.listHeading}><div><h2 className="h2">Organization register</h2><p className="muted">Open a row to inspect associated accounts. Organization membership roles are not platform administrator roles.</p></div><span className={styles.count}>{result?.total ?? 0} records</span></div>
   {busy && !result ? <OperationStatus state="loading" title="Loading organization records" detail="Organization and account data are being fetched from the authorized admin endpoint." /> : !result?.items.length ? <div className={styles.empty}><Building2 size={26}/><strong>No organizations found</strong><span>Try another search term or clear the verification filter.</span></div> : <div className={styles.orgList}>
    {result.items.map(org => <article className={styles.org} key={org.id}>
     <div className={styles.orgMain}>
      <div className={styles.orgIcon}><Building2 size={20} aria-hidden="true"/></div>
      <div className={styles.orgIdentity}><div className={styles.orgTitle}><h3>{org.display_name || org.legal_name}</h3><Badge tone={statusTone(org.review_status)}>{org.review_status.replaceAll("_", " ")}</Badge></div><p>{org.legal_name}{org.organization_type ? ` · ${org.organization_type.replaceAll("_", " ")}` : ""}</p><div className={styles.meta}><span>{org.tracking_reference || "No tracking reference"}</span><span>{org.account_count} account{org.account_count === 1 ? "" : "s"} · {org.active_account_count} active</span><span>{org.public_visible ? "Public profile enabled" : "Public profile hidden"}</span></div></div>
      <button className="btn btn-ghost" type="button" aria-expanded={expanded === org.id} aria-controls={`org-accounts-${org.id}`} onClick={() => setExpanded(current => current === org.id ? null : org.id)}><Users size={16} aria-hidden="true"/>{expanded === org.id ? "Hide accounts" : "View accounts"}<ChevronDown size={15} aria-hidden="true"/></button>
     </div>
     {expanded === org.id && <div className={styles.accountPanel} id={`org-accounts-${org.id}`}><div className={styles.accountHeader}><h4>Organization account relationships</h4><span>{org.accounts.length} listed</span></div>{org.accounts.length ? <div className={styles.accountList}>{org.accounts.map(account => <div className={styles.accountRow} key={account.userId}><div className={styles.accountIdentity}><strong>{account.email}</strong><small>{account.username} · {account.userId}</small></div><span>{account.role.replaceAll("_", " ")}</span><Badge tone={account.accountStatus === "active" && account.membershipStatus === "active" ? "green" : "gold"}>{account.accountStatus} · {account.membershipStatus}</Badge></div>)}</div> : <p className="muted">No account memberships are linked to this organization.</p>}<p className={styles.privacyNote}>Account status and organization membership status are separate. Use the dedicated account governance or organization workspace for authorized changes; this view does not mutate records.</p><a className="btn btn-ghost" href="/admin#account-governance">Open platform account governance</a></div>}
    </article>)}
   </div>}
   <div className={styles.pagination}><span className="muted">Showing {result?.items.length ? page * 25 + 1 : 0}–{page * 25 + (result?.items.length || 0)} of {result?.total ?? 0}</span><div className="row" style={{ gap: 8 }}><button type="button" className="btn btn-ghost" disabled={page === 0 || busy} onClick={() => setPage(value => Math.max(0, value - 1))}>Previous</button><button type="button" className="btn btn-ghost" disabled={!result?.hasMore || busy} onClick={() => setPage(value => value + 1)}>Next</button></div></div>
  </Card>
 </div>;
}
