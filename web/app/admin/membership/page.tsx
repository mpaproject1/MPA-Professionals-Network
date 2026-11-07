"use client";

import { useEffect, useState } from "react";
import { OperationStatus } from "../../../components/operation-status";
import { Card } from "../../../components/ui";
import { api } from "../../../lib/api";
import { useUiStore } from "../../../lib/store";
import MembershipAdminWorkspace from "./admin-workspace";

type MembershipAccess = { roles?: string[]; permissions?: string[] };
type AccessState = "loading" | "allowed" | "denied" | "signin";

export default function MembershipAdministrationPage() {
  const token = useUiStore(state => state.token);
  const hydrated = useUiStore(state => state.hydrated);
  const hydrateToken = useUiStore(state => state.hydrateToken);
  const [access, setAccess] = useState<AccessState>("loading");

  useEffect(() => { hydrateToken(); }, [hydrateToken]);

  useEffect(() => {
    let cancelled = false;
    if (!hydrated) return () => { cancelled = true; };
    if (!token) {
      setAccess("signin");
      return () => { cancelled = true; };
    }
    setAccess("loading");
    api<MembershipAccess>("/api/v1/me", {}, token)
      .then(me => {
        if (cancelled) return;
        const roles = Array.isArray(me.roles) ? me.roles : [];
        const permissions = Array.isArray(me.permissions) ? me.permissions : [];
        const allowed =
          roles.some(role => ["system_admin", "reviewer", "membership_reviewer"].includes(role)) ||
          permissions.some(permission => ["membership.review", "members.view", "members.manage"].includes(permission));
        setAccess(allowed ? "allowed" : "denied");
      })
      .catch(() => { if (!cancelled) setAccess("denied"); });
    return () => { cancelled = true; };
  }, [hydrated, token]);

  if (!hydrated || access === "loading") {
    return <Card><OperationStatus state="loading" title="Checking membership administration access" detail="Membership records are loaded only after the server confirms an authorized membership-review role or permission. Finance authority alone does not grant access to membership decisions or applicant records." /></Card>;
  }
  if (access === "signin") {
    return <Card><h1 className="h1">Sign in required</h1><p className="muted">Sign in with an authorized MPA membership administration account.</p><a className="btn btn-primary" href="/login?next=/admin/membership">Sign in</a></Card>;
  }
  if (access === "denied") {
    return <Card><h1 className="h1">You do not have access to this workspace</h1><p className="muted">Membership application review and activation are available only to authorized membership administrators. Plan administration is separately permissioned. Finance authority remains separate and does not grant access to applicant records.</p><a className="btn btn-ghost" href="/admin/finance">Open Finance workspace</a></Card>;
  }
  return <MembershipAdminWorkspace />;
}
