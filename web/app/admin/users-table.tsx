"use client";

import { useMemo, useState } from "react";
import { Activity, ChevronLeft, ChevronRight, Ellipsis, ShieldCheck, UserRound, X } from "lucide-react";
import { FormFeedback } from "../../components/form-feedback";
import { Badge } from "../../components/ui";
import { ApiError, api } from "../../lib/api";
import styles from "./users-table.module.css";

export type ManagedUser = {
  id: string; email: string; username: string; status: string; roles: string[];
  permissions?: string[];
  full_name?: string | null; created_at?: string | null; updated_at?: string | null;
  last_activity_at?: string | null; membership_status?: string | null;
  organization_names?: string[] | null; profile?: Record<string, unknown> | null;
};
export type ManagedRole = { role_code: string; name: string; description?: string | null; scope: string; assignable: boolean; privileged: boolean; assignmentNote?: string | null };
export type ManagedPermission = { permission_code: string; area: string; label: string; description: string; sensitive: boolean; system_only: boolean };
type Props = { users: ManagedUser[]; roleCatalog: ManagedRole[]; permissionCatalog: ManagedPermission[]; currentRoles: string[]; currentUserId: string; token: string; onChanged: () => Promise<void>; onError: (message: string) => void; usersLoadFailed?: boolean };
type Panel = "details" | "access" | "status" | "recovery" | "sessions" | null;

