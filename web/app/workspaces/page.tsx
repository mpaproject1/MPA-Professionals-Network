"use client";
import { ArrowRight, Award, BriefcaseBusiness, Building2, ClipboardCheck, FileCheck2, HandHeart, Handshake, LifeBuoy, ShieldCheck, Users, WalletCards } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OperationStatus } from "../../components/operation-status";
import { Card } from "../../components/ui";
import { api } from "../../lib/api";
import { useUiStore } from "../../lib/store";

type Identity = { user_id: string; roles?: string[]; permissions?: string[] };
type Organization = { id: string; display_name?: string; legal_name?: string; role_code?: string; status?: string };
type JobAssignment = { job_id:string; job_title:string; organization_id:string; organization_name:string; role_code:string; job_status:string };
type Task = { title: string; detail: string; href: string; roles?: string[]; permissions?: string[]; orgRoles?: string[]; jobRoles?: string[]; always?: boolean; icon: typeof Users; group: string };
const tasks: Task[] = [
 { title: "Member journey", detail: "Profile completion, membership, verification progress, service pledges and personal requests.", href: "/members", always: true, icon: Users, group: "My account" },
 { title: "Professional profile", detail: "Maintain your own professional information and verification evidence.", href: "/profile", always: true, icon: FileCheck2, group: "My account" },
 { title: "Mentorship and mentor journey", detail: "Explore mentor and mentee workflows. Mentor eligibility is based on verified professional profile criteria, not a platform role.", href: "/mentorship", always: true, icon: Handshake, group: "My account" },
 { title: "Submit an ethics concern", detail: "Submit and track a confidential professional ethics or conduct concern.", href: "/ethics", always: true, icon: HandHeart, group: "My account" },
 { title: "Membership review", detail: "Review submitted applications, corrections and authorized membership decisions.", href: "/admin/membership", roles: ["reviewer","membership_reviewer","system_admin"], permissions: ["membership.review"], icon: ClipboardCheck, group: "Review queues" },
 { title: "Professional verification", detail: "Review assigned professional evidence, checklist results and verification decisions.", href: "/verification", roles: ["verification_reviewer","system_admin"], permissions: ["verification.manage"], icon: ShieldCheck, group: "Review queues" },
 { title: "Independent verification appeals", detail: "Review verification appeals independently from the original case decision.", href: "/verification", roles: ["appeal_reviewer","system_admin"], icon: ClipboardCheck, group: "Review queues" },
 { title: "Ethics and professional conduct", detail: "Handle confidential ethics cases, conflict declarations, independent panel reviews and outcomes.", href: "/admin/ethics", roles: ["ethics_reviewer","system_admin"], permissions: ["ethics.case.review"], icon: ShieldCheck, group: "Review queues" },
 { title: "Organization applications", detail: "Create and track organization applications and verification through the existing representative workflow.", href: "/organizations", roles: ["organization_representative"], permissions: ["organizations.manage"], icon: Building2, group: "Organization work" },
 { title: "Organization administration", detail: "Manage membership roles and organization records only within your active owner or administrator assignment.", href: "/organizations/workspace", orgRoles: ["owner","administrator"], icon: Building2, group: "Organization work" },
 { title: "Recruitment and hiring", detail: "Manage vacancies, candidate pipelines and interviews within your active recruiter or hiring-manager assignment.", href: "/recruitment", orgRoles: ["owner","administrator","recruiter"], jobRoles: ["recruiter","hiring_manager"], icon: BriefcaseBusiness, group: "Organization work" },
 { title: "Project and service delivery", detail: "Open project and service outcome work within your active project-manager organization assignment.", href: "/organizations/workspace?view=projects", orgRoles: ["project_manager"], icon: Handshake, group: "Organization work" },
 { title: "Read-only organization access", detail: "View permitted organization information without member administration or hiring decision rights.", href: "/organizations/workspace?view=read-only", orgRoles: ["read_only"], icon: Building2, group: "Organization work" },
 { title: "Finance operations", detail: "Verify payments, record manual receipts, issue vouchers and use finance reports.", href: "/admin/finance", roles: ["finance_officer","system_admin"], permissions: ["finance.view","finance.payment.record"], icon: WalletCards, group: "Platform operations" },
 { title: "Support desk", detail: "Handle support requests and authorized staff-assisted follow-up.", href: "/admin/support", roles: ["supporting_staff","system_admin"], permissions: ["support.manage"], icon: LifeBuoy, group: "Platform operations" },
 { title: "Platform review and moderation", detail: "Open the operational review tools allowed by your current permissions.", href: "/admin", roles: ["reviewer","supporting_staff","admin","system_admin"], permissions: ["reviews.view"], icon: ClipboardCheck, group: "Platform operations" },
 { title: "Community Impact recognition review", detail: "Review achievement nominations, apply published criteria and approve consent-gated recognition awards.", href: "/admin/community-impact/recognition", roles: ["system_admin"], permissions: ["community_impact.recognition.review"], icon: Award, group: "Platform operations" },
 { title: "Platform administration", detail: "Manage operational platform administration without system bootstrap ownership.", href: "/admin", roles: ["admin","platform_admin","system_admin"], permissions: ["users.manage"], icon: ShieldCheck, group: "Administration" },
 { title: "System administration", detail: "Manage privileged role grants, direct permissions, security controls and platform foundation.", href: "/admin/accounts", roles: ["system_admin"], icon: ShieldCheck, group: "Administration" },
];
function allowed(task: Task, identity: Identity, organizations: Organization[], jobAssignments: JobAssignment[]) {
 const roles = identity.roles || [], permissions = identity.permissions || [];
 const platformAccess = Boolean(task.roles?.some(role => roles.includes(role)) || task.permissions?.some(permission => permissions.includes(permission)));
 const organizationAccess = Boolean(task.orgRoles?.some(role => organizations.some(org => org.role_code === role)));
 const jobAccess = Boolean(task.jobRoles?.some(role => jobAssignments.some(job => job.role_code === role)));
 return Boolean(task.always) || platformAccess || organizationAccess || jobAccess;
}
export default function RoleWorkspacesPage() {
 const token = useUiStore(state => state.token), hydrated = useUiStore(state => state.hydrated), hydrateToken = useUiStore(state => state.hydrateToken);
 const [identity,setIdentity] = useState<Identity|null>(null), [organizations,setOrganizations] = useState<Organization[]>([]), [jobAssignments,setJobAssignments] = useState<JobAssignment[]>([]);
 const [loading,setLoading] = useState(false), [error,setError] = useState("");
 const load = useCallback(async () => {
  if (!token) { setIdentity(null); setOrganizations([]); setJobAssignments([]); return; }
  setLoading(true); setError("");
  try {
   const [me, orgs, jobs] = await Promise.all([api<Identity>("/api/v1/me",{},token),api<Organization[]>("/api/v1/organizations",{},token),api<JobAssignment[]>("/api/v1/me/job-assignments",{},token)]);
   setIdentity(me); setOrganizations(Array.isArray(orgs) ? orgs.filter(org => !["inactive","revoked"].includes(String(org.status))) : []); setJobAssignments(Array.isArray(jobs) ? jobs : []);
  } catch (cause) { setIdentity(null); setOrganizations([]); setJobAssignments([]); setError(cause instanceof Error ? cause.message : "Role and organization access could not be loaded."); }
  finally { setLoading(false); }
 },[token]);
 useEffect(()=>{if(!hydrated)hydrateToken();},[hydrated,hydrateToken]);
 useEffect(()=>{if(hydrated)void load();},[hydrated,load]);
 const visible = useMemo(()=>identity ? tasks.filter(task=>allowed(task,identity,organizations,jobAssignments)) : [],[identity,organizations,jobAssignments]);
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
