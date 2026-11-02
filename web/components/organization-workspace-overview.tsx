"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  ClipboardCheck,
  Compass,
  Handshake,
  Network,
  UsersRound,
} from "lucide-react";
import { api } from "../lib/api";
import styles from "./organization-workspace-overview.module.css";

type Organization = {
  id: string;
  display_name: string;
  legal_name: string;
  role_code?: string;
  verification_status?: string;
  verification_case_status?: string;
  tracking_reference?: string;
  verification_submitted_at?: string | null;
  verification_decision_reason?: string | null;
  missing_evidence?: string[];
};

type OrganizationOutcomes = {
  jobs: {
    id: string;
    title: string;
    status: string;
    applications: number;
    active_pipeline: number;
    offers: number;
    accepted_offers: number;
    hires: number;
    scheduled_interviews: number;
  }[];
  requisitions: { id: string; title: string; status: string; headcount: number; published_jobs: number }[];
};

type OrganizationAccess = {
  id: string;
  display_name: string;
  legal_name: string;
  verification_status?: string;
  role_code: string;
  membership_status: string;
};

const WORKSPACE_ROLES = ["owner", "administrator", "recruiter", "project_manager", "read_only", "event_manager", "finance"];
const VERIFICATION_MANAGER_ROLES = ["owner", "administrator"];

type Folder = {
  key: string;
  title: string;
  description: string;
  icon: typeof BriefcaseBusiness;
  tone: string;
  allowedRoles?: string[];
  links: { label: string; href: string }[];
};

const folders: Folder[] = [
  {
    key: "publishing",
    title: "Publishing",
    description: "Create and manage professional opportunities.",
    icon: BriefcaseBusiness,
    tone: "publishing",
    allowedRoles: ["owner", "administrator", "recruiter", "project_manager"],
    links: [
      { label: "Jobs and recruitment", href: "/recruitment" },
      { label: "Professional services", href: "/services" },
      { label: "Mentorship offers", href: "/mentorship" },
    ],
  },
  {
    key: "reviewing",
    title: "Reviewing",
    description: "Work through applications and incoming requests.",
    icon: ClipboardCheck,
    tone: "reviewing",
    allowedRoles: ["owner", "administrator", "recruiter"],
    links: [
      { label: "Candidate pipeline", href: "/recruitment#candidate-pipeline" },
      { label: "Public job inquiries", href: "/organizations#org-inquiries" },
    ],
  },
  {
    key: "exploring",
    title: "Exploring",
    description: "Find professionals, organizations and collaborators.",
    icon: Compass,
    tone: "exploring",
    links: [
      { label: "Professional network", href: "/network" },
      { label: "Network-Plus", href: "/network-plus" },
      { label: "Organization directory", href: "/organizations/directory" },
    ],
  },
  {
    key: "reports",
    title: "Reports",
    description: "Understand authorized activity and recorded outcomes.",
    icon: BarChart3,
    tone: "reports",
    links: [
      { label: "Impact and outcomes", href: "/organizations/reports" },
    ],
  },
  {
    key: "organization",
    title: "Organization",
    description: "Manage your team, access and organization details.",
    icon: Building2,
    tone: "organization",
    allowedRoles: ["owner", "administrator"],
    links: [
      { label: "Team and permissions", href: "/organizations/team" },
      { label: "Organization profile", href: "/organizations#org-registration" },
      { label: "Verification evidence", href: "/organizations#org-evidence" },
    ],
  },
  {
    key: "connections",
    title: "Connections",
    description: "Build relationships and take part in community work.",
    icon: Handshake,
    tone: "connections",
    links: [
      { label: "Serve-Community requests", href: "/service-demand" },
      { label: "Mentorship network", href: "/mentorship" },
      { label: "Professional connections", href: "/network" },
    ],
  },
];

