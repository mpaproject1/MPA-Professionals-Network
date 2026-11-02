"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, MapPinned, RefreshCw } from "lucide-react";
import { ApiError, api } from "../lib/api";
import { useUiStore } from "../lib/store";
import { Card } from "./ui";
import { OperationStatus } from "./operation-status";
type Group={country_code?:string;country_name?:string;unit_code?:string;label?:string;unit_level?:string;member_count:number};
type Summary={publishedVersion?:{id:string;version_label:string;published_at:string}|null;residencesOutsidePublishedVersion:number;residenceTypes:{residence_type:string;member_count:number}[];countries:Group[];ethiopiaLevel1:Group[];ethiopiaLevel2:Group[];ethiopiaLevel3:Group[];generatedAt:string};
export function MemberGeographySummary(){
 const token=useUiStore(state=>state.token);const [data,setData]=useState<Summary|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const load=useCallback(async()=>{if(!token)return;setLoading(true);setError("");try{setData(await api<Summary>("/api/v1/admin/member-geography/summary",{},token));}catch(cause){setError(cause instanceof ApiError?cause.message:"Member geography summary is unavailable.");}finally{setLoading(false);}},[token]);
 useEffect(()=>{void load();},[load]);
 return <Card><div className="panel-heading"><div><h2>Member geography</h2><p>Aggregate residence data from member profiles. Street addresses and individual-level details are excluded.</p></div><MapPinned size={20}/></div>
 {loading?<OperationStatus state="loading" title="Loading geographic summary" detail="Aggregating member-selected residence locations."/>:error?<OperationStatus state="error" title="Geography summary unavailable" detail={error}/>:data?<>
  {data.publishedVersion&&<p className="muted"><small>Published reference: {data.publishedVersion.version_label} · {new Date(data.publishedVersion.published_at).toLocaleDateString()}</small></p>}{data.residencesOutsidePublishedVersion>0&&<OperationStatus state="info" title={data.residencesOutsidePublishedVersion+" profile(s) use an older geography version"} detail="These residences are excluded from current-version aggregates until the member or an authorized import refreshes them."/>}
  <div className="grid grid-3">{data.residenceTypes.map(item=><div className="case-row" key={item.residence_type}><p className="muted">{item.residence_type==="ethiopia"?"Ethiopia":"Diaspora"}</p><h3>{item.member_count.toLocaleString()}</h3><p className="muted">Member profile(s)</p></div>)}</div>
  <div className="grid grid-2"><div><strong>Countries / areas</strong>{data.countries.slice(0,8).map(item=><div key={item.country_code} className="row" style={{justifyContent:"space-between",padding:"5px 0"}}><span>{item.country_name}</span><strong>{item.member_count}</strong></div>)}</div><div><strong>Ethiopian Region / Federal City</strong>{data.ethiopiaLevel1.slice(0,8).map(item=><div key={item.unit_code} className="row" style={{justifyContent:"space-between",padding:"5px 0"}}><span>{item.label}</span><strong>{item.member_count}</strong></div>)}</div></div>
  <a className="btn btn-ghost" href="/admin/membership-geography">Manage geographic reference data <ArrowUpRight size={15}/></a>
 </>:<p className="muted">No member residence information has been recorded yet.</p>}
 </Card>;
}
