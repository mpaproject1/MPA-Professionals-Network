"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, Users } from "lucide-react";
import { FormFeedback } from "../../../components/form-feedback";
import { OperationStatus } from "../../../components/operation-status";
import { Badge, Card } from "../../../components/ui";
import { api } from "../../../lib/api";
import { useUiStore } from "../../../lib/store";
import { AdminPageHeader } from "../admin-page-header";
import { type ManagedPermission, type ManagedRole, type ManagedUser, UsersTable } from "../users-table";

type AuditEvent = { id: string; actor_user_id?: string | null; action: string; resource_type: string; resource_id?: string | null; request_id?: string | null; outcome: string; metadata?: Record<string, unknown>; created_at: string };

function claimsFromToken(token: string) {
  try {
    const part = token.split(".")[1];
    const claims = part ? JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) : {};
    const roles = Array.isArray(claims.roles) ? claims.roles.map((role: any) => typeof role === "string" ? role : role?.role_code).filter(Boolean) : [];
    return { roles: roles as string[], userId: String(claims.sub ?? claims.user_id ?? "") };
  } catch { return { roles: [] as string[], userId: "" }; }
}

export default function AdminAccountsPage() {
  const token = useUiStore((state) => state.token);
  const hydrated = useUiStore((state) => state.hydrated);
  const hydrateToken = useUiStore((state) => state.hydrateToken);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roleCatalog, setRoleCatalog] = useState<ManagedRole[]>([]);
  const [permissionCatalog, setPermissionCatalog] = useState<ManagedPermission[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const identity = token ? claimsFromToken(token) : { roles: [], userId: "" };
  const roleKey = identity.roles.join("|");
  const isPlatformAdmin = identity.roles.some((role) => ["system_admin", "admin", "platform_admin"].includes(role));

  useEffect(() => { hydrateToken(); }, [hydrateToken]);

  const load = useCallback(async () => {
    if (!token || !isPlatformAdmin) return;
    setLoading(true); setError(""); setLoadFailed(false);
    try {
      const [userPayload, rolePayload] = await Promise.all([
        api<any>("/api/v1/admin/users?limit=200", {}, token),
        api<any>("/api/v1/admin/roles", {}, token),
      ]);
      const rows = Array.isArray(userPayload) ? userPayload : Array.isArray(userPayload?.users) ? userPayload.users : Array.isArray(userPayload?.items) ? userPayload.items : null;
      if (!rows) throw new Error("The account service returned an unexpected response. No account count is being inferred.");
      const roles = Array.isArray(rolePayload) ? rolePayload : Array.isArray(rolePayload?.roles) ? rolePayload.roles : [];
      setUsers(rows as ManagedUser[]); setRoleCatalog(roles as ManagedRole[]);
      if (roleKey.split("|").includes("system_admin")) {
        const settled = await Promise.allSettled([
          api<ManagedPermission[]>("/api/v1/admin/permissions", {}, token),
          api<any>("/api/v1/admin/audit-log?limit=100", {}, token),
        ]);
        if (settled[0].status === "fulfilled") setPermissionCatalog(Array.isArray(settled[0].value) ? settled[0].value : []);
        else { setPermissionCatalog([]); setError("The permission catalogue could not be loaded; direct permission editing may be unavailable."); }
        if (settled[1].status === "fulfilled") {
          const value = settled[1].value;
          setAuditEvents(Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : []);
        } else { setAuditEvents([]); setError((old) => old ? old + " Audit history could not be loaded." : "Audit history could not be loaded."); }
      } else { setPermissionCatalog([]); setAuditEvents([]); }
    } catch (cause) {
      setLoadFailed(true);
      setError(cause instanceof Error ? cause.message : "Account and team data could not be loaded.");
    } finally { setLoading(false); }
  }, [token, roleKey, isPlatformAdmin]);

  useEffect(() => { if (hydrated && token && isPlatformAdmin) void load(); }, [hydrated, token, isPlatformAdmin, load]);

  if (!hydrated) return <div className="grid"><Card><OperationStatus state="loading" title="Preparing account and team" detail="Restoring your session before loading account records." /></Card></div>;
  if (!token) return <div className="grid"><AdminPageHeader eyebrow="Administration · People & access" title="Account and Team" description="Manage platform accounts and access with auditable, permission-checked actions."/><Card><p className="muted">Sign in with an authorized administrator account to continue.</p><a className="btn btn-primary" href="/login?next=/admin/accounts">Sign in</a></Card></div>;
  if (!isPlatformAdmin) return <div className="grid"><AdminPageHeader eyebrow="Administration · People & access" title="Account and Team" description="Manage platform accounts and access with auditable, permission-checked actions."/><Card><OperationStatus state="error" title="Platform administrator access required" detail="This route is not a grant of access. Ask an authorized administrator if you need account-management access."/><a className="btn btn-ghost" href="/admin">Return to admin overview</a></Card></div>;

  return <div className="grid" style={{ gap: 18, minWidth: 0 }}>
    <AdminPageHeader eyebrow="Administration · People & access" title="Account and Team" description="One searchable account catalogue for team identity, platform roles, status and access actions. Organization membership and job-specific roles remain in their own scoped workspaces." actions={<><a className="btn btn-ghost" href="/admin">Admin overview</a><a className="btn btn-ghost" href="/admin/organizations">Organizations</a><a className="btn btn-ghost" href="/admin/members/catalog">Member catalogue</a></>} />
    <div className="grid grid-2" style={{ gap: 12 }}>
      <Card><div className="row" style={{ gap: 10, alignItems: "flex-start" }}><Users size={20}/><div><strong>Platform accounts</strong><p className="muted">Search, filter and paginate accounts. Open each account for details and contextual actions.</p></div></div></Card>
      <Card><div className="row" style={{ gap: 10, alignItems: "flex-start" }}><ShieldCheck size={20}/><div><strong>Governed access</strong><p className="muted">Sensitive actions require a reason. Server authorization remains authoritative; this interface does not replace scoped organization or membership workflows.</p></div></div></Card>
    </div>
    {error && <FormFeedback kind="error" message={error}/>}
    {loading && users.length === 0 ? <Card><OperationStatus state="loading" title="Loading account catalogue" detail="Fetching the current account page and role definitions from the administration API." /></Card> : <Card><UsersTable users={users} roleCatalog={roleCatalog} permissionCatalog={permissionCatalog} auditEvents={auditEvents} currentRoles={identity.roles} currentUserId={identity.userId} token={token} onChanged={load} onError={setError} usersLoadFailed={loadFailed}/></Card>}
    <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}><span className="muted">Showing up to 200 accounts returned by the API. This screen does not imply that the result is a complete directory.</span><button className="btn btn-ghost" type="button" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh accounts"}</button></div>
  </div>;
}
