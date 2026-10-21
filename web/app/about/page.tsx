"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight, BadgeCheck, BookOpenCheck, BriefcaseBusiness, Building2, ChevronDown,
  CircleHelp, ClipboardList, Eye, Handshake, LockKeyhole, Network, ShieldCheck,
  Sparkles, UserRoundCheck, UsersRound, Wrench
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import styles from "./about.module.css";

const audiences = [
  {
    id: "professional",
    label: "I’m a professional",
    heading: "Build your next step around your skills.",
    body: "Explore membership, discover public services and job opportunities, learn about mentorship, and choose what you want to share in your professional journey.",
    actions: [{ label: "Explore membership", href: "/membership" }, { label: "Find opportunities", href: "/jobs" }]
  },
  {
    id: "organization",
    label: "I represent an organization",
    heading: "Find a clearer way to connect with talent.",
    body: "Learn about organization participation, submit details for review where required, and explore the platform’s service and recruitment pathways.",
    actions: [{ label: "Organization area", href: "/organizations" }, { label: "Browse services", href: "/services" }]
  },
  {
    id: "exploring",
    label: "I’m just exploring",
    heading: "Start with what is publicly available.",
    body: "Browse published services, public job opportunities, shareable professional profiles and reviewed community topics before deciding what to do next.",
    actions: [{ label: "Browse services", href: "/services" }, { label: "See the network", href: "/network" }]
  }
] as const;

const capabilities = [
  { icon: UserRoundCheck, title: "Professional identity and membership", text: "A pathway to submit professional details and follow membership steps, with review and eligibility determined by the relevant workflow." },
  { icon: Wrench, title: "Professional services", text: "Explore published service listings and follow the available route to contact or request help." },
  { icon: BriefcaseBusiness, title: "Jobs and recruitment", text: "Find public vacancies and use the application process provided for each opportunity." },
  { icon: Handshake, title: "Mentorship and learning", text: "Explore mentorship and guidance, whether you are looking for support or are ready to share experience." },
  { icon: UsersRound, title: "Professional discovery", text: "Discover profiles that are available for public viewing. A listing is not a guarantee of endorsement or a particular outcome." },
  { icon: Building2, title: "Organization participation", text: "Organizations can explore registration and participation pathways, with access depending on review, account status and permissions." }
] as const;

const principles = [
  {
    icon: Eye,
    title: "Public means intentionally shareable",
    text: "Public network sections are designed to show published listings and profiles made available for discovery. Private requests and supporting evidence should not be displayed as public content."
  },
  {
    icon: ShieldCheck,
    title: "Review is part of the journey",
    text: "Where a workflow requires review, the platform can communicate the application or submission status and the next action. Review does not mean every claim, listing or outcome is guaranteed."
  },
  {
    icon: ClipboardList,
    title: "Clear steps matter",
    text: "Application and request workflows are intended to show meaningful status, references or follow-up actions when those are provided by the underlying process."
  }
] as const;

