"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowDownToLine, ArrowRight, BarChart3, CalendarDays, CreditCard, Download, MapPinned, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { Badge, Card } from "../../../components/ui";
import { OperationStatus } from "../../../components/operation-status";
import { ApiError, api } from "../../../lib/api";
import { useUiStore } from "../../../lib/store";
import { AdminPageHeader } from "../admin-page-header";
import styles from "./membership-center.module.css";

type ReportRow = Record<string, string | number | null>;
type ReportResult = { report?: { title?: string; definition?: string }; generatedAt?: string; rows: ReportRow[]; totals?: Record<string, number> };
type Me = { roles?: string[]; permissions?: string[] };
type Filters = { from: string; to: string; q: string; status: string };

const today = () => new Date().toISOString().slice(0, 10);
const currentYear = () => new Date().getFullYear();
const initialFilters = (): Filters => ({ from: `${currentYear()}-01-01`, to: today(), q: "", status: "" });
const number = (value: unknown) => Number(value || 0);
const clean = (value: unknown) => String(value ?? "").toLowerCase().replaceAll("_", " ");
const appPending = new Set(["submitted", "in_review", "correction_required"]);
const appApproved = new Set(["approved", "payment_pending", "paid", "activated"]);
const appPaid = new Set(["paid", "activated"]);

function BarList({ title, rows, labelKey, valueKey, empty }: { title: string; rows: ReportRow[]; labelKey: string; valueKey: string; empty: string }) {
  const maximum = Math.max(1, ...rows.map(row => number(row[valueKey])));
  return <section className={styles.chart} aria-label={title}>
    <div className={styles.chartHeading}><h3>{title}</h3><span>{rows.length} groups</span></div>
    {rows.length ? <div className={styles.bars}>{rows.map((row, index) => {
      const value = number(row[valueKey]);
      return <div className={styles.barRow} key={String(row[labelKey] ?? index)}>
        <div className={styles.barMeta}><span title={String(row[labelKey] ?? "Unspecified")}>{String(row[labelKey] ?? "Unspecified")}</span><strong>{value.toLocaleString()}</strong></div>
        <div className={styles.track}><div className={styles.fill} style={{ width: Math.max(value > 0 ? 2 : 0, value / maximum * 100) + "%" }} /></div>
      </div>;
    })}</div> : <p className={styles.emptyChart}>{empty}</p>}
  </section>;
}

function Kpi({ label, value, detail, icon: Icon, tone = "navy" }: { label: string; value: number | string; detail: string; icon: typeof Users; tone?: "navy" | "lemon" | "blue" | "muted" }) {
  return <article className={styles.kpi}>
    <div className={styles.kpiTop}><span>{label}</span><span className={styles.kpiIcon + " " + styles[tone]}><Icon size={18} /></span></div>
    <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
    <small>{detail}</small>
  </article>;
}

