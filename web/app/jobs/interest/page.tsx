"use client";
import { type FormEvent, useState } from "react";
import { FormFeedback } from "../../../components/form-feedback";
import { TagInput } from "../../../components/tag-input";
import { Badge, Card } from "../../../components/ui";
import { ApiError, api } from "../../../lib/api";
import { humanStatus } from "../../../lib/status-labels";

type Inquiry = { id: string; public_reference: string; continuationToken: string; status?: string; nextStep?: string; nextAction?: string };
function createSubmissionKey(): string { if(typeof crypto==="undefined"||typeof crypto.randomUUID!=="function") throw new Error("Secure submission is unavailable in this browser. Please reload and try again."); return crypto.randomUUID()+crypto.randomUUID(); }
function getPublicReference(value: Inquiry | null): string | null { return value?.public_reference ?? null; }
type ConsentResult = { employer_sharing_consent: boolean; status?: string; nextStep?: string };
type ShareHistory = { shareId: string; organizationName: string; sharedFields: string[]; sharedAt: string; revokedAt?: string | null; status: string };
type SharingOrganization = { id: string; display_name?: string | null; legal_name?: string | null };

function labelsForHistory(field: string) { return ({ targetRole: "Target role", skills: "Skills", experience: "Experience", location: "Location", workMode: "Work mode", availability: "Availability", professionalSummary: "Professional summary", education: "Education", intent: "Applicant introduction", contactName: "Name", contactEmail: "Email address", contactPhone: "Phone number" } as Record<string,string>)[field] || field; }

const shareable = [
  ["targetRole", "Target role"],
  ["skills", "Skills"],
  ["experience", "Experience summary"],
  ["location", "Preferred location"],
  ["availability", "Availability"],
  ["contactEmail", "Email address (optional contact sharing)"],
  ["contactPhone", "Phone number (optional contact sharing)"],
] as const;

