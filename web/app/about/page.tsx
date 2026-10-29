import { ArrowRight, BriefcaseBusiness, GraduationCap, HandHeart, ShieldCheck, UserRoundCheck } from "lucide-react";
import Link from "next/link";
import styles from "./about.module.css";

const pathways = [
  { title: "Job Portal", description: "Browse public job opportunities and follow the application steps shown for each listing.", href: "/jobs", action: "Browse jobs", Icon: BriefcaseBusiness },
  { title: "Serve-Community", description: "Explore published professional services and reviewed community-service pathways.", href: "/serve-community", action: "Explore services", Icon: HandHeart },
  { title: "Mentorship", description: "Explore mentorship information and the available mentor-request journey.", href: "/mentorship", action: "Explore mentorship", Icon: GraduationCap },
  { title: "Membership", description: "Learn about membership and follow the application and review steps provided by the platform.", href: "/membership", action: "Understand membership", Icon: UserRoundCheck },
] as const;

export default function AboutPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="about-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span aria-hidden="true" /> About MPA Professionals Network</p>
          <h1 id="about-title">Professional connections, directed toward <span>meaningful contribution.</span></h1>
          <p className={styles.lead}>MPA Professionals Network brings professional opportunities, community service, mentorship and membership pathways into one place for people and organizations to explore.</p>
          <div className={styles.actions}>
            <Link href="#pathways-title" className={styles.primaryAction}>Explore pathways <ArrowRight size={17} aria-hidden="true" /></Link>
            <Link href="/jobs" className={styles.secondaryAction}>Browse the Job Portal</Link>
          </div>
        </div>
        <figure className={styles.illustration}>
          <img src="/illustrations/mpa-network-placeholder.svg" alt="Abstract illustration of people and professional pathways connected in the MPA network" />
          <figcaption>Original replaceable illustration · MPA navy and lime</figcaption>
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
