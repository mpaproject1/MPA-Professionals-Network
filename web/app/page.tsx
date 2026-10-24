"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowDown, ArrowRight, BriefcaseBusiness, Building2, Compass, GraduationCap,
  LockKeyhole, Network, Search, ShieldCheck, Sparkles, UserRoundCheck, Wrench
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import styles from "./landing-redesign.module.css";
import LiveNetworkFeeds from "./live-network-feeds";

const journeys = [
  { id: "services", title: "Browse professional services", text: "Explore published services and find a practical next step for the help you need.", href: "/services", action: "Browse services", icon: Wrench, group: "professional" },
  { id: "membership", title: "Join as a professional", text: "Learn about membership and take the next step toward participating in the network.", href: "/membership", action: "Explore membership", icon: UserRoundCheck, group: "professional" },
  { id: "jobs", title: "Find a job", text: "Explore public opportunities and follow the application journey where available.", href: "/jobs", action: "Browse opportunities", icon: BriefcaseBusiness, group: "professional" },
  { id: "mentorship", title: "Find mentorship", text: "Explore guidance, share expertise and learn how mentorship requests work.", href: "/mentorship", action: "Explore mentorship", icon: GraduationCap, group: "professional" },
  { id: "needs", title: "Share a need or find a service", text: "Explore reviewed, shareable community needs while private requests remain private.", href: "/service-demand", action: "Explore shared needs", icon: Search, group: "community" },
  { id: "organizations", title: "Register an organization", text: "Learn how an organization can submit its details for review and participate.", href: "/organizations", action: "Explore organizations", icon: Building2, group: "organization" }
] as const;

const quickStarts = [
  { label: "Find a service", note: "Explore professional help", href: "/services", icon: Wrench },
  { label: "Explore opportunities", note: "See public job listings", href: "/jobs", icon: BriefcaseBusiness },
  { label: "Meet the network", note: "Discover shared profiles", href: "/network", icon: Network }
] as const;

