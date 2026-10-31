"use client";

import {ArrowRight,BookOpen,CheckCircle2,Clock3,Compass,Filter,Globe2,HeartHandshake,Leaf,MapPin,Search,ShieldCheck,Sparkles,Users,X} from "lucide-react";
import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {SupportAction} from "../../components/support-action";

type InitiativeCategory="All"|"Education"|"Community care"|"Digital inclusion";
type Initiative={id:string;title:string;category:Exclude<InitiativeCategory,"All">;summary:string;detail:string;mode:string;place:string;focus:string;icon:typeof BookOpen;accent:string};

const initiatives:Initiative[]=[
 {id:"learning",title:"Neighbourhood learning circles",category:"Education",summary:"A concept for volunteer-led study circles that help young people build confidence in core learning skills.",detail:"Local educators and volunteers could help shape welcoming small-group learning sessions, share practical study techniques and connect learners with trusted community resources. This is an illustrative programme concept, not a currently approved or open volunteer call.",mode:"Community-based concept",place:"Local community hubs",focus:"Learning support",icon:BookOpen,accent:"education"},
 {id:"care",title:"Community care and wellbeing",category:"Community care",summary:"A concept for coordinated community support, practical guidance and referral awareness.",detail:"A future community-care initiative could bring together trained volunteers and local partners to improve awareness of available support and help residents navigate trusted services. It would require an approved programme owner, safeguarding plan and clear referral boundaries before launch.",mode:"Partner-led concept",place:"Community partner locations",focus:"Community wellbeing",icon:HeartHandshake,accent:"care"},
 {id:"digital",title:"Digital skills for community groups",category:"Digital inclusion",summary:"A concept for helping local community organisations build confidence with everyday digital tools.",detail:"Volunteer professionals could help community groups understand safe digital practices, improve basic workflows and build confidence with accessible tools. Any future programme would publish its scope, eligibility and participation process after review.",mode:"Workshop concept",place:"Remote and local workshops",focus:"Digital inclusion",icon:Globe2,accent:"digital"}
];

const categories:InitiativeCategory[]=["All","Education","Community care","Digital inclusion"];

