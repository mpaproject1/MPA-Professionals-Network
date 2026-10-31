"use client";

import { Accessibility, ArrowRight, BarChart3, BriefcaseBusiness, ChartNoAxesCombined, GraduationCap, HandHeart, ShieldCheck, UserRoundCheck, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import styles from "./about.module.css";


const pathways = [
  { title: "Job Portal", description: "Browse public job opportunities and follow the application steps shown for each listing.", href: "/jobs", action: "Browse jobs", Icon: BriefcaseBusiness },
  { title: "Serve-Community", description: "Explore published community initiatives, volunteer opportunities and completed participation journeys.", href: "/serve-community", action: "Explore initiatives", Icon: HandHeart },
  { title: "Mentorship", description: "Explore mentorship information and the available mentor-request journey.", href: "/mentorship", action: "Explore mentorship", Icon: GraduationCap },
  { title: "Membership", description: "Learn about membership and follow the application and review steps provided by the platform.", href: "/membership", action: "Understand membership", Icon: UserRoundCheck },
] as const;

type CompletedProject = { id: string; source?: string; title: string; category: string; summary: string; completedAt?: string; completedMemberParticipations?: number; publicStory?: string; locationLabel?: string; beneficiaryCount?: number | null; beneficiaryDefinition?: string | null; outcomeMetrics?: { label: string; value: string; unit: string }[]; imageUrls?: string[]; videoUrls?: string[]; imageAltText?: string[] };
type CompletedPortfolio = { items: CompletedProject[]; minimumReportableGroupSize: number; measurementNote: string };

const categoryLabels: Record<string, string> = {
  education: "Education", community_care: "Community care", digital_inclusion: "Digital inclusion",
  environment: "Environment", livelihoods: "Livelihoods", accessibility: "Accessibility", other: "Community initiative",
};

function CompletedProjects() {
  const [portfolio, setPortfolio] = useState<CompletedPortfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api<CompletedPortfolio>("/api/v1/public/serve-community/completed-projects");
      setPortfolio(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Completed project records could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className={styles.portfolio} aria-labelledby="completed-projects-title">
      <div className={styles.sectionHeading}>
        <p className={styles.eyebrow}>Platform records and reviewed offline work</p>
        <h2 id="completed-projects-title">Completed Projects</h2>
        <p>Explore platform initiatives and staff-reviewed projects delivered offline. Participation counts, beneficiary figures and outcome measures are shown only under their separate evidence and review rules.</p>
      </div>
      {loading ? <p className={styles.portfolioState} role="status">Loading completed project records…</p> :
        error ? <div className={styles.portfolioState} role="alert"><p>{error}</p><button type="button" className={styles.secondaryAction} onClick={() => void load()}>Retry</button></div> :
        portfolio?.items.length ? <>
          <div className={styles.portfolioGrid}>
            {portfolio.items.map(project => (
              <article className={styles.projectCard} key={project.id}>
                <div className={styles.projectMeta}><span>{categoryLabels[project.category] || "Community initiative"}</span>{project.source === "offline_staff_record" ? <span>Offline project</span> : null}<span className={styles.completedMark}><ShieldCheck size={14} aria-hidden="true" /> Completed</span></div>
                <h3>{project.title}</h3>
                <p>{project.summary}</p>
                {project.publicStory ? <p>{project.publicStory}</p> : null}
                {project.locationLabel ? <p className={styles.projectDate}>{project.locationLabel}</p> : null}
                {project.imageUrls?.length ? <div className={styles.projectMedia}>{project.imageUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt={project.imageAltText?.[index] || "Completed project photograph"} loading="lazy" /></a>)}</div> : null}
                {project.videoUrls?.length ? <div className={styles.projectVideos}>{project.videoUrls.map(url => <a key={url} href={url} target="_blank" rel="noreferrer">Watch project video <ArrowRight size={14} aria-hidden="true" /></a>)}</div> : null}
                {project.completedMemberParticipations !== undefined ? <div className={styles.projectCount}><Users size={18} aria-hidden="true" /><strong>{project.completedMemberParticipations.toLocaleString()}</strong><span>members with completed participation records</span></div> : null}
                {project.beneficiaryCount !== undefined && project.beneficiaryCount !== null ? <div className={styles.projectCount}><Users size={18} aria-hidden="true" /><strong>{project.beneficiaryCount.toLocaleString()}</strong><span>{project.beneficiaryDefinition || "beneficiaries reached"} · reported</span></div> : null}
                {project.outcomeMetrics?.length ? <ul className={styles.projectOutcomes}>{project.outcomeMetrics.map(metric => <li key={metric.label}><strong>{metric.value} {metric.unit}</strong><span>{metric.label}</span></li>)}</ul> : null}
                {project.completedAt ? <p className={styles.projectDate}>Completed {new Date(project.completedAt).toLocaleDateString()}</p> : null}
              </article>
            ))}
          </div>
          <p className={styles.measurementNote}>{portfolio.measurementNote}</p>
        </> : <div className={styles.portfolioState} role="status"><ChartNoAxesCombined size={24} aria-hidden="true" /><h3>No reportable completed projects yet</h3><p>Approved platform initiatives that meet the privacy reporting threshold and independently reviewed offline project records will appear here.</p></div>}
    </section>
  );
}