export default function JobInterestPage() {
  const [form, setForm] = useState({ contactName: "", contactEmail: "", contactPhone: "", targetRole: "", experience: "", location: "", workMode: "", availability: "", intent: "" });
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [lookupReference, setLookupReference] = useState("");
  const [lookupToken, setLookupToken] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [processingConsent, setProcessingConsent] = useState(false);
  const [shareFields, setShareFields] = useState<string[]>(["targetRole", "skills"]);
  const [sharingOrganizations, setSharingOrganizations] = useState<SharingOrganization[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [sharingOrganizationsLoading, setSharingOrganizationsLoading] = useState(false);
  const [sharingOrganizationsError, setSharingOrganizationsError] = useState("");
  const [organizationSearch, setOrganizationSearch] = useState("");
  const [consentToProcess, setConsentToProcess] = useState(false);
  const [shareWithEmployers, setShareWithEmployers] = useState(false);
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [consentSaved, setConsentSaved] = useState(false);
  const [sharingHistory, setSharingHistory] = useState<ShareHistory[]>([]);
  const [sharingHistoryError, setSharingHistoryError] = useState("");
  const [sharingHistoryLoading, setSharingHistoryLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submissionUncertain,setSubmissionUncertain] = useState(false);
  const [requestIdempotencyKey,setRequestIdempotencyKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function update(key: keyof typeof form, value: string) { setForm(current => ({ ...current, [key]: value })); }
  async function searchSharingOrganizations() {
    const term = organizationSearch.trim();
    if (term.length < 3) {
      setSharingOrganizations([]);
      setSelectedOrganizationId("");
      setSharingOrganizationsError("Enter at least 3 characters of an organization name to search.");
      return;
    }
    setSharingOrganizationsLoading(true);
    setSharingOrganizationsError("");
    setSharingOrganizations([]);
    setSelectedOrganizationId("");
    try {
      const rows = await api<SharingOrganization[]>(`/api/v1/public/opportunity-sharing-organizations?q=${encodeURIComponent(term)}`);
      if (!Array.isArray(rows)) throw new Error("The organization search returned an unexpected response.");
      setSharingOrganizations(rows);
    } catch (e) {
      setSharingOrganizationsError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Verified organizations could not be searched. Retry before saving consent.");
    } finally {
      setSharingOrganizationsLoading(false);
    }
  }
  function toggleField(field: string, checked: boolean) {
    setShareFields(current => checked ? [...new Set([...current, field])] : current.filter(item => item !== field));
  }
  async function refreshSharingHistory(item: Inquiry) {
    if (sharingHistoryLoading) return;
    setSharingHistoryLoading(true);
    setSharingHistoryError("");
    try {
      const rows = await api<ShareHistory[]>(`/api/v1/public/opportunity-inquiries/${encodeURIComponent(item.public_reference)}/sharing-history`, { method: "POST", body: JSON.stringify({ token: item.continuationToken }) });
      setSharingHistory(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setSharingHistoryError(e instanceof ApiError ? e.message : "Sharing history could not be loaded. Retry without resubmitting your request.");
    } finally {
      setSharingHistoryLoading(false);
    }
  }

  async function loadExistingRequest(event: FormEvent) {
    event.preventDefault(); setLookupBusy(true); setError(""); setNotice("");
    try {
      const record = await api<any>(`/api/v1/public/opportunity-inquiries/${encodeURIComponent(lookupReference.trim())}/access`, { method: "POST", body: JSON.stringify({ token: lookupToken.trim() }) });
      if (record.inquiryType !== "job" || record.jobTitle) throw new Error("This reference is not a no-vacancy job-interest request.");
      const recovered: Inquiry = { id: "", public_reference: record.reference, continuationToken: lookupToken.trim(), nextStep: record.nextStep };
      setInquiry(recovered);
      const fields = Array.isArray(record.employerSharingFields) ? record.employerSharingFields : [];
      setShareFields(fields.length ? fields : ["targetRole", "skills"]);
      setShareWithEmployers(record.employerSharingConsent === true);
      setSelectedOrganizationId(record.employerSharingOrganizationId || "");
      setConsentSaved(record.employerSharingConsent === true && !record.employerSharingRevokedAt);
      setNotice("Your request was recovered. Check the sharing status and history below.");
      await refreshSharingHistory(recovered);
    } catch (e) { setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "We couldn't recover this request. Check the reference and private token."); }
    finally { setLookupBusy(false); }
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if(busy||inquiry)return;
    setBusy(true);setError("");setNotice("");
    try {
      const key=requestIdempotencyKey||createSubmissionKey();setRequestIdempotencyKey(key);
      const created = await api<Inquiry>("/api/v1/public/opportunity-inquiries", {
        method: "POST",
        headers: {"X-Idempotency-Key":key},
        body: JSON.stringify({
          inquiryType: "job",
          contactName: form.contactName.trim(),
          contactEmail: form.contactEmail.trim() || null,
          contactPhone: form.contactPhone.trim() || null,
          targetRole: form.targetRole.trim(),
          skills: selectedSkills,
          experience: form.experience.trim(),
          location: form.location.trim(),
          workMode: form.workMode.trim(),
          availability: form.availability.trim(),
          intent: form.intent.trim() || "I would like to be considered for relevant opportunities even when no matching vacancy is currently listed.",
          consent: consentToProcess
        })
      });
      setSubmissionUncertain(false);setRequestIdempotencyKey("");
      setInquiry(created);
      const statusMessage="Job-interest request status: "+humanStatus(created.status||"received")+". "+(created.nextStep||created.nextAction||"Your request is recorded and awaits Support Desk review.");
      void refreshSharingHistory(created);
      if (shareWithEmployers) {
        if (!selectedOrganizationId) {
          setNotice(statusMessage+" Select a verified organization before saving named-employer consent.");
          setError("Choose the specific verified organization you authorize. No employer sharing is enabled yet.");
          setBusy(false);
          return;
        }
        setProcessingConsent(true);
        try {
          const consent=await api<ConsentResult>(`/api/v1/public/opportunity-inquiries/${encodeURIComponent(created.public_reference)}/sharing-consent`, {
            method: "POST",
            body: JSON.stringify({ token: created.continuationToken, employerSharingConsent: true, scope: "named_employer", organizationId: selectedOrganizationId, fields: shareFields })
          });
          setConsentSaved(true);
          await refreshSharingHistory(created);
          setNotice(statusMessage+" Employer-sharing consent status: "+(consent.employer_sharing_consent?"Saved for review":"Not enabled")+". "+(consent.nextStep||"Support Desk review is required before any employer access."));
        } catch (consentError) {
          setNotice(statusMessage+" Employer-sharing consent was not saved, so no employer sharing is enabled. Keep this page open and retry the consent step below.");
          setError(consentError instanceof ApiError ? consentError.message : "Consent could not be saved.");
        } finally { setProcessingConsent(false); }
      } else {
        setNotice(statusMessage+" MPA Support Desk will review it before any named-employer sharing.");
      }
    } catch (e) {
      const uncertain=e instanceof ApiError&&(e.status===0||e.status>=500||e.code==="INVALID_RESPONSE");
      setSubmissionUncertain(uncertain);
      setError(uncertain?"We could not confirm whether your request was received. Your entries are locked so you can safely retry the same submission without creating a duplicate.":e instanceof ApiError?e.message:e instanceof Error?e.message:"We couldn't submit this request.");
    } finally { setBusy(false); }
  }
  async function retryConsent() {
    if (!inquiry) return;
    if (!selectedOrganizationId) { setError("Choose the specific verified organization you authorize. No employer sharing is enabled yet."); return; }
    if (!sharingOrganizations.some(org => org.id === selectedOrganizationId)) { setError("Choose an organization from the current verified-organization list, then retry."); return; }
    setProcessingConsent(true); setError(""); setNotice("");
    try {
      const consent=await api<ConsentResult>(`/api/v1/public/opportunity-inquiries/${encodeURIComponent(inquiry.public_reference)}/sharing-consent`, {
        method: "POST",
        body: JSON.stringify({ token: inquiry.continuationToken, employerSharingConsent: true, scope: "named_employer", organizationId: selectedOrganizationId, fields: shareFields })
      });
      setConsentSaved(true);
      await refreshSharingHistory(inquiry);
      setNotice("Employer-sharing consent status: "+(consent.employer_sharing_consent?"Saved for review":"Not enabled")+". "+(consent.nextStep||"Support Desk review is required before any employer access."));
    } catch (e) { setError(e instanceof ApiError ? e.message : "Consent could not be saved. No employer sharing is enabled."); }
    finally { setProcessingConsent(false); }
  }
  async function revokeConsent() {
    if (!inquiry||processingConsent) return;
    setProcessingConsent(true); setError(""); setNotice("");
    try {
      const consent=await api<ConsentResult>(`/api/v1/public/opportunity-inquiries/${encodeURIComponent(inquiry.public_reference)}/sharing-consent`, {
        method: "POST",
        body: JSON.stringify({ token: inquiry.continuationToken, employerSharingConsent: false })
      });
      setConsentSaved(false);
      setShareWithEmployers(false);
      await refreshSharingHistory(inquiry);
      setNotice("Employer-sharing consent status: "+(consent.employer_sharing_consent?"Still enabled":"Revoked")+". "+(consent.nextStep||"Previously shared records remain in the audit history."));
    } catch (e) { setError(e instanceof ApiError ? e.message : "We couldn't confirm consent revocation. Please retry."); }
    finally { setProcessingConsent(false); }
  }

  const organizationOptions = sharingOrganizations.map(org => ({ id: org.id, label: org.display_name || org.legal_name || "Verified organization" }));

  return <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: 18 }}>
    <div>
      <div className="eyebrow">Employment & opportunity hub</div>
      <h1 className="h1">Tell MPA what kind of work you’re seeking.</h1>
      <p className="muted">You can register interest even when no suitable vacancy is listed. Your request stays private to you and MPA Support Desk unless you separately opt in to named-employer sharing.</p>
    </div>
    {!inquiry ? <Card>
      <h2 className="h2">Already submitted a job-interest request?</h2>
      <p className="muted">Use your reference and private continuation token to review sharing history, update consent or revoke future employer access. The token is a secret; do not share it.</p>
      <form onSubmit={loadExistingRequest} className="grid grid-2" style={{ gap: 12 }}>
        <label>Request reference<input required value={lookupReference} onChange={e => setLookupReference(e.target.value)} placeholder="MPA-JOB-…" /></label>
        <label>Private continuation token<input required value={lookupToken} onChange={e => setLookupToken(e.target.value)} /></label>
        <button className="btn btn-ghost" type="submit" disabled={lookupBusy || !lookupReference.trim() || !lookupToken.trim()}>{lookupBusy ? "Recovering…" : "Manage existing request"}</button>
      </form>
    </Card> : null}
    {inquiry ? <Card>
      <Badge>{consentSaved ? "Request submitted · consent recorded" : "Request submitted · private by default"}</Badge>
      <h2 className="h2" style={{ marginTop: 12 }}>Your reference: {inquiry.public_reference}</h2>
      <label>Private continuation token<input readOnly value={inquiry.continuationToken} aria-label="Private continuation token" /></label>
      <p className="muted">Save this token somewhere private. It lets you manage employer-sharing consent and view which organizations received your request. Anyone who obtains it may be able to access this request, so do not post or forward it.</p>
      <p>{notice || inquiry.nextStep || "MPA Support Desk will review your request and determine an appropriate next step."}</p>
      {error ? <FormFeedback kind="error" message={error} onRetry={submissionUncertain?()=>void submit():undefined} retryLabel="Check submission again" busy={busy} nextAction={submissionUncertain?"Keep the same details and retry to retrieve the existing request safely.":"Correct any highlighted information, then submit again."}/> : null}
      {!consentSaved ? <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><input type="checkbox" checked={shareWithEmployers} onChange={e => setShareWithEmployers(e.target.checked)} />I explicitly opt in to named-employer sharing now. This is optional and separate from submitting my request.</label>
        {shareWithEmployers ? <div style={{ display: "grid", gap: 8 }}><label>Search for the specific verified organization<input maxLength={120} disabled={sharingOrganizationsLoading||processingConsent} value={organizationSearch} onChange={e => setOrganizationSearch(e.target.value)} placeholder="Enter at least 3 characters of the organization name" /></label><button className="btn btn-ghost" type="button" disabled={sharingOrganizationsLoading || processingConsent} onClick={() => void searchSharingOrganizations()}>{sharingOrganizationsLoading ? "Finding verified organizations…" : "Search verified organizations"}</button>{organizationOptions.length > 0 ? <label>Choose the organization authorized to receive selected fields<select required value={selectedOrganizationId} onChange={e => setSelectedOrganizationId(e.target.value)} disabled={sharingOrganizationsLoading || processingConsent}><option value="">Choose a verified organization</option>{organizationOptions.map(org => <option key={org.id} value={org.id}>{org.label}</option>)}</select></label> : null}{sharingOrganizationsLoading ? <p aria-live="polite" aria-atomic="true" className="muted">Finding verified organizations and checking their verification status…</p> : null}{sharingOrganizationsError ? <FormFeedback kind="error" message={sharingOrganizationsError} onRetry={() => void searchSharingOrganizations()} /> : null}{!sharingOrganizationsLoading && !sharingOrganizationsError && !sharingOrganizations.length ? <p className="muted">{organizationSearch.trim().length >= 3 ? "No verified organizations matched that search. Your request remains private; try another name or leave sharing off." : "Search for a verified organization by name. The full organization directory is not exposed."}</p> : null}{shareable.map(([field,label]) => <label key={field} style={{ display: "flex", gap: 10, alignItems: "center" }}><input type="checkbox" checked={shareFields.includes(field)} onChange={e => toggleField(field,e.target.checked)} />{label}</label>)}<button className="btn btn-primary" type="button" disabled={processingConsent || sharingOrganizationsLoading || Boolean(sharingOrganizationsError) || !organizationOptions.some(org => org.id === selectedOrganizationId) || !shareFields.length} onClick={() => void retryConsent()}>{processingConsent ? "Saving consent…" : "Save explicit sharing consent"}</button></div> : <p className="muted">Your request remains private. No employer can access it.</p>}
      </div> : <button className="btn btn-ghost" type="button" disabled={processingConsent} onClick={() => void revokeConsent()}>{processingConsent ? "Updating…" : "Revoke employer-sharing consent"}</button>}
      <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}><h3 className="h2">Employer sharing history</h3><button className="btn btn-ghost" type="button" onClick={() => void refreshSharingHistory(inquiry)} disabled={sharingHistoryLoading} aria-busy={sharingHistoryLoading}>{sharingHistoryLoading ? "Checking sharing history…" : "Check sharing history"}</button></div>
        {sharingHistoryError ? <p role="alert">{sharingHistoryError}</p> : null}
        {sharingHistory.length ? sharingHistory.map(item => <div key={item.shareId} className="case-row"><b>{item.organizationName}</b><p className="muted">Fields shared: {item.sharedFields.map(field => labelsForHistory(field)).join(", ")} · {new Date(item.sharedAt).toLocaleString()}</p><Badge>{item.status}</Badge>{item.revokedAt ? <p className="muted">Access revoked {new Date(item.revokedAt).toLocaleString()}.</p> : null}</div>) : <p className="muted">No employer has received this request. If you opted in, Support Desk review is still required before any sharing.</p>}
      </div>
      <p className="muted">Consent permits only the selected fields to be shared with a specific verified organization after Support Desk review. It does not guarantee a vacancy, interview or job offer.</p>
    </Card> : <Card>
      <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
        <h2 className="h2">Your job-interest request</h2>
        <div className="grid grid-2">
          <label>Your name<input required maxLength={200} value={form.contactName} disabled={busy||submissionUncertain||Boolean(inquiry)} onChange={e => {setRequestIdempotencyKey("");setSubmissionUncertain(false);update("contactName", e.target.value)}} /></label>
          <label>Email (optional if phone provided)<input type="email" maxLength={320} value={form.contactEmail} disabled={busy||submissionUncertain||Boolean(inquiry)} onChange={e => {setRequestIdempotencyKey("");setSubmissionUncertain(false);update("contactEmail", e.target.value)}} /></label>
          <label>Phone (optional if email provided)<input maxLength={80} value={form.contactPhone} disabled={busy||submissionUncertain||Boolean(inquiry)} onChange={e => {setRequestIdempotencyKey("");setSubmissionUncertain(false);update("contactPhone", e.target.value)}} /></label>
          <label>Target role / occupation<input required maxLength={500} value={form.targetRole} disabled={busy||submissionUncertain||Boolean(inquiry)} onChange={e => {setRequestIdempotencyKey("");setSubmissionUncertain(false);update("targetRole", e.target.value)}} placeholder="What kind of work are you seeking?" /></label>
          <TagInput label="Skills" disabled={busy||submissionUncertain||Boolean(inquiry)} value={selectedSkills} onChange={setSelectedSkills} placeholder="Add one skill at a time" help="Add each skill separately. Duplicate entries are ignored; remove any selection before submitting."/>
          <label>Preferred location<input maxLength={300} value={form.location} disabled={busy||submissionUncertain||Boolean(inquiry)} onChange={e => {setRequestIdempotencyKey("");setSubmissionUncertain(false);update("location", e.target.value)}} placeholder="City or region" /></label>
          <label>Preferred work mode<select value={form.workMode} onChange={e=>update("workMode",e.target.value)}><option value="">No preference</option><option value="onsite">On-site</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option></select></label>
          <label>Availability<select value={form.availability} onChange={e=>update("availability",e.target.value)}><option value="">Not specified</option><option value="immediately">Immediately</option><option value="within_2_weeks">Within two weeks</option><option value="within_1_month">Within one month</option><option value="within_3_months">Within three months</option><option value="flexible">Flexible / to discuss</option></select></label>
        </div>
        <label>Experience range<select value={form.experience} onChange={e=>update("experience",e.target.value)}><option value="">Not specified</option><option value="less_than_1_year">Less than 1 year</option><option value="1_to_3_years">1–3 years</option><option value="4_to_7_years">4–7 years</option><option value="8_to_10_years">8–10 years</option><option value="more_than_10_years">More than 10 years</option></select></label>
        <label>Anything else MPA should know<textarea maxLength={2000} rows={3} value={form.intent} disabled={busy||submissionUncertain||Boolean(inquiry)} onChange={e => {setRequestIdempotencyKey("");setSubmissionUncertain(false);update("intent", e.target.value)}} /></label>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><input type="checkbox" required checked={consentToProcess} onChange={e => setConsentToProcess(e.target.checked)} />I agree that MPA may receive and review this job-interest request to assess possible opportunities. This does not authorize employer sharing.</label>
        <Card>
          <h3 className="h2">Optional: consent to named-employer sharing</h3>
          <p className="muted">Off by default. If selected, MPA Support Desk may share only the fields you choose with a specific verified organization after review. Contact details are not selected by default.</p>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><input type="checkbox" checked={shareWithEmployers} onChange={e => setShareWithEmployers(e.target.checked)} />I explicitly opt in to sharing selected information with a named, verified employer after MPA Support Desk review.</label>
          {shareWithEmployers ? <div style={{ display: "grid", gap: 8, marginTop: 10 }}><label>Search for the specific verified organization<input maxLength={120} value={organizationSearch} onChange={e => setOrganizationSearch(e.target.value)} placeholder="Enter at least 3 characters of the organization name" /></label><button className="btn btn-ghost" type="button" disabled={sharingOrganizationsLoading || processingConsent} onClick={() => void searchSharingOrganizations()}>{sharingOrganizationsLoading ? "Searching…" : "Search verified organizations"}</button>{organizationOptions.length > 0 ? <label>Choose the organization authorized to receive selected fields<select required value={selectedOrganizationId} onChange={e => setSelectedOrganizationId(e.target.value)} disabled={sharingOrganizationsLoading || processingConsent}><option value="">Choose a verified organization</option>{organizationOptions.map(org => <option key={org.id} value={org.id}>{org.label}</option>)}</select></label> : null}{sharingOrganizationsLoading ? <p aria-live="polite" aria-atomic="true" className="muted">Loading verified organizations…</p> : null}{sharingOrganizationsError ? <FormFeedback kind="error" message={sharingOrganizationsError} onRetry={() => void searchSharingOrganizations()} /> : null}{!sharingOrganizationsLoading && !sharingOrganizationsError && !sharingOrganizations.length ? <p role="alert" className="muted">Search for a verified organization by name. The full organization directory is not exposed.</p> : null}{shareable.map(([field,label]) => <label key={field} style={{ display: "flex", gap: 10, alignItems: "center" }}><input type="checkbox" checked={shareFields.includes(field)} onChange={e => toggleField(field,e.target.checked)} />{label}</label>)}</div> : null}
        </Card>
        {error ? <p role="alert" style={{ color: "var(--danger, #b91c1c)" }}>{error}</p> : null}
        {notice ? <FormFeedback kind="success" message={notice} actionHref={inquiry?`/apply/opportunity?ref=${encodeURIComponent(inquiry.public_reference)}&token=${encodeURIComponent(inquiry.continuationToken)}`:undefined} actionLabel={inquiry?"Continue with request details":undefined}>{getPublicReference(inquiry) ? <p>Keep this reference to check your request later: <strong>{getPublicReference(inquiry)}</strong></p> : null}{inquiry&&(!shareWithEmployers||consentSaved)&&!processingConsent&&<button type="button" className="btn btn-ghost" onClick={()=>{setInquiry(null);setForm({contactName:"",contactEmail:"",contactPhone:"",targetRole:"",experience:"",location:"",workMode:"",availability:"",intent:""});setSelectedSkills([]);setConsentToProcess(false);setShareWithEmployers(false);setShareFields(["targetRole","skills"]);setSelectedOrganizationId("");setConsentSaved(false);setNotice("");setError("");setRequestIdempotencyKey("");setSubmissionUncertain(false);}}>Start another request</button>}</FormFeedback> : null}
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <button className="btn btn-primary" type="submit" disabled={busy || processingConsent}>{busy ? "Submitting…" : "Submit job-interest request"}</button>
          <a className="btn btn-ghost" href="/jobs">Return to listed jobs</a>
        </div>
      </form>
    </Card>}
  </div>;
}
