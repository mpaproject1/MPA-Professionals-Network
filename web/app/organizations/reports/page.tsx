"use client";

import { FileText, Printer } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { FormFeedback } from "../../../components/form-feedback";
import { OperationStatus } from "../../../components/operation-status";
import { Badge, Card } from "../../../components/ui";
import { ApiError, api } from "../../../lib/api";
import { useUiStore } from "../../../lib/store";

type Organization = {
  id: string;
  legal_name: string;
  display_name: string;
  verification_status?: string;
  role_code?: string;
};
type OutcomeJob = {
  id: string;
  title: string;
  status: string;
  posting_scope?: string;
  applications: number;
  active_pipeline: number;
  offers: number;
  accepted_offers: number;
  hires: number;
  scheduled_interviews: number;
};
type Requisition = {
  id: string;
  title: string;
  status: string;
  headcount?: number;
  published_jobs: number;
};
type OrganizationOutcomes = {
  jobs: OutcomeJob[];
  requisitions: Requisition[];
};

function total(rows: OutcomeJob[], field: keyof Pick<OutcomeJob, "applications" | "active_pipeline" | "offers" | "accepted_offers" | "hires" | "scheduled_interviews">) {
  return rows.reduce((sum, row) => sum + (Number.isFinite(row[field]) ? Number(row[field]) : 0), 0);
}

