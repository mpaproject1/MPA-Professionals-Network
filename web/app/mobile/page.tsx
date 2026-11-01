"use client";

import {ArrowRight,BookOpen,BriefcaseBusiness,Bell,Building2,GraduationCap,HeartHandshake,LayoutDashboard,ShieldCheck,UserRound} from "lucide-react";
import Link from "next/link";
import {useEffect} from "react";
import {useUiStore} from "../../lib/store";

const memberShortcuts=[
 {href:"/members",title:"My workspace",detail:"Your professional journey and member services",icon:LayoutDashboard},
 {href:"/jobs",title:"Jobs and opportunities",detail:"Discover roles and follow applications",icon:BriefcaseBusiness},
 {href:"/mentorship",title:"Mentorship",detail:"Connect, schedule and track progress",icon:GraduationCap},
 {href:"/services",title:"Professional services",detail:"Find trusted services and make requests",icon:Building2},
 {href:"/membership",title:"Membership",detail:"Membership status, renewals and your card",icon:ShieldCheck},
 {href:"/notifications",title:"Action center",detail:"Updates and actions that need attention",icon:Bell},
 {href:"/learning",title:"Learning",detail:"Continue your professional development",icon:BookOpen},
 {href:"/profile",title:"My profile",detail:"Maintain your professional identity",icon:UserRound}
];
const publicShortcuts=[
 {href:"/jobs",title:"Jobs and opportunities",detail:"Explore current professional opportunities",icon:BriefcaseBusiness},
 {href:"/serve-community",title:"Serve the community",detail:"Discover initiatives and ways to contribute",icon:HeartHandshake},
 {href:"/about",title:"About MPA",detail:"Learn about the Ethiopian Muslim Professionals Association",icon:Building2},
 {href:"/register",title:"Join MPA",detail:"Create your professional network account",icon:UserRound}
];
export default function MobileHomePage(){
 const token=useUiStore(s=>s.token),hydrated=useUiStore(s=>s.hydrated),hydrateToken=useUiStore(s=>s.hydrateToken);
 useEffect(()=>{if(!hydrated)hydrateToken()},[hydrated,hydrateToken]);
 const shortcuts=token?memberShortcuts:publicShortcuts;
 return <main className="mx-auto w-full max-w-4xl px-4 py-6 pb-28 sm:px-6 sm:py-10">
  <header className="mb-6 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm sm:p-8">
   <p className="text-xs font-bold uppercase tracking-[.18em] text-[var(--muted)]">Ethiopian Muslim Professionals Association</p>
   <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Your MPA, in your pocket.</h1>
   <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{token?"A simpler mobile workspace for your membership, opportunities, mentorship and professional connections.":"Explore the MPA network and access opportunities from one mobile-friendly starting point."}</p>
   {!hydrated?<p className="mt-4 text-sm text-[var(--muted)]" role="status">Restoring your session…</p>:!token?<div className="mt-5 flex flex-wrap gap-2"><Link className="btn btn-primary" href="/login">Sign in <ArrowRight size={16}/></Link><Link className="btn btn-secondary" href="/register">Join MPA</Link></div>:null}
  </header>
  <section aria-label={token?"Member shortcuts":"Explore MPA"} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
   {shortcuts.map(item=>{const Icon=item.icon;return <Link key={item.href} href={item.href} className="group flex min-h-24 items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--primary)]/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"><span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[var(--bg)] text-[var(--primary)]"><Icon size={22}/></span><span className="min-w-0 flex-1"><span className="block font-semibold">{item.title}</span><span className="mt-1 block text-sm leading-5 text-[var(--muted)]">{item.detail}</span></span><ArrowRight size={17} className="shrink-0 text-[var(--muted)] transition group-hover:translate-x-1"/></Link>})}
  </section>
  <p className="mt-6 text-center text-xs text-[var(--muted)]">The mobile workspace uses the same secure MPA account and permissions as the desktop portal.</p>
 </main>;
}
