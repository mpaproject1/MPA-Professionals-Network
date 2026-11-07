"use client";

import { Download, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { OperationStatus } from "../../../components/operation-status";
import { Badge, Card } from "../../../components/ui";
import { ApiError, api } from "../../../lib/api";
import { useUiStore } from "../../../lib/store";
import { AdminPageHeader } from "../admin-page-header";
import { FinanceOperationsRegister, type FinanceManualReceipt } from "../../../components/admin/finance-operations-register";

type Payment = {
  payment_id: string;
  member_name?: string | null;
  payment_status: string;
  amount: string | number;
  currency: string;
  channel: string;
  source: string;
  purpose_reference?: string | null;
  payment_reference?: string | null;
  created_at: string;
  verified_at?: string | null;
  verification_note?: string | null;
  evidence_file_id?: string | null;
  evidence_file_name?: string | null;
  verified_by_name?: string | null;
  reconciled_by_name?: string | null;
  reconciled_at?: string | null;
  application_id: string | null;
  tracking_reference?: string | null;
  application_type: string;
  application_status: string;
  product_code: string;
  product_name: string;
  reconciliation_status?: string | null;
  reconciliation_note?: string | null;
  reversed: boolean;
};
type Me = { roles?: string[]; permissions?: string[] };
type FinanceSummaryRow = { Currency: string; "Gross verified": string | number; "Refunds/reversals": string | number; "Net collected": string | number; "Failed amount": string | number; "Matched amount": string | number; "Unreconciled amount": string | number; "Outstanding amount": string | number; "Missing fee amount": number; "Disputed amount": string | number; "Written off amount": string | number; "Disputed payments": number; "Written off payments": number; "Approved payments": number; "Failed payments": number; "Refunded/reversed payments": number; "Outstanding applications": number };
type FinanceSummary = { rows: FinanceSummaryRow[]; generatedAt: string };
type LegacyMembershipPayment = {
  membership_id: string;
  membership_number: string;
  membership_status: string;
  start_date?: string | null;
  end_date?: string | null;
  imported_at: string;
  product_name: string;
  product_code: string;
  member_name?: string | null;
  email?: string | null;
  imported_payment_reference?: string | null;
  imported_payment_amount?: string | null;
  imported_payment_currency?: string | null;
  imported_payment_date?: string | null;
  imported_payment_method?: string | null;
  imported_evidence_reference?: string | null;
  confirmed_fee_amount?: string | number | null;
  fee_currency?: string | null;
  verified_cash?: string | number | null;
  approved_non_cash?: string | number | null;
  outstanding_balance?: string | number | null;
  invitation_expires_at?: string | null;
  invitation_claimed_at?: string | null;
};
type LegacyPaymentDraft = { feeAmount: string; amount: string; currency: string; paymentReference: string; paymentDate: string; paymentMethod: string; evidenceReference: string; financeNote: string };
const legacyDraft = (item: LegacyMembershipPayment): LegacyPaymentDraft => ({
  feeAmount: item.confirmed_fee_amount == null ? "" : String(item.confirmed_fee_amount),
  amount: item.imported_payment_amount || "",
  currency: (item.imported_payment_currency || "").toUpperCase(),
  paymentReference: item.imported_payment_reference || "",
  paymentDate: /^\d{4}-\d{2}-\d{2}$/.test(item.imported_payment_date || "") ? item.imported_payment_date! : "",
  paymentMethod: ["bank_transfer", "telebirr", "cash", "mobile_money", "other"].includes(item.imported_payment_method || "") ? item.imported_payment_method! : "bank_transfer",
  evidenceReference: item.imported_evidence_reference || "",
  financeNote: "",
});

const financeMoneyColumns = new Set(["Gross verified", "Refunds/reversals", "Net collected", "Failed amount", "Matched", "Unreconciled", "Disputed", "Written off", "Outstanding"]);

function financeSummaryValue(label: string, value: string | number) {
  if (label === "Currency") return String(value);
  return Number(value || 0).toLocaleString(undefined, financeMoneyColumns.has(label) ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 });
}

function dateLabel(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "Not recorded";
}

