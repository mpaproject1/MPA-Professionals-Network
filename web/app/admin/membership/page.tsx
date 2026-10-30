"use client";

import { useEffect, useState } from "react";
import { OperationStatus } from "../../../components/operation-status";
import { Card } from "../../../components/ui";
import { api } from "../../../lib/api";
import { useUiStore } from "../../../lib/store";
import MembershipWorkspace from "../../membership/workspace";

type MembershipAccess = { roles?: string[]; permissions?: string[] };
type AccessState = "loading" | "allowed" | "denied" | "signin";

export default function MembershipAdministrationPage() {
  const token = useUiStore((state) => state.token);
  const hydrated = useUiStore((state) => state.hydrated);
  const hydrateToken = useUiStore((state) => state.hydrateToken);
  const [access, setAccess] = useState<AccessState>("loading");
  const [canManageMethods, setCanManageMethods] = useState(false);

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
      .then((me) => {
        if (cancelled) return;
        const roles = Array.isArray(me.roles) ? me.roles : [];
        const permissions = Array.isArray(me.permissions) ? me.permissions : [];
        const allowed =
          roles.some((role) => ["system_admin", "reviewer", "membership_reviewer"].includes(role)) ||
          permissions.some((permission) => ["membership.review", "members.view"].includes(permission));
        setAccess(allowed ? "allowed" : "denied");
        setCanManageMethods(roles.includes("system_admin") || roles.includes("finance_officer") || permissions.includes("finance.manage"));
      })
      .catch(() => { if (!cancelled) setAccess("denied"); });

    return () => { cancelled = true; };
  }, [hydrated, token]);

  if (!hydrated || access === "loading") {
    return <Card><OperationStatus state="loading" title="Checking membership administration access" detail="We’re verifying current membership-review permissions before loading application records. Payment authority is checked separately and does not grant membership decision access." /></Card>;
  }
  if (access === "signin") {
    return <Card><h1 className="h1">Sign in required</h1><p className="muted">Sign in with an authorized MPA administration account to manage membership applications, plan versions and payment review.</p><a className="btn btn-primary" href="/login?next=/admin/membership">Sign in</a></Card>;
  }
  if (access === "denied") {
    return <Card><h1 className="h1">You do not have access to this workspace</h1><p className="muted">Membership application review and activation are available only to authorized membership reviewers and administrators. Finance authority does not grant membership decision access. Your account and membership records have not been changed.</p><a className="btn btn-ghost" href="/membership">Return to my membership</a></Card>;
  }

  return <><div className="grid">{canManageMethods && <Card><div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}><div><h2 className="h2">Finance configuration</h2><p className="muted">Manage member-facing bank, Telebirr and manual payment instructions.</p></div><a className="btn btn-ghost" href="/admin/membership/payment-methods">Payment methods</a></div></Card>}</div><MembershipWorkspace adminWorkspace /></>;
}
