"use client";
import {ArrowRight,BriefcaseBusiness,GraduationCap,LockKeyhole,Search,Users,Workflow} from "lucide-react";
import Link from "next/link";
import {Card} from "../../components/ui";

const primaryPathways=[
 {href:"/services",title:"Professional services",tag:"Services",icon:BriefcaseBusiness,description:"Find published professional services and contact providers to discuss scope, timing and delivery.",action:"Explore services"},
 {href:"/mentorship",title:"Mentorship circles",tag:"Mentorship",icon:GraduationCap,description:"Explore active mentor profiles or submit your goals as an open mentorship request.",action:"Find a mentor"},
 {href:"/service-demand",title:"Community needs",tag:"Community demands",icon:Users,description:"Share an unmet need privately or support a reviewed public demand topic.",action:"View community needs"}
];
const otherPathways=[
 {href:"/jobs",title:"Careers and opportunities",description:"Browse published opportunities and continue through the relevant application workflow.",action:"Browse opportunities"},
 {href:"/organizations",title:"Organization workspace",description:"If you manage an organization, open its workspace to manage approved profile details and recruitment tasks.",action:"Open workspace"},
 {href:"/saved",title:"Saved items",description:"Return to services, mentors and opportunities you have saved.",action:"View saved items"}
];
export default function ServeCommunityPage(){return <main className="mx-auto grid w-full max-w-7xl px-4 py-6 sm:px-6" style={{gap:28}}>
 <section className="marketplace-hero grid" style={{gap:12}}>
  <div className="eyebrow">MPA professional network · Serve-Community</div>
  <h1 className="h1">Serve-Community. More ways to contribute.</h1>
  <p className="muted" style={{maxWidth:760}}>Discover professional services, mentorship, career opportunities and community initiatives in one place. Start with public information; requests, applications and delivery continue through their dedicated workflows.</p>
  <form action="/services" method="get" className="marketplace-search" role="search">
   <label htmlFor="serve-community-service-search"><Search size={17} aria-hidden="true"/> Search professional services</label>
   <input id="serve-community-service-search" name="q" type="search" placeholder="Try finance, design, training or consulting" />
   <button className="btn btn-primary" type="submit">Search services <ArrowRight size={16}/></button>
  </form>
  <div className="row marketplace-tabs" aria-label="Explore Serve-Community areas" style={{gap:8,flexWrap:"wrap"}}>
   <Link href="/serve-community" aria-current="page">All</Link><Link href="/services">Services</Link><Link href="/mentorship">Mentorship</Link><Link href="/jobs">Careers</Link><Link href="/organizations">Organizations</Link>
  </div>
  <div className="row" style={{gap:10,flexWrap:"wrap"}}>
   <Link className="btn btn-ghost" href="/service-demand"><Users size={17}/> Share a need</Link>
   <Link className="btn btn-ghost" href="/member"><Workflow size={17}/> My workspace</Link>
  </div>
 </section>
 <section className="grid" style={{gap:14}}>
  <div><div className="eyebrow">Choose your next step</div><h2 className="h2">Start with what you need today</h2><p className="muted">Three clear starting points, with more pathways below.</p></div>
  <div className="grid grid-3 marketplace-primary-grid" style={{gap:14}}>{primaryPathways.map(item=>{const Icon=item.icon;return <Card key={item.href} className="marketplace-pathway grid" style={{alignContent:"start",gap:12}}><div className="marketplace-pathway-icon"><Icon size={23}/></div><div className="eyebrow">{item.tag}</div><h3 className="h2">{item.title}</h3><p className="muted">{item.description}</p><div style={{marginTop:"auto"}}><Link className="btn btn-ghost" href={item.href}>{item.action} <ArrowRight size={16}/></Link></div></Card>})}</div>
 </section>
 <section className="grid" style={{gap:12}}>
  <div><div className="eyebrow">More from MPA</div><h2 className="h2">Other useful pathways</h2></div>
  <div className="grid grid-3 marketplace-secondary-grid" style={{gap:12}}>{otherPathways.map(item=><Card key={item.href} className="grid" style={{alignContent:"start",gap:8}}><h3 style={{fontSize:18,fontWeight:750}}>{item.title}</h3><p className="muted">{item.description}</p><Link className="text-link" href={item.href}>{item.action} <ArrowRight size={15}/></Link></Card>)}</div>
 </section>
 <section className="marketplace-trust grid" style={{gap:10}}>
  <div className="row" style={{gap:12,alignItems:"flex-start"}}><LockKeyhole size={23}/><div className="grid" style={{gap:6}}><h2 className="h2">Your privacy stays in your control</h2><p className="muted">A public listing is not a private agreement. Requests, applications, mentor proposals and introductions use their own workflows. Review the details and next step before submitting.</p></div></div>
  <div className="row" style={{gap:10,flexWrap:"wrap"}}><Link className="text-link" href="/privacy">Privacy information</Link><Link className="text-link" href="/community-guidelines">Community guidelines</Link><Link className="text-link" href="/contact">Contact support</Link></div>
 </section>
</main>}