export default function FinanceWorkspacePage() {
  const token = useUiStore(state => state.token);
  const hydrated = useUiStore(state => state.hydrated);
  const hydrateToken = useUiStore(state => state.hydrateToken);
  const [access, setAccess] = useState<"loading" | "allowed" | "denied" | "signin">("loading");
  const [rows, setRows] = useState<Payment[]>([]);
  const [manualReceipts, setManualReceipts] = useState<FinanceManualReceipt[]>([]);
  const [legacyPayments, setLegacyPayments] = useState<LegacyMembershipPayment[]>([]);
  const [legacyDrafts, setLegacyDrafts] = useState<Record<string, LegacyPaymentDraft>>({});
  const [legacyQueueError, setLegacyQueueError] = useState("");
  const [summaryRows, setSummaryRows] = useState<FinanceSummaryRow[]>([]);
  const [summaryError, setSummaryError] = useState("");
  const [summaryGeneratedAt, setSummaryGeneratedAt] = useState("");
  const [canVerify, setCanVerify] = useState(false);
  const [canReverse, setCanReverse] = useState(false);
  const [canIssueVoucher, setCanIssueVoucher] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [evidencePreview, setEvidencePreview] = useState<{ name: string; type: string; url: string; text?: string } | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError("");
    setBusy("load");
    try {
      const me = await api<Me>("/api/v1/me", {}, token);
      const roles = Array.isArray(me.roles) ? me.roles : [];
      const permissions = Array.isArray(me.permissions) ? me.permissions : [];
      const financeRole = roles.includes("finance_officer");
      const platformAdmin = roles.includes("system_admin");
      const readAccess = financeRole || platformAdmin || permissions.some(permission => ["finance.view", "finance.payment.verify", "finance.payment.reverse", "finance.manage"].includes(permission));
      if (!readAccess) {
        setAccess("denied");
        setRows([]);
        setManualReceipts([]);
        setLegacyPayments([]);
        setSummaryRows([]);
        setSummaryError("");
        setSummaryGeneratedAt("");
        return;
      }
      setCanVerify(financeRole || permissions.some(permission => ["finance.payment.verify", "finance.manage"].includes(permission)));
      setCanReverse(financeRole || permissions.some(permission => ["finance.payment.reverse", "finance.manage"].includes(permission)));
      setCanIssueVoucher(financeRole || platformAdmin || roles.includes("admin") || permissions.some(permission => ["finance.voucher.issue", "finance.manage"].includes(permission)));
      const payments = await api<Payment[]>("/api/v1/finance/membership/payments", {}, token);
      setRows(Array.isArray(payments) ? payments : []);
      try {
        const receiptResult = await api<{items: FinanceManualReceipt[];total:number;hasMore:boolean}>("/api/v1/finance/receipts?limit=100&offset=0", {}, token);
        const allReceipts = Array.isArray(receiptResult.items) ? [...receiptResult.items] : [];
        for (let offset = 100; offset < receiptResult.total; offset += 100) {
          const next = await api<{items: FinanceManualReceipt[]}>("/api/v1/finance/receipts?limit=100&offset=" + offset, {}, token);
          allReceipts.push(...(Array.isArray(next.items) ? next.items : []));
        }
        setManualReceipts(allReceipts);
      } catch {
        setManualReceipts([]);
      }
      setLegacyQueueError("");
      try {
        const legacyQueue = await api<{ rows: LegacyMembershipPayment[] }>("/api/v1/finance/membership/legacy-payment-verification", {}, token);
        setLegacyPayments(Array.isArray(legacyQueue.rows) ? legacyQueue.rows : []);
      } catch (legacyCause) {
        setLegacyPayments([]);
        setLegacyQueueError(legacyCause instanceof ApiError ? legacyCause.message : "Historical member payment verification queue could not be loaded.");
      }
      try {
        const summary = await api<FinanceSummary>("/api/v1/admin/reports/finance-summary/run", { method: "POST", body: JSON.stringify({}) }, token);
        setSummaryRows(Array.isArray(summary.rows) ? summary.rows : []);
        setSummaryGeneratedAt(summary.generatedAt || "");
        setSummaryError("");
      } catch (summaryCause) {
        setSummaryRows([]);
        setSummaryError(summaryCause instanceof ApiError ? summaryCause.message : "Finance summary could not be loaded. The payment queue remains available.");
      }
      setAccess("allowed");
    } catch (cause) {
      setRows([]);
      setManualReceipts([]);
      setLegacyPayments([]);
      setSummaryRows([]);
      setSummaryError("");
      setSummaryGeneratedAt("");
      setAccess("denied");
      setError(cause instanceof ApiError ? cause.message : "The finance payment queue could not be loaded.");
    } finally {
      setBusy("");
    }
  }, [token]);

  useEffect(() => { hydrateToken(); }, [hydrateToken]);
  useEffect(() => {
    if (!evidencePreview) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (evidencePreview.url) URL.revokeObjectURL(evidencePreview.url);
        setEvidencePreview(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [evidencePreview]);

  useEffect(() => {
    if (!hydrated) return;
    if (!token) { setAccess("signin"); return; }
    setAccess("loading");
    void load();
  }, [hydrated, token, load]);

  async function previewFinanceEvidence(fileId: string, fileName: string) {
    if (!token || !fileId || busy) return;
    setBusy("evidence:" + fileId);
    setError("");
    try {
      const response = await fetch("/api/v1/files/" + encodeURIComponent(fileId), { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 403 ? "Your Finance permissions do not allow access to this payment evidence." : "Payment evidence could not be loaded.");
      const blob = await response.blob();
      const extension = fileName.toLowerCase().split(".").pop() || "";
      const detected = blob.type || "application/octet-stream";
      const type = detected === "application/octet-stream" ? (extension === "pdf" ? "application/pdf" : ["png", "jpg", "jpeg", "webp", "gif"].includes(extension) ? "image/" + (extension === "jpg" ? "jpeg" : extension) : extension === "txt" ? "text/plain" : detected) : detected;
      if (!type.includes("pdf") && !type.startsWith("image/") && !type.startsWith("text/")) throw new Error("In-app preview supports PDF, image and text evidence. This file type cannot be previewed safely.");
      setEvidencePreview({ name: fileName || "Payment evidence", type, url: URL.createObjectURL(blob), text: type.startsWith("text/") ? await blob.text() : undefined });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Payment evidence preview failed."); }
    finally { setBusy(""); }
  }
  async function verifyPaymentInline(id: string, decision: "approved" | "needs_correction" | "rejected", note: string) {
    if (!token || !canVerify || busy) return;
    setBusy(id); setError(""); setNotice("");
    try {
      await api("/api/v1/payments/" + id + "/verify", { method: "POST", body: JSON.stringify({ decision, note, evidenceChecked: [] }) }, token);
      setNotice("Payment decision recorded. Membership approval and activation remain separate decisions."); await load();
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : "Payment verification could not be recorded."); }
    finally { setBusy(""); }
  }
  async function reversePaymentInline(id: string, type: "refund" | "reversal", reason: string, legacy: boolean) {
    if (!token || !canReverse || reason.trim().length < 8 || busy) return;
    setBusy(id); setError(""); setNotice("");
    try {
      if (legacy) await api("/api/v1/finance/membership/legacy-payment-verification/" + id + "/reverse", { method: "POST", body: JSON.stringify({ reversalType: type, reason }) }, token);
      else await api("/api/v1/payments/" + id + "/reverse", { method: "POST", body: JSON.stringify({ type, reason }) }, token);
      setNotice("Payment refund/reversal recorded and linked financial state updated."); await load();
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : "Payment reversal could not be recorded."); }
    finally { setBusy(""); }
  }
  async function decideManualReceipt(id: string, decision: "verified" | "rejected", note: string) {
    if (!token || !canVerify || busy || (decision === "rejected" && note.trim().length < 8)) return;
    setBusy(id); setError(""); setNotice("");
    try { await api("/api/v1/finance/receipts/" + id + "/decision", { method: "POST", body: JSON.stringify({ decision, note }) }, token); setNotice("Manual finance receipt decision recorded."); await load(); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : "Receipt decision could not be recorded."); }
    finally { setBusy(""); }
  }
  async function reverseManualReceipt(id: string, reason: string) {
    if (!token || !canReverse || reason.trim().length < 8 || busy) return;
    setBusy(id); setError(""); setNotice("");
    try { await api("/api/v1/finance/receipts/" + id + "/reverse", { method: "POST", body: JSON.stringify({ reason }) }, token); setNotice("Manual finance payment reversed and active voucher revoked."); await load(); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : "Manual finance payment could not be reversed."); }
    finally { setBusy(""); }
  }
  async function issueFinanceVoucher(id: string, manual: boolean) {
    if (!token || !canIssueVoucher || busy) return;
    setBusy(id); setError(""); setNotice("");
    try {
      const path = manual ? "/api/v1/finance/receipts/" + id + "/voucher" : "/api/v1/finance/membership/payments/" + id + "/voucher";
      const voucher = await api<{token?:string;verificationPath?:string;voucherNumber:string}> (path, { method: "POST", body: JSON.stringify({}) }, token);
      if (voucher.token && voucher.verificationPath) window.open("/admin/finance/receipts/voucher?data=" + encodeURIComponent(JSON.stringify(voucher)), "_blank", "noopener,noreferrer");
      setNotice("Verified payment voucher prepared."); await load();
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : "Payment voucher could not be issued."); }
    finally { setBusy(""); }
  }
  function closeEvidencePreview() {
    if (evidencePreview?.url) URL.revokeObjectURL(evidencePreview.url);
    setEvidencePreview(null);
  }
  function downloadEvidencePreview() {
    if (!evidencePreview) return;
    const anchor = document.createElement("a");
    anchor.href = evidencePreview.url;
    anchor.download = evidencePreview.name || "payment-evidence";
    anchor.click();
  }

  async function verifyLegacyPayment(event: FormEvent, item: LegacyMembershipPayment) {
    event.preventDefault();
    if (!token || !canVerify || busy) return;
    const draft = legacyDrafts[item.membership_id] || legacyDraft(item);
    setBusy("legacy-" + item.membership_id);
    setError("");
    setNotice("");
    try {
      await api("/api/v1/finance/membership/legacy-payment-verification/" + item.membership_id + "/verify", {
        method: "POST",
        body: JSON.stringify(draft),
      }, token);
      setNotice("Historical payment verification recorded. Any outstanding invitation for this imported membership is now eligible to be claimed; no membership review decision was changed.");
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Historical membership payment verification could not be recorded.");
    } finally {
      setBusy("");
    }
  }

  if (!hydrated || access === "loading") return <Card><OperationStatus state="loading" title="Checking finance permissions" detail="Verifying the current account before retrieving payment records." /></Card>;
  if (access === "signin") return <Card><h1 className="h1">Sign in required</h1><p className="muted">Finance payment records are available only to authorized finance staff and administrators.</p><a className="btn btn-primary" href="/login?next=/admin/finance">Sign in</a></Card>;
  if (access === "denied") return <Card><OperationStatus state="error" title="Finance workspace access denied" detail={error || "Your account does not have finance payment queue access. Membership-review permissions do not grant finance access."} /><a className="btn btn-ghost" href="/dashboard">Return to your dashboard</a></Card>;

  return <div className="grid" style={{ gap: 16 }}>
    <AdminPageHeader eyebrow="MPA · Finance operations" title="Membership payment queue" description="Verify eligible payments, review payment exceptions and record authorized reversals. This workspace does not approve or activate membership applications." actions={<><button type="button" className="btn btn-ghost" onClick={() => void load()} disabled={busy !== ""}>{busy === "load" ? "Refreshing…" : "Refresh queue"}</button></>} />
    <div className="row" style={{gap:8,flexWrap:"wrap"}}><a className="btn btn-primary" href="/admin/finance/receipts">Record manual payment & issue QR vouchers</a><a className="btn btn-ghost" href="/admin/reports?report=manual-finance-receipts">Manual finance receipts report</a></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success" role="status" aria-live="polite">{notice}</p>}
    <Card id="historical-member-payment-verification">
      <div className="row" style={{justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
        <div><h2 className="h2">Historical member payment verification</h2><p className="muted">Record the original fee due separately from each actual installment. Partial receipts reduce the outstanding balance but do not unlock the account invitation until the fee is fully settled by verified cash or an approved non-cash disposition.</p></div>
        <Badge tone={legacyPayments.length ? "gold" : "slate"}>{legacyPayments.length} awaiting Finance</Badge>
      </div>
      {legacyQueueError ? <OperationStatus state="error" title="Historical payment queue unavailable" detail={legacyQueueError} /> : legacyPayments.length === 0 ? <OperationStatus state="info" title="No imported membership payments awaiting verification" detail="No unverified legacy membership records were returned from the authoritative source." /> : <div className="grid" style={{gap:12}}>
        {legacyPayments.map(item => {
          const draft = legacyDrafts[item.membership_id] || legacyDraft(item);
          return <article key={item.membership_id} className="case-row" style={{display:"grid",gap:12}}>
            <div className="row" style={{justifyContent:"space-between",alignItems:"flex-start",gap:10,flexWrap:"wrap"}}>
              <div><strong>{item.member_name || "Imported member"} · {item.membership_number}</strong><p className="muted">{item.email || "No email recorded"} · {item.product_name} ({item.product_code})</p><p className="muted">Imported {dateLabel(item.imported_at)} · Record status {item.membership_status.replaceAll("_"," ")} · Fee due {item.confirmed_fee_amount==null?"not yet confirmed":Number(item.confirmed_fee_amount).toFixed(2)+" "+item.fee_currency} · Outstanding {item.outstanding_balance==null?"not yet calculated":Number(item.outstanding_balance).toFixed(2)+" "+item.fee_currency}</p></div>
              <Badge tone="gold">{item.invitation_claimed_at ? "Previously claimed · review record" : item.invitation_expires_at ? "Invitation awaiting claim" : "No invitation recorded"}</Badge>
            </div>
            {canVerify ? <form className="form-stack" onSubmit={event => void verifyLegacyPayment(event,item)}>
              <div className="grid grid-2">
                <label>Verified amount<input type="number" min="0.01" step="0.01" required value={draft.amount} onChange={event=>setLegacyDrafts(current=>({...current,[item.membership_id]:{...draft,amount:event.target.value}}))}/></label>
                <label>Currency<input required maxLength={3} minLength={3} value={draft.currency} placeholder="ETB" onChange={event=>setLegacyDrafts(current=>({...current,[item.membership_id]:{...draft,currency:event.target.value.toUpperCase()}}))}/></label>
                <label>Payment reference<input required minLength={4} maxLength={180} value={draft.paymentReference} onChange={event=>setLegacyDrafts(current=>({...current,[item.membership_id]:{...draft,paymentReference:event.target.value}}))}/></label>
                <label>Payment date<input type="date" required value={draft.paymentDate} onChange={event=>setLegacyDrafts(current=>({...current,[item.membership_id]:{...draft,paymentDate:event.target.value}}))}/></label>
                <label>Payment method<select value={draft.paymentMethod} onChange={event=>setLegacyDrafts(current=>({...current,[item.membership_id]:{...draft,paymentMethod:event.target.value}}))}><option value="bank_transfer">Bank transfer</option><option value="telebirr">Telebirr</option><option value="cash">Cash</option><option value="mobile_money">Other mobile money</option><option value="other">Other</option></select></label>
                <label>Evidence reference<input required minLength={4} maxLength={300} value={draft.evidenceReference} placeholder="Statement line, receipt or approved evidence reference" onChange={event=>setLegacyDrafts(current=>({...current,[item.membership_id]:{...draft,evidenceReference:event.target.value}}))}/></label>
              </div>
              <label>Finance verification note<textarea rows={2} maxLength={1000} value={draft.financeNote} onChange={event=>setLegacyDrafts(current=>({...current,[item.membership_id]:{...draft,financeNote:event.target.value}}))} placeholder="Record how the historical payment was independently checked."/></label>
              <button type="submit" className="btn btn-primary" disabled={busy!==""}>{busy==="legacy-"+item.membership_id?"Verifying…" :"Verify historical installment"}</button>
            </form> : <p className="muted">Read-only Finance queue. The separate finance.payment.verify permission is required to approve historical payment evidence.</p>}
          </article>;
        })}
      </div>}
    </Card>
    <Card>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div><h2 className="h2">Finance summary</h2><p className="muted">Current membership-payment position by currency. Generated {dateLabel(summaryGeneratedAt)}. No amounts from different currencies are combined.</p></div>
        <a className="btn btn-ghost" href="/admin/reports?report=finance-summary">Open finance reports</a>
      </div>
      {summaryError ? <OperationStatus state="error" title="Finance summary unavailable" detail={summaryError} /> : summaryRows.length === 0 ? <OperationStatus state="info" title="No finance summary records" detail="No membership payments or outstanding approved applications were found for the current period." /> : <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>{["Currency", "Gross verified", "Refunds/reversals", "Net collected", "Failed amount", "Matched", "Unreconciled", "Disputed", "Written off", "Outstanding", "Missing fee amount", "Approved", "Failed", "Refunded/reversed", "Disputed payments", "Written off payments", "Outstanding applications"].map(label => <th key={label} scope="col" style={{ textAlign: "left", padding: 9, borderBottom: "1px solid var(--border, #cbd5e1)" }}>{label}</th>)}</tr></thead>
          <tbody>{summaryRows.map(row => <tr key={row.Currency}>{[{label:"Currency",value:row.Currency},{label:"Gross verified",value:row["Gross verified"]},{label:"Refunds/reversals",value:row["Refunds/reversals"]},{label:"Net collected",value:row["Net collected"]},{label:"Failed amount",value:row["Failed amount"]},{label:"Matched",value:row["Matched amount"]},{label:"Unreconciled",value:row["Unreconciled amount"]},{label:"Disputed",value:row["Disputed amount"]},{label:"Written off",value:row["Written off amount"]},{label:"Outstanding",value:row["Outstanding amount"]},{label:"Missing fee amount",value:row["Missing fee amount"]},{label:"Approved",value:row["Approved payments"]},{label:"Failed",value:row["Failed payments"]},{label:"Refunded/reversed",value:row["Refunded/reversed payments"]},{label:"Disputed payments",value:row["Disputed payments"]},{label:"Written off payments",value:row["Written off payments"]},{label:"Outstanding applications",value:row["Outstanding applications"]}].map(({label,value}) => <td key={label} style={{ padding: 9, borderBottom: "1px solid var(--border, #e2e8f0)", whiteSpace: "nowrap" }}>{financeSummaryValue(label,value)}</td>)}</tr>)}</tbody>
        </table>
      </div>}
      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <a className="btn btn-ghost" href="/admin/reports?report=approved-payments">Approved payments</a>
        <a className="btn btn-ghost" href="/admin/reports?report=failed-reversed-payments">Failed, refunded/reversed and disputed</a>
        <a className="btn btn-ghost" href="/admin/reports?report=membership-collections">Membership collections</a>
        <a className="btn btn-ghost" href="/admin/reports?report=outstanding-membership-payments">Outstanding payments</a>
        <a className="btn btn-ghost" href="/admin/reports?report=payment-reconciliation">Payment reconciliation</a>
      </div>
    </Card>
    <FinanceOperationsRegister
      payments={rows}
      receipts={manualReceipts}
      canVerify={canVerify}
      canReverse={canReverse}
      canIssueVoucher={canIssueVoucher}
      busy={busy}
      onPreview={(fileId,fileName)=>void previewFinanceEvidence(fileId,fileName)}
      onVerifyPayment={(id,decision,note)=>void verifyPaymentInline(id,decision,note)}
      onReversePayment={(id,type,reason,legacy)=>void reversePaymentInline(id,type,reason,legacy)}
      onVerifyReceipt={(id,decision,note)=>void decideManualReceipt(id,decision,note)}
      onReverseReceipt={(id,reason)=>void reverseManualReceipt(id,reason)}
      onIssueVoucher={(id,manual)=>void issueFinanceVoucher(id,manual)}
    />
    <Card><p className="muted">Payment verification, reversal and reconciliation remain audited financial actions. A successful payment does not by itself approve or activate a membership application.</p></Card>
    {evidencePreview && <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeEvidencePreview(); }} style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(2,8,23,.82)", display: "grid", placeItems: "center", padding: 16 }}>
      <section role="dialog" aria-modal="true" aria-labelledby="finance-payment-evidence-title" className="card grid" style={{ width: "min(1100px, 100%)", height: "min(88vh, 850px)", gridTemplateRows: "auto 1fr auto", overflow: "hidden" }}>
        <div className="row" style={{ justifyContent: "space-between" }}><div><div className="eyebrow">Finance · private payment evidence</div><h2 id="finance-payment-evidence-title" className="h2">{evidencePreview.name}</h2></div><button type="button" className="btn btn-ghost" onClick={closeEvidencePreview} aria-label="Close evidence preview"><X size={18} /></button></div>
        {evidencePreview.type.startsWith("image/") ? <div style={{ overflow: "auto", display: "grid", placeItems: "center", background: "var(--surface)" }}><img src={evidencePreview.url} alt={"Payment evidence preview: " + evidencePreview.name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /></div> : evidencePreview.type === "application/pdf" ? <iframe title={"Payment PDF evidence preview: " + evidencePreview.name} src={evidencePreview.url} style={{ width: "100%", height: "100%", border: "1px solid var(--border)", borderRadius: 8 }} /> : <pre style={{ overflow: "auto", whiteSpace: "pre-wrap", padding: 16, background: "var(--surface)", borderRadius: 8 }}>{evidencePreview.text}</pre>}
        <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn btn-ghost" onClick={downloadEvidencePreview}><Download size={15} /> Download evidence</button><button type="button" className="btn btn-primary" onClick={closeEvidencePreview}>Close preview</button></div>
      </section>
    </div>}
  </div>;
}