export default function AboutPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="about-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span aria-hidden="true" /> About MPA Professionals Network</p>
          <h1 id="about-title">Professional connections, directed toward <span>meaningful contribution.</span></h1>
          <p className={styles.lead}>MPA Professionals Network connects professionals, members and organizations through clear, accountable journeys for opportunity, service, mentorship, collaboration and membership.</p>
          <div className={styles.actions}>
            <Link href="#pathways-title" className={styles.primaryAction}>Explore pathways <ArrowRight size={17} aria-hidden="true" /></Link>
            <Link href="/jobs" className={styles.secondaryAction}>Browse the Job Portal</Link>
          </div>
        </div>
        <figure className={styles.illustration}>
          <img src="/illustrations/mpa-network-placeholder.svg" alt="Abstract illustration of people and professional pathways connected in the MPA network" />
          <figcaption>MPA navy and lemon visual identity</figcaption>
        </figure>
      </section>

      <section className={styles.pathways} aria-labelledby="pathways-title">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>Explore the network</p>
          <h2 id="pathways-title">Four clear starting points.</h2>
          <p>Choose the public pathway that best matches your goal. Access to specific actions depends on the relevant account status, eligibility and workflow.</p>
        </div>
        <div className={styles.pathwayGrid}>
          {pathways.map(({ title, description, href, action, Icon }) => (
            <article className={styles.pathwayCard} key={title}>
              <span className={styles.pathwayIcon}><Icon size={22} aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{description}</p>
              <Link href={href} className={styles.pathwayLink}>{action} <ArrowRight size={15} aria-hidden="true" /></Link>
            </article>
          ))}
        </div>
      </section>

      <CompletedProjects />

      <section className={styles.experience} aria-labelledby="experience-title">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>Designed around people and progress</p>
          <h2 id="experience-title">A connected experience, with clear next steps.</h2>
          <p>The platform brings related work into one coherent experience while keeping each workflow, permission and decision distinct.</p>
        </div>
        <div className={styles.experienceGrid}>
          <article><span><BarChart3 size={21} aria-hidden="true" /></span><h3>Progress you can understand</h3><p>Profile completion, application status, milestones and dashboard summaries help members see what is recorded, what is pending and what action comes next.</p></article>
          <article><span><ShieldCheck size={21} aria-hidden="true" /></span><h3>Trust and privacy by design</h3><p>Verification, membership approval, payment confirmation and participation consent remain separate. Private evidence and personal records are not public portfolio content.</p></article>
          <article><span><Accessibility size={21} aria-hidden="true" /></span><h3>Usable on every screen</h3><p>Responsive layouts, readable status labels, keyboard access, visible focus and clear touch targets support mobile, tablet and desktop use.</p></article>
          <article><span><ChartNoAxesCombined size={21} aria-hidden="true" /></span><h3>Impact grounded in records</h3><p>Charts and public showcases should reflect system records with clear definitions. Missing or unverified outcomes are never replaced with estimates or invented success stories.</p></article>
        </div>
      </section>

      <section className={styles.process} aria-labelledby="process-title">
        <div className={styles.processIcon}><ShieldCheck size={23} aria-hidden="true" /></div>
        <div>
          <p className={styles.eyebrow}>How participation works</p>
          <h2 id="process-title">Clear steps. Respect for privacy.</h2>
          <p>Public pages show published listings and information intentionally made available for discovery. Where a process requires an account, review, consent or approval, those requirements remain separate. A listing or profile does not guarantee endorsement, employment, service delivery or a particular outcome.</p>
        </div>
      </section>

      <section className={styles.finalCta} aria-labelledby="final-title">
        <div>
          <p className={styles.eyebrow}>Take the next step</p>
          <h2 id="final-title">Start with the pathway that fits you.</h2>
          <p>Review membership information and choose how you want to participate.</p>
        </div>
        <Link href="/membership" className={styles.primaryAction}>Explore membership <ArrowRight size={17} aria-hidden="true" /></Link>
      </section>
    </main>
  );
}
