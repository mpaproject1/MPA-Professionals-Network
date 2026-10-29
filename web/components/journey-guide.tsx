"use client";

import { ArrowRight, CheckCircle2, Circle, Clock3, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useUiStore } from "../lib/store";
import { Card } from "./ui";

export type JourneyStep = {
  title: string;
  description: string;
  href: string;
  action?: string;
};

type OrganizationProgressRecord = {
  id: string;
  legal_name: string;
  display_name: string;
  tracking_reference?: string;
  verification_status?: string;
  verification_case_status?: string;
  verification_submitted_at?: string | null;
  verification_reviewed_at?: string | null;
  verification_decision_reason?: string | null;
  missing_evidence?: string[];
  required_evidence?: string[];
};

type LoadState = "idle" | "loading" | "ready" | "error";

function humanize(value?: string) {
  return (value || "not recorded").replaceAll("_", " ");
}

function organizationState(org: OrganizationProgressRecord) {
  const verification = (org.verification_status || "").toLowerCase();
  const caseStatus = (org.verification_case_status || "").toLowerCase();
  if (verification === "verified" || caseStatus === "approved") {
    return {
      stage: "Verified",
      detail: "The server reports this organization as verified. Publishing and recruitment actions remain subject to role and record permissions.",
      action: "Open recruitment",
      href: "/recruitment",
      kind: "complete" as const,
    };
  }
  if (["submitted", "pending", "in_review", "under_review"].includes(caseStatus) || verification === "pending") {
    return {
      stage: "Awaiting review",
      detail: "Your verification case has been submitted. Wait for the review decision; if the reviewer requests corrections, the next action will appear here after the status refreshes.",
      action: "Review submitted details",
      href: "#org-registration",
      kind: "waiting" as const,
    };
  }
  if (["correction_required", "returned", "needs_correction"].includes(caseStatus)) {
    return {
      stage: "Changes required",
      detail: org.verification_decision_reason?.trim()
        ? `Reviewer feedback: ${org.verification_decision_reason}`
        : "The verification case needs changes. Review the decision and provide the requested evidence before resubmitting.",
      action: "Review evidence and status",
      href: "#org-evidence",
      kind: "action" as const,
    };
  }
  if (["rejected", "declined"].includes(caseStatus) || verification === "rejected") {
    return {
      stage: "Not approved",
      detail: org.verification_decision_reason?.trim()
        ? `Reviewer reason: ${org.verification_decision_reason}`
        : "The server reports that verification was not approved. Review the recorded decision and available next steps; do not assume publishing is enabled.",
      action: "Review decision",
      href: "#org-evidence",
      kind: "blocked" as const,
    };
  }
  return {
    stage: "Registration / evidence needed",
    detail: (org.missing_evidence?.length || 0) > 0
      ? `The server identifies missing evidence: ${org.missing_evidence?.map(humanize).join(", ")}.`
      : "Registration exists, but the server has not confirmed verification. Review the required evidence and submit the case when the supported requirements are complete.",
    action: "Continue verification",
    href: "#org-evidence",
    kind: "action" as const,
  };
}