function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.14 }}
      transition={{ duration: 0.48, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

export default function Home() {
  const [journeyFocus, setJourneyFocus] = useState<"all" | "professional" | "organization" | "community">("all");
  const reduceMotion = useReducedMotion();
  const visibleJourneys = journeys.filter((journey) => journeyFocus === "all" || journey.group === journeyFocus);

  return (
    <div className={styles.page}>
      <div className={styles.ambientGlow} aria-hidden="true" />
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroCopy}>
          <motion.div
            className={styles.networkTag}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.45 }}
          >
            <span className={styles.liveDot} aria-hidden="true" />
            MPA Professionals Network
          </motion.div>
          <motion.h1
            id="home-title"
            className={styles.heroTitle}
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.55, delay: 0.06 }}
          >
            Your expertise can open <span>meaningful doors.</span>
          </motion.h1>
          <motion.p
            className={styles.heroSubtitle}
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.5, delay: 0.13 }}
          >
            Discover professional services, explore opportunities, learn from mentors and build purposeful professional connections.
          </motion.p>
          <motion.div
            className={styles.heroActions}
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.5, delay: 0.2 }}
          >
            <Link href="/services" className={styles.primaryCta}>Browse professional services <ArrowRight size={17} aria-hidden="true" /></Link>
            <Link href="/jobs" className={styles.secondaryCta}>Explore opportunities</Link>
            <Link href="/membership" className={styles.loginCta}>Join the network <ArrowRight size={15} aria-hidden="true" /></Link>
          </motion.div>
          <div className={styles.trustSignals} aria-label="Network principles">
            <span><ShieldCheck size={16} aria-hidden="true" /> Evidence-led review</span>
            <span><LockKeyhole size={16} aria-hidden="true" /> Privacy-aware access</span>
            <span><Network size={16} aria-hidden="true" /> Professional connections</span>
          </div>
          <Link href="#live-network" className={styles.scrollHint}>Explore what is available <ArrowDown size={15} aria-hidden="true" /></Link>
        </div>

        <Reveal className={styles.heroVisual}>
          <div className={styles.visualOrb} aria-hidden="true"><div /><div /><div /></div>
          <div className={styles.visualTopline}>
            <span className={styles.visualMark}><Network size={17} aria-hidden="true" /></span>
            <span><strong>One network</strong><small>Many ways to contribute</small></span>
            <Sparkles className={styles.sparkle} size={19} aria-hidden="true" />
          </div>
          <p className={styles.visualPrompt}>What would you like to do today?</p>
          <div className={styles.quickStarts}>
            {quickStarts.map(({ label, note, href, icon: Icon }, index) => (
              <motion.div
                key={href}
                initial={reduceMotion ? false : { opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.38, delay: 0.12 + index * 0.08 }}
              >
                <Link href={href} className={styles.quickStart}>
                  <span className={styles.quickIcon}><Icon size={19} aria-hidden="true" /></span>
                  <span className={styles.quickText}><strong>{label}</strong><small>{note}</small></span>
                  <ArrowRight size={16} aria-hidden="true" className={styles.quickArrow} />
                </Link>
              </motion.div>
            ))}
          </div>
          <div className={styles.visualFootnote}><span aria-hidden="true" /> Start with what matters to you. Your path can grow from there.</div>
        </Reveal>
      </section>

      <section className={styles.section} id="live-network" aria-labelledby="live-network-heading">
        <Reveal className={styles.sectionHeading}>
          <p className={styles.eyebrow}>A view into the network</p>
          <h2 id="live-network-heading">Good work starts with people.</h2>
          <p className={styles.sectionIntro}>Explore current public listings and shared topics. Sections show what is available, explain when nothing is published and let you retry if a feed cannot load.</p>
          <span className={styles.headingRule} />
        </Reveal>
        <LiveNetworkFeeds />
      </section>

      <section className={styles.section} aria-labelledby="journeys-heading">
        <Reveal className={styles.sectionHeading}>
          <p className={styles.eyebrow}>Choose your next step</p>
          <h2 id="journeys-heading">How can we help you today?</h2>
          <p className={styles.sectionIntro}>Start with one goal. You can explore the other parts of the network whenever you are ready.</p>
          <span className={styles.headingRule} />
        </Reveal>
        <div className={styles.journeyFilters} role="group" aria-label="Filter journey cards">
          {([
            ["all", "All journeys"],
            ["professional", "Professionals"],
            ["organization", "Organizations"],
            ["community", "Community"]
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={journeyFocus === value ? styles.journeyFilterActive : styles.journeyFilter}
              aria-pressed={journeyFocus === value}
              onClick={() => setJourneyFocus(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={styles.journeyGrid} aria-live="polite">
          {visibleJourneys.map(({ id, title, text, href, action, icon: Icon }, index) => (
            <Reveal key={id} delay={index * 0.045} className={styles.cardReveal}>
              <article className={styles.journeyCard}>
                <div>
                  <span className={styles.cardIcon}><Icon size={22} aria-hidden="true" /></span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
                <Link href={href} className={styles.cardLink}>{action} <ArrowRight size={16} aria-hidden="true" /></Link>
              </article>
            </Reveal>
          ))}
        </div>
        <p className={styles.filterNote}>Use “All journeys” to see all six starting points together.</p>
      </section>

      <section className={styles.section}>
        <Reveal className={styles.aboutBridge}>
          <div className={styles.aboutBridgeIcon}><Compass size={24} aria-hidden="true" /></div>
          <div className={styles.aboutBridgeCopy}>
            <p className={styles.eyebrow}>Know the network</p>
            <h2>Professional growth should be understandable and accountable.</h2>
            <p>Learn how MPA participation works, what the platform is designed to support, and how privacy-aware access and review fit into the journey.</p>
            <Link href="/about" className={styles.inlineCta}>About MPA and how it works <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <div className={styles.bridgeDecor} aria-hidden="true"><span /><span /><span /></div>
        </Reveal>
      </section>

      <section className={`${styles.section} ${styles.lastSection}`}>
        <Reveal className={styles.finalCta}>
          <div className={styles.finalContent}>
            <p className={styles.eyebrow}>Your next step starts here</p>
            <h2>Bring your skills into the conversation.</h2>
            <p>Browse what is public, choose a journey that fits your goal, or learn about membership before you begin.</p>
            <div className={styles.finalActions}>
              <Link href="/services" className={styles.finalPrimary}>Explore services <ArrowRight size={17} aria-hidden="true" /></Link>
              <Link href="/membership" className={styles.finalSecondary}>Understand membership</Link>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