function statusFor(organization: Organization) {
  const state = organization.verification_case_status || organization.verification_status || "draft";
  const canManageVerification = VERIFICATION_MANAGER_ROLES.includes(organization.role_code || "");
  if (organization.verification_status === "verified" && !WORKSPACE_ROLES.includes(organization.role_code || "")) {
    return { label: "Workspace access unavailable", detail: "Your organization relationship is active, but this role is not authorized for the current organization workspace. Ask the organization owner or administrator to review your assignment.", tone: "attention" };
  }
  if (organization.verification_status === "verified") {
    return { label: "Verified", detail: "Organization verification has been approved.", tone: "verified" };
  }
  if (["submitted", "in_review", "pending"].includes(state) || organization.verification_status === "pending") {
    return { label: "Under review", detail: "Your submission is awaiting an authorized MPA review. No further submission is needed while it is pending.", tone: "pending" };
  }
  if (state === "correction_required") {
    return canManageVerification
      ? { label: "Changes requested", detail: "Review the feedback and provide the outstanding information or evidence.", tone: "attention" }
      : { label: "Owner action needed", detail: "MPA has requested changes. Only the organization owner or an administrator can update verification evidence and resubmit.", tone: "attention" };
  }
  if (state === "rejected") {
    return { label: "Not approved", detail: "The application was not approved. Review the recorded decision before taking another step.", tone: "attention" };
  }
  return canManageVerification
    ? { label: "Setup in progress", detail: "Complete the required evidence checklist and submit the organization for review.", tone: "draft" }
    : { label: "Owner action needed", detail: "Organization verification is managed by the owner or an administrator. Ask them to complete the evidence checklist and submit the case.", tone: "attention" };
}