async function downloadReport(token: string, id: string, filters: Filters, format: "csv" | "xlsx") {
  const params = new URLSearchParams({ format, from: filters.from, to: filters.to, q: filters.q, status: filters.status });
  const response = await fetch(`/api/v1/admin/reports/${id}/export?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) {
    let message = "The membership report export failed.";
    try { const body = await response.json(); message = body?.error?.message || message; } catch {}
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = response.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/)?.[1] || `mpa-${id}.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function MembershipCenterPage() {
  const token = useUiStore(state => state.token);
  const hydrated = useUiStore(state => state.hydrated);
  const hydrateToken = useUiStore(state => state.hydrateToken);
  const [access, setAccess] = useState<"loading" | "allowed" | "denied" | "signin">("loading");
  const [roles, setRoles] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [applications, setApplications] = useState<ReportResult | null>(null);
  const [membership, setMembership] = useState<ReportResult | null>(null);
  const [monthlyApplications, setMonthlyApplications] = useState<ReportResult | null>(null);
  const [reviewerPerformance, setReviewerPerformance] = useState<ReportResult | null>(null);
  const [finance, setFinance] = useState<ReportResult | null>(null);
  const [financeAvailable, setFinanceAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState("");
  const [error, setError] = useState("");
  const [generatedAt, setGeneratedAt] = useState("");

  const canFinance = roles.some(role => ["system_admin", "finance_officer"].includes(role)) || permissions.some(permission => ["finance.view", "finance.payment.verify", "finance.manage"].includes(permission));
  const canManagePaymentMethods = roles.some(role => ["system_admin", "finance_officer"].includes(role)) || permissions.includes("finance.manage");
  const canReview = roles.some(role => ["system_admin", "admin", "reviewer", "membership_reviewer"].includes(role)) || permissions.includes("membership.review");
  const canViewMemberRecords = roles.some(role => ["system_admin", "admin", "membership_reviewer"].includes(role)) || permissions.some(permission => ["members.view", "members.manage"].includes(permission));
  const canImportExport = roles.some(role => ["system_admin", "admin", "membership_reviewer", "finance_officer"].includes(role)) || permissions.includes("members.import");
  const canManageCards = roles.some(role => ["system_admin", "reviewer"].includes(role)) || permissions.some(permission => ["members.view", "members.manage"].includes(permission));
  const canViewReports = canReview || permissions.includes("reports.view") || roles.some(role => ["system_admin", "admin"].includes(role));
  const canViewReviewerPerformance = roles.some(role => ["system_admin", "admin", "membership_reviewer"].includes(role)) || permissions.includes("reports.sensitive");

  useEffect(() => { hydrateToken(); }, [hydrateToken]);

  const load = useCallback(async (nextFilters: Filters) => {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      const me = await api<Me>("/api/v1/me", {}, token);
      const currentRoles = Array.isArray(me.roles) ? me.roles : [];
      const currentPermissions = Array.isArray(me.permissions) ? me.permissions : [];
      const allowed = currentRoles.some(role => ["system_admin", "admin", "reviewer", "membership_reviewer"].includes(role)) ||
        currentPermissions.some(permission => ["membership.review", "membership.activate", "members.view", "members.manage", "reports.view"].includes(permission));
      setRoles(currentRoles);
      setPermissions(currentPermissions);
      if (!allowed) { setAccess("denied"); setApplications(null); setMembership(null); setMonthlyApplications(null); setReviewerPerformance(null); setFinance(null); setFinanceAvailable(false); setGeneratedAt(""); return; }

      const [appResult, memberResult, monthlyResult] = await Promise.all([
        api<ReportResult>("/api/v1/admin/reports/membership-applications/run", { method: "POST", body: JSON.stringify({ from: nextFilters.from, to: nextFilters.to, q: nextFilters.q, status: nextFilters.status }) }, token),
        // Current member stock is deliberately unbounded by the application-period filter.
        api<ReportResult>("/api/v1/admin/reports/membership-status/run", { method: "POST", body: JSON.stringify({}) }, token),
        api<ReportResult>("/api/v1/admin/reports/membership-applications/run", { method: "POST", body: JSON.stringify({ from: nextFilters.from, to: nextFilters.to, q: nextFilters.q, status: nextFilters.status, groupBy: "month" }) }, token),
      ]);
      if (!Array.isArray(appResult?.rows) || !Array.isArray(memberResult?.rows) || !Array.isArray(monthlyResult?.rows)) throw new Error("Membership reporting returned an incomplete response. No KPI values have been inferred.");
      setApplications(appResult);
      setMembership(memberResult);
      setMonthlyApplications(monthlyResult);
      setGeneratedAt(appResult.generatedAt || memberResult.generatedAt || "");
      if (currentRoles.some(role => ["system_admin", "admin", "membership_reviewer"].includes(role)) || currentPermissions.includes("reports.sensitive")) {
        try {
          setReviewerPerformance(await api<ReportResult>("/api/v1/admin/reports/membership-reviewer-performance/run", { method: "POST", body: JSON.stringify({ from: nextFilters.from, to: nextFilters.to }) }, token));
        } catch { setReviewerPerformance(null); }
      } else setReviewerPerformance(null);
      const financeAllowed = currentRoles.some(role => ["system_admin", "admin", "finance_officer"].includes(role)) ||
        currentPermissions.includes("finance.view");
      setFinanceAvailable(financeAllowed);
      if (financeAllowed) {
        try {
          const financeResult = await api<ReportResult>("/api/v1/admin/reports/finance-summary/run", { method: "POST", body: JSON.stringify({ from: nextFilters.from, to: nextFilters.to }) }, token);
          setFinance(financeResult);
        } catch { setFinance(null); }
      } else setFinance(null);
      setAccess("allowed");
    } catch (cause) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : "Membership dashboard could not be loaded.");
      setApplications(null);
      setMembership(null);
      setMonthlyApplications(null);
      setReviewerPerformance(null);
      setFinance(null);
      setFinanceAvailable(false);
      setGeneratedAt("");
      setAccess("allowed");
    } finally { setBusy(false); }
  }, [token]);

  useEffect(() => {
    if (!hydrated) return;
    if (!token) { setAccess("signin"); setRoles([]); setPermissions([]); setApplications(null); setMembership(null); setMonthlyApplications(null); setReviewerPerformance(null); setFinance(null); setFinanceAvailable(false); setGeneratedAt(""); return; }
    setAccess("loading");
    void load(initialFilters());
  }, [hydrated, token, load]);

  const appRows = applications?.rows || [];
  const memberRows = membership?.rows || [];
  const reviewerRows = reviewerPerformance?.rows || [];
  const appCount = useMemo(() => appRows.reduce((sum, row) => sum + number(row.Applications), 0), [appRows]);
  const pending = useMemo(() => appRows.filter(row => appPending.has(String(row.Status))).reduce((sum, row) => sum + number(row.Applications), 0), [appRows]);
  const approved = useMemo(() => appRows.filter(row => appApproved.has(String(row.Status))).reduce((sum, row) => sum + number(row.Applications), 0), [appRows]);
  const paid = useMemo(() => appRows.filter(row => appPaid.has(String(row.Status))).reduce((sum, row) => sum + number(row.Applications), 0), [appRows]);
  const rejected = useMemo(() => appRows.filter(row => row.Status === "rejected").reduce((sum, row) => sum + number(row.Applications), 0), [appRows]);
  const withdrawn = useMemo(() => appRows.filter(row => row.Status === "withdrawn").reduce((sum, row) => sum + number(row.Applications), 0), [appRows]);
  const approvalRate = approved + rejected > 0 ? `${(approved / (approved + rejected) * 100).toFixed(1)}%` : "—";
  const paidConversion = approved > 0 ? `${(paid / approved * 100).toFixed(1)}%` : "—";
  const awaitingPayment = Math.max(0, approved - paid);
  const activeMembers = useMemo(() => memberRows.filter(row => row.Status === "active").reduce((sum, row) => sum + number(row.Members), 0), [memberRows]);
  const expiredMembers = useMemo(() => memberRows.filter(row => row.Status === "expired").reduce((sum, row) => sum + number(row.Members), 0), [memberRows]);
  const statusChart = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of appRows) totals.set(clean(row.Status), (totals.get(clean(row.Status)) || 0) + number(row.Applications));
    return Array.from(totals.entries()).map(([Status, Applications]) => ({ Status, Applications })).sort((a, b) => b.Applications - a.Applications);
  }, [appRows]);
  const planChart = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of memberRows) totals.set(String(row.Product || "Unspecified"), (totals.get(String(row.Product || "Unspecified")) || 0) + number(row.Members));
    return Array.from(totals.entries()).map(([Product, Members]) => ({ Product, Members })).sort((a, b) => b.Members - a.Members);
  }, [memberRows]);
  const applicationPlanChart = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of appRows) totals.set(String(row.Product || "Unspecified"), (totals.get(String(row.Product || "Unspecified")) || 0) + number(row.Applications));
    return Array.from(totals.entries()).map(([Product, Applications]) => ({ Product, Applications })).sort((a, b) => b.Applications - a.Applications);
  }, [appRows]);

  const applyPeriod = (year: string, month: string) => {
    if (!year) return;
    if (!month) setFilters(current => ({ ...current, from: `${year}-01-01`, to: `${year}-12-31` }));
    else {
      const last = new Date(Number(year), Number(month), 0).getDate();
      setFilters(current => ({ ...current, from: `${year}-${month}-01`, to: `${year}-${month}-${String(last).padStart(2, "0")}` }));
    }
  };

  if (!hydrated || access === "loading") return <Card><OperationStatus state="loading" title="Preparing Membership Center" detail="Verifying membership workspace access and loading authoritative membership reports." /></Card>;
  if (access === "signin") return <div className="grid"><AdminPageHeader eyebrow="MPA · Membership management" title="Membership Center" description="Unified membership operations and management intelligence."/><Card><p className="muted">Sign in with an authorized MPA membership administration account.</p><a className="btn btn-primary" href="/login?next=/admin/membership-center">Sign in</a></Card></div>;
  if (access === "denied") return <div className="grid"><AdminPageHeader eyebrow="MPA · Membership management" title="Membership Center" description="Unified membership operations and management intelligence."/><Card><OperationStatus state="error" title="Membership Center access denied" detail="Membership review, activation, member administration or an authorized reporting permission is required. Finance permission alone does not grant membership decision access."/><a className="btn btn-ghost" href="/admin">Return to admin overview</a></Card></div>;

  const nav = [
    ["Overview", "/admin/membership-center", true],
    ...(canReview ? [["Applications", "/admin/membership", false] as [string, string, boolean]] : []),
    ...(canViewMemberRecords ? [["Members", "/admin/members/catalog", false] as [string, string, boolean]] : []),
    ...(canImportExport ? [["Import & export", "/admin/members", false] as [string, string, boolean]] : []),
    ...(canReview ? [["Renewals & expiry", "/admin/reports?report=membership-status", false] as [string, string, boolean]] : []),
    ...(canFinance ? [["Finance payments", "/admin/finance", false] as [string, string, boolean]] : []),
    ...(canManageCards ? [["Membership cards", "/admin/membership-cards", false] as [string, string, boolean]] : []),
    ...(canViewMemberRecords ? [["Plans & settings", "/admin/membership", false] as [string, string, boolean]] : []),
    ...(canManagePaymentMethods ? [["Payment methods", "/admin/membership/payment-methods", false] as [string, string, boolean]] : []),
    ...(canViewReports ? [["Reports", "/admin/reports?category=Membership", false] as [string, string, boolean]] : []),
  ] as [string, string, boolean][];

  return <div className={styles.page}>
    <AdminPageHeader eyebrow="MPA · Membership management" title="Membership Center" description="One place to review applications, understand the paid membership base and monitor renewal risk." actions={<button className="btn btn-ghost" type="button" onClick={() => void load(filters)} disabled={busy}><RefreshCw size={16}/>{busy ? "Refreshing…" : "Refresh data"}</button>} />
    <nav className={styles.nav} aria-label="Membership management sections">
      {nav.map(([label, href, active]) => <a key={label} href={href} aria-current={active ? "page" : undefined} className={active ? styles.navActive : ""}>{label}</a>)}
    </nav>
    {error && <Card><OperationStatus state="error" title="Membership data could not be fully verified" detail={error} action={<button className="btn btn-ghost" type="button" onClick={() => void load(filters)}>Retry</button>} /></Card>}
    <section className={styles.filterPanel} aria-label="Membership report filters">
      <div className={styles.filterTitle}><div><strong>Reporting period</strong><span>Application counts use application creation dates. Active and expired membership counts show the current recorded stock.</span></div><Badge tone="slate">Ethiopia · GMT+3 reporting convention</Badge></div>
      <div className={styles.filters}>
        <label>From<input type="date" value={filters.from} onChange={event => setFilters(current => ({ ...current, from: event.target.value }))}/></label>
        <label>To<input type="date" value={filters.to} onChange={event => setFilters(current => ({ ...current, to: event.target.value }))}/></label>
        <label>Application stage<select value={filters.status} onChange={event => setFilters(current => ({ ...current, status: event.target.value }))}><option value="">All stages</option><option value="submitted">Submitted</option><option value="in_review">In review</option><option value="correction_required">Needs information</option><option value="approved">Approved</option><option value="payment_pending">Payment pending</option><option value="paid">Paid</option><option value="activated">Activated</option><option value="rejected">Rejected</option><option value="withdrawn">Withdrawn</option></select></label>
        <label className={styles.searchFilter}>Plan / application search<input value={filters.q} onChange={event => setFilters(current => ({ ...current, q: event.target.value }))} placeholder="Search plan or application type"/></label>
        <button className="btn btn-primary" type="button" onClick={() => void load(filters)} disabled={busy}>{busy ? "Applying…" : "Apply filters"}</button>
      </div>
      <div className={styles.periodShortcuts}>
        <label>Year<select defaultValue={String(currentYear())} onChange={event => applyPeriod(event.target.value, "")}>{Array.from({length: 7}, (_, index) => currentYear() - index).map(year => <option key={year} value={year}>{year}</option>)}</select></label>
        <label>Month<select defaultValue="" onChange={event => { const year = String(new Date(filters.from).getFullYear() || currentYear()); applyPeriod(year, event.target.value); }}><option value="">Full year</option>{Array.from({length: 12}, (_, index) => index + 1).map(month => <option key={month} value={String(month).padStart(2,"0")}>{new Date(2024, month - 1, 1).toLocaleString("en", {month:"long"})}</option>)}</select></label>
        <span className={styles.filterNote}>All charts and application KPIs refresh together. Current member stock is not reduced by the selected application period.</span>
      </div>
    </section>

    <section className={styles.kpiGrid} aria-label="Membership key performance indicators">
      <Kpi label="Applications received" value={applications ? appCount : "—"} detail="Created in the selected period" icon={Activity}/>
      <Kpi label="Awaiting review" value={applications ? pending : "—"} detail="Submitted, in review or needs information" icon={CalendarDays} tone="lemon"/>
      <Kpi label="Approved" value={applications ? approved : "—"} detail="Approved and subsequent paid/activated stages" icon={ShieldCheck} tone="blue"/>
      <Kpi label="Paid applications" value={applications ? paid : "—"} detail="Finance-verified lifecycle stage" icon={CreditCard}/>
      <Kpi label="Approved awaiting payment" value={applications ? awaitingPayment : "—"} detail="Approved applications not yet in paid/activated state" icon={CreditCard} tone="lemon"/>
      <Kpi label="Approval rate" value={applications ? approvalRate : "—"} detail="Approved / approved plus rejected; withdrawals excluded" icon={BarChart3} tone="blue"/>
      <Kpi label="Paid conversion" value={applications ? paidConversion : "—"} detail="Paid or activated / approved lifecycle applications" icon={Activity}/>
      <Kpi label="Rejected / withdrawn" value={applications ? rejected + withdrawn : "—"} detail={applications ? `${rejected.toLocaleString()} rejected · ${withdrawn.toLocaleString()} withdrawn` : "Application report unavailable"} icon={CalendarDays} tone="muted"/>
      <Kpi label="Active members" value={membership ? activeMembers : "—"} detail="Current recorded active membership stock; payment status is not inferred" icon={Users} tone="blue"/>
      <Kpi label="Expired memberships" value={membership ? expiredMembers : "—"} detail="Current records with expired status" icon={CalendarDays} tone="muted"/>
    </section>

    <section className={styles.chartGrid} aria-label="Membership analysis charts">
      <Card><BarList title="Applications by month" rows={monthlyApplications?.rows || []} labelKey="Month" valueKey="Applications" empty={monthlyApplications ? "No applications matched this period." : "Monthly trend report unavailable."}/>
      {canViewReviewerPerformance && <BarList title="Review decisions by staff" rows={reviewerRows} labelKey="Reviewer" valueKey="Decisions" empty={reviewerPerformance ? "No review decisions were recorded in this period." : "Reviewer performance report unavailable."}/>}
      <BarList title="Application pipeline" rows={statusChart} labelKey="Status" valueKey="Applications" empty={applications ? "No applications matched this period." : "Application report unavailable; retry after checking access."}/></Card>
      <Card><BarList title="Current membership by plan" rows={planChart} labelKey="Product" valueKey="Members" empty={membership ? "No membership records were returned." : "Membership report unavailable; retry after checking access."}/></Card>
      <Card><BarList title="Applications by membership plan" rows={applicationPlanChart} labelKey="Product" valueKey="Applications" empty="No applications matched this period."/></Card>
      <Card>
        <div className={styles.chartHeading}><h3>Membership health</h3><span>Current stock</span></div>
        <div className={styles.healthRows}>
          <div><span>Active</span><strong>{activeMembers.toLocaleString()}</strong><div className={styles.healthTrack}><i style={{width: (activeMembers + expiredMembers ? activeMembers / (activeMembers + expiredMembers) * 100 : 0) + "%"}}/></div></div>
          <div><span>Expired</span><strong>{expiredMembers.toLocaleString()}</strong><div className={styles.healthTrack}><i className={styles.expiredFill} style={{width: (activeMembers + expiredMembers ? expiredMembers / (activeMembers + expiredMembers) * 100 : 0) + "%"}}/></div></div>
        </div>
        <p className={styles.chartFootnote}>This view reflects recorded status and validity rules from the membership-status report. It does not infer unrecorded payment history.</p>
      </Card>
    </section>

    <section className={styles.bottomGrid}>
      <Card>
        <div className={styles.panelHeading}><div><h2>Operational next steps</h2><p>Open the existing workflow without duplicating its authority.</p></div><ArrowRight size={18}/></div>
        <div className={styles.actionList}>
          <a href="/admin/membership"><span><strong>Review applications</strong><small>Record eligibility decisions and request missing information.</small></span><ArrowRight size={17}/></a>
          <a href="/admin/members/catalog"><span><strong>Search member register</strong><small>Inspect membership records and linked account status.</small></span><ArrowRight size={17}/></a>
          <a href="/admin/members"><span><strong>Import or export members</strong><small>Preview imports and export authorized member data.</small></span><ArrowRight size={17}/></a>
          {canFinance && <a href="/admin/finance"><span><strong>Finance payment queue</strong><small>Verify eligible payments or record authorized reversals.</small></span><ArrowRight size={17}/></a>}
          <a href="/admin/membership-cards"><span><strong>Membership cards</strong><small>Print cards for records already eligible under existing rules.</small></span><ArrowRight size={17}/></a>
        </div>
      </Card>
      <Card>
        <div className={styles.panelHeading}><div><h2>Geographic analysis readiness</h2><p>Location reporting must use verified member data.</p></div><MapPinned size={18}/></div>
        <div className={styles.locationNotice}>
          <strong>Structured location filters are not yet available in the current membership source.</strong>
          <p>The current person and membership schema does not persist a governed region, zone, woreda and city hierarchy. This dashboard therefore does not fabricate geographic counts or pretend a text search is a location filter. Add validated location capture and reference-data mapping before enabling regional KPI comparisons.</p>
        </div>
        <div className={styles.panelFootnote}>Last report refresh: {generatedAt ? new Date(generatedAt).toLocaleString() : "Not confirmed"} · {busy ? "Refreshing" : "Source reports loaded"}</div>
      </Card>
    </section>

    {financeAvailable && <Card>
      <div className={styles.panelHeading}><div><h2>Finance summary</h2><p>Visible only to users with separate Finance reporting authority. Amounts remain separated by currency.</p></div><a className="btn btn-ghost" href="/admin/finance">Open Finance</a></div>
      {finance?.rows?.length ? <div className={styles.financeRows}>{finance.rows.map(row => <div key={String(row.Currency)}><strong>{String(row.Currency)}</strong><span>Net retained: {number(row["Net collected"]).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span><span>Outstanding: {number(row["Outstanding amount"]).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span><span>Verified payments: {number(row["Approved payments"]).toLocaleString()}</span></div>)}</div> : <p className={styles.chartFootnote}>Finance summary unavailable or no matching finance records were returned. Use the Finance workspace to investigate.</p>}
    </Card>}

    <Card>
      <div className={styles.exportPanel}>
        <div><h2>Management reports</h2><p>Download the filtered application funnel. Member-directory exports remain separately permissioned and audited.</p></div>
        <div className={styles.exportActions}>
          <button className="btn btn-ghost" type="button" disabled={Boolean(exporting)} onClick={async()=>{if(!token)return;setExporting("csv");setError("");try{await downloadReport(token,"membership-applications",filters,"csv");}catch(cause){setError(cause instanceof Error?cause.message:"CSV export failed.");}finally{setExporting("");}}}><Download size={16}/>{exporting==="csv"?"Preparing…":"Download CSV"}</button>
          <button className="btn btn-primary" type="button" disabled={Boolean(exporting)} onClick={async()=>{if(!token)return;setExporting("xlsx");setError("");try{await downloadReport(token,"membership-applications",filters,"xlsx");}catch(cause){setError(cause instanceof Error?cause.message:"Excel export failed.");}finally{setExporting("");}}}><ArrowDownToLine size={16}/>{exporting==="xlsx"?"Preparing…":"Download Excel"}</button>
          <button className="btn btn-ghost" type="button" disabled={Boolean(exporting)} onClick={async()=>{if(!token)return;setExporting("status");setError("");try{await downloadReport(token,"membership-status",{from:"",to:"",q:"",status:""},"xlsx");}catch(cause){setError(cause instanceof Error?cause.message:"Membership stock export failed.");}finally{setExporting("");}}}><Download size={16}/>{exporting==="status"?"Preparing…":"Export member status summary"}</button>
          {canViewReviewerPerformance && <button className="btn btn-ghost" type="button" disabled={Boolean(exporting)} onClick={async()=>{if(!token)return;setExporting("reviewers");setError("");try{await downloadReport(token,"membership-reviewer-performance",{from:filters.from,to:filters.to,q:"",status:""},"xlsx");}catch(cause){setError(cause instanceof Error?cause.message:"Reviewer report export failed.");}finally{setExporting("");}}}><Download size={16}/>{exporting==="reviewers"?"Preparing…":"Export reviewer performance"}</button>}
        </div>
      </div>
      <p className={styles.chartFootnote}>Generated reports are audited by the server. Export scope and fields are governed by the report permission catalogue.</p>
    </Card>
    <p className={styles.footerNote}>Membership decisions, payment verification, account claiming and activation remain separate audited workflows. A system administrator cannot bypass the Finance payment eligibility requirement.</p>
  </div>;
}
