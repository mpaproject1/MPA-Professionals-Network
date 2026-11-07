"use client";

import { Activity, BookOpenCheck, BriefcaseBusiness, Building2, ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, ClipboardList, CreditCard, FileBarChart, Fingerprint, HeartHandshake, Mail, MessageSquareText, Scale, ShieldCheck, Store, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { useUiStore } from "../../lib/store";
import styles from "./admin-workspace.module.css";

type Destination = { href: string; label: string; description: string; icon: typeof Activity; exact?: boolean };
const destinations: Destination[] = [
  { href: "/admin", label: "Overview", description: "Review and administration", icon: Activity, exact: true },
  { href: "/admin/membership-center", label: "Membership Center", description: "Applications, paid-member register, renewals and analytics", icon: ShieldCheck },
  { href: "/admin/jobs/review", label: "Vacancy review", description: "Review submitted vacancies and publication approvals", icon: ClipboardList },
  { href: "/admin/mentorship-interest", label: "Mentorship interest", description: "Review mentor interest and propose matches", icon: Users },
  { href: "/admin/mentorship-reports", label: "Mentorship reports", description: "Confidential participant reports and outcomes", icon: ClipboardCheck },
  { href: "/admin/service-mentorship-cases", label: "Service and mentorship cases", description: "Audited participant case records", icon: Users },
  { href: "/admin/public-media-stories", label: "Public story moderation", description: "Consent and publication review", icon: ShieldCheck },
  { href: "/admin/community-campaigns", label: "Community campaigns", description: "Message approvals, schedules and delivery", icon: Mail },
  { href: "/admin/finance", label: "Finance payments", description: "Verify membership payments and record authorized reversals", icon: CreditCard },
  { href: "/admin/accounts", label: "Account and Team", description: "Account catalogue, roles and access actions", icon: Users },
  { href: "/admin/account-governance", label: "Account governance", description: "Account references, membership history and authorized organization relationships", icon: ShieldCheck },
  { href: "/admin/experience", label: "Help, guides and demos", description: "Contextual guides, training scenarios and support resources", icon: BookOpenCheck },
  { href: "/admin/organizations", label: "Organizations & accounts", description: "Organization register and account relationships", icon: Building2 },
  { href: "/admin/network-plus/businesses", label: "Network-Plus businesses", description: "Review private business evidence and public business profiles", icon: Building2 },
  { href: "/admin/network-plus/services", label: "Network-Plus listings", description: "Moderate Needs, Offers and discovery-only catalog profiles", icon: Store },
  { href: "/admin/members", label: "Members", description: "Imports and member records", icon: Users },
  { href: "/admin/members/catalog", label: "Member catalogue", description: "Search membership records and account links", icon: Users },
  { href: "/admin/membership", label: "Membership administration", description: "Plan versions, reviews and payments", icon: ShieldCheck },
  { href: "/admin/membership/payment-methods", label: "Payment methods", description: "Finance-only member payment configuration", icon: CreditCard },
  { href: "/admin/membership-card", label: "Membership card", description: "Credential appearance", icon: ShieldCheck },
  { href: "/admin/reference-portfolio", label: "Reference data & taxonomies", description: "Manage versioned education, professional and Community Impact classifications", icon: BookOpenCheck },
  { href: "/admin/marketplace", label: "Serve-Community review", description: "Demand and listing review", icon: ClipboardList },
  { href: "/admin/serve-community/offline-projects", label: "Completed projects", description: "Record and review completed offline community projects", icon: ClipboardList },
  { href: "/admin/community-impact/retention-policy", label: "Impact retention policy", description: "Propose and approve evidence-retention rules", icon: Scale },
  { href: "/admin/community-impact/claims", label: "Impact claim review", description: "Assign and independently review private contribution claims and appeals", icon: ClipboardCheck },
  { href: "/admin/community-impact/governance", label: "Impact governance", description: "Identity assurance, individual attribution, detection policies, reviewer conflicts and assessments", icon: Scale },
  { href: "/admin/community-impact/scoring", label: "Impact score governance", description: "Versioned score policies, member score ledger, recalculation and reversals", icon: Scale },
  { href: "/admin/referrals", label: "Member referrals", description: "Review employment referrals and govern referral recognition", icon: Users },
  { href: "/organizations", label: "Organizations", description: "Verification, evidence and partner workspace", icon: Building2 },
  { href: "/admin/reports", label: "Reports", description: "Reporting and exports", icon: FileBarChart },
  { href: "/admin/test-lab", label: "Development Test Lab", description: "Create disposable test portfolios, export temporary credentials and safely reset test data", icon: ClipboardList },
  { href: "/admin/email", label: "Email operations", description: "Queues, templates and delivery", icon: Mail },
  { href: "/admin/security", label: "Admin security", description: "Passkeys and recovery", icon: Fingerprint },
  { href: "/admin/support", label: "Support", description: "Inquiries and knowledge base", icon: MessageSquareText },
];

const groupFor=(href:string)=>href==="/admin"?"Overview":["/admin/membership","/admin/members","/admin/members/catalog","/admin/membership-card","/admin/accounts","/admin/account-governance","/admin/organizations","/organizations"].includes(href)?"People":href.startsWith("/admin/finance")||href.includes("payment-methods")?"Finance":["/admin/jobs/review","/admin/network-plus/businesses","/admin/network-plus/services","/admin/marketplace","/admin/serve-community/offline-projects","/admin/mentorship-interest","/admin/mentorship-reports","/admin/service-mentorship-cases","/admin/public-media-stories"].includes(href)?"Opportunities":href.startsWith("/admin/community-impact")||href==="/admin/referrals"?"Community Impact":["/admin/support","/admin/community-campaigns","/admin/email"].includes(href)?"Communications":href==="/admin/reports"?"Reports":"Governance";
const groupIcons={Overview:Activity,People:Users,Finance:CreditCard,Opportunities:BriefcaseBusiness,"Community Impact":HeartHandshake,Communications:Mail,Reports:FileBarChart,Governance:ShieldCheck};
const groupOrder=["Overview","People","Finance","Opportunities","Community Impact","Communications","Reports","Governance"];
export function AdminWorkspace({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const token = useUiStore((state) => state.token);
  const hydrated = useUiStore((state) => state.hydrated);
  const hydrateToken = useUiStore((state) => state.hydrateToken);
  const [roles, setRoles] = useState<string[] | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [reportIds, setReportIds] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(["People","Finance","Opportunities","Community Impact"]);
  useEffect(() => { try { setCollapsed(window.localStorage.getItem("mpa-admin-sidebar-collapsed") === "true"); const saved=window.localStorage.getItem("mpa-admin-sidebar-groups"); if(saved) setExpandedGroups(JSON.parse(saved) as string[]); } catch { /* keep defaults */ } }, []);

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
  const grouped=useMemo(()=>groupOrder.map(group=>({group,items:navDestinations.filter(item=>groupFor(item.href)===group)})).filter(entry=>entry.items.length),[navDestinations]);
  const roleSummary = roles === null ? "Resolving account access…" : roles.length ? roles.map((role) => role.replaceAll("_", " ")).join(" · ") : "No administrator role confirmed";
  const toggleCollapsed=()=>setCollapsed(value=>{const next=!value;try{window.localStorage.setItem("mpa-admin-sidebar-collapsed",String(next));}catch{}return next;});
  const toggleGroup=(group:string)=>setExpandedGroups(value=>{const next=value.includes(group)?value.filter(item=>item!==group):[...value,group];try{window.localStorage.setItem("mpa-admin-sidebar-groups",JSON.stringify(next));}catch{}return next;});
  const navDestinations = useMemo(() => {
    const platformAdmin = Boolean(roles?.some((role) => ["system_admin", "admin", "platform_admin"].includes(role)));
    const membershipReviewer = Boolean(roles?.some((role) => ["reviewer", "membership_reviewer"].includes(role)) || permissions.includes("membership.review"));
    const financeOfficer = Boolean(roles?.includes("finance_officer"));
    const financeAccess = Boolean(financeOfficer || permissions.some((permission) => ["finance.view", "finance.payment.verify", "finance.payment.reverse", "finance.manage"].includes(permission)));
    const financeConfig = Boolean(financeOfficer || permissions.includes("finance.manage"));
    const supportStaff = Boolean(roles?.includes("supporting_staff"));
    const offlineProjectAccess = Boolean(supportStaff || permissions.includes("serve_community.projects.manage"));
    if (platformAdmin) return destinations.filter((item) => (item.href !== "/admin/test-lab" || roles?.includes("system_admin") === true) && (item.href !== "/admin/community-impact/retention-policy" || roles?.includes("system_admin") === true || permissions.some((permission) => ["community_impact.retention.manage", "community_impact.retention.approve"].includes(permission))) && (item.href !== "/admin/community-impact/claims" || roles?.includes("system_admin") === true || permissions.some((permission) => ["community_impact.claim.review", "community_impact.claim.assign", "community_impact.claim.appeal_review"].includes(permission))) && (item.href !== "/admin/referrals" || roles?.some((role) => ["system_admin","admin","supporting_staff"].includes(role)) === true || permissions.includes("referral.manage")));
    return destinations.filter((item) => {
      if (item.href === "/admin/test-lab") return roles?.includes("system_admin") === true;
      if (["/admin/accounts", "/admin/account-governance", "/admin/experience", "/admin/members", "/admin/members/catalog", "/admin/membership-card", "/admin/reference-portfolio"].includes(item.href)) return false;
      if (item.href === "/admin/membership" || item.href === "/admin/membership-center") return membershipReviewer || permissions.some((permission) => ["membership.review","membership.activate","members.view","members.manage"].includes(permission));
      if (item.href === "/admin/jobs/review") return roles?.some((role) => ["reviewer","system_admin"].includes(role)) === true || permissions.includes("jobs.review");
      if (["/admin/mentorship-interest","/admin/mentorship-reports","/admin/service-mentorship-cases","/admin/public-media-stories"].includes(item.href)) return roles?.some((role) => ["system_admin","supporting_staff"].includes(role)) === true;
      if (item.href === "/admin/community-campaigns") return platformAdmin;
      if (item.href === "/admin/finance") return financeAccess;
      if (item.href === "/admin/membership/payment-methods") return financeConfig;
      if (item.href === "/admin/reports") return reportIds.length > 0;
      if (item.href === "/admin/organizations") return roles?.some((role) => ["reviewer", "organization_admin"].includes(role)) === true;
      if (item.href === "/admin/network-plus/businesses") return roles?.some((role) => ["business_verification_reviewer","business_moderator"].includes(role)) === true || permissions.some((permission) => ["business.verify","business.moderate"].includes(permission));
      if (item.href === "/admin/network-plus/services") return roles?.includes("business_moderator") === true || permissions.includes("business.moderate");
      if (item.href === "/admin/marketplace") return membershipReviewer || supportStaff;
      if (item.href === "/admin/serve-community/offline-projects") return offlineProjectAccess;
      if (item.href === "/admin/community-impact/retention-policy") return roles?.includes("system_admin") === true || permissions.some((permission) => ["community_impact.retention.manage", "community_impact.retention.approve"].includes(permission));
      if (item.href === "/admin/community-impact/claims") return roles?.includes("system_admin") === true || permissions.some((permission) => ["community_impact.claim.review", "community_impact.claim.assign", "community_impact.claim.appeal_review"].includes(permission));
      if (item.href === "/admin/community-impact/governance") return roles?.includes("system_admin") === true || permissions.some((permission) => ["community_impact.identity.review","community_impact.offline_attribution.review","community_impact.detection.manage","community_impact.detection_policy.manage","community_impact.detection_policy.approve","community_impact.claim.assess","community_impact.claim.second_review","community_impact.retention.evaluate"].includes(permission));
      if (item.href === "/admin/community-impact/scoring") return roles?.includes("system_admin") === true || permissions.some((permission) => ["community_impact.score.policy.manage","community_impact.score.policy.approve","community_impact.score.recalculate","community_impact.score.reverse","community_impact.score.view_all"].includes(permission));
      if (item.href === "/admin/referrals") return roles?.some((role) => ["system_admin","admin","supporting_staff"].includes(role)) === true || permissions.includes("referral.manage");
      if (item.href === "/admin/support") return supportStaff || roles?.includes("reviewer") === true;
      if (item.href === "/admin/security" || item.href === "/admin/email") return false;
      return false;
    });
  }, [roles, permissions, reportIds]);

  return <div className={`${styles.workspace} ${collapsed?styles.collapsed:""}`}><aside className={styles.sidebar} aria-label="Administration navigation"><div className={styles.brand}><span className={styles.brandMark}><Building2 size={19}/></span>{!collapsed&&<div><strong>MPA operations</strong><span>Administration</span></div>}<button type="button" className={styles.collapseButton} onClick={toggleCollapsed} aria-label={collapsed?"Expand navigation":"Collapse navigation"}>{collapsed?<ChevronRight size={17}/>:<ChevronLeft size={17}/>}</button></div><nav className={styles.nav} aria-label="Admin workspaces">{grouped.map(({group,items})=>{const Icon=groupIcons[group as keyof typeof groupIcons];const open=expandedGroups.includes(group)||items.some(item=>item.href===pathname||pathname.startsWith(`${item.href}/`));if(group==="Overview")return items.map(item=><Link key={item.href} href={item.href} title={collapsed?item.label:item.description} aria-current={pathname===item.href?"page":undefined} className={pathname===item.href?styles.active:styles.link}><item.icon size={18}/>{!collapsed&&<span className={styles.linkText}>{item.label}</span>}</Link>);return <section className={styles.navGroup} key={group}><button type="button" className={styles.groupButton} onClick={()=>collapsed?toggleCollapsed():toggleGroup(group)} aria-expanded={open} title={collapsed?group:undefined}><Icon size={17}/>{!collapsed&&<><span>{group}</span><small>{items.length}</small><ChevronDown size={14} className={open?styles.chevronOpen:styles.chevron}/></>}</button>{open&&!collapsed&&<div className={styles.groupItems}>{items.map(item=>{const active=item.href===pathname||pathname.startsWith(`${item.href}/`);return <Link key={item.href} href={item.href} title={item.description} aria-current={active?"page":undefined} className={active?styles.active:styles.link}><item.icon size={16}/><span className={styles.linkText}>{item.label}</span></Link>;})}</div>}</section>;})}</nav>{!collapsed&&<div className={styles.access}><span>Signed-in access</span><p>{roleSummary}</p><small>Server-side authorization protects every action.</small></div>}</aside><section className={styles.content}><nav className={styles.breadcrumbs} aria-label="Breadcrumb"><Link href="/admin">Administration</Link><span>/</span><span aria-current="page">{current?.label??"Workspace"}</span></nav>{children}</section></div>;
