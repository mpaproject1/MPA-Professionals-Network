"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FormFeedback } from "../../../components/form-feedback";
import { Badge, Card } from "../../../components/ui";
import { ApiError, api } from "../../../lib/api";
import { useUiStore } from "../../../lib/store";

type CaseType = "service" | "mentorship" | "organization_mentorship" | "all";
type CaseSummary = {
  case_type: "service" | "mentorship" | "organization_mentorship";
  id: string;
  status: string;
  created_at: string;
  case_title: string;
  participant_one_name?: string | null;
  participant_two_name?: string | null;
  organization_name?: string | null;
};
type MembershipRecord = {
  membershipNumber?: string | null;
  status?: string;
  startDate?: string | null;
  endDate?: string | null;
  productName?: string | null;
};
type Participant = {
  role: string;
  organizationRole?: string;
  userId: string;
  accountReference?: string | null;
  email?: string | null;
  accountStatus?: string;
  accountCreatedAt?: string;
  person?: {
    firstName?: string | null;
    middleName?: string | null;
    lastName?: string | null;
    displayName?: string | null;
    phone?: string | null;
  } | null;
  professionalProfile?: {
    headline?: string | null;
    bio?: string | null;
    educationSummary?: string | null;
    qualifications?: string | null;
    skills?: unknown;
    languages?: unknown;
    certifications?: unknown;
    portfolioUrl?: string | null;
  } | null;
  membershipRecords: MembershipRecord[];
};
type CaseDetails = {
  caseType: "service" | "mentorship" | "organization_mentorship";
  caseId: string;
  caseRecord: Record<string, unknown>;
  participants: Participant[];
  history: Record<string, unknown>;
  accessReason: string;
  accessedAt: string;
};

function displayList(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(", ") || "Not recorded";
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).join(", ") || "Not recorded";
    } catch {
      return value || "Not recorded";
    }
    return value || "Not recorded";
  }
  return "Not recorded";
}

function fullName(person?: Participant["person"]): string {
  if (!person) return "Participant profile unavailable";
  return person.displayName || [person.firstName, person.middleName, person.lastName].filter(Boolean).join(" ") || "Name not recorded";
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2) || "No records returned.";
}

