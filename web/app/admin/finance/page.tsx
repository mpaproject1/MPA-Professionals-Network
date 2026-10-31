"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { OperationStatus } from "../../../components/operation-status";
import { Badge, Card } from "../../../components/ui";
import { api, ApiError } from "../../../lib/api";
import { useUiStore } from "../../../lib/store";
import { AdminPageHeader } from "../admin-page-header";

type Payment = {
  payment_id: string;
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
  application_id: string;
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
  const [summaryRows, setSummaryRows] = useState<FinanceSummaryRow[]>([]);
  const [summaryError, setSummaryError] = useState("");
  const [summaryGeneratedAt, setSummaryGeneratedAt] = useState("");
  const [canVerify, setCanVerify] = useState(false);
  const [canReverse, setCanReverse] = useState(false);
  const [canIssueVoucher, setCanIssueVoucher] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [decisions, setDecisions] = useState<Record<string, "approved" | "needs_correction" | "rejected">>({});
  const [verificationNotes, setVerificationNotes] = useState<Record<string, string>>({});
  const [reversalTypes, setReversalTypes] = useState<Record<string, "refund" | "reversal">>({});
  const [reversalReasons, setReversalReasons] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!token) return;
    setError("");
    setBusy("load");
    try {
      const me = await api<Me>("/api/v1/me", {}, token);
      const roles = Array.isArray(me.roles) ? me.roles : [];
      const permissions = Array.isArray(me.permissions) ? me.permissions : [];
      const financeRole = roles.some(role => ["finance_officer", "system_admin"].includes(role));
      const readAccess = financeRole || permissions.some(permission => ["finance.view", "finance.payment.verify", "finance.payment.reverse", "finance.manage"].includes(permission));
      if (!readAccess) {
        setAccess("denied");
        setRows([]);
        setSummaryRows([]);
        setSummaryError("");
        setSummaryGeneratedAt("");
        return;
      }
      setCanVerify(financeRole || permissions.some(permission => ["finance.payment.verify", "finance.manage"].includes(permission)));
      setCanReverse(financeRole || permissions.some(permission => ["finance.payment.reverse", "finance.manage"].includes(permission)));
      setCanIssueVoucher(financeRole || permissions.some(permission => ["finance.voucher.issue", "finance.manage"].includes(permission)));
      const payments = await api<Payment[]>("/api/v1/finance/membership/payments", {}, token);
      setRows(Array.isArray(payments) ? payments : []);
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
    if (!hydrated) return;
    if (!token) { setAccess("signin"); return; }
    setAccess("loading");
    void load();
  }, [hydrated, token, load]);

  async function verifyPayment(event: FormEvent, payment: Payment) {
    event.preventDefault();
    if (!token || !canVerify || busy) return;
    setBusy(payment.payment_id);
    setError("");
    setNotice("");
    try {
      await api("/api/v1/payments/" + payment.payment_id + "/verify", {
        method: "POST",
        body: JSON.stringify({
          decision: decisions[payment.payment_id] || "approved",
          note: verificationNotes[payment.payment_id] || "",
          evidenceChecked: [],
        }),
      }, token);
      setNotice("Payment decision recorded. Membership application approval and activation remain separate decisions.");
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Payment verification could not be recorded.");
    } finally {
      setBusy("");
    }
  }

  async function issueMembershipVoucher(payment: Payment) {
    if (!token || !canIssueVoucher || busy) return;
    setBusy(payment.payment_id); setError(""); setNotice("");
    try {
      const voucher = await api<{token?:string;verificationPath?:string;payment?:unknown;voucherNumber:string;alreadyIssued?:boolean}>("/api/v1/finance/membership/payments/" + payment.payment_id + "/voucher", { method:"POST", body:JSON.stringify({}) }, token);
      if (voucher.token && voucher.verificationPath) {
        window.open("/admin/finance/receipts/voucher?data=" + encodeURIComponent(JSON.stringify(voucher)), "_blank", "noopener,noreferrer");
        setNotice("Verified membership payment voucher prepared. Use Print / Save as PDF in the opened voucher.");
      } else setNotice("An active voucher already exists. Its one-time QR token cannot be recovered; request an authorized replacement if the original is unavailable.");
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : "Membership payment voucher could not be issued."); }
    finally { setBusy(""); }
  }

  async function reversePayment(event: FormEvent, payment: Payment) {
    event.preventDefault();
    const reason = (reversalReasons[payment.payment_id] || "").trim();
    if (!token || !canReverse || reason.length < 8 || busy) return;
    setBusy(payment.payment_id);
    setError("");
    setNotice("");
    try {
      await api("/api/v1/payments/" + payment.payment_id + "/reverse", {
        method: "POST",
        body: JSON.stringify({ type: reversalTypes[payment.payment_id] || "refund", reason }),
      }, token);
      setNotice("Payment refund/reversal recorded. Any linked active membership is handled by the existing reversal workflow.");
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Payment reversal could not be recorded.");
    } finally {
      setBusy("");
    }
  }

  if (!hydrated || access === "loading") return <Card><OperationStatus state="loading" title="Checking finance permissions" detail="Verifying the current account before retrieving payment records." /></Card>;
  if (access === "signin") return <Card><h1 className="h1">Sign in required</h1><p className="muted">Finance payment records are available only to authorized finance staff and administrators.</p><a className="btn btn-primary" href="/login?next=/admin/finance">Sign in</a></Card>;
  if (access === "denied") return <Card><OperationStatus state="error" title="Finance workspace access denied" detail={error || "Your account does not have finance payment queue access. Membership-review permissions do not grant finance access."} /><a className="btn btn-ghost" href="/dashboard">Return to your dashboard</a></Card>;

  return <div className="grid" style={{ gap: 16 }}>
    <AdminPageHeader eyebrow="MPA · Finance operations" title="Membership payment queue" description="Verify eligible payments, review payment exceptions and record authorized reversals. This workspace does not approve or activate membership applications." actions={<button type="button" className="btn btn-ghost" onClick={() => void load()} disabled={busy !== ""}>{busy === "load" ? "Refreshing…" : "Refresh queue"}</button>} />
    <div className="row" style={{gap:8,flexWrap:"wrap"}}><a className="btn btn-primary" href="/admin/finance/receipts">Record manual payment & issue QR vouchers</a><a className="btn btn-ghost" href="/admin/reports?report=manual-finance-receipts">Manual finance receipts report</a></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="form-success" role="status" aria-live="polite">{notice}</p>}
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
    <Card>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div><h2 className="h2">Payment records</h2><p className="muted">Up to 500 membership payment records, newest and pending items first. Applicant contact details and private application evidence are not included in this queue.</p></div>
        <Badge tone="slate">{rows.length} records returned</Badge>
      </div>
      {rows.length === 0 ? <OperationStatus state="info" title="No membership payments in this queue" detail="No matching payment records were returned. Refresh to check the current source records." /> : rows.map(payment => <article key={payment.payment_id} className="case-row" style={{ alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }} className="grid">
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <div><strong>{payment.product_name || payment.product_code} · {payment.application_type}</strong><p className="muted">Application {payment.tracking_reference || payment.application_id}</p></div>
            <Badge tone={payment.payment_status === "succeeded" ? "green" : payment.payment_status === "pending" ? "gold" : "slate"}>{payment.payment_status.replaceAll("_", " ")}</Badge>
          </div>
          <div className="grid grid-2">
            <p><span className="muted">Amount</span><br/><b>{payment.currency} {payment.amount}</b></p>
            <p><span className="muted">Application state</span><br/><b>{payment.application_status.replaceAll("_", " ")}</b></p>
            <p><span className="muted">Channel / source</span><br/><b>{payment.channel} · {payment.source}</b></p>
            <p><span className="muted">Payment reference</span><br/><b>{payment.payment_reference || payment.purpose_reference || "Not supplied"}</b></p>
            <p><span className="muted">Submitted</span><br/><b>{dateLabel(payment.created_at)}</b></p>
            <p><span className="muted">Verified</span><br/><b>{dateLabel(payment.verified_at)}</b></p>
            <p><span className="muted">Reconciliation</span><br/><b>{payment.reconciliation_status || "Not recorded"}</b></p>
          </div>
          {payment.verification_note && <p className="muted">Payment note: {payment.verification_note}</p>}
          {canIssueVoucher && payment.payment_status === "succeeded" && !payment.reversed && <button type="button" className="btn btn-primary" disabled={busy === payment.payment_id} onClick={() => void issueMembershipVoucher(payment)}>Issue QR payment voucher</button>}

          {payment.reconciliation_note && <p className="muted">Reconciliation note: {payment.reconciliation_note}</p>}
          {payment.reversed && <p className="form-error" role="status">A refund or reversal is already recorded for this payment.</p>}
          {canVerify && payment.payment_status === "pending" && payment.source !== "provider_webhook" && ["manual", "bank_transfer", "cash", "other"].includes(payment.channel) && ["submitted", "in_review", "correction_required", "approved", "payment_pending"].includes(payment.application_status) && <form className="form-stack" onSubmit={event => void verifyPayment(event, payment)}>
            <h3 className="h2">Verify payment</h3>
            <label>Decision<select value={decisions[payment.payment_id] || "approved"} onChange={event => setDecisions(current => ({ ...current, [payment.payment_id]: event.target.value as "approved" | "needs_correction" | "rejected" }))}><option value="approved">Approve payment</option><option value="needs_correction">Request correction</option><option value="rejected">Reject payment</option></select></label>
            <label>Finance note<textarea rows={2} maxLength={1000} value={verificationNotes[payment.payment_id] || ""} onChange={event => setVerificationNotes(current => ({ ...current, [payment.payment_id]: event.target.value }))} placeholder="Record what was checked or what needs correction."/></label>
            <button type="submit" className="btn btn-primary" disabled={busy === payment.payment_id}>{busy === payment.payment_id ? "Recording…" : "Record payment decision"}</button>
          </form>}
          {canReverse && payment.payment_status === "succeeded" && !payment.reversed && <form className="form-stack" onSubmit={event => void reversePayment(event, payment)}>
            <h3 className="h2">Refund or reverse payment</h3>
            <label>Action<select value={reversalTypes[payment.payment_id] || "refund"} onChange={event => setReversalTypes(current => ({ ...current, [payment.payment_id]: event.target.value as "refund" | "reversal" }))}><option value="refund">Refund</option><option value="reversal">Payment reversal</option></select></label>
            <label>Reason<textarea required minLength={8} maxLength={1000} value={reversalReasons[payment.payment_id] || ""} onChange={event => setReversalReasons(current => ({ ...current, [payment.payment_id]: event.target.value }))} placeholder="Explain why this payment is being refunded or reversed."/></label>
            <button type="submit" className="btn btn-ghost" disabled={busy === payment.payment_id || (reversalReasons[payment.payment_id] || "").trim().length < 8}>{busy === payment.payment_id ? "Recording…" : "Record refund / reversal"}</button>
          </form>}
        </div>
      </article>)}
    </Card>
    <Card><p className="muted">Payment verification, reversal and reconciliation remain audited financial actions. A successful payment does not by itself approve or activate a membership application.</p></Card>
  </div>;
}
