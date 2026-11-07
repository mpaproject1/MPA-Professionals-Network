"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Badge, Card } from "../ui";
import { FinanceMembershipObligations } from "../finance-membership-obligations";

export type FinancePaymentRow = {
  payment_id: string; payment_status: string; amount: string | number; currency: string;
  channel: string; source: string; purpose_reference?: string | null; payment_reference?: string | null;
  created_at: string; verified_at?: string | null; verification_note?: string | null;
  evidence_file_id?: string | null; evidence_file_name?: string | null; verified_by_name?: string | null;
  reconciled_by_name?: string | null; reconciled_at?: string | null; application_id: string | null;
  tracking_reference?: string | null; application_type: string; application_status: string;
  product_code: string; product_name: string; reconciliation_status?: string | null;
  reconciliation_note?: string | null; reversed: boolean; member_name?: string | null;
};
export type FinanceManualReceipt = {
  id: string; receiptNumber: string; payerType: string; payerName: string; amount: string;
  currency: string; purpose: string; paymentMethod: string; paymentDate: string; status: string;
  notes?: string | null; evidenceFileId?: string | null; bankReference?: string | null; payerUserId?: string | null; organizationName?: string | null;
  verifiedAt?: string | null; verificationNote?: string | null;
};
type Tab = "register" | "queue" | "reconciliation" | "refunds" | "outstanding";
type Props = {
  payments: FinancePaymentRow[]; receipts: FinanceManualReceipt[]; historicalPanel?: ReactNode;
  canVerify: boolean; canReverse: boolean; canIssueVoucher: boolean; busy: string;
  onPreview: (fileId: string, fileName: string) => void;
  onVerifyPayment: (id: string, decision: "approved" | "needs_correction" | "rejected", note: string) => void;
  onReversePayment: (id: string, type: "refund" | "reversal", reason: string, legacy: boolean) => void;
  onVerifyReceipt: (id: string, decision: "verified" | "rejected", note: string) => void;
  onReverseReceipt: (id: string, reason: string) => void;
  onIssueVoucher: (id: string, manual: boolean) => void;
};
const money = (amount: string | number, currency: string) => currency + " " + Number(amount || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const label = (value?: string | null) => (value || "—").replaceAll("_"," ");
const statusTone = (status: string): "green" | "gold" | "slate" => ["succeeded","verified"].includes(status) ? "green" : ["pending","recorded"].includes(status) ? "gold" : "slate";
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString() : "—";

export function FinanceOperationsRegister({payments,receipts,historicalPanel,canVerify,canReverse,canIssueVoucher,busy,onPreview,onVerifyPayment,onReversePayment,onVerifyReceipt,onReverseReceipt,onIssueVoucher}:Props) {
  const [tab,setTab]=useState<Tab>("register");
  const [status,setStatus]=useState("all");
  const [account,setAccount]=useState("all");
  const [query,setQuery]=useState("");
  const [selected,setSelected]=useState<{kind:"membership"|"receipt";id:string}|null>(null);
  const [notes,setNotes]=useState<Record<string,string>>({});
  const [reasons,setReasons]=useState<Record<string,string>>({});
  const [decision,setDecision]=useState<Record<string,"approved"|"needs_correction"|"rejected">>({});
  const [reverseType,setReverseType]=useState<Record<string,"refund"|"reversal">>({});

  const all = useMemo(() => [
    ...payments.map(p=>({kind:"membership" as const,id:p.payment_id,reference:p.payment_reference||p.purpose_reference||p.payment_id,payer:p.member_name||"Member account",payerType:"Member",accountReference:p.tracking_reference||"Membership account",purpose:p.product_name||"Membership payment",amount:p.amount,currency:p.currency,status:p.reversed?"refunded":p.payment_status,method:p.channel,date:p.created_at,evidence:p.evidence_file_id,evidenceName:p.evidence_file_name,reconciliation:p.reconciliation_status||"unreconciled",raw:p})),
    ...receipts.map(r=>({kind:"receipt" as const,id:r.id,reference:r.receiptNumber,payer:r.payerName,payerType:r.payerType==="organization"?"Organization":r.payerType==="member"?"Member":label(r.payerType),accountReference:r.organizationName||r.payerUserId||"",purpose:r.purpose,amount:r.amount,currency:r.currency,status:r.status==="recorded"?"pending":r.status,method:r.paymentMethod,date:r.paymentDate,evidence:r.evidenceFileId,evidenceName:"Payment evidence",reconciliation:"manual record",raw:r}))
  ],[payments,receipts]);

  const counts = useMemo(()=>({
    approved:all.filter(x=>["succeeded","verified"].includes(x.status)).length,
    outstanding:all.filter(x=>["pending","initiated","recorded"].includes(x.status)).length,
    failed:all.filter(x=>x.status==="failed").length,
    refunds:all.filter(x=>["refunded","reversed"].includes(x.status)).length,
    disputed:all.filter(x=>x.reconciliation==="disputed").length
  }),[all]);
  const filtered=useMemo(()=>all.filter(x=>{
    const term=query.trim().toLowerCase();
    const text=[x.reference,x.payer,x.payerType,x.purpose,x.method,x.id].join(" ").toLowerCase();
    if(term&&!text.includes(term))return false;
    if(account!=="all"&&x.payerType.toLowerCase()!==account)return false;
    if(tab==="queue"&&!["pending","initiated","recorded"].includes(x.status))return false;
    if(tab==="refunds"&&!["refunded","reversed"].includes(x.status))return false;
    if(tab==="reconciliation"&&x.kind!=="membership")return false;
    if(tab==="register"&&status!=="all"){
      if(status==="approved"&&!["succeeded","verified"].includes(x.status))return false;
      if(status==="failed"&&x.status!=="failed")return false;
      if(status==="refunded"&&!["refunded","reversed"].includes(x.status))return false;
      if(status==="disputed"&&x.reconciliation!=="disputed")return false;
      if(status==="outstanding"&&!["pending","initiated","recorded"].includes(x.status))return false;
      if(status==="membership"&&!(x.kind==="membership"||x.purpose.toLowerCase().includes("membership")))return false;
    }
    return true;
  }),[all,query,account,tab,status]);
  const active=selected?all.find(x=>x.kind===selected.kind&&x.id===selected.id):null;

  return <div className="grid" style={{gap:12}}>
    <Card>
      <div className="row" style={{justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <div><div className="eyebrow">FINANCE OPERATIONS</div><h2 className="h2" style={{marginBottom:2}}>Financial position</h2><p className="muted">Live records · totals are record counts, not cross-currency sums</p></div>
        <a className="btn btn-ghost" href="/admin/finance/receipts">Record a payment</a>
      </div>
      <div className="grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8,marginTop:12}}>
        {[["Approved",counts.approved],["Outstanding",counts.outstanding],["Failed",counts.failed],["Refunded / reversed",counts.refunds],["Disputed",counts.disputed]].map(([name,value])=><div key={String(name)} style={{padding:"10px 12px",border:"1px solid var(--border)",borderRadius:10,minWidth:0}}><div className="muted" style={{fontSize:12}}>{name}</div><strong style={{fontSize:23,fontVariantNumeric:"tabular-nums"}}>{value}</strong></div>)}
      </div>
    </Card>
    <div className="row" role="tablist" aria-label="Finance workspaces" style={{gap:6,flexWrap:"wrap",borderBottom:"1px solid var(--border)",paddingBottom:8}}>
      {([["register","Payment register"],["queue","Payment queue"],["reconciliation","Historical reconciliation"],["refunds","Refunds & reversals"],["outstanding","Outstanding payments"]] as [Tab,string][]).map(([key,name])=><button key={key} type="button" role="tab" aria-selected={tab===key} className={tab===key?"btn btn-primary":"btn btn-ghost"} onClick={()=>{setTab(key);setSelected(null);setStatus("all");}}>{name}{key==="queue"&&counts.outstanding>0?" · "+counts.outstanding:""}</button>)}
    </div>
    {tab==="outstanding" ? <FinanceMembershipObligations /> : null}
    {tab==="reconciliation" ? historicalPanel : null}
    {tab!=="outstanding"&&<Card>
      <div className="row" style={{justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
        <div><h2 className="h2" style={{marginBottom:2}}>{tab==="register"?"Payment register":tab==="queue"?"Payments awaiting action":tab==="refunds"?"Refund and reversal register":"Historical payment transactions"}</h2><p className="muted">{filtered.length} matching records · select a row to inspect and act without leaving this workspace</p></div>
        <button type="button" className="btn btn-ghost" onClick={()=>{const header=["Reference","Payer","Account type","Purpose","Amount","Currency","Status","Method","Date"];const lines=filtered.map(x=>[x.reference,x.payer,x.payerType,x.purpose,x.amount,x.currency,x.status,x.method,x.date]);const csv=[header,...lines].map(row=>row.map(v=>'"'+String(v??"").replaceAll('"','""')+'"').join(",")).join("\r\n");const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="mpa-finance-register.csv";a.click();URL.revokeObjectURL(url);}}>Export filtered CSV</button>
      </div>
      <div className="grid grid-3" style={{gap:8,margin:"12px 0"}}>
        <input aria-label="Search finance records" placeholder="Search reference, payer, purpose…" value={query} onChange={e=>setQuery(e.target.value)} />
        <select aria-label="Filter payer account type" value={account} onChange={e=>setAccount(e.target.value)}><option value="all">All payer accounts</option><option value="member">Member accounts</option><option value="organization">Organization accounts</option><option value="sponsor">Sponsors</option><option value="donor">Donors</option><option value="other">Other accounts</option></select>
        {tab==="register"?<select aria-label="Filter payment status" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All payment statuses</option><option value="approved">Approved payments</option><option value="failed">Failed payments</option><option value="refunded">Refunded / reversed</option><option value="disputed">Disputed</option><option value="outstanding">Outstanding payments</option><option value="membership">Membership collections</option></select>:<div className="muted" style={{alignSelf:"center",fontSize:13}}>{tab==="queue"?"Pending verification and processing":tab==="refunds"?"Only refunded and reversed transactions":"Imported membership transactions"}</div>}
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:850}}>
          <thead><tr>{["Reference","Payer / account","Purpose","Amount","Status","Method / date","Reconciliation",""].map(h=><th key={h} scope="col" style={{textAlign:"left",padding:"10px 8px",borderBottom:"1px solid var(--border)",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
          <tbody>{filtered.map(x=><tr key={x.kind+":"+x.id} onClick={()=>setSelected({kind:x.kind,id:x.id})} style={{cursor:"pointer",background:active?.id===x.id?"var(--surface-secondary)":undefined}}>
            <td style={{padding:9,borderBottom:"1px solid var(--border)",whiteSpace:"nowrap"}}><strong>{x.reference}</strong><div className="muted" style={{fontSize:11}}>{x.kind==="membership"?"Membership transaction":"Finance receipt"}</div></td>
            <td style={{padding:9,borderBottom:"1px solid var(--border)"}}><strong>{x.payer}</strong><div className="muted" style={{fontSize:11}}>{x.payerType} account{x.accountReference?" · "+x.accountReference:""}</div></td>
            <td style={{padding:9,borderBottom:"1px solid var(--border)"}}>{x.purpose}</td>
            <td style={{padding:9,borderBottom:"1px solid var(--border)",whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums"}}><strong>{money(x.amount,x.currency)}</strong></td>
            <td style={{padding:9,borderBottom:"1px solid var(--border)"}}><Badge tone={statusTone(x.status)}>{label(x.status)}</Badge></td>
            <td style={{padding:9,borderBottom:"1px solid var(--border)",whiteSpace:"nowrap"}}>{label(x.method)}<div className="muted" style={{fontSize:11}}>{date(x.date)}</div></td>
            <td style={{padding:9,borderBottom:"1px solid var(--border)"}}>{label(x.reconciliation)}</td>
            <td style={{padding:9,borderBottom:"1px solid var(--border)"}}><button type="button" className="btn btn-ghost" onClick={e=>{e.stopPropagation();setSelected({kind:x.kind,id:x.id});}}>Inspect</button></td>
          </tr>)}</tbody>
        </table>
        {filtered.length===0&&<p className="muted" style={{padding:20,textAlign:"center"}}>No payment records match these filters.</p>}
      </div>
    </Card>}
    {tab!=="outstanding"&&active&&<Card>
      <div className="row" style={{justifyContent:"space-between",alignItems:"flex-start"}}><div><div className="eyebrow">PAYMENT DETAIL · {active.kind==="membership"?"MEMBERSHIP":"MANUAL FINANCE"}</div><h2 className="h2">{active.reference}</h2><p className="muted">{active.payer} · {active.payerType} account{active.accountReference?" · "+active.accountReference:""}</p></div><button type="button" className="btn btn-ghost" onClick={()=>setSelected(null)}>Close detail</button></div>
      <div className="grid grid-3" style={{gap:10}}><p><span className="muted">Amount</span><br/><strong>{money(active.amount,active.currency)}</strong></p><p><span className="muted">Purpose</span><br/><strong>{active.purpose}</strong></p><p><span className="muted">Status</span><br/><Badge tone={statusTone(active.status)}>{label(active.status)}</Badge></p><p><span className="muted">Method</span><br/><strong>{label(active.method)}</strong></p><p><span className="muted">Date</span><br/><strong>{date(active.date)}</strong></p><p><span className="muted">Reconciliation</span><br/><strong>{label(active.reconciliation)}</strong></p></div>
      {active.evidence&&<button type="button" className="btn btn-ghost" disabled={busy!==""} onClick={()=>onPreview(active.evidence!,active.evidenceName||"Payment evidence")}>Preview payment evidence</button>}
      {active.kind==="membership"&&active.raw.verification_note&&<p className="muted">Verification note: {active.raw.verification_note}</p>}
      {active.kind==="receipt"&&active.raw.notes&&<p className="muted">Finance notes: {active.raw.notes}</p>}
      <div className="grid" style={{gap:12,marginTop:12}}>
        {active.kind==="membership"&&canVerify&&active.status==="pending"&&active.raw.source!=="provider_webhook"&&<section className="case-row"><h3 className="h2">Verify membership payment</h3><label>Decision<select value={decision[active.id]||"approved"} onChange={e=>setDecision(v=>({...v,[active.id]:e.target.value as "approved"|"needs_correction"|"rejected"}))}><option value="approved">Approve payment</option><option value="needs_correction">Request correction</option><option value="rejected">Reject payment</option></select></label><label>Finance note<textarea rows={2} maxLength={1000} value={notes[active.id]||""} onChange={e=>setNotes(v=>({...v,[active.id]:e.target.value}))}/></label><button type="button" className="btn btn-primary" disabled={busy!==""} onClick={()=>onVerifyPayment(active.id,decision[active.id]||"approved",notes[active.id]||"")}>Record payment decision</button></section>}
        {active.kind==="receipt"&&canVerify&&active.status==="pending"&&<section className="case-row"><h3 className="h2">Verify manual finance receipt</h3><label>Decision note<textarea rows={2} value={notes[active.id]||""} onChange={e=>setNotes(v=>({...v,[active.id]:e.target.value}))}/></label><div className="row"><button type="button" className="btn btn-primary" disabled={busy!==""} onClick={()=>onVerifyReceipt(active.id,"verified",notes[active.id]||"")}>Verify payment received</button><button type="button" className="btn btn-ghost" disabled={busy!==""||(notes[active.id]||"").trim().length<8} onClick={()=>onVerifyReceipt(active.id,"rejected",notes[active.id]||"")}>Reject</button></div></section>}
        {canIssueVoucher&&active.status==="succeeded"&&active.kind==="membership"&&!active.raw.reversed&&<button type="button" className="btn btn-ghost" disabled={busy!==""} onClick={()=>onIssueVoucher(active.id,false)}>Issue QR payment voucher</button>}
        {canIssueVoucher&&active.status==="verified"&&active.kind==="receipt"&&<button type="button" className="btn btn-ghost" disabled={busy!==""} onClick={()=>onIssueVoucher(active.id,true)}>Issue QR payment voucher</button>}
        {canReverse&&active.kind==="membership"&&active.status==="succeeded"&&!active.raw.reversed&&<section className="case-row"><h3 className="h2">Refund or reverse payment</h3><label>Action<select value={reverseType[active.id]||"refund"} onChange={e=>setReverseType(v=>({...v,[active.id]:e.target.value as "refund"|"reversal"}))}><option value="refund">Refund</option><option value="reversal">Reverse payment</option></select></label><label>Reason<textarea rows={2} minLength={8} value={reasons[active.id]||""} onChange={e=>setReasons(v=>({...v,[active.id]:e.target.value}))}/></label><button className="btn btn-ghost" type="button" disabled={busy!==""||(reasons[active.id]||"").trim().length<8} onClick={()=>onReversePayment(active.id,reverseType[active.id]||"refund",reasons[active.id]||"",active.raw.application_type==="legacy_import")}>Record refund / reversal</button></section>}
        {canReverse&&active.kind==="receipt"&&active.status==="verified"&&<section className="case-row"><h3 className="h2">Reverse manual finance payment</h3><label>Reason<textarea rows={2} minLength={8} value={reasons[active.id]||""} onChange={e=>setReasons(v=>({...v,[active.id]:e.target.value}))}/></label><button className="btn btn-ghost" type="button" disabled={busy!==""||(reasons[active.id]||"").trim().length<8} onClick={()=>onReverseReceipt(active.id,reasons[active.id]||"")}>Reverse & revoke voucher</button></section>}
      </div>
    </Card>}
  </div>;
}
