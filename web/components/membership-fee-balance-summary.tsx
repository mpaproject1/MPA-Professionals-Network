"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { ApiError, api } from "../lib/api";
import { useUiStore } from "../lib/store";
import { Badge, Card } from "./ui";
import { OperationStatus } from "./operation-status";
type Row={currency:string;amount_due:string|number;verified_cash:string|number;approved_non_cash:string|number;outstanding_balance:string|number;pending_receipts?:unknown[]};
function total(rows:Row[],field:keyof Row,currency:string){return rows.filter(row=>row.currency===currency).reduce((sum,row)=>sum+Number(row[field]||0),0);}
export function MembershipFeeBalanceSummary(){
 const token=useUiStore(state=>state.token);const [rows,setRows]=useState<Row[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
 async function load(){if(!token)return;setLoading(true);setError("");try{const result=await api<{rows:Row[]}>("/api/v1/finance/membership/fee-obligations",{},token);setRows(result.rows||[]);}catch(cause){setError(cause instanceof ApiError?cause.message:"Fee balance summary is unavailable.");}finally{setLoading(false);}}
 useEffect(()=>{void load();},[token]);
 const currencies=[...new Set(rows.map(row=>row.currency))];
 return <Card><div className="panel-heading"><div><h2>Membership fee balances</h2><p>Verified cash, approved non-cash coverage and remaining dues are reported separately.</p></div><button className="btn btn-ghost" type="button" disabled={loading} onClick={()=>void load()}><RefreshCw size={15}/></button></div>
 {loading?<OperationStatus state="loading" title="Loading fee balances" detail="Retrieving Finance-authoritative obligation totals."/>:error?<OperationStatus state="error" title="Fee balances unavailable" detail={error}/>:rows.length?<>
  <div className="grid grid-3">{currencies.map(code=><div className="case-row" key={code}><p className="muted">{code} · Outstanding</p><h3>{total(rows,"outstanding_balance",code).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</h3><p className="muted">Fee due {total(rows,"amount_due",code).toLocaleString()} · verified cash {total(rows,"verified_cash",code).toLocaleString()} · approved non-cash {total(rows,"approved_non_cash",code).toLocaleString()}</p></div>)}</div>
  <p className="muted">{rows.filter(row=>Number(row.outstanding_balance)>0).length} obligation(s) with an outstanding balance · {rows.reduce((sum,row)=>sum+(row.pending_receipts?.length||0),0)} receipt(s) awaiting Finance verification.</p>
  <a className="btn btn-ghost" href="/admin/finance">Open Finance payment workspace <ArrowUpRight size={15}/></a>
 </>:<p className="muted">No fee obligations have been created yet.</p>}
 </Card>;
}