export function JourneyGuide({
  eyebrow,
  title,
  description,
  primaryLabel,
  primaryHref,
  steps,
}: {
  eyebrow: string;
  title: string;
  description: string;
  primaryLabel: string;
  primaryHref: string;
  steps: JourneyStep[];
}) {
  const token = useUiStore((state) => state.token);
  const isOrganizationJourney = /employer|recruiter/i.test(eyebrow);
  const [organizations, setOrganizations] = useState<OrganizationProgressRecord[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadError, setLoadError] = useState("");
  const [refreshAttempt, setRefreshAttempt] = useState(0);

  useEffect(() => {
    if (!isOrganizationJourney) return;
    if (!token) {
      setOrganizations([]);
      setLoadState("idle");
      setLoadError("");
      return;
    }
    let cancelled = false;
    setLoadState("loading");
    setLoadError("");
    api<OrganizationProgressRecord[]>("/api/v1/organizations", {}, token)
      .then((result) => {
        if (cancelled) return;
        if (!Array.isArray(result)) {
          throw new Error("The organization status response was not in the expected format.");
        }
        setOrganizations(result);
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setOrganizations([]);
        setLoadState("error");
        setLoadError(
          error instanceof ApiError
            ? error.message
            : "We couldn't confirm organization progress from the service. Retry by refreshing this page.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [isOrganizationJourney, token, refreshAttempt]);

  return (
    <Card>
      <div className="grid" style={{ gap: 12 }}>
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h2 className="h2">{title}</h2>
          <p className="muted">{description}</p>
        </div>

        {isOrganizationJourney && (
          <section aria-labelledby="organization-live-progress-title" className="grid" style={{ gap: 10 }}>
            <div>
              <div className="eyebrow">Live progress</div>
              <h3 id="organization-live-progress-title" className="h2">Your organization’s next step</h3>
              <p className="muted">Progress is based on the authenticated service response. A missing response is never treated as approval or as zero activity.</p>
            </div>
            {loadState === "loading" && (
              <div className="case-row" role="status" aria-live="polite">
                <Clock3 size={18} aria-hidden="true" />
                <span>Checking organization status…</span>
              </div>
            )}
            {loadState === "error" && (
              <div className="case-row" role="alert">
                <ShieldAlert size={18} aria-hidden="true" />
                <div>
                  <strong>Progress could not be confirmed</strong>
                  <p className="muted">{loadError}</p>
                  <button className="btn btn-ghost" type="button" onClick={() => setRefreshAttempt((attempt) => attempt + 1)}>Retry status check</button>
                </div>
              </div>
            )}
            {loadState === "ready" && organizations.length === 0 && (
              <div className="case-row">
                <Circle size={18} aria-hidden="true" />
                <div>
                  <strong>Step 1 of the journey: Register your organization</strong>
                  <p className="muted">No organization was returned for this account. Create a registration draft to begin. Registration does not mean the organization is verified.</p>
                  <a className="btn btn-primary" href="#org-registration">Register organization <ArrowRight size={15} /></a>
                </div>
              </div>
            )}
            {loadState === "ready" && organizations.map((org) => {
              const state = organizationState(org);
              const verified = state.kind === "complete";
              const journeySteps = [
                { title: "Register organization", status: "complete", detail: "The organization record exists on the service." },
                {
                  title: "Verify organization",
                  status: verified ? "complete" : state.kind === "waiting" ? "awaiting review" : state.kind === "blocked" ? "not approved" : "action needed",
                  detail: verified ? "The service confirms verification." : state.kind === "waiting" ? "The submitted case is awaiting a reviewer decision." : state.kind === "blocked" ? "Review the recorded decision and available next steps." : "Complete the supported evidence and review requirements.",
                },
                { title: "Publish opportunities", status: verified ? "next step" : "locked until verification", detail: verified ? "Use recruitment; publication remains subject to server-side eligibility and permissions." : "Publishing is not represented as available before verification." },
                { title: "Manage applicants", status: verified ? "use recruitment workspace" : "locked until verification", detail: "Application and candidate records remain in the existing organization-scoped recruitment workflow." },
                { title: "Review outcomes", status: "open report when needed", detail: "Use the existing authorized report; only server-returned metrics are shown." },
              ];
              return (
                <article className="case-row" key={org.id} aria-label={`Progress for ${org.display_name}`}>
                  <div className="row" style={{ alignItems: "flex-start", gap: 10 }}>
                    {verified ? <CheckCircle2 size={20} aria-hidden="true" /> : state.kind === "waiting" ? <Clock3 size={20} aria-hidden="true" /> : <Circle size={20} aria-hidden="true" />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                        <strong>{org.display_name || org.legal_name}</strong>
                        <span className="badge">{state.stage}</span>
                      </div>
                      {org.tracking_reference && <p className="muted">Reference: {org.tracking_reference}</p>}
                      <p className="muted">{state.detail}</p>
                      <p className="muted">Server status: verification {humanize(org.verification_status)} · case {humanize(org.verification_case_status)}</p>
                      <ol aria-label={`Guided progress for ${org.display_name || org.legal_name}`} className="grid" style={{ gap: 8, padding: 0, margin: "12px 0", listStyle: "none" }}>
                        {journeySteps.map((step, index) => (
                          <li key={step.title} className="case-row" aria-current={index === 1 && !verified ? "step" : index === 2 && verified ? "step" : undefined}>
                            <div className="row" style={{ alignItems: "flex-start", gap: 10 }}>
                              <span className="avatar" aria-hidden="true" style={{ flexShrink: 0 }}>{index + 1}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                                  <strong>{step.title}</strong>
                                  <span className="badge">{step.status}</span>
                                </div>
                                <p className="muted">{step.detail}</p>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ol>
                      <a className="btn btn-ghost" href={state.href}>{state.action} <ArrowRight size={15} /></a>
                    </div>
                  </div>
                </article>
              );
            })}
            {loadState === "ready" && organizations.some((org) => org.verification_status === "verified" || org.verification_case_status === "approved") && (
              <p className="muted">Next stages: publish eligible opportunities, manage applications for your own organization, then review the organization’s authorized outcome report. These stages are not marked complete here because their completion state must come from their own service workflows.</p>
            )}
          </section>
        )}

        <ol className="grid grid-2" style={{ gap: 10, padding: 0, margin: 0, listStyle: "none" }}>
          {steps.map((step, index) => (
            <li key={step.title} className="case-row">
              <div className="row" style={{ alignItems: "flex-start", gap: 10 }}>
                <span aria-hidden="true" className="avatar" style={{ flexShrink: 0 }}>
                  {index + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 className="h2">{step.title}</h3>
                  <p className="muted">{step.description}</p>
                  <Link className="btn btn-ghost" href={step.href}>
                    {step.action || "Open step"} <ArrowRight size={15} />
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <div className="row" style={{ flexWrap: "wrap", justifyContent: "space-between" }}>
          <p className="muted"><CheckCircle2 size={15} style={{ display: "inline", verticalAlign: "text-bottom" }} /> Each step keeps its own saved status and history.</p>
          <Link className="btn btn-primary" href={primaryHref}>{primaryLabel} <ArrowRight size={16} /></Link>
        </div>
      </div>
    </Card>
  );
}
