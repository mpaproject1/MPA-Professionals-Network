"use client";

import {useState} from "react";
import {ApiError,api} from "../lib/api";
import {Card} from "./ui";

type Metric={value:number|null;suppressed:boolean;definition?:string};
type ImpactReport={title:string;listing:{id:string;lifecycleStatus:string};minimumGroupSize:number;suppressionPolicy:string;filters:{from?:string|null;to?:string|null};generatedAt:string;metrics:Record<string,Metric>;monthlySummary:{month:string;value:number|null;suppressed:boolean}[]};

function localDate(date:Date){const year=date.getFullYear(),month=String(date.getMonth()+1).padStart(2,"0"),day=String(date.getDate()).padStart(2,"0");return year+"-"+month+"-"+day;}
async function downloadImpact(path:string,token:string){const response=await fetch(path,{headers:{Authorization:"Bearer "+token},cache:"no-store"});if(!response.ok){let message="Export failed. Please retry.";try{const data=await response.json();message=data?.error?.message||message;}catch{}throw new Error(message);}const blob=await response.blob();if(!blob.size)throw new Error("The report export was empty. No file was downloaded.");const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=response.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/)?.[1]||"serve-community-impact";document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}

export function ServiceImpactReportPanel({listingId,token}:{listingId:string;token:string|null}){
 const [from,setFrom]=useState(()=>localDate(new Date(Date.now()-90*86400000)));
 const [to,setTo]=useState(()=>localDate(new Date()));
 const [report,setReport]=useState<ImpactReport|null>(null);
 const [busy,setBusy]=useState<"run"|"csv"|"pdf"|"xlsx"|null>(null);
 const [error,setError]=useState("");const [notice,setNotice]=useState("");
 function query(format?:string){const params=new URLSearchParams();if(from)params.set("from",from);if(to)params.set("to",to);if(format)params.set("format",format);return params.toString();}
 async function run(){if(!token||busy)return;if(from&&to&&from>to){setError("The start date must be on or before the end date.");return;}setBusy("run");setError("");setNotice("");try{const result=await api<{report:ImpactReport}>("/api/v1/services/listings/"+encodeURIComponent(listingId)+"/impact-report?"+query(),{},token);setReport(result.report);setNotice("Report generated from authorized source records. Suppressed values remain hidden.");}catch(e){setError(e instanceof ApiError?e.message:e instanceof Error?e.message:"The impact report could not be confirmed.");}finally{setBusy(null);}}
 async function exportAs(format:"csv"|"pdf"|"xlsx"){if(!token||busy)return;if(from&&to&&from>to){setError("The start date must be on or before the end date.");return;}setBusy(format);setError("");setNotice("");try{await downloadImpact("/api/v1/services/listings/"+encodeURIComponent(listingId)+"/impact-report/export?"+query(format),token);setNotice(format.toUpperCase()+" export generated and audited.");}catch(e){setError(e instanceof Error?e.message:"The export could not be confirmed.");}finally{setBusy(null);}}
 return <details className="grid" style={{gap:10,marginTop:10}}><summary className="case-row" style={{cursor:"pointer"}}><b>Impact report & exports</b><span className="muted" style={{display:"block"}}>Authorized, privacy-safe aggregates · minimum group size 5</span></summary>
  {!token?<p className="muted">Sign in as an authorized service owner to generate this report.</p>:<Card>
   <div className="grid grid-2" style={{gap:10}}><label>From<input type="date" value={from} max={to||undefined} onChange={e=>setFrom(e.target.value)}/></label><label>To<input type="date" value={to} min={from||undefined} onChange={e=>setTo(e.target.value)}/></label></div>
   <div className="row" style={{gap:8,flexWrap:"wrap",marginTop:12}}><button className="btn btn-primary" type="button" disabled={Boolean(busy)} onClick={()=>void run()}>{busy==="run"?"Generating…":"Generate report"}</button><button className="btn btn-ghost" type="button" disabled={Boolean(busy)} onClick={()=>void exportAs("csv")}>{busy==="csv"?"Preparing CSV…":"Export CSV"}</button><button className="btn btn-ghost" type="button" disabled={Boolean(busy)} onClick={()=>void exportAs("xlsx")}>{busy==="xlsx"?"Preparing Excel…":"Export Excel"}</button><button className="btn btn-ghost" type="button" disabled={Boolean(busy)} onClick={()=>void exportAs("pdf")}>{busy==="pdf"?"Preparing PDF…":"Export PDF"}</button></div>
   {error&&<p className="form-error" role="alert">{error}</p>}{notice&&<p className="form-success" role="status">{notice}</p>}
   {report&&<div className="grid" style={{gap:10,marginTop:14}}><div><h4 className="h2">{report.title}</h4><p className="muted">Period: {report.filters.from||"start"} – {report.filters.to||"today"} · Generated {new Date(report.generatedAt).toLocaleString()}</p></div><div className="grid grid-2" style={{gap:8}}>{Object.entries(report.metrics||{}).map(([key,metric])=><div className="case-row" key={key}><b>{metric.suppressed?"Suppressed":metric.value===null?"No responses yet":Number(metric.value).toLocaleString()}</b><small className="muted">{key.replaceAll("_"," ")}</small></div>)}</div><p className="muted">{report.suppressionPolicy}</p><p className="tagline">Activity and outcomes are reported separately. A participant-reported outcome is not proof of causation. CSV keeps original text values; import as text in spreadsheet software when leading zeroes must remain displayed.</p></div>}
  </Card>}
 </details>;
}
