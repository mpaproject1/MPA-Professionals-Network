"use client";
import { ArrowRight, BriefcaseBusiness, Building2, ClipboardCheck, FileCheck2, Handshake, LifeBuoy, ShieldCheck, Users, WalletCards } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OperationStatus } from "../../components/operation-status";
import { Card } from "../../components/ui";
import { api } from "../../lib/api";
import { useUiStore } from "../../lib/store";

type Identity = { user_id: string; roles?: string[]; permissions?: string[] };
type Organization = { id: string; display_name?: string; legal_name?: string; role_code?: string; status?: string };
type Task = { title: string; detail: string; href: string; roles?: string[]; permissions?: string[]; scopeRoles?: string[]; icon: typeof Users; group: string };
const tasks: Task[] = [
 { title: "Member journey", detail: "Profile completion, membership, verification progress and personal requests.", href: "/members", icon: Users, group: "My account" },
 { title: "Professional profile", detail: "Maintain your own professional information and verification evidence.", href: "/profile", icon: FileCheck2, group: "My account" },
 { title: "Membership review", detail: "Review submitted applications using the existing decision and correction workflow.", href: "/membership", roles: ["reviewer","membership_reviewer","system_admin"], permissions: ["membership.review"], icon: ClipboardCheck, group: "Review queues" },
 { title: "Verification cases", detail: "Review authorized professional evidence, checklists and case decisions.", href: "/verification", roles: ["verification_reviewer","ethics_reviewer","system_admin"], permissions: ["verification.manage"], icon: ShieldCheck, group: "Review queues" },
 { title: "Independent appeals", detail: "Review verification appeals independently from the original case decision.", href: "/verification", roles: ["appeal_reviewer","system_admin"], permissions: ["verification.manage"], icon: ClipboardCheck, group: "Review queues" },
 { title: "Organization workspace", detail: "Manage applications and organization records within your authorized organization scope.", href: "/organizations", roles: ["organization_representative"], permissions: ["organizations.manage"], scopeRoles: ["organization_admin","organization_owner","owner","admin"], icon: Building2, group: "Organization work" },
 { title: "Recruitment and hiring", detail: "Open job and applicant workflows only for assigned organizations or job teams.", href: "/jobs", roles: [], permissions: ["jobs.manage"], scopeRoles: ["recruiter","hiring_manager","job_manager"], icon: BriefcaseBusiness, group: "Organization work" },
 { title: "Project delivery", detail: "Open project and service work within assigned organization or project scope.", href: "/organizations", roles: [], permissions: ["projects.manage"], scopeRoles: ["project_manager"], icon: Handshake, group: "Organization work" },
 { title: "Finance operations", detail: "Verify payments, record manual receipts, issue vouchers and use finance reports.", href: "/admin/finance", roles: ["finance_officer","system_admin"], permissions: ["finance.view","finance.manage","finance.payment.record"], icon: WalletCards, group: "Platform operations" },
 { title: "Support desk", detail: "Handle support requests and authorized staff-assisted follow-up.", href: "/admin/support", roles: ["supporting_staff","system_admin"], permissions: ["support.manage"], icon: LifeBuoy, group: "Platform operations" },
 { title: "Platform review and moderation", detail: "Open the operational review tools allowed by your current permissions.", href: "/admin", roles: ["reviewer","supporting_staff","admin","system_admin"], permissions: ["reviews.view"], icon: ClipboardCheck, group: "Platform operations" },
 { title: "Platform administration", detail: "Manage accounts, platform roles and security within administrator authority.", href: "/admin/accounts", roles: ["admin","platform_admin","system_admin"], permissions: ["users.manage"], icon: ShieldCheck, group: "Administration" },
];
function allowed(task: Task, identity: Identity, organizations: Organization[]) {
 const roles = identity.roles || [], permissions = identity.permissions || [];
 const platformAccess = Boolean(task.roles?.some(role => roles.includes(role)) || task.permissions?.some(permission => permissions.includes(permission)));
 const scopedAccess = Boolean(task.scopeRoles?.some(role => organizations.some(org => String(org.role_code || "").toLowerCase() === role)));
 return platformAccess || scopedAccess;
}
export default function RoleWorkspacesPage() {
 const token = useUiStore(state => state.token), hydrated = useUiStore(state => state.hydrated), hydrateToken = useUiStore(state => state.hydrateToken);
 const [identity,setIdentity] = useState<Identity|null>(null), [organizations,setOrganizations] = useState<Organization[]>([]);
 const [loading,setLoading] = useState(false), [error,setError] = useState("");
 const load = useCallback(async () => {
  if (!token) { setIdentity(null); setOrganizations([]); return; }
  setLoading(true); setError("");
  try {
   const [me, orgs] = await Promise.all([api<Identity>("/api/v1/me",{},token),api<Organization[]>("/api/v1/organizations",{},token)]);
   setIdentity(me); setOrganizations(Array.isArray(orgs) ? orgs.filter(org => !["inactive","revoked"].includes(String(org.status))) : []);
  } catch (cause) { setIdentity(null); setOrganizations([]); setError(cause instanceof Error ? cause.message : "Role and organization access could not be loaded."); }
  finally { setLoading(false); }
 },[token]);
 useEffect(()=>{if(!hydrated)hydrateToken();},[hydrated,hydrateToken]);
 useEffect(()=>{if(hydrated)void load();},[hydrated,load]);
 const visible = useMemo(()=>identity ? tasks.filter(task=>allowed(task,identity,organizations)) : [],[identity,organizations]);
 const groups = useMemo(()=>[...new Set(visible.map(task=>task.group))],[visible]);
 if(!hydrated || loading) return <main className="mx-auto max-w-6xl px-4 py-8"><Card><OperationStatus state="loading" title="Preparing your workspaces" detail="Checking your current platform roles and organization relationships." /></Card></main>;
 if(!token) return <main className="mx-auto max-w-4xl px-4 py-10"><Card><h1 className="h1">Your workspaces</h1><p className="muted mt-2">Sign in to see the work areas available to your account.</p><Link className="btn btn-primary mt-4" href="/login?next=/workspaces">Sign in <ArrowRight size={16}/></Link></Card></main>;
 if(error) return <main className="mx-auto max-w-6xl px-4 py-8"><Card><OperationStatus state="error" title="Workspace access could not be confirmed" detail={error}/><button className="btn btn-ghost mt-3" type="button" onClick={()=>void load()}>Try again</button></Card></main>;
 return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
  <header className="mb-7"><p className="eyebrow">MPA · Role-based work</p><h1 className="h1">Your workspaces</h1><p className="muted mt-2 max-w-3xl">One starting point for your current responsibilities. Each link opens its existing workflow; server permissions and record scope remain authoritative.</p>
   <div className="mt-4 flex flex-wrap gap-2">{(identity?.roles||[]).map(role=><span className="badge" key={role}>{role.replaceAll("_"," ")}</span>)}{organizations.map(org=><span className="badge" key={org.id}>{org.display_name||org.legal_name||"Organization"}{org.role_code ? " · "+org.role_code.replaceAll("_"," ") : ""}</span>)}</div>
  </header>
  {visible.length===0 ? <Card><h2 className="h3">No assigned workspaces yet</h2><p className="muted mt-2">Your member journey remains available. If you expected staff or organization work, ask an administrator to review the current role or scoped assignment.</p><Link className="btn btn-primary mt-4" href="/members">Open member journey <ArrowRight size={16}/></Link></Card> : groups.map(group=><section className="mb-8" key={group}><h2 className="h2 mb-3">{group}</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visible.filter(task=>task.group===group).map(task=>{const Icon=task.icon;return <Card key={task.title}><div className="flex h-full flex-col"><div className="mb-3 flex items-center gap-2"><Icon size={19} aria-hidden="true"/><h3 className="font-semibold">{task.title}</h3></div><p className="muted text-sm">{task.detail}</p><div className="mt-auto pt-4"><Link className="btn btn-ghost" href={task.href}>Open workspace <ArrowRight size={16}/></Link></div></div></Card>;})}</div></section>)}
  <p className="muted text-xs">Queue totals and progress remain in the authoritative workflow screens. This overview does not invent counts or copy private records.</p>
 </main>;
}
