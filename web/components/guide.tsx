"use client";

import {ChevronLeft,ChevronRight,HelpCircle,PlayCircle,X} from "lucide-react";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {usePathname} from "next/navigation";
import {api} from "../lib/api";

type Step={target?:string;title:string;text:string};
type Guide={id?:string;guide_key:string;route_pattern:string;title:string;description:string;steps:Step[]};
const fallback:Guide={guide_key:"local-help",route_pattern:"*",title:"Getting around MPA",description:"Use the main navigation to move between workspaces. The support assistant is available separately for questions.",steps:[{title:"Explore the current screen",text:"This guide is a short orientation. You can keep using the page while it is open, or skip it at any time."}]};
function visibleTarget(selector?:string):HTMLElement|null{
 if(!selector||typeof document==="undefined")return null;
 try{return Array.from(document.querySelectorAll<HTMLElement>(selector)).find(el=>{const style=window.getComputedStyle(el);return style.display!=="none"&&style.visibility!=="hidden"&&el.getClientRects().length>0;})||null;}catch{return null;}
}
export function GuideLauncher(){
 const pathname=usePathname()||"/";const [guides,setGuides]=useState<Guide[]>([]);
 const [open,setOpen]=useState(false);const [index,setIndex]=useState(0);const [cardPlacement,setCardPlacement]=useState<"top"|"bottom">("bottom");const launcherRef=useRef<HTMLButtonElement>(null);const headingRef=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{let cancelled=false;setIndex(0);api<Guide[]>(`/api/v1/experience/guides?route=${encodeURIComponent(pathname)}`).then(rows=>{if(!cancelled)setGuides(Array.isArray(rows)?rows:[])}).catch(()=>{if(!cancelled)setGuides([])});return()=>{cancelled=true}},[pathname]);
 const guide=useMemo(()=>guides.find(g=>g.route_pattern===pathname)||guides.find(g=>g.route_pattern==="*")||fallback,[guides,pathname]);
 const steps=guide.steps?.length?guide.steps:fallback.steps;const step=steps[Math.min(index,steps.length-1)];
 const close=useCallback(()=>{setOpen(false);window.setTimeout(()=>launcherRef.current?.focus(),0)},[]);
 const begin=useCallback(()=>{setIndex(0);setOpen(true);window.dispatchEvent(new Event("mpa:close-support"));},[]);
 useEffect(()=>{const start=()=>begin();window.addEventListener("mpa:open-guide",start);return()=>window.removeEventListener("mpa:open-guide",start)},[begin]);
 useEffect(()=>{if(!open)return;const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();close()}};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey)},[open,close]);
 useEffect(()=>{if(!open)return;const target=visibleTarget(step?.target);if(target){target.scrollIntoView({behavior:"auto",block:"center",inline:"nearest"});const rect=target.getBoundingClientRect();setCardPlacement(rect.top>window.innerHeight*0.52?"top":"bottom")}else setCardPlacement("bottom");headingRef.current?.focus({preventScroll:true});},[open,step]);
 const targetExists=Boolean(visibleTarget(step?.target));
 function next(){if(index<steps.length-1)setIndex(value=>value+1);else close()}
 return <>
  <button ref={launcherRef} type="button" id="mpa-help" data-guide-target="help-control" className="guide-help" aria-label="Show me around this screen" onClick={begin}><HelpCircle size={18}/> {pathname==="/members"?"Show me around":"Guide"}</button>
  {open?<div className="guide-overlay" data-testid="guide-overlay">
   {targetExists&&step?.target?<GuideSpotlight target={step.target}/>:null}
   <aside className="guide-card" style={cardPlacement==="top"?{top:"calc(76px + env(safe-area-inset-top))",bottom:"auto"}:undefined} role="dialog" aria-modal="false" aria-labelledby="guide-title" aria-describedby="guide-description">
    <div className="row"><span className="badge badge-green"><PlayCircle size={13}/> Guided tour</span><button type="button" className="icon-btn" onClick={close} aria-label="Close tour"><X size={17}/></button></div>
    <div id="guide-title" className="eyebrow" style={{marginTop:14}}>{guide.title}</div>
    <p className="muted" aria-live="polite">Step {index+1} of {steps.length}</p>
    <h2 id="guide-step-title" ref={headingRef} tabIndex={-1}>{step?.title||guide.title}</h2>
    <p id="guide-description" className="muted">{step?.text||guide.description}</p>
    {!targetExists&&step?.target?<p className="guide-fallback" role="status">That control is not visible in this layout. You can continue using this explanation; no page controls are blocked.</p>:null}
    <div className="guide-progress" aria-hidden="true">{steps.map((_,i)=><span key={i} className={i<=index?"done":""}/>)}</div>
    <div className="row" style={{marginTop:16,flexWrap:"wrap"}}>
     <button type="button" className="btn btn-ghost" disabled={index===0} onClick={()=>setIndex(value=>Math.max(0,value-1))}><ChevronLeft size={16}/> Back</button>
     <div className="row" style={{gap:8}}>
      <button type="button" className="btn btn-ghost" onClick={close}>Skip</button>
      <button type="button" className="btn btn-primary" onClick={next}>{index<steps.length-1?<>Next <ChevronRight size={16}/></>:"Finish"}</button>
     </div>
    </div>
   </aside>
  </div>:null}
 </>;
}
function GuideSpotlight({target}:{target:string}){
 const [rect,setRect]=useState<{top:number;left:number;width:number;height:number}|null>(null);
 useEffect(()=>{const update=()=>{const el=visibleTarget(target);if(!el){setRect(null);return}const r=el.getBoundingClientRect();setRect({top:r.top-6,left:r.left-6,width:r.width+12,height:r.height+12})};update();window.addEventListener("resize",update);window.addEventListener("scroll",update,true);return()=>{window.removeEventListener("resize",update);window.removeEventListener("scroll",update,true)}},[target]);
 if(!rect)return null;return <div className="guide-spotlight" style={rect}/>;
}