function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.16 }}
      transition={{ duration: 0.45, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

export default function AboutPage() {
  const [audience, setAudience] = useState<(typeof audiences)[number]["id"]>("professional");
  const selectedAudience = audiences.find((item) => item.id === audience) ?? audiences[0];
  const reduceMotion = useReducedMotion();

  return (
    <div className={styles.page}>
      <div className={styles.ambientGlow} aria-hidden="true" />
      <section className={styles.hero} aria-labelledby="about-title">
        <motion.div
          className={styles.heroCopy}
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <p className={styles.eyebrow}><span className={styles.eyebrowDot} /> About MPA</p>
          <h1 id="about-title">A professional network should help you turn <span>connections into contribution.</span></h1>
          <p className={styles.heroLead}>MPA Professionals Network brings professional discovery, services, job opportunities, mentorship and membership journeys into one place—with clearer steps for people and organizations to participate.</p>
          <div className={styles.heroActions}>
            <Link href="/services" className={styles.primaryCta}>Explore professional services <ArrowRight size={17} aria-hidden="true" /></Link>
            <Link href="/membership" className={styles.secondaryCta}>Understand membership</Link>
          </div>
          <div className={styles.heroSignals}>
            <span><Network size={16} aria-hidden="true" /> Connections with purpose</span>
            <span><LockKeyhole size={16} aria-hidden="true" /> Privacy-aware access</span>
          </div>
        </motion.div>
        <Reveal className={styles.heroPanel}>
          <div className={styles.panelOrbit} aria-hidden="true"><span /><span /><span /></div>
          <div className={styles.panelHeading}>
            <span className={styles.panelIcon}><Sparkles size={20} aria-hidden="true" /></span>
            <div><strong>One connected experience</strong><small>Explore the path that fits your goal</small></div>
          </div>
          <div className={styles.panelPath}>
            <span className={styles.pathNode}><UserRoundCheck size={17} aria-hidden="true" /></span>
            <div><strong>Build your professional journey</strong><small>Membership, identity and participation</small></div>
          </div>
          <div className={styles.pathConnector} aria-hidden="true" />
          <div className={styles.panelPath}>
            <span className={styles.pathNode}><BookOpenCheck size={17} aria-hidden="true" /></span>
            <div><strong>Discover ways to contribute</strong><small>Services, jobs and mentorship</small></div>
          </div>
          <div className={styles.pathConnector} aria-hidden="true" />
          <div className={styles.panelPath}>
            <span className={styles.pathNode}><Handshake size={17} aria-hidden="true" /></span>
            <div><strong>Follow the next action</strong><small>Use the status and guidance provided</small></div>
          </div>
          <p className={styles.panelNote}>The exact steps depend on the service, account status and workflow.</p>
        </Reveal>
      </section>

      <section className={styles.section} aria-labelledby="purpose-title">
        <Reveal className={styles.sectionHeading}>
          <p className={styles.eyebrow}>What it is for</p>
          <h2 id="purpose-title">More than a list of names.</h2>
          <p>Use the network to find what is available, understand how to participate and move toward a useful next step—without assuming that every listing or request has the same status.</p>
        </Reveal>
        <div className={styles.capabilityGrid}>
          {capabilities.map(({ icon: Icon, title, text }, index) => (
            <Reveal key={title} delay={index * 0.045} className={styles.capabilityWrap}>
              <article className={styles.capabilityCard}>
                <span className={styles.capabilityIcon}><Icon size={21} aria-hidden="true" /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="pathways-title">
        <Reveal className={styles.sectionHeading}>
          <p className={styles.eyebrow}>Start where you are</p>
          <h2 id="pathways-title">Your path depends on your goal.</h2>
          <p>Select the description that best fits you to see relevant starting points. These choices guide you to existing areas of the platform; they do not change your account permissions.</p>
        </Reveal>
        <div className={styles.audienceChooser} role="group" aria-label="Choose your starting point">
          {audiences.map((item) => (
            <button
              key={item.id}
              type="button"
              className={audience === item.id ? styles.audienceTabActive : styles.audienceTab}
              aria-pressed={audience === item.id}
              onClick={() => setAudience(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <motion.article
          className={styles.audiencePanel}
          key={selectedAudience.id}
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          aria-live="polite"
        >
          <span className={styles.audiencePanelIcon}><CircleHelp size={22} aria-hidden="true" /></span>
          <div className={styles.audiencePanelCopy}>
            <h3>{selectedAudience.heading}</h3>
            <p>{selectedAudience.body}</p>
            <div className={styles.audienceActions}>
              {selectedAudience.actions.map((action) => (
                <Link key={action.href} href={action.href} className={styles.inlineLink}>{action.label} <ArrowRight size={15} aria-hidden="true" /></Link>
              ))}
            </div>
          </div>
        </motion.article>
      </section>

      <section className={styles.section} aria-labelledby="trust-title">
        <Reveal className={styles.sectionHeading}>
          <p className={styles.eyebrow}>Trust, privacy and accountability</p>
          <h2 id="trust-title">Clear boundaries build confidence.</h2>
          <p>Good network experiences need useful information and sensible limits. These principles describe the intended experience; access still depends on the actual workflow and permissions.</p>
        </Reveal>
        <div className={styles.principlesGrid}>
          {principles.map(({ icon: Icon, title, text }, index) => (
            <Reveal key={title} delay={index * 0.06}>
              <article className={styles.principleCard}>
                <span className={styles.principleIcon}><Icon size={20} aria-hidden="true" /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            </Reveal>
          ))}
        </div>
        <div className={styles.privacyNote}>
          <LockKeyhole size={20} aria-hidden="true" />
          <p><strong>Keep private information private.</strong> Share only what is needed for a workflow. Do not assume that an application, request, contact detail or supporting document is public just because the platform has public discovery areas.</p>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="questions-title">
        <Reveal className={styles.sectionHeading}>
          <p className={styles.eyebrow}>A few useful clarifications</p>
          <h2 id="questions-title">Before you get started.</h2>
        </Reveal>
        <div className={styles.faqList}>
          <details className={styles.faqItem}>
            <summary>Do I need to join before I can explore? <ChevronDown size={18} aria-hidden="true" /></summary>
            <p>You can browse areas that are publicly available. Some actions, submissions or private information require an account, membership status or additional permission.</p>
          </details>
          <details className={styles.faqItem}>
            <summary>Does a published profile or listing guarantee an outcome? <ChevronDown size={18} aria-hidden="true" /></summary>
            <p>No. Public availability helps people discover an opportunity or service; it does not guarantee endorsement, employment, a service agreement or a particular result. Check the details and make your own informed decision.</p>
          </details>
          <details className={styles.faqItem}>
            <summary>How will I know what happens after I submit something? <ChevronDown size={18} aria-hidden="true" /></summary>
            <p>Use the relevant application or request area to check its status and any next action shown. The available status, reference and follow-up options vary by workflow.</p>
          </details>
          <details className={styles.faqItem}>
            <summary>What if I cannot find a suitable service or opportunity? <ChevronDown size={18} aria-hidden="true" /></summary>
            <p>Try another network area, return when new public listings become available, or explore shared community needs. Private requests should only appear publicly when they have been approved for sharing.</p>
          </details>
        </div>
      </section>

      <section className={styles.section}>
        <Reveal className={styles.finalCta}>
          <div className={styles.finalIcon}><BadgeCheck size={23} aria-hidden="true" /></div>
          <p className={styles.eyebrow}>Take the next step</p>
          <h2>Find the part of the network that fits you.</h2>
          <p>Start by exploring services, discover opportunities, or review membership information before you decide how to participate.</p>
          <div className={styles.finalActions}>
            <Link href="/services" className={styles.finalPrimary}>Browse services <ArrowRight size={16} aria-hidden="true" /></Link>
            <Link href="/membership" className={styles.finalSecondary}>Explore membership</Link>
            <Link href="/" className={styles.finalTextLink}>Return home</Link>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