export default function OrganizationReportsPage() {
  const token = useUiStore(s => s.token);
  const hydrated = useUiStore(s => s.hydrated);
  const hydrateToken = useUiStore(s => s.hydrateToken);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [outcomes, setOutcomes] = useState<OrganizationOutcomes | null>(null);
  const [loadingOrganizations, setLoadingOrganizations] = useState(false);
  const [loadingOutcomes, setLoadingOutcomes] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => { hydrateToken(); }, [hydrateToken]);

  const loadOrganizations = useCallback(async () => {
    if (!token) {
      setOrganizations([]);
      setOrganizationId("");
      setOutcomes(null);
      return;
    }
    setLoadingOrganizations(true);
    setError("");
    try {
      const rows = await api<Organization[]>("/api/v1/organizations", {}, token);
      const list = Array.isArray(rows) ? rows : [];
      setOrganizations(list);
      const requestedId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("organizationId") || "" : "";
      setOrganizationId(current => current && list.some(org => org.id === current)
        ? current
        : requestedId && list.some(org => org.id === requestedId)
          ? requestedId
          : (list.find(org => org.verification_status === "verified") || list[0])?.id || "");
    } catch (cause) {
      setOrganizations([]);
      setOrganizationId("");
      setOutcomes(null);
      setError(cause instanceof ApiError ? cause.message : "Your organization list could not be confirmed.");
    } finally {
      setLoadingOrganizations(false);
    }
  }, [token]);

  useEffect(() => {
    if (hydrated && token) void loadOrganizations();
    if (hydrated && !token) {
      setOrganizations([]);
      setOutcomes(null);
    }
  }, [hydrated, token, loadOrganizations]);

  const loadOutcomes = useCallback(async () => {
    if (!token || !organizationId) {
      setOutcomes(null);
      return;
    }
    setLoadingOutcomes(true);
    setError("");
    setNotice("");
    setOutcomes(null);
    try {
      const data = await api<OrganizationOutcomes>(
        `/api/v1/organizations/${encodeURIComponent(organizationId)}/outcomes`,
        {},
        token,
      );
      if (!data || !Array.isArray(data.jobs) || !Array.isArray(data.requisitions)) {
        throw new Error("The outcome service returned an incomplete report. No summary has been shown.");
      }
      setOutcomes(data);
    } catch (cause) {
      setError(cause instanceof ApiError || cause instanceof Error
        ? cause.message || "Organization outcomes could not be loaded."
        : "Organization outcomes could not be loaded.");
    } finally {
      setLoadingOutcomes(false);
    }
  }, [token, organizationId]);

  useEffect(() => {
    if (hydrated && token && organizationId) void loadOutcomes();
  }, [hydrated, token, organizationId, loadOutcomes]);

  const selected = organizations.find(org => org.id === organizationId);

  if (!hydrated) return <div className="grid" style={{ gap: 16 }}><h1 className="h1">Impact & outcomes</h1><Card><OperationStatus state="loading" title="Preparing organization report" detail="Checking your session before requesting organization-scoped outcome data." /></Card></div>;
  if (!token) return <div className="grid" style={{ gap: 16 }}><h1 className="h1">Impact & outcomes</h1><Card><p>Sign in with an active organization account to view private organization outcomes.</p><a className="btn btn-primary" href="/login?next=/organizations/reports">Sign in</a></Card></div>;

  return <div className="grid" style={{ gap: 16, minWidth: 0 }}>
    <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
      <div>
        <div className="eyebrow">Organization workspace · Governance</div>
        <h1 className="h1">Impact & outcome report</h1>
        <p className="muted">A scoped summary of recruitment and requisition records returned by the organization outcomes service. Figures are not inferred from sample data.</p>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <a className="btn btn-ghost" href="/organizations">Organization workspace</a>
        <button className="btn btn-primary" type="button" onClick={() => { setNotice("Use your browser's print dialog and choose Save as PDF to export this currently loaded report."); window.print(); }} disabled={!outcomes || loadingOutcomes}><Printer size={16} aria-hidden="true" /> Print / Save as PDF</button>
      </div>
    </div>
    {error && <FormFeedback kind="error" message={error} />}
    {notice && <FormFeedback kind="success" message={notice} />}
    <Card>
      <div className="row" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <label style={{ flex: "1 1 280px" }}>Organization
          <select value={organizationId} onChange={event => setOrganizationId(event.target.value)} disabled={loadingOrganizations || loadingOutcomes || organizations.length === 0}>
            <option value="">Choose an organization</option>
            {organizations.map(org => <option key={org.id} value={org.id}>{org.display_name} — {org.legal_name}</option>)}
          </select>
        </label>
        
      </div>
      {selected && <p className="muted" style={{ marginTop: 10 }}>{selected.legal_name} · Workspace role: {selected.role_code || "organization member"} · Verification: {selected.verification_status || "unverified"}</p>}
      {loadingOrganizations && <OperationStatus state="loading" title="Loading your organizations" detail="The server is resolving organizations linked to your authenticated account." />}
      {!loadingOrganizations && organizations.length === 0 && !error && <p className="muted">No organization is linked to this account. Register an organization before requesting its report.</p>}
      {loadingOutcomes && <OperationStatus state="loading" title="Loading verified outcome data" detail="Recruitment and requisition records are being fetched for the selected organization. No totals are displayed until the response is complete." />}
      {!loadingOutcomes && !outcomes && !error && organizationId && <p className="muted">No report data has been confirmed yet. The report remains unavailable until a complete response is received.</p>}
    </Card>
    {outcomes && selected && <>
      <div className="grid grid-2" style={{ gap: 12 }}>
        {[
          { label: "Published vacancies", value: outcomes.jobs.filter(job => job.status === "published").length },
          { label: "Applications received", value: total(outcomes.jobs, "applications") },
          { label: "Active recruitment pipeline", value: total(outcomes.jobs, "active_pipeline") },
          { label: "Offers issued", value: total(outcomes.jobs, "offers") },
          { label: "Accepted offers", value: total(outcomes.jobs, "accepted_offers") },
          { label: "Recorded hires", value: total(outcomes.jobs, "hires") },
          { label: "Scheduled interviews", value: total(outcomes.jobs, "scheduled_interviews") },
          { label: "Requisitions", value: outcomes.requisitions.length },
        ].map(metric => <Card key={metric.label}><span className="muted">{metric.label}</span><div className="h1" style={{ marginTop: 8 }}>{metric.value.toLocaleString()}</div><small className="muted">Returned for the selected organization</small></Card>)}
      </div>
      <Card>
        <div className="row" style={{ gap: 10 }}>
          <FileText color="var(--primary)" />
          <div><h2 className="h2">Recruitment outcomes</h2><p className="muted">Counts are grouped by job and returned by the server.</p></div>
        </div>
        {outcomes.jobs.length ? <div className="grid" style={{ gap: 10, marginTop: 12 }}>
          {outcomes.jobs.map(job => <article className="case-row" key={job.id}>
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <strong>{job.title}</strong><Badge>{job.status.replaceAll("_", " ")}</Badge>
            </div>
            <p className="muted">Scope: {(job.posting_scope || "not recorded").replaceAll("_", " ")} · Applications: {job.applications} · Active pipeline: {job.active_pipeline} · Offers: {job.offers} · Accepted: {job.accepted_offers} · Hires: {job.hires} · Scheduled interviews: {job.scheduled_interviews}</p>
          </article>)}
        </div> : <p className="muted">The server returned no job records for this organization.</p>}
      </Card>
      <Card>
        <h2 className="h2">Requisition register</h2>
        {outcomes.requisitions.length ? <div className="grid" style={{ gap: 10, marginTop: 12 }}>
          {outcomes.requisitions.map(item => <article className="case-row" key={item.id}>
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}><strong>{item.title}</strong><Badge>{item.status.replaceAll("_", " ")}</Badge></div>
            <p className="muted">Requested headcount: {item.headcount ?? "Not recorded"} · Published jobs linked: {item.published_jobs}</p>
          </article>)}
        </div> : <p className="muted">The server returned no requisition records for this organization.</p>}
      </Card>
      <Card>
        <h2 className="h2">Report scope and limitations</h2>
        <p className="muted">This report includes recruitment and requisition records only. The current organization outcome API does not provide verified community funding, services delivered, or volunteer hours, so those figures are intentionally omitted. The PDF option uses the browser print dialog for the currently loaded report; it is not a signed server-generated audit artifact.</p>
      </Card>
    </>}
  </div>;
}