export default function ServeCommunityPage(){
 const [category,setCategory]=useState<InitiativeCategory>("All");
 const [query,setQuery]=useState("");
 const [selected,setSelected]=useState<Initiative|null>(null);
 const filtered=useMemo(()=>initiatives.filter(item=>(category==="All"||item.category===category)&&(!query.trim()||[item.title,item.summary,item.category,item.focus].join(" ").toLowerCase().includes(query.trim().toLowerCase()))),[category,query]);
 useEffect(()=>{if(!selected)return;const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")setSelected(null)};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey)},[selected]);
 return <main className="serve-community-page">
  <section className="sc-hero">
   <div className="sc-hero-copy">
    <div className="sc-kicker"><span className="sc-kicker-dot"/><span>MPA · Serve-Community</span><span className="sc-kicker-divider"/>Community impact, made visible</div>
    <h1>Good work grows<br/><span>when we do it together.</span></h1>
    <p className="sc-hero-lead">A dedicated home for community initiatives, volunteering and shared progress. Discover where your skills, time and care can make a meaningful difference.</p>
    <div className="sc-hero-actions">
     <a className="btn btn-primary" href="#discover">Explore initiatives <ArrowRight size={17}/></a>
     <SupportAction label="Talk to MPA" className="btn btn-ghost"/>
    </div>
    <div className="sc-hero-proof"><span><ShieldCheck size={16}/> Reviewed before publication</span><span><Users size={16}/> Participation by choice</span><span><Leaf size={16}/> Impact with purpose</span></div>
   </div>
   <div className="sc-hero-art" aria-hidden="true">
    <div className="sc-art-orbit sc-art-orbit-one"/><div className="sc-art-orbit sc-art-orbit-two"/>
    <div className="sc-art-center"><HeartHandshake size={54} strokeWidth={1.35}/></div>
    <span className="sc-art-node sc-art-node-one"><BookOpen size={22}/></span><span className="sc-art-node sc-art-node-two"><Users size={22}/></span><span className="sc-art-node sc-art-node-three"><Globe2 size={22}/></span>
    <span className="sc-art-spark sc-art-spark-one"/><span className="sc-art-spark sc-art-spark-two"/>
   </div>
  </section>

  <section className="sc-principles" aria-label="How Serve-Community works">
   <article><span className="sc-principle-icon"><CheckCircle2 size={19}/></span><div><strong>Reviewed initiatives</strong><p>Only approved community-benefit programmes belong in the live directory.</p></div></article>
   <article><span className="sc-principle-icon"><HeartHandshake size={19}/></span><div><strong>Meaningful participation</strong><p>Clear expectations, voluntary involvement and consent-led journeys.</p></div></article>
   <article><span className="sc-principle-icon"><ShieldCheck size={19}/></span><div><strong>Respectful reporting</strong><p>Community progress is shared in aggregate, not through personal details.</p></div></article>
  </section>

  <section id="discover" className="sc-discover">
   <div className="sc-section-heading">
    <div><div className="eyebrow">Discover with purpose</div><h2 className="h2">Explore community initiatives</h2><p className="muted">Find a cause that connects with your experience and the change you want to support.</p></div>
    <div className="sc-preview-label"><Sparkles size={15}/> Interactive concept preview</div>
   </div>
   <div className="sc-preview-notice" role="note"><InfoIcon/><p><strong>Preview content — not live opportunities.</strong> These sample programme cards demonstrate the intended experience. No initiative is currently being advertised or accepting registrations through this preview. Live cards will be populated only from reviewed and approved community initiatives.</p></div>
   <div className="sc-toolbar">
    <label className="sc-search"><Search size={18}/><span className="sr-only">Search sample initiatives</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search causes, skills or themes…" /></label>
    <div className="sc-filter-label"><Filter size={16}/> Explore by focus</div>
    <div className="sc-category-tabs" role="group" aria-label="Filter initiatives by category">{categories.map(item=><button key={item} type="button" aria-pressed={category===item} className={category===item?"active":""} onClick={()=>setCategory(item)}>{item}</button>)}</div>
   </div>
   <div className="sc-results-meta" aria-live="polite"><span>{filtered.length} sample {filtered.length===1?"concept":"concepts"}</span><span>Illustrative content only</span></div>
   {filtered.length?<div className="sc-initiative-grid">{filtered.map(item=>{const Icon=item.icon;return <article className="sc-initiative-card" key={item.id}>
    <div className={`sc-card-art sc-card-art-${item.accent}`}><span className="sc-card-art-icon"><Icon size={28}/></span><span className="sc-card-preview">Preview concept</span><span className="sc-card-art-mark" aria-hidden="true">MPA</span></div>
    <div className="sc-card-content"><div className="sc-card-category">{item.category}</div><h3>{item.title}</h3><p>{item.summary}</p><div className="sc-card-meta"><span><MapPin size={14}/>{item.place}</span><span><Clock3 size={14}/>{item.mode}</span></div><button type="button" className="sc-card-link" onClick={()=>setSelected(item)}>View concept <ArrowRight size={16}/></button></div>
   </article>})}</div>:<div className="sc-empty"><Search size={25}/><h3>No sample concepts match</h3><p>Try another search term or clear the selected category.</p><button className="btn btn-ghost" type="button" onClick={()=>{setCategory("All");setQuery("")}}>Clear filters</button></div>}
  </section>

  <section className="sc-join">
   <div className="sc-join-icon"><Compass size={27}/></div><div className="sc-join-copy"><div className="eyebrow">Bring your skills to the community</div><h2 className="h2">Have an idea worth growing?</h2><p className="muted">Talk with MPA about a community initiative, volunteering pathway or partnership. Proposals are reviewed before anything is published.</p></div><SupportAction label="Start a conversation" className="btn btn-primary"/>
  </section>

  <section className="sc-boundary">
   <div><div className="eyebrow">The right space for every journey</div><h2 className="h2">Community impact is different from commercial discovery.</h2><p className="muted">Serve-Community is for public-benefit initiatives and volunteering. Professional and commercial discovery has its own Network-Plus experience, with separate eligibility, ownership and request rules.</p></div>
   <Link className="btn btn-ghost" href="/network-plus">Explore Network-Plus <ArrowRight size={16}/></Link>
  </section>

  {selected?<div className="sc-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setSelected(null)}}><section className="sc-modal" role="dialog" aria-modal="true" aria-labelledby="sc-modal-title" aria-describedby="sc-modal-description"><div className={`sc-modal-art sc-card-art-${selected.accent}`}><span className="sc-card-art-icon"><selected.icon size={32}/></span><button type="button" className="sc-modal-close" aria-label="Close concept details" onClick={()=>setSelected(null)}><X size={19}/></button><span className="sc-card-preview">Preview concept · not open for registration</span></div><div className="sc-modal-body"><div className="sc-card-category">{selected.category} · Illustrative concept</div><h2 id="sc-modal-title">{selected.title}</h2><p id="sc-modal-description">{selected.detail}</p><div className="sc-modal-facts"><span><MapPin size={15}/>{selected.place}</span><span><Clock3 size={15}/>{selected.mode}</span><span><CheckCircle2 size={15}/>{selected.focus}</span></div><div className="sc-modal-note"><ShieldCheck size={18}/><p>This is sample content for UX preview only. It is not an approved initiative, a live vacancy or an invitation to register.</p></div><button type="button" className="btn btn-primary" onClick={()=>setSelected(null)}>Close preview</button></div></section></div>:null}
 </main>;
}

function InfoIcon(){return <span className="sc-notice-icon" aria-hidden="true"><ShieldCheck size={19}/></span>}
