"use client";

import { Check, ChevronLeft, ChevronRight, Download, Eye, FileText, History, Plus, RefreshCw, ShieldCheck, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OperationStatus } from "../../../components/operation-status";
import { Badge, Card } from "../../../components/ui";
import { ApiError, api } from "../../../lib/api";
import { getAccountContext } from "../../../lib/account-context";
import { useUiStore } from "../../../lib/store";

type Plan = {
  product_code: string; name: string; description?: string | null; price: string | number;
  currency: string; billing_model: string; active: boolean; renewal_required: boolean;
  duration_days?: number | null; effective_from?: string | null; effective_to?: string | null;
  current_fee_amount?: string | number; current_fee_currency?: string; current_fee_version?: number | null;
  grace_period_days?: number; benefits?: unknown; eligibility?: Record<string, unknown>;
  fee_rule_history?: Array<{ version: number; plan_name?: string; plan_description?: string | null;
    baseAmount: number | string; currency: string; taxAmount: number | string; serviceFee: number | string;
    effectiveFrom: string; effectiveTo?: string | null; durationDays?: number | null; billingModel: string;
    renewalRequired: boolean; gracePeriodDays: number; benefits?: string[]; eligibility?: Record<string, unknown> }>;
};
type Draft = {
  productCode: string; name: string; description: string; amount: string; currency: string;
  taxAmount: string; serviceFee: string; billingModel: string; durationDays: string;
  renewalRequired: boolean; gracePeriodDays: string; effectiveFrom: string; planEffectiveFrom: string;
  planEffectiveTo: string; active: boolean; benefits: string; eligibilityText: string;
};
type FeeSnapshot = { productName?: string; productCode?: string; amount?: string | number; currency?: string; feeRuleVersion?: number | string };
type Application = {
  id: string; tracking_reference?: string; display_name?: string | null; user_id?: string;
  email?: string; application_type: string; status: string; created_at: string; submitted_at?: string | null;
  updated_at?: string; previous_membership_end_date?: string | null; fee_snapshot?: FeeSnapshot;
  name?: string; review_history?: Array<{ decision: string; note?: string; createdAt: string; actorName?: string }>;
  payment?: { id: string; status: string; amount: string | number; currency: string; channel: string;
    reference?: string | null; verification_note?: string | null; created_at?: string;
    verified_at?: string | null; verified_by_name?: string | null; reconciliation_status?: string | null;
    reconciled_by_name?: string | null; reconciled_at?: string | null;
    reconciliation_note?: string | null; reversal?: { type: string; reason?: string } | null } | null;
  attachments?: Array<{ id: string; fileObjectId: string; fileName: string; attachmentType: string; createdAt: string }>;
  data_snapshot?: { professionalDetails?: { fullName?: string; sector?: string; institutionalAffiliation?: string | null } };
};
type Me = { roles?: string[]; permissions?: string[] };
const today = () => new Date().toISOString().slice(0, 10);
const blankDraft = (): Draft => ({
  productCode: "", name: "", description: "", amount: "0", currency: "ETB", taxAmount: "0",
  serviceFee: "0", billingModel: "recurring", durationDays: "365", renewalRequired: true,
  gracePeriodDays: "0", effectiveFrom: today(), planEffectiveFrom: today(), planEffectiveTo: "",
  active: true, benefits: "", eligibilityText: ""
});
const statusTone = (status: string): "green" | "red" | "blue" | "gold" | "slate" =>
  ["active", "paid", "approved", "succeeded", "verified", "activated"].includes(status) ? "green" :
  ["rejected", "declined", "failed", "cancelled", "reversed", "expired"].includes(status) ? "red" :
  ["in_review", "under_review", "matching"].includes(status) ? "blue" :
  ["submitted", "pending", "pending_review", "correction_required", "payment_pending"].includes(status) ? "gold" : "slate";
const money = (amount: unknown, currency: string) => currency + " " + Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const readable = (value: string) => value.replaceAll("_", " ");