export function OrganizationWorkspaceOverview({
  organizations,
  organizationAccess,
  token,
  activeFolderKey,
  onActiveFolderChange,
  authenticated,
  organizationLookupReady,
  onRetry,
  onRegister,
}: {
  organizations: Organization[];
  organizationAccess: OrganizationAccess[];
  token: string;
  activeFolderKey: string;
  onActiveFolderChange: (key: string) => void;
  authenticated: boolean;
  organizationLookupReady: boolean;
  onRetry: () => void;
  onRegister: () => void;
}) {
  const verified = organizations.filter((item) => item.verification_status === "verified");
  const workspaceReady = verified.filter((item) => WORKSPACE_ROLES.includes(item.role_code || ""));
  const awaiting = organizations.filter((item) => {
    const state = item.verification_case_status || item.verification_status;
    return ["submitted", "in_review", "pending"].includes(state || "") || item.verification_status === "pending";
  });
  const attention = organizations.filter((item) => ["correction_required", "rejected"].includes(item.verification_case_status || ""));
  const hasVerifiedOrganization = workspaceReady.length > 0;
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  useEffect(() => {
    if (workspaceReady.length === 0) {
      setSelectedOrganizationId("");
      return;
    }
    setSelectedOrganizationId((current) => workspaceReady.some((item) => item.id === current) ? current : workspaceReady[0].id);
  }, [workspaceReady]);
  const selectedOrganization = workspaceReady.find((item) => item.id === selectedOrganizationId) || workspaceReady[0];
  const [outcomes, setOutcomes] = useState<OrganizationOutcomes | null>(null);
  const [outcomesState, setOutcomesState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  useEffect(() => {
    let cancelled = false;
    if (!token || !selectedOrganizationId) {
      setOutcomes(null);
      setOutcomesState("idle");
      return () => { cancelled = true; };
    }
    setOutcomes(null);
    setOutcomesState("loading");
    api<OrganizationOutcomes>(`/api/v1/organizations/${encodeURIComponent(selectedOrganizationId)}/outcomes`, {}, token)
      .then((data) => {
        if (cancelled) return;
        if (!data || !Array.isArray(data.jobs) || !Array.isArray(data.requisitions)) throw new Error("Invalid organization outcomes response");
        setOutcomes(data);
        setOutcomesState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setOutcomes(null);
        setOutcomesState("error");
      });
    return () => { cancelled = true; };
  }, [token, selectedOrganizationId]);
  const outcomeSummary = outcomes ? {
    openJobs: outcomes.jobs.filter((job) => job.status === "published").length,
    applications: outcomes.jobs.reduce((sum, job) => sum + (Number.isFinite(job.applications) ? job.applications : 0), 0),
    activePipeline: outcomes.jobs.reduce((sum, job) => sum + (Number.isFinite(job.active_pipeline) ? job.active_pipeline : 0), 0),
    hires: outcomes.jobs.reduce((sum, job) => sum + (Number.isFinite(job.hires) ? job.hires : 0), 0),
  } : null;
  const activeRoles = selectedOrganization ? [selectedOrganization.role_code || ""] : [];
  const visibleFolders = workspaceReady.length === 0 ? [] : folders.filter((folder) => !folder.allowedRoles || folder.allowedRoles.some((role) => activeRoles.includes(role)));
  const activeFolder = visibleFolders.find((folder) => folder.key === activeFolderKey) || visibleFolders[0];
  useEffect(() => {
    if (visibleFolders.length > 0 && !visibleFolders.some((folder) => folder.key === activeFolderKey)) {
      onActiveFolderChange(visibleFolders[0].key);
    }
  }, [visibleFolders, activeFolderKey, onActiveFolderChange]);
  const organizationHref = (href: string) => {
    const [path, hash] = href.split("#");
    if (!selectedOrganizationId || !["/recruitment", "/organizations/reports", "/organizations/team"].includes(path)) return href;
    const query = new URLSearchParams({ organizationId: selectedOrganizationId }).toString();
    return `${path}?${query}${hash ? `#${hash}` : ""}`;
  };
  const nextAction = outcomeSummary
    ? outcomeSummary.openJobs === 0
      ? { title: "Publish your first job opportunity", detail: "Start with a role your organization is ready to recruit for.", href: "/recruitment" }
      : outcomeSummary.applications === 0
        ? { title: "Share your published opportunities", detail: "Your jobs are live. Help eligible professionals discover them.", href: "/recruitment" }
        : outcomeSummary.activePipeline > 0
          ? { title: "Review the active candidate pipeline", detail: `${outcomeSummary.activePipeline} application(s) are in screening, shortlisting or interview stages.`, href: "/recruitment#candidate-pipeline" }
          : { title: "Review recruitment outcomes", detail: "Check recorded applications, offers and hires before planning the next opportunity.", href: "/organizations/reports" }
    : null;

  if (organizations.length === 0 && authenticated && !organizationLookupReady) {
    return (
      <section className={styles.gate} aria-labelledby="organization-access-check-title">
        <div className={styles.gateIntro}>
          <span className={styles.eyebrow}>MPA organization access</span>
          <h2 id="organization-access-check-title">Confirming your organization access</h2>
          <p>We need to confirm both your active organization assignments and any previous organization relationships before showing registration or workspace actions.</p>
        </div>
        <button className="btn btn-ghost" type="button" onClick={onRetry}>Retry access check</button>
      </section>
    );
  }

  if (organizations.length === 0 && authenticated && organizationAccess.length > 0) {
    const hasActiveRelationship = organizationAccess.some((item) => item.membership_status === "active");
    return (
      <section className={styles.gate} aria-labelledby="organization-access-restricted-title">
        <div className={styles.gateIntro}>
          <span className={styles.eyebrow}>MPA organization access</span>
          <h2 id="organization-access-restricted-title">{hasActiveRelationship ? "Your organization access needs attention" : "Organization access is not active"}</h2>
          <p>{hasActiveRelationship ? "An active organization relationship was found, but the organization workspace details could not be loaded. Refresh before attempting another action." : "Your account has a previous organization relationship, but it is suspended or removed. This is not treated as an unregistered account, and a new registration is not offered."}</p>
        </div>
        <div className={styles.statusList}>
          {organizationAccess.map((item) => (
            <article className={styles.statusCard} key={item.id}>
              <div className={styles.statusTop}>
                <div><strong>{item.display_name || item.legal_name}</strong><span>{item.role_code.replaceAll("_", " ")}</span></div>
                <span className={`${styles.statusPill} ${item.membership_status === "active" ? styles.pending : styles.attention}`}>{item.membership_status.replaceAll("_", " ")}</span>
              </div>
              <p>{item.membership_status === "suspended" ? "Ask an authorized organization owner or administrator to review your access." : item.membership_status === "removed" ? "Your organization assignment has been removed. Contact the organization if you believe this is incorrect." : "The relationship is active, but workspace access could not be confirmed."}</p>
            </article>
          ))}
        </div>
        <button className="btn btn-ghost" type="button" onClick={onRetry}>Refresh organization access</button>
      </section>
    );
  }

  if (organizations.length === 0) {
    return (
      <section className={styles.gate} aria-labelledby="organization-welcome-title">
        <div className={styles.gateIntro}>
          <span className={styles.eyebrow}>MPA organization access</span>
          <h2 id="organization-welcome-title">Bring your organization into a trusted professional network.</h2>
          <p>Connect with eligible professionals and manage opportunities through accountable, permission-based workflows.</p>
        </div>
        <div className={styles.benefits}>
          <div><UsersRound aria-hidden="true"/><span>Reach eligible and verified professionals.</span></div>
          <div><BriefcaseBusiness aria-hidden="true"/><span>Publish jobs and professional opportunities.</span></div>
          <div><Network aria-hidden="true"/><span>Discover talent and potential collaborators.</span></div>
          <div><Handshake aria-hidden="true"/><span>Request mentorship and professional services.</span></div>
          <div><ClipboardCheck aria-hidden="true"/><span>Review applications and recruitment workflows.</span></div>
          <div><BarChart3 aria-hidden="true"/><span>Access permitted insights and outcome reports.</span></div>
        </div>
        <div className={styles.gateAction}>
          <p>Start with a short organization profile. Supporting evidence and review come in later steps.</p>
          <button className="btn btn-primary" type="button" onClick={onRegister}>Register your organization</button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.workspace} aria-labelledby="organization-overview-title">
      <header className={styles.dashboardHeader}>
        <div>
          <span className={styles.eyebrow}>MPA · Organization app</span>
          <h2 id="organization-overview-title">{hasVerifiedOrganization ? "Your organization at a glance" : "Your organization application"}</h2>
          <p>{hasVerifiedOrganization ? "Choose a folder to continue with the work your organization is authorized to do." : "Your registration and verification status are shown below. Operational folders unlock after approval."}</p>
        </div>
        <div className={styles.dashboardActions}>
          <label className={styles.organizationSwitcher}>
            <span>Working with</span>
            <select
              aria-label="Choose active organization"
              value={selectedOrganization?.id || ""}
              disabled={workspaceReady.length < 2}
              onChange={(event) => setSelectedOrganizationId(event.target.value)}
            >
              {workspaceReady.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}
            </select>
          </label>
          <Link className={styles.refreshLink} href="/organizations#your-organizations">View status details <span aria-hidden="true">↗</span></Link>
        </div>
      </header>

      <div className={styles.metrics} aria-label="Organization registration summary">
        <div className={styles.metric}><span>Organizations linked</span><strong>{organizations.length.toString().padStart(2, "0")}</strong></div>
        <div className={styles.metric}><span>Verified</span><strong>{verified.length.toString().padStart(2, "0")}</strong></div>
        <div className={styles.metric}><span>Org. cases awaiting review</span><strong>{awaiting.length.toString().padStart(2, "0")}</strong></div>
        <div className={styles.metric}><span>Need attention</span><strong>{attention.length.toString().padStart(2, "0")}</strong></div>
      </div>
      <section className={styles.activitySummary} aria-label="Live organization recruitment activity">
        <div className={styles.activityHeading}>
          <div><h3>Recruitment activity</h3><p>Authorized, organization-scoped totals. Applicant identities are not shown.</p></div>
          {outcomesState === "loading" ? <span role="status">Loading live activity…</span> : null}
        </div>
        {outcomesState === "ready" && outcomeSummary ? (
          <>
            <div className={styles.metrics}>
              <div className={styles.metric}><span>Published jobs</span><strong>{outcomeSummary.openJobs}</strong></div>
              <div className={styles.metric}><span>Applications received</span><strong>{outcomeSummary.applications}</strong></div>
              <div className={styles.metric}><span>Active pipeline</span><strong>{outcomeSummary.activePipeline}</strong></div>
              <div className={styles.metric}><span>Hires recorded</span><strong>{outcomeSummary.hires}</strong></div>
            </div>
            {outcomes && outcomes.jobs.length === 0 && outcomes.requisitions.length === 0 ? <p className={styles.activityEmpty}>No recruitment activity has been recorded for this organization yet.</p> : null}
            {nextAction ? (
              <div className={styles.nextAction}>
                <div><span className={styles.eyebrow}>Recommended next action</span><strong>{nextAction.title}</strong><p>{nextAction.detail}</p></div>
                <Link href={organizationHref(nextAction.href)}>Open task <span aria-hidden="true">↗</span></Link>
              </div>
            ) : null}
          </>
        ) : outcomesState === "error" ? (
          <p className={styles.activityEmpty}>Live recruitment totals are not available for this organization or role. No placeholder figures are displayed.</p>
        ) : null}
      </section>

      {!hasVerifiedOrganization ? (
        <div className={styles.statusList}>
          {organizations.map((organization) => {
            const status = statusFor(organization);
            const caseState = organization.verification_case_status || organization.verification_status || "draft";
            const evidenceSubmitted = ["submitted", "in_review", "pending", "correction_required", "verified", "rejected"].includes(caseState) || organization.verification_status === "pending" || organization.verification_status === "verified";
            const decisionRecorded = ["verified", "rejected", "correction_required"].includes(caseState) || organization.verification_status === "verified";
            return (
              <article className={styles.statusCard} key={organization.id}>
                <div className={styles.statusTop}>
                  <div><strong>{organization.display_name || organization.legal_name}</strong><span>{organization.tracking_reference || "Application reference pending"}{organization.role_code ? ` · ${organization.role_code.replaceAll("_", " ")}` : ""}{organization.verification_submitted_at ? ` · Submitted ${new Date(organization.verification_submitted_at).toLocaleDateString()}` : ""}</span></div>
                  <span className={`${styles.statusPill} ${styles[status.tone] || ""}`}>{status.label}</span>
                </div>
                <ol className={styles.verificationTimeline} aria-label="Organization verification progress">
                  <li className={styles.stageComplete}>Profile created</li>
                  <li className={evidenceSubmitted ? styles.stageComplete : styles.stageCurrent}>Evidence submitted</li>
                  <li className={decisionRecorded ? styles.stageComplete : evidenceSubmitted ? styles.stageCurrent : ""}>MPA decision</li>
                </ol>
                <p>{status.detail}</p>
                {organization.verification_decision_reason ? <p className={styles.reviewNote}><strong>Reviewer feedback:</strong> {organization.verification_decision_reason}</p> : null}
                {(organization.missing_evidence || []).length > 0 && status.tone !== "pending" ? <p className={styles.reviewNote}><strong>Outstanding:</strong> {(organization.missing_evidence || []).map((item) => item.replaceAll("_", " ")).join(", ")}</p> : null}
                {VERIFICATION_MANAGER_ROLES.includes(organization.role_code || "") && status.tone !== "pending" && status.tone !== "verified" ? <Link className="btn btn-primary" href="/organizations#org-evidence">Continue verification</Link> : null}
              </article>
            );
          })}
        </div>
      ) : (
        <>
          {organizations.length > verified.length ? (
            <div className={styles.secondaryStatuses}>
              {organizations.filter((item) => item.verification_status !== "verified").map((organization) => {
                const status = statusFor(organization);
                return <span key={organization.id}><strong>{organization.display_name}</strong> · {status.label}</span>;
              })}
            </div>
          ) : null}
          <div className={styles.folderShelf} role="tablist" aria-label="Organization workspace folders">
            {visibleFolders.map((folder, index) => {
              const Icon = folder.icon;
              const selected = activeFolder.key === folder.key;
              return (
                <button
                  className={`${styles.folder} ${styles[folder.tone] || ""} ${selected ? styles.folderActive : ""}`}
                  key={folder.key}
                  type="button"
                  role="tab"
                  id={`organization-folder-${folder.key}`}
                  aria-selected={selected}
                  aria-controls="organization-folder-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => onActiveFolderChange(folder.key)}
                  onKeyDown={(event) => {
                    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) return;
                    event.preventDefault();
                    const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
                    const nextIndex = (index + direction + visibleFolders.length) % visibleFolders.length;
                    const nextFolder = visibleFolders[nextIndex];
                    setActiveFolderKey(nextFolder.key);
                    document.getElementById(`organization-folder-${nextFolder.key}`)?.focus();
                  }}
                >
                  <span className={styles.folderTab} aria-hidden="true" />
                  <span className={styles.folderHeader}>
                    <span className={styles.folderIcon}><Icon size={19} aria-hidden="true"/></span>
                    <span className={styles.toolCount}>{folder.links.length} tools</span>
                  </span>
                  <span className={styles.folderTitle}>{folder.title}</span>
                  <span className={styles.folderDescription}>{folder.description}</span>
                </button>
              );
            })}
          </div>
          <section
            className={styles.folderPanel}
            id="organization-folder-panel"
            role="tabpanel"
            aria-labelledby={`organization-folder-${activeFolder.key}`}
          >
            <div className={styles.folderPanelHeading}>
              <span className={styles.eyebrow}>Selected folder</span>
              <h3>{activeFolder.title}</h3>
              <p>{activeFolder.description}</p>
            </div>
            <div className={styles.folderActions}>
              {activeFolder.links.map((item, index) => (
                <Link className={styles.folderAction} href={organizationHref(item.href)} key={item.href + item.label}>
                  <span><strong>{item.label}</strong><small>{index === 0 ? "Open this workspace" : "Continue to this function"}</small></span>
                  <span aria-hidden="true">↗</span>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