export default function ServiceMentorshipSupportCasesPage() {
  const token = useUiStore((state) => state.token);
  const hydrateToken = useUiStore((state) => state.hydrateToken);
  const [caseType, setCaseType] = useState<CaseType>("all");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<CaseSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({});
  const [openingId, setOpeningId] = useState("");
  const [details, setDetails] = useState<CaseDetails | null>(null);

  const load = useCallback(async (nextOffset = offset, nextSearch = appliedSearch) => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ type: caseType, limit: "25", offset: String(nextOffset) });
      if (status) params.set("status", status);
      if (nextSearch.trim()) params.set("q", nextSearch.trim());
      const result = await api<{ items: CaseSummary[]; totalCount: number }>(
        "/api/v1/admin/service-mentorship-cases?" + params.toString(),
        {},
        token,
      );
      setItems(Array.isArray(result.items) ? result.items : []);
      setTotalCount(Number(result.totalCount) || 0);
    } catch (cause) {
      setItems([]);
      setTotalCount(0);
      setError(cause instanceof ApiError ? cause.message : "The restricted case index could not be confirmed.");
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, caseType, offset, status, token]);

  useEffect(() => { hydrateToken(); }, [hydrateToken]);
  useEffect(() => { if (token) void load(); }, [load, token]);

  async function openCase(item: CaseSummary) {
    const reason = (reasonDrafts[item.id] || "").trim();
    if (reason.length < 8) {
      setError("Enter a clear access reason of at least eight characters before opening participant details.");
      return;
    }
    setOpeningId(item.id);
    setError("");
    setNotice("");
    try {
      const result = await api<CaseDetails>(
        "/api/v1/admin/service-mentorship-cases/" + item.case_type + "/" + encodeURIComponent(item.id) + "/access",
        { method: "POST", body: JSON.stringify({ reason }) },
        token,
      );
      setDetails(result);
      setNotice("Restricted participant details opened. This access has been recorded in the audit history.");
    } catch (cause) {
      setDetails(null);
      setError(cause instanceof ApiError ? cause.message : "The participant record could not be opened. No access is assumed until the service confirms it.");
    } finally {
      setOpeningId("");
    }
  }

  return (
    <main className="page-shell" style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 18px" }}>
      <Link className="text-link" href="/admin">← Back to administration</Link>
      <div className="eyebrow" style={{ marginTop: 16 }}>MPA Support Desk · Restricted case access</div>
      <h1 className="h1">Service and mentorship participant records</h1>
      <p className="muted">Search for a specific service request or mentorship relationship. Full participant contact and professional information is revealed only after an authorized Support Desk or system administrator opens that exact case with a recorded reason. Service providers and mentors continue to receive scoped workflow information and aggregate reports without participant email or phone details.</p>
      {error && <FormFeedback kind="error" message={error} onRetry={() => void load()} retryLabel="Retry case search" />}
      {notice && <FormFeedback kind="success" message={notice} />}
      {!token ? (
        <Card>
          <p>Sign in with an authorized MPA Support Desk or system administrator account.</p>
          <Link className="btn btn-primary" href="/login?next=/admin/service-mentorship-cases">Sign in</Link>
        </Card>
      ) : (
        <Card>
          <form className="grid grid-2" style={{ gap: 12 }} onSubmit={(event) => { event.preventDefault(); setOffset(0); setAppliedSearch(search.trim()); void load(0, search.trim()); }}>
            <label>Case type
              <select value={caseType} onChange={(event) => { setCaseType(event.target.value as CaseType); setOffset(0); setDetails(null); }}>
                <option value="all">Services and mentorship</option>
                <option value="service">Service requests</option>
                <option value="mentorship">Individual mentorship relationships</option>
                <option value="organization_mentorship">Organization mentorship programmes</option>
              </select>
            </label>
            <label>Case status
              <select value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0); setDetails(null); }}>
                <option value="">All statuses</option>
                {["draft", "requested", "accepted", "in_progress", "active", "paused", "completed", "disputed", "declined", "cancelled"].map((value) => (
                  <option key={value} value={value}>{value.replaceAll("_", " ")}</option>
                ))}
              </select>
            </label>
            <label style={{ gridColumn: "1 / -1" }}>Search case reference, service/programme or participant name
              <input value={search} onChange={(event) => setSearch(event.target.value)} maxLength={120} placeholder="Paste a case reference or enter a participant name" />
            </label>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? "Searching…" : "Search cases"}</button>
              <button className="btn btn-ghost" type="button" disabled={loading} onClick={() => { setCaseType("all"); setStatus(""); setSearch(""); setAppliedSearch(""); setOffset(0); setDetails(null); }}>Clear filters</button>
            </div>
          </form>
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", marginTop: 16 }}>
            <b>{loading ? "Refreshing case index…" : totalCount + " matching case(s)"}</b>
            <button className="btn btn-ghost" type="button" disabled={loading} onClick={() => void load()}>Refresh</button>
          </div>
          {!loading && items.length === 0 && !error && <p className="muted">No cases matched the selected filters. A failed load is never presented as an empty result.</p>}
          <div className="grid" style={{ gap: 10, marginTop: 12 }}>
            {items.map((item) => (
              <section className="case-row" key={item.case_type + ":" + item.id}>
                <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <strong>{item.case_title}</strong>
                  <Badge>{item.status.replaceAll("_", " ")}</Badge>
                </div>
                <p>{item.participant_one_name || "Participant"} · {item.participant_two_name || "Participant"}{item.organization_name ? " · " + item.organization_name : ""}</p>
                <p className="muted">{item.case_type === "service" ? "Service request" : item.case_type === "mentorship" ? "Individual mentorship relationship" : "Organization mentorship request"} · {item.id} · {new Date(item.created_at).toLocaleString()}</p>
                <label>Reason for accessing this specific case
                  <textarea rows={2} minLength={8} maxLength={500} value={reasonDrafts[item.id] || ""} onChange={(event) => setReasonDrafts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="For example: verify a participant identity to resolve the reported service-delivery concern." />
                </label>
                <button className="btn btn-primary" type="button" disabled={openingId === item.id} onClick={() => void openCase(item)}>
                  {openingId === item.id ? "Opening restricted record…" : "Open participant details"}
                </button>
              </section>
            ))}
          </div>
          {totalCount > 25 && <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
            <span className="muted">Showing {offset + 1}–{Math.min(offset + items.length, totalCount)} of {totalCount}</span>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-ghost" type="button" disabled={loading || offset === 0} onClick={() => setOffset((current) => Math.max(0, current - 25))}>Previous</button>
              <button className="btn btn-ghost" type="button" disabled={loading || offset + items.length >= totalCount} onClick={() => setOffset((current) => current + 25)}>Next</button>
            </div>
          </div>}
        </Card>
      )}
      {details && (
        <Card>
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div className="eyebrow">Restricted case record</div>
              <h2 className="h2">{details.caseType === "service" ? "Service request" : details.caseType === "mentorship" ? "Individual mentorship relationship" : "Organization mentorship request"}</h2>
              <p className="muted">Reference: {details.caseId} · Opened {new Date(details.accessedAt).toLocaleString()}</p>
            </div>
            <Badge>Access audited</Badge>
          </div>
          <p className="muted">Access reason: {details.accessReason}</p>
          <h3 className="h2">Participants and contact details</h3>
          <p className="muted">This case-specific view is restricted to MPA Support Desk and system administrators. Do not copy participant contact information into provider reports or public records.</p>
          <div className="grid grid-2" style={{ gap: 12 }}>
            {details.participants.map((participant) => (
              <section className="case-row" key={participant.role + ":" + participant.userId} style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                  <strong>{participant.role.replaceAll("_", " ")}{participant.organizationRole ? " · " + participant.organizationRole.replaceAll("_", " ") : ""}</strong>
                  <Badge>{participant.accountStatus || "account status unavailable"}</Badge>
                </div>
                <h4 className="h2">{fullName(participant.person)}</h4>
                <p><b>Account reference:</b> {participant.accountReference || "Not recorded"}</p>
                <p><b>Email:</b> {participant.email ? <a href={"mailto:" + participant.email}>{participant.email}</a> : "Not recorded"}</p>
                <p><b>Phone:</b> {participant.person?.phone ? <a href={"tel:" + participant.person.phone}>{participant.person.phone}</a> : "Not recorded"}</p>
                <p><b>Membership history:</b></p>
                {participant.membershipRecords.length === 0 ? <p className="muted">No membership records returned.</p> : participant.membershipRecords.map((membership, index) => (
                  <p className="muted" key={membership.membershipNumber || String(index)}>
                    {membership.productName || "Membership"} · {membership.membershipNumber || "No number"} · {membership.status || "Unknown"} · {membership.startDate ? new Date(membership.startDate).toLocaleDateString() : "Start not recorded"} – {membership.endDate ? new Date(membership.endDate).toLocaleDateString() : "No end date"}
                  </p>
                ))}
                {participant.professionalProfile && (
                  <div>
                    <b>Professional profile</b>
                    <p>{participant.professionalProfile.headline || "Headline not recorded"}</p>
                    {participant.professionalProfile.bio && <p className="muted">{participant.professionalProfile.bio}</p>}
                    <p className="muted">Education: {participant.professionalProfile.educationSummary || "Not recorded"} · Qualifications: {participant.professionalProfile.qualifications || "Not recorded"}</p>
                    <p className="muted">Skills: {displayList(participant.professionalProfile.skills)} · Languages: {displayList(participant.professionalProfile.languages)} · Certifications: {displayList(participant.professionalProfile.certifications)}</p>
                    {participant.professionalProfile.portfolioUrl && <p><a href={participant.professionalProfile.portfolioUrl} target="_blank" rel="noopener noreferrer">Open portfolio</a></p>}
                  </div>
                )}
              </section>
            ))}
          </div>
          <details style={{ marginTop: 16 }}>
            <summary className="text-link">Full case record and authorized workflow history</summary>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 560, overflow: "auto" }}>{pretty({ caseRecord: details.caseRecord, history: details.history })}</pre>
          </details>
          <button className="btn btn-ghost" type="button" style={{ marginTop: 12 }} onClick={() => setDetails(null)}>Close restricted details</button>
        </Card>
      )}
    </main>
  );
}