export function UsersTable({ users, roleCatalog, permissionCatalog, currentRoles, currentUserId, token, onChanged, onError, usersLoadFailed = false }: Props) {
  const [selected, setSelected] = useState<ManagedUser | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [reason, setReason] = useState("");
  const [roleCode, setRoleCode] = useState("");
  const [permissionDraft, setPermissionDraft] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const isSystemAdmin = currentRoles.includes("system_admin");
  const choices = roleCatalog.filter(r => r.assignable && (!r.privileged || isSystemAdmin));
  const pageSize = 10;
  const filtered = useMemo(() => users.filter(user => {
    const q = query.trim().toLowerCase();
    const matchesText = !q || [user.email, user.username, user.full_name || "", user.id].some(v => v.toLowerCase().includes(q));
    return matchesText && (statusFilter === "all" || user.status === statusFilter);
  }), [users, query, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageUsers = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function open(user: ManagedUser, next: Panel) {
    setSelected(user); setPanel(next); setOpenMenu(null); setReason(""); setRoleCode("");
    setPermissionDraft(user.permissions || []); setNotice(""); onError("");
  }
  function canManage(user: ManagedUser) {
    const privileged = user.roles.some(code => roleCatalog.find(r => r.role_code === code)?.privileged);
    return user.id !== currentUserId && (!privileged || isSystemAdmin);
  }
  async function perform(action: () => Promise<unknown>, success: string) {
    if (!selected) return;
    if (!reason.trim()) { onError("Enter a reason before continuing."); return; }
    setBusy(true); setNotice(""); onError("");
    try {
      await action();
      setNotice(success);
      await onChanged();
      setSelected(null); setPanel(null); setReason("");
    } catch (cause) {
      onError(cause instanceof ApiError || cause instanceof Error ? cause.message : "The account action failed. No success was confirmed.");
    } finally { setBusy(false); }
  }
  const targetManageable = selected ? canManage(selected) : false;
  const date = (value?: string | null) => value ? new Date(value).toLocaleString() : "Not available";
  const profile = selected?.profile && typeof selected.profile === "object" ? selected.profile : {};

  return <div className={styles.wrap}>
    {notice && <FormFeedback kind="success" message={notice} />}
    <div className={styles.toolbar}>
      <label className={styles.search}>Search accounts<input value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder="Name, email, username or ID" /></label>
      <label className={styles.filter}>Status<select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}><option value="all">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="disabled">Disabled</option></select></label>
      <span className={styles.resultCount}>{filtered.length} account{filtered.length === 1 ? "" : "s"}</span>
    </div>
    {usersLoadFailed ? <div className={styles.emptyState}><b>Accounts could not be loaded</b><p>Check your administrator access and connection, then retry the page.</p></div> : pageUsers.length === 0 ? <div className={styles.emptyState}><b>{users.length ? "No matching accounts" : "No accounts available"}</b><p>{users.length ? "Change the search or status filter." : "When accounts are available to this administrator, they will appear here."}</p></div> :
    <div className={styles.list} role="list" aria-label="Account catalogue">
      {pageUsers.map(user => {
        const manageable = canManage(user);
        return <article className={styles.accountCard} key={user.id} role="listitem">
          <div className={styles.identity}>
            <span className={styles.avatar} aria-hidden="true"><UserRound size={19}/></span>
            <div className={styles.identityText}><b>{user.full_name || user.username || user.email}</b><span>{user.email}</span><small>{user.username} · ID {user.id}</small></div>
          </div>
          <div className={styles.stateCol}><Badge tone={user.status === "active" ? "green" : "gold"}>{user.status}</Badge><small>Membership: {user.membership_status || "Not available"}</small></div>
          <div className={styles.roleCol}><span className={styles.mutedLabel}>Platform roles</span><div className={styles.roles}>{user.roles.length ? user.roles.map(code => <Badge key={code} tone="slate">{roleCatalog.find(r => r.role_code === code)?.name || code}</Badge>) : <span className={styles.mutedLabel}>No platform roles</span>}</div></div>
          <div className={styles.lastActivity}><span className={styles.mutedLabel}>Last activity</span><span>{date(user.last_activity_at || user.updated_at)}</span></div>
          <div className={styles.actions}>
            <button className="btn btn-ghost" type="button" onClick={() => open(user, "details")}>View account</button>
            <div className={styles.menuWrap}>
              <button className="btn btn-ghost" type="button" aria-label={`Actions for ${user.email}`} aria-expanded={openMenu === user.id} onClick={() => setOpenMenu(openMenu === user.id ? null : user.id)}><Ellipsis size={18}/></button>
              {openMenu === user.id && <div className={styles.menu} role="menu">
                <button type="button" role="menuitem" onClick={() => open(user, "access")} disabled={!manageable}>Manage access</button>
                <button type="button" role="menuitem" onClick={() => open(user, "status")} disabled={!manageable}>{user.status === "active" ? "Suspend account…" : "Reactivate account…"}</button>
                <button type="button" role="menuitem" onClick={() => open(user, "recovery")} disabled={!manageable}>Send sign-in recovery link…</button>
                <button type="button" role="menuitem" onClick={() => open(user, "sessions")} disabled={!manageable}>Revoke sessions…</button>
                {!manageable && <small>Use a separate system administrator for your own or privileged accounts.</small>}
              </div>}
            </div>
          </div>
        </article>;
      })}
    </div>}
    <div className={styles.pagination}><span>Showing {filtered.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}</span><div><button className="btn btn-ghost" type="button" disabled={currentPage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}><ChevronLeft size={16}/> Previous</button><span>Page {currentPage} of {pageCount}</span><button className="btn btn-ghost" type="button" disabled={currentPage >= pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))}>Next <ChevronRight size={16}/></button></div></div>
    <details className={styles.catalog}><summary>Platform role catalog and scope boundaries</summary><div className={styles.roleCatalog}>{roleCatalog.map(role => <div key={role.role_code}><b>{role.name}</b><span>{role.scope}</span><p>{role.assignmentNote || role.description || "No description recorded."}</p><small>{role.assignable ? "Assignable platform role" : "Managed in scoped workspace"}{role.privileged ? " · System administrator only" : ""}</small></div>)}</div></details>

    {selected && panel && <div className={styles.overlay} role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) { setSelected(null); setPanel(null); } }}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="account-dialog-title">
        <header className={styles.dialogHeader}><div><span className={styles.eyebrow}>Account administration</span><h2 id="account-dialog-title">{panel === "details" ? "Account details" : panel === "access" ? "Manage access" : panel === "status" ? (selected.status === "active" ? "Suspend account" : "Reactivate account") : panel === "recovery" ? "Account recovery" : "Revoke active sessions"}</h2><p>{selected.full_name || selected.email}</p></div><button className="icon-btn" type="button" aria-label="Close dialog" disabled={busy} onClick={() => { setSelected(null); setPanel(null); }}><X size={19}/></button></header>
        {panel === "details" ? <div className={styles.detailBody}>
          <section><h3><UserRound size={16}/> Identity & account</h3><dl><dt>Name</dt><dd>{selected.full_name || "Not available"}</dd><dt>Email</dt><dd>{selected.email}</dd><dt>Username</dt><dd>{selected.username || "Not available"}</dd><dt>Account ID</dt><dd>{selected.id}</dd><dt>Account status</dt><dd>{selected.status}</dd><dt>Created</dt><dd>{date(selected.created_at)}</dd><dt>Last updated</dt><dd>{date(selected.updated_at)}</dd></dl></section>
          <section><h3><ShieldCheck size={16}/> Access & membership</h3><dl><dt>Platform roles</dt><dd>{selected.roles.length ? selected.roles.map(code => roleCatalog.find(r => r.role_code === code)?.name || code).join(", ") : "No platform roles"}</dd><dt>Membership status</dt><dd>{selected.membership_status || "Not available from this account response"}</dd><dt>Organizations</dt><dd>{selected.organization_names?.length ? selected.organization_names.join(", ") : "Not available from this account response"}</dd></dl></section>
          <section><h3><Activity size={16}/> Profile & activity</h3>{Object.keys(profile).length ? <dl>{Object.entries(profile).map(([key,value]) => <ReactDetail key={key} label={key} value={value}/>)}</dl> : <p className={styles.help}>Profile details are not included in the account catalogue response. This view does not invent missing data.</p>}<dl><dt>Last relevant activity</dt><dd>{date(selected.last_activity_at || selected.updated_at)}</dd></dl></section>
          <div className={styles.dialogActions}><button className="btn btn-ghost" type="button" onClick={() => open(selected, "access")} disabled={!manageable}>Manage access</button><button className="btn btn-primary" type="button" onClick={() => { setPanel(null); setSelected(null); }}>Close details</button></div>
          <p className={styles.help}>Identity fields are read-only here because this screen currently has no verified account-profile update contract. No changes are implied or saved from this view.</p>
        </div> : panel === "access" ? <div className={styles.dialogBody}>
          <p className={styles.help}>Changes require a reason and are enforced by the server. Privileged roles are restricted to system administrators; self-role changes remain blocked.</p>
          <label>Grant a platform role<select value={roleCode} onChange={e => setRoleCode(e.target.value)} disabled={!targetManageable || busy}><option value="">Choose role…</option>{choices.map(role => <option key={role.role_code} value={role.role_code}>{role.name} · {role.scope}</option>)}</select></label>
          <button className="btn btn-primary" type="button" disabled={!targetManageable || !roleCode || selected.roles.includes(roleCode) || !reason.trim() || busy} onClick={() => void perform(() => api(`/api/v1/admin/users/${selected.id}`, {method:"PATCH",body:JSON.stringify({roleCode,reason})}, token), "Role updated and recorded.")}>Grant role</button>
          <div className={styles.currentRoles}><b>Current roles</b>{selected.roles.length ? selected.roles.map(code => <div key={code}><span>{roleCatalog.find(r => r.role_code === code)?.name || code}</span><button className="btn btn-ghost" type="button" disabled={!targetManageable || !reason.trim() || busy || (roleCatalog.find(r=>r.role_code===code)?.privileged && !isSystemAdmin)} onClick={() => void perform(() => api(`/api/v1/admin/users/${selected.id}`, {method:"PATCH",body:JSON.stringify({removeRoleCode:code,reason})}, token), "Role removed and recorded.")}>Remove</button></div>) : <p>No platform roles assigned.</p>}</div>
          {isSystemAdmin && permissionCatalog.length > 0 && <details className={styles.permissionDetails}><summary>Advanced direct permissions ({permissionDraft.length})</summary><div className={styles.permissionList}>{permissionCatalog.map(permission => <label key={permission.permission_code}><input type="checkbox" checked={permissionDraft.includes(permission.permission_code)} disabled={!targetManageable || permission.system_only || busy} onChange={e => setPermissionDraft(old => e.target.checked ? [...old, permission.permission_code] : old.filter(c => c !== permission.permission_code))}/><span><b>{permission.area} · {permission.label}</b><small>{permission.description}{permission.sensitive ? " Sensitive capability; audited." : ""}{permission.system_only ? " System-only." : ""}</small></span></label>)}</div><button className="btn btn-primary" type="button" disabled={!targetManageable || !reason.trim() || busy} onClick={() => void perform(() => api(`/api/v1/admin/users/${selected.id}/permissions`, {method:"PATCH",body:JSON.stringify({permissionCodes:permissionDraft,reason})}, token), "Permissions updated; active sessions are revoked by the service.")}>Save permissions</button></details>}
          <Reason value={reason} onChange={setReason} disabled={!targetManageable || busy}/>
        </div> : <div className={styles.dialogBody}>
          <div className={styles.warning}><ShieldCheck size={18}/><p>{panel === "status" ? (selected.status === "active" ? "Suspending blocks account access. Existing sessions must be invalidated by the service. The account record and history are retained." : "Reactivating restores account access subject to existing membership and verification rules.") : panel === "recovery" ? "A short-lived sign-in link will be queued for the account email. Never ask a user to share the link or disclose a password." : "This revokes active sessions for the account. The user will need to authenticate again."}</p></div>
          <Reason value={reason} onChange={setReason} disabled={!targetManageable || busy}/>
          <div className={styles.dialogActions}><button className="btn btn-ghost" type="button" disabled={busy} onClick={() => {setPanel(null);setReason("");}}>Cancel</button><button className="btn btn-primary" type="button" disabled={!targetManageable || !reason.trim() || busy} onClick={() => {
            if (panel === "status") void perform(() => api(`/api/v1/admin/users/${selected.id}`, {method:"PATCH",body:JSON.stringify({status:selected.status === "active" ? "suspended" : "active",reason})}, token), "Account status updated.");
            if (panel === "recovery") void perform(async () => { const result = await api<{message:string;email:string}>(`/api/v1/admin/users/${selected.id}/one-time-session-link`, {method:"POST",body:JSON.stringify({reason})}, token); setNotice(`${result.message} Recipient: ${result.email}. Verify identity through a known channel.`); }, "Recovery link request submitted.");
            if (panel === "sessions") void perform(() => api(`/api/v1/admin/users/${selected.id}/revoke-sessions`, {method:"POST",body:JSON.stringify({reason})}, token), "Session revocation request completed.");
          }}>{busy ? "Working…" : panel === "status" ? "Confirm status change" : panel === "recovery" ? "Queue recovery link" : "Revoke sessions"}</button></div>
        </div>}
      </section>
    </div>}
  </div>;
}

function Reason({value,onChange,disabled}:{value:string;onChange:(v:string)=>void;disabled:boolean}) {
  return <label className={styles.reason}>Reason for this change<textarea value={value} onChange={e=>onChange(e.target.value)} maxLength={500} rows={3} placeholder="Explain why this action is necessary (required)" disabled={disabled}/></label>;
}
function ReactDetail({label,value}:{label:string;value:unknown}) {
  const display = value == null ? "Not available" : typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : JSON.stringify(value);
  return <><dt>{label.replaceAll("_"," ")}</dt><dd>{display}</dd></>;
}
