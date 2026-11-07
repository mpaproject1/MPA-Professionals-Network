"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ApiError, api } from "../../../../lib/api";
import { useUiStore } from "../../../../lib/store";

type Payment = {
  id: string;
  status: string;
  amount: string | number;
  currency: string;
  channel?: string;
  reference?: string | null;
  created_at?: string;
  verified_at?: string | null;
  reversal?: { type?: string; created_at?: string } | null;
};
type Application = {
  id: string;
  tracking_reference?: string;
  application_type: string;
  status: string;
  created_at: string;
  fee_snapshot?: { productName?: string; productCode?: string; amount?: string | number; currency?: string };
  data_snapshot?: Record<string, unknown>;
  payment?: Payment | null;
};

function displayDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default function MembershipInvoicePage() {
  const params = useParams<{ paymentId: string }>();
  const token = useUiStore((state) => state.token);
  const hydrated = useUiStore((state) => state.hydrated);
  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hydrated) return;
    if (!token) {
      setLoading(false);
      setError("Sign in to view the invoice for your own membership payment.");
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    api<Application[]>("/api/v1/membership/applications/me", {}, token)
      .then((items) => {
        if (!active) return;
        const ownApplication = (Array.isArray(items) ? items : []).find(
          (item) => item.payment?.id === params.paymentId,
        );
        if (!ownApplication?.payment || ownApplication.payment.status !== "succeeded" || ownApplication.payment.reversal) {
          setApplication(null);
          setError("This invoice is unavailable. It may not belong to your account, may not be verified, or may have been reversed.");
          return;
        }
        setApplication(ownApplication);
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof ApiError ? cause.message : "The payment invoice could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [hydrated, token, params.paymentId]);

  const payment = application?.payment;
  const payerName = useMemo(() => {
    const snapshot = application?.data_snapshot || {};
    const candidate = snapshot.displayName || snapshot.fullName || snapshot.name;
    return typeof candidate === "string" && candidate.trim() ? candidate.trim() : "MPA Member";
  }, [application]);

  if (!hydrated || loading) {
    return <main className="invoice-status"><p role="status">Loading your payment invoice…</p></main>;
  }
  if (!token) {
    return <main className="invoice-status"><h1>Sign in required</h1><p>{error}</p><a href={"/login?next=" + encodeURIComponent("/membership/invoice/" + params.paymentId)}>Sign in</a></main>;
  }
  if (!application || !payment) {
    return <main className="invoice-status"><h1>Invoice unavailable</h1><p role="alert">{error || "The invoice could not be found."}</p><a href="/membership/payment">Return to membership payments</a></main>;
  }

  return (
    <main className="invoice-page">
      <div className="invoice-actions">
        <a href="/membership/payment">Back to payment details</a>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>Print / Save as PDF</button>
      </div>
      <article id="membership-invoice" aria-label="MPA membership payment invoice">
        <header className="invoice-header">
          <div className="invoice-brand">MPA</div>
          <div>
            <h1>MUSLIM PROFESSIONALS ASSOCIATION</h1>
            <p>MEMBERSHIP PAYMENT RECEIPT</p>
          </div>
        </header>
        <div className="invoice-title">
          <h2>Payment received</h2>
          <strong>{application.tracking_reference || application.id}</strong>
        </div>
        <dl className="invoice-details">
          <div><dt>Paid by</dt><dd>{payerName}</dd></div>
          <div><dt>Payment reference</dt><dd>{payment.reference || payment.id}</dd></div>
          <div><dt>Membership plan</dt><dd>{application.fee_snapshot?.productName || application.fee_snapshot?.productCode || "Membership"}</dd></div>
          <div><dt>Payment purpose</dt><dd>Membership fee</dd></div>
          <div><dt>Amount received</dt><dd className="invoice-amount">{payment.currency} {Number(payment.amount).toLocaleString()}</dd></div>
          <div><dt>Payment method</dt><dd>{payment.channel || "—"}</dd></div>
          <div><dt>Date submitted</dt><dd>{displayDate(payment.created_at)}</dd></div>
          <div><dt>Date verified</dt><dd>{displayDate(payment.verified_at)}</dd></div>
          <div><dt>Payment status</dt><dd><span className="invoice-status-label">Verified · Paid</span></dd></div>
        </dl>
        <footer className="invoice-footer">
          <p>This document confirms receipt of the membership payment shown above.</p>
          <p>Payment verification is separate from membership approval and activation.</p>
          <small>Muslim Professionals Association · Keep this receipt for your records.</small>
        </footer>
      </article>
      <style jsx global>{`
        .invoice-page { max-width: 900px; margin: 0 auto; padding: 24px; color: #172b3d; }
        .invoice-actions { display:flex; justify-content:space-between; align-items:center; gap:16px; margin-bottom:18px; }
        .invoice-actions a { color: var(--link, #1b4d80); }
        #membership-invoice { background:#fff; color:#172b3d; border:1px solid #cbd5df; border-radius:14px; padding:42px; box-shadow:0 8px 28px rgba(15,35,55,.08); }
        .invoice-header { display:flex; align-items:center; justify-content:center; gap:18px; text-align:left; border-bottom:3px solid #97c024; padding-bottom:24px; }
        .invoice-brand { display:grid; place-items:center; width:64px; height:64px; border-radius:14px; background:#0a3258; color:#fff; font-size:25px; font-weight:800; }
        .invoice-header h1 { margin:0; font-size:22px; letter-spacing:.04em; }
        .invoice-header p { margin:6px 0 0; font-size:12px; letter-spacing:.16em; font-weight:700; color:#526579; }
        .invoice-title { text-align:center; margin:28px 0; }
        .invoice-title h2 { margin:0 0 8px; font-size:25px; }
        .invoice-title strong { font-size:14px; color:#526579; }
        .invoice-details { display:grid; grid-template-columns:1fr 1fr; gap:0 28px; margin:0; }
        .invoice-details div { padding:14px 0; border-bottom:1px solid #e1e7ed; min-width:0; }
        .invoice-details dt { color:#526579; font-size:12px; margin-bottom:5px; }
        .invoice-details dd { margin:0; font-size:15px; font-weight:650; overflow-wrap:anywhere; }
        .invoice-details .invoice-amount { font-size:20px; color:#0a3258; }
        .invoice-status-label { color:#315d00; }
        .invoice-footer { margin-top:30px; padding-top:18px; border-top:2px solid #d8e0e7; text-align:center; font-size:13px; color:#526579; }
        .invoice-footer p { margin:5px 0; }
        .invoice-footer small { display:block; margin-top:16px; }
        .invoice-status { max-width:680px; margin:48px auto; padding:24px; }
        @media (max-width:600px) {
          .invoice-page { padding:12px; }
          #membership-invoice { padding:22px 16px; }
          .invoice-header { justify-content:flex-start; }
          .invoice-header h1 { font-size:16px; }
          .invoice-brand { width:48px; height:48px; }
          .invoice-details { grid-template-columns:1fr; }
          .invoice-actions { align-items:flex-start; flex-wrap:wrap; }
        }
        @media print {
          @page { size:A4 portrait; margin:12mm; }
          html, body { background:#fff !important; margin:0 !important; padding:0 !important; }
          body * { visibility:hidden !important; }
          #membership-invoice, #membership-invoice * { visibility:visible !important; }
          #membership-invoice {
            position:absolute !important; left:0 !important; top:0 !important;
            width:100% !important; max-width:none !important; box-sizing:border-box !important;
            margin:0 !important; padding:0 !important; border:0 !important; border-radius:0 !important;
            box-shadow:none !important; color:#172b3d !important; background:#fff !important;
          }
          .invoice-actions { display:none !important; }
          .invoice-details div, .invoice-header, .invoice-footer { break-inside:avoid; }
          a { color:inherit !important; text-decoration:none !important; }
        }
      `}</style>
    </main>
  );
}