export default function MembershipAdminWorkspace() {
  const token = useUiStore(state => state.token);
  const [tab, setTab] = useState<"plans" | "queue">("queue");
  const initialTabSet = useRef(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [planError, setPlanError] = useState("");
  const [queueError, setQueueError] = useState("");
  const [busy, setBusy] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [planModal, setPlanModal] = useState(false);
  const [planStep, setPlanStep] = useState(1);
  const [editingCode, setEditingCode] = useState("");
  const [draft, setDraft] = useState<Draft>(blankDraft());
  const [planFeedback, setPlanFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [queueFeedback, setQueueFeedback] = useState<{ kind: "success" | "error"; message: string; applicationId?: string } | null>(null);
  const [selected, setSelected] = useState<Application | null>(null);
  const [historyFor, setHistoryFor] = useState<Application | null>(null);
  const [evidence, setEvidence] = useState<{ name: string; url: string; type: string } | null>(null);
  const [decisionFor, setDecisionFor] = useState<Application | null>(null);
  const [decision, setDecision] = useState<"approved" | "correction_required" | "rejected">("approved");
  const [decisionNote, setDecisionNote] = useState("");
  const [canViewQueue, setCanViewQueue] = useState(false);
  const [canReview, setCanReview] = useState(false);
  const [canActivate, setCanActivate] = useState(false);
  const [canManagePlans, setCanManagePlans] = useState(false);

  const loadPlans = useCallback(async () => {
    if (!token) return;
    setPlanError("");
    try {
      const result = await api<Plan[]>("/api/v1/admin/membership/products", {}, token);
      if (!Array.isArray(result)) throw new Error("The membership plan service returned an unexpected response.");
      setPlans(result);
    } catch (cause) {
      setPlanError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "Membership plans could not be loaded.");
    }
  }, [token]);
  const loadQueue = useCallback(async () => {
    if (!token) return;
    setQueueError("");
    try {
      const result = await api<Application[]>("/api/v1/review/membership/applications", {}, token);
      if (!Array.isArray(result)) throw new Error("The membership review service returned an unexpected response.");
      setApplications(result);
    } catch (cause) {
      setQueueError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "Membership applications could not be loaded.");
    }
  }, [token]);
  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const me = await getAccountContext<Me>(token);
      const roles = Array.isArray(me.roles) ? me.roles : [];
      const permissions = Array.isArray(me.permissions) ? me.permissions : [];
      const managePlans = roles.includes("system_admin") || permissions.includes("members.manage");
      const decisionRoles = roles.some(role => ["system_admin", "reviewer", "membership_reviewer"].includes(role));
      const viewQueue = decisionRoles || permissions.some(permission => ["membership.review", "members.view"].includes(permission));
      setCanManagePlans(managePlans);
      setCanViewQueue(viewQueue);
      if (!initialTabSet.current) { setTab(managePlans ? "plans" : "queue"); initialTabSet.current = true; }
      setCanReview(decisionRoles || permissions.includes("membership.review"));
      setCanActivate(decisionRoles || permissions.includes("membership.activate"));
      await Promise.all([managePlans ? loadPlans() : Promise.resolve(), viewQueue ? loadQueue() : Promise.resolve()]);
    } catch (cause) {
      setPlanError(cause instanceof ApiError ? cause.message : "Your membership administration permissions could not be confirmed.");
      setQueueError(cause instanceof ApiError ? cause.message : "Your membership administration permissions could not be confirmed.");
    } finally {
      setLoading(false);
    }
  }, [token, loadPlans, loadQueue]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!planModal && !selected && !historyFor && !decisionFor && !evidence) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (evidence) { if (evidence.url) URL.revokeObjectURL(evidence.url); setEvidence(null); }
      else if (decisionFor) setDecisionFor(null);
      else if (historyFor) setHistoryFor(null);
      else if (selected) setSelected(null);
      else if (planModal && busy !== "plan") { setPlanModal(false); setPlanFeedback(null); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [planModal, selected, historyFor, decisionFor, evidence, busy]);

  const filtered = useMemo(() => applications.filter(item => {
    const haystack = [
      item.tracking_reference, item.display_name, item.email, item.user_id, item.fee_snapshot?.productName,
      item.fee_snapshot?.productCode, item.payment?.reference, item.payment?.id
    ].filter(Boolean).join(" ").toLowerCase();
    return (!query.trim() || haystack.includes(query.trim().toLowerCase())) &&
      (statusFilter === "all" || item.status === statusFilter) &&
      (typeFilter === "all" || item.application_type === typeFilter);
  }).sort((a, b) => {
    const rank = (status: string) => ["submitted", "in_review"].includes(status) ? 0 : status === "correction_required" ? 1 : status === "paid" ? 2 : 3;
    const byAction = rank(a.status) - rank(b.status);
    if (byAction) return byAction;
    return new Date(b.submitted_at || b.created_at || 0).getTime() - new Date(a.submitted_at || a.created_at || 0).getTime();
  }), [applications, query, statusFilter, typeFilter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { setPage(1); }, [query, statusFilter, typeFilter]);

  function startCreate() {
    setEditingCode("");
    setDraft(blankDraft());
    setPlanStep(1);
    setPlanFeedback(null);
    setPlanModal(true);
  }
  function startEdit(plan: Plan) {
    const latest = plan.fee_rule_history?.[0];
    const eligibility = latest?.eligibility || plan.eligibility || {};
    setEditingCode(plan.product_code);
    setDraft({
      productCode: plan.product_code, name: latest?.plan_name || plan.name,
      description: latest?.plan_description || plan.description || "",
      amount: String(latest?.baseAmount ?? plan.price), currency: latest?.currency || plan.currency,
      taxAmount: String(latest?.taxAmount ?? 0), serviceFee: String(latest?.serviceFee ?? 0),
      billingModel: latest?.billingModel || plan.billing_model,
      durationDays: latest?.durationDays == null ? "" : String(latest.durationDays),
      renewalRequired: Boolean(latest?.renewalRequired ?? plan.renewal_required),
      gracePeriodDays: String(latest?.gracePeriodDays ?? plan.grace_period_days ?? 0),
      effectiveFrom: today(), planEffectiveFrom: plan.effective_from?.slice(0, 10) || "",
      planEffectiveTo: plan.effective_to?.slice(0, 10) || "", active: plan.active,
      benefits: (latest?.benefits || (Array.isArray(plan.benefits) ? plan.benefits as string[] : [])).join("\n"),
      eligibilityText: Array.isArray(eligibility.requirements) ? (eligibility.requirements as string[]).join("\n") : ""
    });
    setPlanStep(1);
    setPlanFeedback(null);
    setPlanModal(true);
  }
  function closePlanModal() {
    if (busy === "plan") return;
    setPlanModal(false);
    setPlanFeedback(null);
  }
  async function savePlan(event: FormEvent) {
    event.preventDefault();
    if (!token || busy) return;
    setBusy("plan");
    setPlanFeedback(null);
    const eligibility: Record<string, unknown> = {};
    const requirements = draft.eligibilityText.split("\n").map(value => value.trim()).filter(Boolean).slice(0, 40);
    if (requirements.length) eligibility.requirements = requirements;
    const body = {
      productCode: draft.productCode.trim().toUpperCase(), name: draft.name.trim(), description: draft.description.trim(),
      amount: Number(draft.amount), currency: draft.currency.trim().toUpperCase(), billingModel: draft.billingModel,
      durationDays: draft.durationDays === "" ? null : Number(draft.durationDays),
      renewalRequired: draft.renewalRequired, gracePeriodDays: Number(draft.gracePeriodDays),
      effectiveFrom: draft.effectiveFrom, planEffectiveFrom: draft.planEffectiveFrom || null,
      planEffectiveTo: draft.planEffectiveTo || null, active: draft.active,
      benefits: draft.benefits.split("\n").map(value => value.trim()).filter(Boolean),
      eligibility, taxAmount: Number(draft.taxAmount), serviceFee: Number(draft.serviceFee),
      expectedVersion: editingCode ? String(plans.find(plan => plan.product_code === editingCode)?.fee_rule_history?.[0]?.version ?? "") : ""
    };
    try {
      await api(editingCode ? "/api/v1/admin/membership/products/" + encodeURIComponent(editingCode) : "/api/v1/admin/membership/products", {
        method: editingCode ? "PATCH" : "POST", body: JSON.stringify(body)
      }, token);
      setPlanFeedback({ kind: "success", message: editingCode ? "New plan version saved. Existing applications retain their original fee and terms." : "Membership plan created successfully." });
      await loadPlans();
      setPlanStep(4);
    } catch (cause) {
      setPlanFeedback({ kind: "error", message: cause instanceof ApiError ? cause.message : "The plan could not be saved. Your entries are still here; correct the issue and retry." });
    } finally {
      setBusy("");
    }
  }
  async function recordDecision() {
    if (!token || !decisionFor || busy) return;
    setBusy("decision:" + decisionFor.id);
    setQueueFeedback(null);
    try {
      await api("/api/v1/membership/applications/" + encodeURIComponent(decisionFor.id) + "/review", {
        method: "POST",
        body: JSON.stringify({ decision, note: decisionNote.trim(), requestedFields: decision === "correction_required" ? ["membership_details"] : undefined })
      }, token);
      setQueueFeedback({ kind: "success", applicationId: decisionFor.id, message: "Decision recorded for " + (decisionFor.tracking_reference || "the selected application") + "." });
      setDecisionFor(null);
      setDecisionNote("");
      await loadQueue();
    } catch (cause) {
      setQueueFeedback({ kind: "error", applicationId: decisionFor.id, message: cause instanceof ApiError ? cause.message : "The review decision failed. No successful decision was confirmed." });
    } finally {
      setBusy("");
    }
  }
  async function activate(item: Application) {
    if (!token || busy) return;
    setBusy("activate:" + item.id);
    setQueueFeedback(null);
    try {
      await api("/api/v1/membership/applications/" + encodeURIComponent(item.id) + "/activate", { method: "POST" }, token);
      setQueueFeedback({ kind: "success", applicationId: item.id, message: "Membership activation recorded for " + (item.tracking_reference || "the selected application") + "." });
      await loadQueue();
    } catch (cause) {
      setQueueFeedback({ kind: "error", applicationId: item.id, message: cause instanceof ApiError ? cause.message : "Activation failed. The application remains unchanged unless the server confirms otherwise." });
    } finally {
      setBusy("");
    }
  }
  async function previewAttachment(fileId: string, fileName: string) {
    if (!token || busy) return;
    setBusy("evidence");
    setQueueFeedback(null);
    try {
      const response = await fetch("/api/v1/files/" + encodeURIComponent(fileId), { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 403 ? "Your role cannot access this private attachment." : "The private attachment could not be loaded.");
      const blob = await response.blob();
      const extension = fileName.toLowerCase().split(".").pop() || "";
      const detectedType = blob.type || "application/octet-stream";
      const type = detectedType === "application/octet-stream" ? (extension === "pdf" ? "application/pdf" : ["png", "jpg", "jpeg", "webp", "gif"].includes(extension) ? "image/" + (extension === "jpg" ? "jpeg" : extension) : detectedType) : detectedType;
      if (!type.includes("pdf") && !type.startsWith("image/")) throw new Error("In-app preview supports PDF and image evidence. Download this file securely instead.");
      const url = URL.createObjectURL(blob);
      setEvidence({ name: fileName, url, type });
    } catch (cause) {
      setQueueFeedback({ kind: "error", message: cause instanceof Error ? cause.message : "Evidence preview failed." });
    } finally {
      setBusy("");
    }
  }
  function downloadEvidence() {
    if (!evidence) return;
    const anchor = document.createElement("a");
    anchor.href = evidence.url;
    anchor.download = evidence.name || "membership-evidence";
    anchor.click();
  }
  function closeEvidence() {
    if (evidence) URL.revokeObjectURL(evidence.url);
    setEvidence(null);
  }

  const statusOptions = Array.from(new Set(applications.map(item => item.status))).sort();

  return <div className="grid" style={{ gap: 16 }}>
    <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" }}>
      <div><div className="eyebrow">MPA · Operations workspace</div><h1 className="h1">Membership management</h1><p className="muted">One task at a time. Plan configuration and application decisions are separated into focused workspaces.</p></div>
      
    </div>

    <div role="tablist" aria-label="Membership administration sections" className="row" style={{ gap: 8, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
      {canManagePlans && <button id="membership-plans-tab" type="button" role="tab" aria-controls="membership-plans-panel" aria-selected={tab === "plans"} tabIndex={tab === "plans" ? 0 : -1} className={"btn " + (tab === "plans" ? "btn-primary" : "btn-ghost")} onClick={() => setTab("plans")}>1. Membership plans <span className="muted">({plans.length})</span></button>}
      {canViewQueue && <button id="membership-review-tab" type="button" role="tab" aria-controls="membership-review-panel" aria-selected={tab === "queue"} tabIndex={tab === "queue" ? 0 : -1} className={"btn " + (tab === "queue" ? "btn-primary" : "btn-ghost")} onClick={() => setTab("queue")}>2. Review queue <span className="muted">({applications.length})</span></button>}
    </div>

    {canManagePlans && tab === "plans" && <section id="membership-plans-panel" role="tabpanel" aria-labelledby="membership-plans-tab" className="grid" style={{ gap: 14 }}>
      <Card>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
          <div><h2 className="h2">Membership plan catalogue</h2><p className="muted">Published terms are versioned. Existing applications keep the plan snapshot they accepted.</p></div>
          <button type="button" className="btn btn-primary" onClick={startCreate}><Plus size={16} /> Add membership plan</button>
        </div>
        {planError && <div className="form-error" role="alert">{planError} </div>}
        {loading && !plans.length ? <OperationStatus state="loading" title="Loading membership plans" detail="Retrieving the current plan catalogue and fee versions." /> :
          !plans.length && !planError ? <div className="muted">No plans are configured yet. Add the first plan to make it available for new applications.</div> :
          <div className="grid" style={{ gap: 8, marginTop: 12 }}>
            {plans.map(plan => {
              const active = plan.active && (!plan.effective_from || plan.effective_from.slice(0, 10) <= today()) && (!plan.effective_to || plan.effective_to.slice(0, 10) >= today());
              return <div key={plan.product_code} className="case-row">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><strong>{plan.name}</strong><Badge tone={active ? "green" : "slate"}>{active ? "Available" : plan.active ? "Scheduled / ended" : "Inactive"}</Badge></div>
                  <p className="muted">{plan.product_code} · {money(plan.current_fee_amount ?? plan.price, plan.current_fee_currency || plan.currency)} · {readable(plan.billing_model)}</p>
                  <small className="muted">Fee version {plan.current_fee_version ?? "—"} · {plan.fee_rule_history?.length || 0} historical version(s) · {plan.duration_days ? plan.duration_days + " days" : "No fixed duration"}</small>
                </div>
                <button type="button" className="btn btn-ghost" onClick={() => startEdit(plan)} title={"Edit " + plan.name + " or add a new fee version"} aria-label={"Edit " + plan.name}>Edit plan</button>
              </div>;
            })}
          </div>}
      </Card>
    </section>}

    {canViewQueue && tab === "queue" && <section id="membership-review-panel" role="tabpanel" aria-labelledby="membership-review-tab" className="grid" style={{ gap: 12 }}>
      <Card>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <div><h2 className="h2">Membership review queue</h2><p className="muted">Find an application, inspect its evidence and history, then take only the action your role permits.</p></div>
          
        </div>
        {queueError && <div className="form-error" role="alert">{queueError} </div>}
        <div className="grid grid-3" style={{ gap: 8, margin: "12px 0" }}>
          <div className="membership-progress"><small className="muted">Total applications</small><div className="h2">{applications.length}</div></div>
          <div className="membership-progress"><small className="muted">Awaiting decision</small><div className="h2">{applications.filter(item => ["submitted", "in_review"].includes(item.status)).length}</div></div>
          <div className="membership-progress"><small className="muted">Payment verified / activation</small><div className="h2">{applications.filter(item => item.status === "paid").length}</div></div>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <label style={{ flex: "2 1 260px" }}>Search applications<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Reference, applicant, email, plan or payment ref…" /></label>
          <label style={{ flex: "1 1 150px" }}>Status<select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{statusOptions.map(status => <option key={status} value={status}>{readable(status)}</option>)}</select></label>
          <label style={{ flex: "1 1 150px" }}>Application type<select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="all">All types</option><option value="new">New membership</option><option value="renewal">Renewal</option></select></label>
          <button type="button" className="btn btn-ghost" onClick={() => { setQuery(""); setStatusFilter("all"); setTypeFilter("all"); }}>Clear filters</button>
        </div>
        {loading && !applications.length ? <OperationStatus state="loading" title="Loading review queue" detail="Retrieving applications and their current server-side states." /> :
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead><tr>{["Application / applicant", "Plan terms", "Payment", "Status", "Submitted", "Actions"].map(label => <th key={label} scope="col" style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{label}</th>)}</tr></thead>
              <tbody>
                {visibleRows.map(item => <tr key={item.id}>
                  <td style={{ padding: "11px 8px", borderBottom: "1px solid var(--border)", minWidth: 230 }}>
                    <strong>{item.tracking_reference || "Reference pending"}</strong><div>{item.display_name || item.data_snapshot?.professionalDetails?.fullName || "Applicant"}</div><small className="muted">{item.email || "Email unavailable"}</small>
                  </td>
                  <td style={{ padding: "11px 8px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                    <div>{item.fee_snapshot?.productName || item.fee_snapshot?.productCode || "Membership"}</div><small className="muted">{money(item.fee_snapshot?.amount ?? 0, item.fee_snapshot?.currency || "ETB")} · v{item.fee_snapshot?.feeRuleVersion ?? "legacy"}</small>
                  </td>
                  <td style={{ padding: "11px 8px", borderBottom: "1px solid var(--border)" }}>
                    {item.payment ? <><Badge tone={statusTone(item.payment.status)}>{readable(item.payment.status)}</Badge><small className="muted" style={{ display: "block" }}>{money(item.payment.amount, item.payment.currency)}</small>{item.payment.reconciliation_status && <small className="muted" style={{ display: "block" }}>Reconciled: {readable(item.payment.reconciliation_status)}{item.payment.reconciled_by_name ? " · by " + item.payment.reconciled_by_name : ""}</small>}</> : <small className="muted">Not submitted</small>}
                  </td>
                  <td style={{ padding: "11px 8px", borderBottom: "1px solid var(--border)" }}><Badge tone={statusTone(item.status)}>{readable(item.status)}</Badge></td>
                  <td style={{ padding: "11px 8px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}><small>{item.submitted_at || item.created_at ? new Date(String(item.submitted_at || item.created_at)).toLocaleDateString() : "—"}</small></td>
                  <td style={{ padding: "11px 8px", borderBottom: "1px solid var(--border)" }}>
                    <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                      <button type="button" className="btn btn-ghost" style={{ padding: "6px 8px", minWidth: 34 }} title="Open application details" aria-label="Open application details" onClick={() => setSelected(item)}><Eye size={15} /></button>
                      <button type="button" className="btn btn-ghost" style={{ padding: "6px 8px", minWidth: 34 }} title="View review history" aria-label="View review history" onClick={() => setHistoryFor(item)}><History size={15} /></button>
                      {["submitted", "in_review"].includes(item.status) && canReview && <button type="button" className="btn btn-primary" style={{ padding: "6px 8px", minWidth: 34 }} title="Review application: approve, request correction or reject" aria-label="Review application" onClick={() => { setDecisionFor(item); setDecision("approved"); setDecisionNote(""); }}><ShieldCheck size={15} /></button>}
                      {item.status === "paid" && canActivate && <button type="button" className="btn btn-ghost" style={{ padding: "6px 8px", minWidth: 34 }} title="Activate membership after server-side checks" aria-label="Activate membership" onClick={() => void activate(item)}><Check size={15} /></button>}
                    </div>
                    {queueFeedback?.applicationId === item.id && <div className={queueFeedback.kind === "success" ? "form-success" : "form-error"} role={queueFeedback.kind === "success" ? "status" : "alert"} aria-live="polite" style={{ marginTop: 6 }}>{queueFeedback.message}</div>}
                  </td>
                </tr>)}
                {!visibleRows.length && <tr><td colSpan={6} style={{ padding: 24, textAlign: "center" }} className="muted">{queueError ? "Queue unavailable until the load error is resolved." : "No applications match these filters."}</td></tr>}
              </tbody>
            </table>
          </div>}
        {queueFeedback && !filtered.some(item => item.id === queueFeedback.applicationId) && <div className={queueFeedback.kind === "success" ? "form-success" : "form-error"} role={queueFeedback.kind === "success" ? "status" : "alert"} aria-live="polite">{queueFeedback.message}</div>}
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
          <small className="muted">Showing {filtered.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} matching applications</small>
          <div className="row"><button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}><ChevronLeft size={15} /> Previous</button><span className="muted">Page {page} / {pageCount}</span><button type="button" className="btn btn-ghost" disabled={page >= pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>Next <ChevronRight size={15} /></button></div>
        </div>
      </Card>
    </section>}

    {planModal && <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closePlanModal(); }} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(2,8,23,.72)", display: "grid", placeItems: "center", padding: 16 }}>
      <section role="dialog" aria-modal="true" aria-labelledby="plan-dialog-title" className="card grid" style={{ width: "min(760px, 100%)", maxHeight: "90vh", overflowY: "auto", gap: 14 }}>
        <div className="row" style={{ justifyContent: "space-between" }}><div><div className="eyebrow">Plan setup · Step {planStep} of 4</div><h2 id="plan-dialog-title" className="h2">{editingCode ? "Create a plan version" : "Add a membership plan"}</h2></div><button type="button" className="btn btn-ghost" onClick={closePlanModal} aria-label="Close plan setup"><X size={18} /></button></div>
        <ol className="row" style={{ listStyle: "none", padding: 0, gap: 6, margin: 0 }} aria-label="Plan creation steps">
          {["Identity & fees", "Validity", "Benefits & eligibility", "Review & publish"].map((label, index) => <li key={label} style={{ flex: 1, borderBottom: planStep === index + 1 ? "3px solid var(--primary)" : "1px solid var(--border)", padding: "8px 4px", fontSize: 12, fontWeight: planStep === index + 1 ? 700 : 400 }}><span>{index + 1}. {label}</span></li>)}
        </ol>
        <form className="form-stack" onSubmit={savePlan}>
          {planStep === 1 && <div className="grid grid-2">
            <label>Plan code<input required disabled={!!editingCode} maxLength={40} value={draft.productCode} onChange={event => setDraft({ ...draft, productCode: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} placeholder="REGULAR" /></label>
            <label>Plan name<input required maxLength={120} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="Regular membership" /></label>
            <label>Base fee<input required type="number" min="0" step="0.01" value={draft.amount} onChange={event => setDraft({ ...draft, amount: event.target.value })} /></label>
            <label>Currency<input required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" value={draft.currency} onChange={event => setDraft({ ...draft, currency: event.target.value.toUpperCase() })} /></label>
            <label>Tax amount<input type="number" min="0" step="0.01" value={draft.taxAmount} onChange={event => setDraft({ ...draft, taxAmount: event.target.value })} /></label>
            <label>Service fee<input type="number" min="0" step="0.01" value={draft.serviceFee} onChange={event => setDraft({ ...draft, serviceFee: event.target.value })} /></label>
          </div>}
          {planStep === 2 && <div className="grid grid-2">
            <label>Billing model<select value={draft.billingModel} onChange={event => setDraft({ ...draft, billingModel: event.target.value, durationDays: event.target.value === "lifetime" ? "" : (draft.durationDays || "365"), renewalRequired: event.target.value === "lifetime" ? false : draft.renewalRequired })}><option value="recurring">Recurring</option><option value="one_time">One-time</option><option value="lifetime">Lifetime</option></select></label>
            <label>Validity (days)<input type="number" min="1" max="3650" disabled={draft.billingModel === "lifetime"} required={draft.billingModel !== "lifetime"} value={draft.durationDays} onChange={event => setDraft({ ...draft, durationDays: event.target.value })} /></label>
            <label>Grace period (days)<input type="number" min="0" max="365" value={draft.gracePeriodDays} onChange={event => setDraft({ ...draft, gracePeriodDays: event.target.value })} /></label>
            <label>Fee version effective from<input type="date" required value={draft.effectiveFrom} onChange={event => setDraft({ ...draft, effectiveFrom: event.target.value })} /></label>
            <label>Plan available from<input type="date" value={draft.planEffectiveFrom} onChange={event => setDraft({ ...draft, planEffectiveFrom: event.target.value })} /></label>
            <label>Plan available until<input type="date" value={draft.planEffectiveTo} min={draft.planEffectiveFrom || undefined} onChange={event => setDraft({ ...draft, planEffectiveTo: event.target.value })} /></label>
            <label className="row"><input type="checkbox" checked={draft.renewalRequired} disabled={draft.billingModel === "lifetime"} onChange={event => setDraft({ ...draft, renewalRequired: event.target.checked })} /> Renewal required</label>
            <label className="row"><input type="checkbox" checked={draft.active} onChange={event => setDraft({ ...draft, active: event.target.checked })} /> Available for new applications</label>
          </div>}
          {planStep === 3 && <div className="grid">
            <label>Plan description<textarea rows={3} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} placeholder="Explain who this plan is for." /></label>
            <label>Benefits (one per line)<textarea rows={4} value={draft.benefits} onChange={event => setDraft({ ...draft, benefits: event.target.value })} placeholder={"Member directory access\nProfessional development opportunities"} /></label>
            <label>Eligibility requirements (one per line)<textarea rows={4} value={draft.eligibilityText} onChange={event => setDraft({ ...draft, eligibilityText: event.target.value })} placeholder={"Must be registered in the profession.\nProvide a valid qualification."} /></label>
          </div>}
          {planStep === 4 && <div className="grid">
            <div className="membership-progress"><h3 className="h2">{draft.name || "New membership plan"}</h3><p className="muted">{draft.productCode || "Plan code pending"} · {draft.currency} {Number(draft.amount || 0).toLocaleString()} base + {draft.currency} {Number(draft.taxAmount || 0).toLocaleString()} tax + {draft.currency} {Number(draft.serviceFee || 0).toLocaleString()} service fee</p><p>{readable(draft.billingModel)} · {draft.billingModel === "lifetime" ? "Lifetime validity" : (draft.durationDays || "—") + " days"} · {draft.renewalRequired ? "Renewal required" : "No renewal"} · {draft.active ? "Published for new applications" : "Inactive"}</p><p className="muted">Effective {draft.effectiveFrom}; availability {draft.planEffectiveFrom || "any date"} to {draft.planEffectiveTo || "no end date"}.</p><p>{draft.description || "No description supplied."}</p><small className="muted">{draft.benefits.split("\n").filter(Boolean).length} benefit(s) · {draft.eligibilityText.split("\n").filter(Boolean).length} eligibility requirement(s)</small></div>
          </div>}
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <button type="button" className="btn btn-ghost" disabled={busy === "plan"} onClick={() => planStep === 1 ? closePlanModal() : setPlanStep(value => Math.max(1, value - 1))}>{planStep === 1 ? "Cancel" : "Back"}</button>
            {planStep < 4 ? <button type="button" className="btn btn-primary" onClick={() => {
            const validFees = [draft.amount, draft.taxAmount, draft.serviceFee].every(value => value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0);
            if (planStep === 1 && (!draft.productCode.trim() || !draft.name.trim() || !/^[A-Z]{3}$/.test(draft.currency) || !validFees)) {
              setPlanFeedback({ kind: "error", message: "Complete the plan code, name, three-letter currency and valid non-negative fee amounts before continuing." });
              return;
            }
            if (planStep === 2 && (!draft.effectiveFrom || (draft.billingModel !== "lifetime" && (!draft.durationDays || Number(draft.durationDays) < 1)) || (draft.planEffectiveFrom && draft.planEffectiveTo && draft.planEffectiveTo < draft.planEffectiveFrom))) {
              setPlanFeedback({ kind: "error", message: "Check the validity dates, duration and billing settings before continuing." });
              return;
            }
            setPlanFeedback(null);
            setPlanStep(value => Math.min(4, value + 1));
          }}>Continue <ChevronRight size={16} /></button> :
              planFeedback?.kind === "success" ? <button type="button" className="btn btn-primary" onClick={closePlanModal}>Done</button> :
              <button type="submit" className="btn btn-primary" disabled={busy === "plan"}>{busy === "plan" ? "Creating…" : editingCode ? "Save plan version" : "Create membership plan"}</button>}
          </div>
          {planFeedback && <div className={planFeedback.kind === "success" ? "form-success" : "form-error"} role={planFeedback.kind === "success" ? "status" : "alert"} aria-live="polite">{planFeedback.message}</div>}
        </form>
      </section>
    </div>}

    {selected && <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(2,8,23,.72)", display: "grid", placeItems: "center", padding: 16 }}>
      <section role="dialog" aria-modal="true" aria-labelledby="application-details-title" className="card grid" style={{ width: "min(820px, 100%)", maxHeight: "90vh", overflowY: "auto" }}>
        <div className="row" style={{ justifyContent: "space-between" }}><div><div className="eyebrow">Application record</div><h2 id="application-details-title" className="h2">{selected.tracking_reference || "Membership application"}</h2></div><button type="button" className="btn btn-ghost" onClick={() => setSelected(null)} aria-label="Close application details"><X size={18} /></button></div>
        <div className="grid grid-2">
          <p><small className="muted">Applicant</small><br /><strong>{selected.display_name || selected.data_snapshot?.professionalDetails?.fullName || "Not supplied"}</strong><br /><small>{selected.email || "Email unavailable"}</small></p>
          <p><small className="muted">Application status</small><br /><Badge tone={statusTone(selected.status)}>{readable(selected.status)}</Badge></p>
          <p><small className="muted">Plan terms at application</small><br /><strong>{money(selected.fee_snapshot?.amount ?? 0, selected.fee_snapshot?.currency || "ETB")}</strong><br /><small>{selected.fee_snapshot?.productName || selected.fee_snapshot?.productCode || "Plan"} · fee version {selected.fee_snapshot?.feeRuleVersion ?? "legacy"}</small></p>
          <p><small className="muted">Submitted</small><br /><strong>{selected.submitted_at || selected.created_at ? new Date(String(selected.submitted_at || selected.created_at)).toLocaleString() : "Not recorded"}</strong></p>
        </div>
        {selected.application_type === "renewal" && <p className="muted">Renewal · current membership ends {selected.previous_membership_end_date || "date not recorded"}. Do not interrupt the current membership period.</p>}
        <div className="membership-progress"><h3 className="h2">Payment reconciliation</h3>{selected.payment ? <><p>{selected.payment.currency} {selected.payment.amount} · {readable(selected.payment.status)} · {selected.payment.channel}</p><p className="muted">Transaction {selected.payment.id} · Reference {selected.payment.reference || "not supplied"} · Reconciliation {selected.payment.reconciliation_status || "not recorded"}</p><p className="muted">Payment verified {selected.payment.verified_at ? new Date(selected.payment.verified_at).toLocaleString() : "not recorded"}{selected.payment.verified_by_name ? " by " + selected.payment.verified_by_name : ""}</p><p className="muted">Reconciliation {selected.payment.reconciliation_status || "not recorded"}{selected.payment.reconciled_by_name ? " · completed by " + selected.payment.reconciled_by_name : ""}{selected.payment.reconciled_at ? " · " + new Date(selected.payment.reconciled_at).toLocaleString() : ""}</p>{selected.payment.verification_note && <p><strong>Finance / reviewer note:</strong> {selected.payment.verification_note}</p>}{selected.payment.reconciliation_note && <p className="muted">Reconciliation note: {selected.payment.reconciliation_note}</p>}{selected.payment.reversal && <p className="form-error">Reversed / refunded: {selected.payment.reversal.type} · {selected.payment.reversal.reason}</p>}</> : <p className="muted">No payment is attached to this application.</p>}</div>
        <div><h3 className="h2">Submitted evidence</h3>{selected.attachments?.length ? selected.attachments.map(file => <div key={file.id} className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", padding: "7px 0", borderBottom: "1px solid var(--border)" }}><span><FileText size={15} /> {file.fileName} · {readable(file.attachmentType)}</span><button type="button" className="btn btn-ghost" disabled={busy === "evidence"} onClick={() => void previewAttachment(file.fileObjectId, file.fileName)}><Eye size={15} /> Preview</button></div>) : <p className="muted">No application attachments were submitted.</p>}</div>
        <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn btn-ghost" onClick={() => { setHistoryFor(selected); setSelected(null); }}><History size={15} /> Review history</button><button type="button" className="btn btn-primary" onClick={() => setSelected(null)}>Close</button></div>
      </section>
    </div>}

    {historyFor && <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setHistoryFor(null); }} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(2,8,23,.72)", display: "grid", placeItems: "center", padding: 16 }}>
      <section role="dialog" aria-modal="true" aria-labelledby="review-history-title" className="card grid" style={{ width: "min(620px, 100%)", maxHeight: "85vh", overflowY: "auto" }}>
        <div className="row" style={{ justifyContent: "space-between" }}><div><div className="eyebrow">Audit trail</div><h2 id="review-history-title" className="h2">Review history · {historyFor.tracking_reference || "Application"}</h2></div><button type="button" className="btn btn-ghost" onClick={() => setHistoryFor(null)} aria-label="Close review history"><X size={18} /></button></div>
        {historyFor.review_history?.length ? <ol className="grid" style={{ gap: 12, paddingLeft: 22 }}>{historyFor.review_history.map((entry, index) => <li key={historyFor.id + "-" + index}><strong>{readable(entry.decision)}</strong><small className="muted" style={{ display: "block" }}>{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "Time unavailable"}{entry.actorName ? " · " + entry.actorName : ""}</small>{entry.note && <p>{entry.note}</p>}</li>)}</ol> : <p className="muted">No review history is available for this application.</p>}
      </section>
    </div>}

    {decisionFor && <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setDecisionFor(null); }} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(2,8,23,.72)", display: "grid", placeItems: "center", padding: 16 }}>
      <section role="dialog" aria-modal="true" aria-labelledby="decision-title" className="card grid" style={{ width: "min(520px, 100%)" }}>
        <div className="row" style={{ justifyContent: "space-between" }}><h2 id="decision-title" className="h2">Review {decisionFor.tracking_reference || "application"}</h2><button type="button" className="btn btn-ghost" onClick={() => setDecisionFor(null)} aria-label="Close review decision"><X size={18} /></button></div>
        <label>Decision<select value={decision} onChange={event => setDecision(event.target.value as typeof decision)}><option value="approved">Approve application</option><option value="correction_required">Request correction</option><option value="rejected">Reject application</option></select></label>
        <label>Reviewer note<textarea rows={4} required value={decisionNote} onChange={event => setDecisionNote(event.target.value)} placeholder="Record a clear reason and any action the applicant must take." /></label>
        <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn btn-ghost" onClick={() => setDecisionFor(null)}>Cancel</button><button type="button" className="btn btn-primary" disabled={!decisionNote.trim() || busy === "decision:" + decisionFor.id} onClick={() => void recordDecision()}>{busy === "decision:" + decisionFor.id ? "Saving…" : "Confirm decision"}</button></div>
      </section>
    </div>}

    {evidence && <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeEvidence(); }} style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(2,8,23,.82)", display: "grid", placeItems: "center", padding: 16 }}>
      <section role="dialog" aria-modal="true" aria-labelledby="evidence-title" className="card grid" style={{ width: "min(1100px, 100%)", height: "min(88vh, 850px)", gridTemplateRows: "auto 1fr auto", overflow: "hidden" }}>
        <div className="row" style={{ justifyContent: "space-between" }}><div><div className="eyebrow">Private attachment · authorized access</div><h2 id="evidence-title" className="h2">{evidence.name}</h2></div><button type="button" className="btn btn-ghost" onClick={closeEvidence} aria-label="Close evidence preview"><X size={18} /></button></div>
        {evidence.type.startsWith("image/") ? <div style={{ overflow: "auto", display: "grid", placeItems: "center", background: "var(--surface)" }}><img src={evidence.url} alt={"Evidence preview: " + evidence.name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /></div> : <iframe title={"PDF evidence preview: " + evidence.name} src={evidence.url} style={{ width: "100%", height: "100%", border: "1px solid var(--border)", borderRadius: 8 }} />}
        <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn btn-ghost" onClick={downloadEvidence}><Download size={15} /> Download</button><button type="button" className="btn btn-primary" onClick={closeEvidence}>Close preview</button></div>
      </section>
    </div>}
  </div>;
}
