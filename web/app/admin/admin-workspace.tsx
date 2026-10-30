"use client";

import { Activity, BookOpenCheck, Building2, ClipboardList, CreditCard, FileBarChart, Fingerprint, Mail, MessageSquareText, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { useUiStore } from "../../lib/store";
import styles from "./admin-workspace.module.css";

type Destination = { href: string; label: string; description: string; icon: typeof Activity; exact?: boolean };
const destinations: Destination[] = [
  { href: "/admin", label: "Overview", description: "Review and administration", icon: Activity, exact: true },
  { href: "/admin/finance", label: "Finance payments", description: "Verify membership payments and record authorized reversals", icon: CreditCard },
  { href: "/admin/accounts", label: "Account and Team", description: "Account catalogue, roles and access actions", icon: Users },
  { href: "/admin/account-governance", label: "Account governance", description: "Account references, membership history and authorized organization relationships", icon: ShieldCheck },
  { href: "/admin/experience", label: "Help, guides and demos", description: "Contextual guides, training scenarios and support resources", icon: BookOpenCheck },
  { href: "/admin/organizations", label: "Organizations & accounts", description: "Organization register and account relationships", icon: Building2 },
  { href: "/admin/members", label: "Members", description: "Imports and member records", icon: Users },
  { href: "/admin/members/catalog", label: "Member catalogue", description: "Search membership records and account links", icon: Users },
  { href: "/admin/membership", label: "Membership administration", description: "Plan versions, reviews and payments", icon: ShieldCheck },
  { href: "/admin/membership/payment-methods", label: "Payment methods", description: "Finance-only member payment configuration", icon: CreditCard },
  { href: "/admin/membership-card", label: "Membership card", description: "Credential appearance", icon: ShieldCheck },
  { href: "/admin/reference-portfolio", label: "Reference data", description: "Governed profile options", icon: BookOpenCheck },
  { href: "/admin/marketplace", label: "Serve-Community review", description: "Demand and listing review", icon: ClipboardList },
  { href: "/organizations", label: "Organizations", description: "Verification, evidence and partner workspace", icon: Building2 },
  { href: "/admin/reports", label: "Reports", description: "Reporting and exports", icon: FileBarChart },
  { href: "/admin/email", label: "Email operations", description: "Queues, templates and delivery", icon: Mail },
  { href: "/admin/security", label: "Admin security", description: "Passkeys and recovery", icon: Fingerprint },
  { href: "/admin/support", label: "Support", description: "Inquiries and knowledge base", icon: MessageSquareText },
];

export function AdminWorkspace({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const token = useUiStore((state) => state.token);
  const hydrated = useUiStore((state) => state.hydrated);
  const hydrateToken = useUiStore((state) => state.hydrateToken);
  const [roles, setRoles] = useState<string[] | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [reportIds, setReportIds] = useState<string[]>([]);

  useEffect(() => { hydrateToken(); }, [hydrateToken]);
  useEffect(() => {
    let cancelled = false;
    if (!hydrated || !token) { setRoles(null); return () => { cancelled = true; }; }
    api<{ roles?: unknown; permissions?: unknown }>("/api/v1/me", {}, token)
      .then((me) => {
        if (cancelled) return;
        setRoles(Array.isArray(me.roles) ? me.roles.map((role) => typeof role === "string" ? role : role && typeof role === "object" && "role_code" in role && typeof role.role_code === "string" ? role.role_code : "").filter(Boolean) : []);
        setPermissions(Array.isArray(me.permissions) ? me.permissions.map((permission) => typeof permission === "string" ? permission : permission && typeof permission === "object" && "permission_code" in permission && typeof permission.permission_code === "string" ? permission.permission_code : "").filter(Boolean) : []);
      })
      .catch(() => { if (!cancelled) { setRoles([]); setPermissions([]); } });
    return () => { cancelled = true; };
  }, [hydrated, token]);
  useEffect(() => {
    let cancelled = false;
    if (!hydrated || !token) { setReportIds([]); return () => { cancelled = true; }; }
    api<{ id?: unknown }[]>("/api/v1/admin/reports", {}, token)
      .then((reports) => { if (!cancelled) setReportIds(Array.isArray(reports) ? reports.map((report) => typeof report?.id === "string" ? report.id : "").filter(Boolean) : []); })
      .catch(() => { if (!cancelled) setReportIds([]); });
    return () => { cancelled = true; };
  }, [hydrated, token]);

  const current = useMemo(() => {
    const exact = destinations.find((item) => item.href === pathname);
    if (exact) return exact;
    return [...destinations].sort((a, b) => b.href.length - a.href.length).find((item) => pathname.startsWith(`${item.href}/`));
  }, [pathname]);
  const roleSummary = roles === null ? "Resolving account access…" : roles.length ? roles.map((role) => role.replaceAll("_", " ")).join(" · ") : "No administrator role confirmed";
  const navDestinations = useMemo(() => {
    const platformAdmin = Boolean(roles?.some((role) => ["system_admin", "admin", "platform_admin"].includes(role)));
    const membershipReviewer = Boolean(roles?.some((role) => ["reviewer", "membership_reviewer"].includes(role)) || permissions.includes("membership.review"));
    const financeOfficer = Boolean(roles?.includes("finance_officer"));
    const financeAccess = Boolean(financeOfficer || permissions.some((permission) => ["finance.view", "finance.payment.verify", "finance.payment.reverse", "finance.manage"].includes(permission)));
    const financeConfig = Boolean(financeOfficer || permissions.includes("finance.manage"));
    const supportStaff = Boolean(roles?.includes("supporting_staff"));
    if (platformAdmin) return destinations;
    return destinations.filter((item) => {
      if (["/admin/accounts", "/admin/account-governance", "/admin/experience", "/admin/members", "/admin/members/catalog", "/admin/membership-card", "/admin/reference-portfolio"].includes(item.href)) return false;
      if (item.href === "/admin/membership") return membershipReviewer;
      if (item.href === "/admin/finance") return financeAccess;
      if (item.href === "/admin/membership/payment-methods") return financeConfig;
      if (item.href === "/admin/reports") return reportIds.length > 0;
      if (item.href === "/admin/organizations") return roles?.some((role) => ["reviewer", "organization_admin"].includes(role)) === true;
      if (item.href === "/admin/marketplace") return membershipReviewer || supportStaff;
      if (item.href === "/admin/support") return supportStaff || roles?.includes("reviewer") === true;
      if (item.href === "/admin/security" || item.href === "/admin/email") return false;
      return false;
    });
  }, [roles, permissions, reportIds]);

  return <div className={styles.workspace}>
    <aside className={styles.sidebar} aria-label="Administration navigation">
      <div className={styles.brand}><span className={styles.brandMark}><Building2 size={19} /></span><div><strong>MPA operations</strong><span>Administration workspace</span></div></div>
      <nav className={styles.nav} aria-label="Admin workspaces">
        {navDestinations.map(({ href, label, description, icon: Icon, exact = false }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return <Link key={href} href={href} title={description} aria-current={active ? "page" : undefined} className={active ? styles.active : styles.link}>
            <Icon size={18} aria-hidden="true" /><span className={styles.linkText}><strong>{label}</strong><small>{description}</small></span>
          </Link>;
        })}
      </nav>
      <div className={styles.access}><span>Signed-in role information</span><p>{roleSummary}</p><small>Navigation is for discovery only. Every page and action must still be authorized by the server.</small></div>
    </aside>
    <section className={styles.content}>
      <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
        <Link href="/admin">Administration</Link><span aria-hidden="true">/</span><span aria-current="page">{current?.label ?? "Workspace"}</span>
      </nav>
      {children}
    </section>
  </div>;
}
