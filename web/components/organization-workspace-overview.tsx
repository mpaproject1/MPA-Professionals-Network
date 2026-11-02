"use client";

import Link from "next/link";
import { useState } from "react";
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

type OrganizationAccess = {
  id: string;
  display_name: string;
  legal_name: string;
  verification_status?: string;
  role_code: string;
  membership_status: string;
};

type Folder = {
  key: string;
  title: string;
  description: string;
  icon: typeof BriefcaseBusiness;
  tone: string;
  links: { label: string; href: string }[];
};

const folders: Folder[] = [
  {
    key: "publishing",
    title: "Publishing",
    description: "Create and manage professional opportunities.",
    icon: BriefcaseBusiness,
    tone: "publishing",
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
  if (organization.verification_status === "verified") {
    return { label: "Verified", detail: "Organization verification has been approved.", tone: "verified" };
  }
  if (state === "submitted" || state === "pending" || organization.verification_status === "pending") {
    return { label: "Under review", detail: "Your submission is awaiting an authorized MPA review. No further submission is needed while it is pending.", tone: "pending" };
  }
  if (state === "correction_required") {
    return { label: "Changes requested", detail: "Review the feedback and provide the outstanding information or evidence.", tone: "attention" };
  }
  if (state === "rejected") {
    return { label: "Not approved", detail: "The application was not approved. Review the recorded decision before taking another step.", tone: "attention" };
  }
  return { label: "Setup in progress", detail: "Complete the required evidence checklist and submit the organization for review.", tone: "draft" };
}

export function OrganizationWorkspaceOverview({
  organizations,
  organizationAccess,
  authenticated,
  organizationLookupReady,
  onRetry,
  onRegister,
}: {
  organizations: Organization[];
  organizationAccess: OrganizationAccess[];
  authenticated: boolean;
  organizationLookupReady: boolean;
  onRetry: () => void;
  onRegister: () => void;
}) {
  const verified = organizations.filter((item) => item.verification_status === "verified");
  const awaiting = organizations.filter((item) => {
    const state = item.verification_case_status || item.verification_status;
    return state === "submitted" || state === "pending" || item.verification_status === "pending";
  });
  const attention = organizations.filter((item) => item.verification_case_status === "correction_required");
  const hasVerifiedOrganization = verified.length > 0;
  const [activeFolderKey, setActiveFolderKey] = useState("publishing");
  const activeFolder = folders.find((folder) => folder.key === activeFolderKey) || folders[0];

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
        <Link className={styles.refreshLink} href="/organizations#your-organizations">View status details <span aria-hidden="true">↗</span></Link>
      </header>

      <div className={styles.metrics} aria-label="Organization registration summary">
        <div className={styles.metric}><span>Organizations linked</span><strong>{organizations.length.toString().padStart(2, "0")}</strong></div>
        <div className={styles.metric}><span>Verified</span><strong>{verified.length.toString().padStart(2, "0")}</strong></div>
        <div className={styles.metric}><span>Awaiting review</span><strong>{awaiting.length.toString().padStart(2, "0")}</strong></div>
        <div className={styles.metric}><span>Need attention</span><strong>{attention.length.toString().padStart(2, "0")}</strong></div>
      </div>

      {!hasVerifiedOrganization ? (
        <div className={styles.statusList}>
          {organizations.map((organization) => {
            const status = statusFor(organization);
            return (
              <article className={styles.statusCard} key={organization.id}>
                <div className={styles.statusTop}>
                  <div><strong>{organization.display_name || organization.legal_name}</strong><span>{organization.tracking_reference || "Application reference pending"}{organization.role_code ? ` · ${organization.role_code.replaceAll("_", " ")}` : ""}</span></div>
                  <span className={`${styles.statusPill} ${styles[status.tone] || ""}`}>{status.label}</span>
                </div>
                <p>{status.detail}</p>
                {organization.verification_decision_reason ? <p className={styles.reviewNote}><strong>Reviewer feedback:</strong> {organization.verification_decision_reason}</p> : null}
                {(organization.missing_evidence || []).length > 0 && status.tone !== "pending" ? <p className={styles.reviewNote}><strong>Outstanding:</strong> {(organization.missing_evidence || []).map((item) => item.replaceAll("_", " ")).join(", ")}</p> : null}
                {status.tone !== "pending" && <Link className="btn btn-primary" href="/organizations#org-evidence">Continue verification</Link>}
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
            {folders.map((folder) => {
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
                  onClick={() => setActiveFolderKey(folder.key)}
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
                <Link className={styles.folderAction} href={item.href} key={item.href + item.label}>
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
