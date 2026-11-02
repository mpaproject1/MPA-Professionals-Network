"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { ApiError, api } from "../lib/api";
import { useUiStore } from "../lib/store";
import { Card } from "./ui";
import { OperationStatus } from "./operation-status";

type Totals={currency:string;obligation_count:number;outstanding_count:number;amount_due:string|number;verified_cash:string|number;approved_non_cash:string|number;outstanding_balance:string|number};

export function MembershipFeeBalanceSummary(){
 const token=useUiStore(state=>state.token);
 const [totals,setTotals]=useState<Totals[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const load=useCallback(async()=>{
  if(!token)return;
  setLoading(true);setError("");
  try{const result=await api<{totalsByCurrency:Totals[]}>("/api/v1/finance/membership/fee-obligations",{},token);setTotals(result.totalsByCurrency||[]);}
  catch(cause){setError(cause instanceof ApiError?cause.message:"Fee balance summary is unavailable.");}
  finally{setLoading(false);}
 },[token]);
 useEffect(()=>{void load();},[load]);
 return <Card>
  <div className="panel-heading"><div><h2>Membership fee balances</h2><p>Verified cash, approved non-cash coverage and remaining dues are reported separately.</p></div><button className="btn btn-ghost" type="button" disabled={loading} onClick={()=>void load()}><RefreshCw size={15}/></button></div>
  {loading?<OperationStatus state="loading" title="Loading fee balances" detail="Retrieving Finance-authoritative obligation totals."/>:error?<OperationStatus state="error" title="Fee balances unavailable" detail={error}/>:totals.length?<>
   <div className="grid grid-3">{totals.map(item=><div className="case-row" key={item.currency}><p className="muted">{item.currency} · Outstanding</p><h3>{Number(item.outstanding_balance).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</h3><p className="muted">Fee due {Number(item.amount_due).toLocaleString()} · verified cash {Number(item.verified_cash).toLocaleString()} · approved non-cash {Number(item.approved_non_cash).toLocaleString()}</p><p className="muted">{item.obligation_count} obligations · {item.outstanding_count} outstanding</p></div>)}</div>
   <a className="btn btn-ghost" href="/admin/finance">Open Finance payment workspace <ArrowUpRight size={15}/></a>
  </>:<p className="muted">No fee obligations have been created yet.</p>}
 </Card>;
}
