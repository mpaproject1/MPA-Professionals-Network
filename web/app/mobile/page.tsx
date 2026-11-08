"use client";

import {ArrowRight,ArrowUpRight,Bell,BookOpen,BriefcaseBusiness,Building2,Compass,GraduationCap,HeartHandshake,LayoutDashboard,Network,ShieldCheck,Sparkles,UserRound} from "lucide-react";
import Link from "next/link";
import {useEffect} from "react";
import {useUiStore} from "../../lib/store";

type Shortcut={href:string;title:string;detail:string;group:string;icon:typeof Bell};
const memberShortcuts:Shortcut[]=[
 {href:"/members",title:"My workspace",detail:"Your professional journey, progress and member services",group:"Your work",icon:LayoutDashboard},
 {href:"/jobs",title:"Jobs and opportunities",detail:"Discover roles and follow applications",group:"Your work",icon:BriefcaseBusiness},
 {href:"/mentorship",title:"Mentorship",detail:"Connect, schedule and track progress",group:"Your work",icon:GraduationCap},
 {href:"/learning",title:"Learning",detail:"Continue your professional development",group:"Your work",icon:BookOpen},
 {href:"/services",title:"Professional services",detail:"Find trusted expertise and manage requests",group:"Your work",icon:Building2},
 {href:"/membership",title:"Membership",detail:"Status, renewals and your digital card",group:"Account",icon:ShieldCheck},
 {href:"/notifications",title:"Action center",detail:"Updates and actions that need attention",group:"Account",icon:Bell},
 {href:"/notifications#notification-preferences",title:"Notification preferences",detail:"Choose your alerts and device settings",group:"Account",icon:Bell},
 {href:"/profile",title:"My profile",detail:"Maintain your professional identity",group:"Account",icon:UserRound}
];
const publicShortcuts:Shortcut[]=[
 {href:"/jobs",title:"Jobs and opportunities",detail:"Explore current professional opportunities",group:"Get started",icon:BriefcaseBusiness},
 {href:"/about",title:"About MPA",detail:"Learn about the Ethiopian Muslim Professionals Association",group:"Get started",icon:Building2},
 {href:"/register",title:"Join MPA",detail:"Create your professional network account",group:"Get started",icon:UserRound}
];
const discoveryLinks=[
 {href:"/network-plus",title:"Network-Plus",detail:"Professional connections and trusted discovery",icon:Network},
 {href:"/serve-community",title:"Serve-Community",detail:"Public-benefit initiatives and ways to contribute",icon:HeartHandshake}
];
export default function MobileHomePage(){
 const token=useUiStore(s=>s.token),hydrated=useUiStore(s=>s.hydrated),hydrateToken=useUiStore(s=>s.hydrateToken);
 useEffect(()=>{if(!hydrated)hydrateToken()},[hydrated,hydrateToken]);
 const shortcuts=token?memberShortcuts:publicShortcuts;
 const groups=Array.from(new Set(shortcuts.map(item=>item.group)));
 return <main className="mpa-mobile-hub">
  <header className="mobile-hub-hero">
   <div className="mobile-hub-orbit mobile-hub-orbit-one" aria-hidden="true"/><div className="mobile-hub-orbit mobile-hub-orbit-two" aria-hidden="true"/>
   <div className="mobile-hub-eyebrow"><span className="mobile-hub-pulse"/>{hydrated?(token?"MEMBER SPACE · CONNECTED":"MPA PROFESSIONAL NETWORK"):"SECURE WORKSPACE · RESTORING"}</div>
   <p className="mobile-hub-brand">ETHIOPIAN MUSLIM PROFESSIONALS ASSOCIATION</p>
   <h1>Your MPA,<br/><span>in your pocket.</span></h1>
   <p className="mobile-hub-lede">{token?"A focused space to move your professional journey forward.":"Discover opportunities, build trusted connections and contribute to your community."}</p>
   {!hydrated?<p className="mobile-hub-session" role="status">Restoring your secure session…</p>:!token?<div className="mobile-hub-actions"><Link className="mobile-hub-primary" href="/login">Sign in <ArrowRight size={16}/></Link><Link className="mobile-hub-secondary" href="/register">Join MPA</Link></div>:<div className="mobile-hub-session"><ShieldCheck size={15}/> Your account permissions are active</div>}
  </header>

  <nav className="mobile-hub-explore" aria-label="Explore MPA destinations">
   <div className="mobile-hub-nav-heading"><span>EXPLORE THE NETWORK</span><Sparkles size={15}/></div>
   <div className="mobile-hub-nav-links">
    {discoveryLinks.map(item=>{const Icon=item.icon;return <Link href={item.href} key={item.href} className="mobile-hub-nav-link"><span className="mobile-hub-nav-icon"><Icon size={19}/></span><span><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowUpRight size={16} className="mobile-hub-nav-arrow"/></Link>})}
   </div>
  </nav>

  <section className="mobile-hub-destinations" aria-label={token?"Member destinations":"MPA destinations"}>
   <div className="mobile-hub-section-heading"><div><span className="mobile-hub-kicker">ONE NETWORK. MANY POSSIBILITIES.</span><h2>{token?"Your workspace":"Start exploring"}</h2></div><Compass size={21}/></div>
   {groups.map(group=><section className="mobile-hub-group" key={group} aria-label={group}><h3>{group}</h3><div className="mobile-hub-list">{shortcuts.filter(item=>item.group===group).map(item=>{const Icon=item.icon;return <Link key={item.href} href={item.href} className="mobile-hub-row"><span className="mobile-hub-row-icon"><Icon size={19}/></span><span className="mobile-hub-row-copy"><strong>{item.title}</strong><small>{item.detail}</small></span><ArrowRight size={16} className="mobile-hub-row-arrow"/></Link>})}</div></section>)}
  </section>
  <footer className="mobile-hub-footer"><span className="mobile-hub-footer-mark">MPA</span><span>One trusted network for professional growth and community impact.</span></footer>
 </main>;
}
