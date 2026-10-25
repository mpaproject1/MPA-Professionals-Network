"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BriefcaseBusiness, GraduationCap, LockKeyhole, Network, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import Link from "next/link";
import styles from "./landing-redesign.module.css";

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
  const reduceMotion = useReducedMotion();

  return (
    <div className={styles.page}>
      <div className={styles.ambientGlow} aria-hidden="true" />
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroBackdrop} aria-hidden="true">
          <svg className={styles.heroMesh} viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" focusable="false">
            <defs>
              <linearGradient id="heroMeshNavy" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#071927" stopOpacity=".18" />
                <stop offset="50%" stopColor="#0A3258" stopOpacity=".82" />
                <stop offset="100%" stopColor="#071927" stopOpacity=".2" />
              </linearGradient>
              <linearGradient id="heroMeshLime" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1B4D80" stopOpacity=".2" />
                <stop offset="50%" stopColor="#97C024" stopOpacity=".8" />
                <stop offset="100%" stopColor="#1B4D80" stopOpacity=".22" />
              </linearGradient>
              <pattern id="heroConstellationLight" width="200" height="200" patternUnits="userSpaceOnUse">
                <path d="M20 30 100 10 170 60 120 140 40 160Z M100 10 40 160 M170 60 20 30 M120 140 100 10" fill="none" stroke="url(#heroMeshNavy)" strokeWidth=".8" />
                <path d="M170 60 220 30 M120 140 180 220 M40 160-20 180" fill="none" stroke="url(#heroMeshNavy)" strokeWidth=".8" />
                <circle cx="20" cy="30" r="2.5" fill="#071927" /><circle cx="100" cy="10" r="3" fill="#0A3258" />
                <circle cx="170" cy="60" r="2.5" fill="#071927" /><circle cx="120" cy="140" r="3" fill="#0A3258" /><circle cx="40" cy="160" r="2" fill="#071927" />
              </pattern>
              <pattern id="heroConstellationDark" width="200" height="200" patternUnits="userSpaceOnUse">
                <path d="M20 30 100 10 170 60 120 140 40 160Z M100 10 40 160 M170 60 20 30 M120 140 100 10" fill="none" stroke="url(#heroMeshLime)" strokeWidth=".8" />
                <path d="M170 60 220 30 M120 140 180 220 M40 160-20 180" fill="none" stroke="url(#heroMeshLime)" strokeWidth=".8" />
                <circle cx="20" cy="30" r="2.5" fill="#97C024" /><circle cx="100" cy="10" r="3" fill="#C5E64B" />
                <circle cx="170" cy="60" r="2.5" fill="#FFFFFF" /><circle cx="120" cy="140" r="3" fill="#97C024" /><circle cx="40" cy="160" r="2" fill="#1B4D80" />
              </pattern>
              <linearGradient id="heroArchNavy" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#C5E64B" stopOpacity=".08" /><stop offset="35%" stopColor="#0A3258" stopOpacity=".24" />
                <stop offset="75%" stopColor="#071927" stopOpacity=".3" /><stop offset="100%" stopColor="#071927" stopOpacity=".38" />
              </linearGradient>
              <linearGradient id="heroArchLime" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#0A3258" stopOpacity=".05" /><stop offset="35%" stopColor="#97C024" stopOpacity=".2" />
                <stop offset="75%" stopColor="#C5E64B" stopOpacity=".32" /><stop offset="100%" stopColor="#FFFFFF" stopOpacity=".42" />
              </linearGradient>
              <pattern id="heroArchGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M20 0H0V20" fill="none" stroke="currentColor" strokeWidth=".5" strokeOpacity=".24" />
              </pattern>
            </defs>
            <rect width="1200" height="800" fill="url(#heroConstellationLight)" className={styles.meshLight} />
            <rect width="1200" height="800" fill="url(#heroConstellationDark)" className={styles.meshDark} />
            <path d="M180 800V360C180 140 480 30 600 30S1020 140 1020 360V800H960V370C960 180 700 80 600 80S240 180 240 370V800Z" fill="url(#heroArchNavy)" className={styles.archLight} />
            <path d="M180 800V360C180 140 480 30 600 30S1020 140 1020 360V800H960V370C960 180 700 80 600 80S240 180 240 370V800Z" fill="url(#heroArchLime)" className={styles.archDark} />
            <path d="M180 800V360C180 140 480 30 600 30S1020 140 1020 360V800 M240 800V370C240 180 500 80 600 80S960 180 960 370V800" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="6 6" opacity=".5" />
          </svg>
          <span className={styles.heroGlowOne} /><span className={styles.heroGlowTwo} />
        </div>
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
        </div>

        <Reveal className={styles.heroVisual}>
          <svg className={styles.glowingArch} viewBox="0 0 240 250" fill="none" aria-hidden="true" focusable="false">
            <path d="M18 250V118C18 55 62 12 120 12S222 55 222 118V250" stroke="currentColor" strokeWidth="2" />
            <path d="M39 250V121C39 69 73 35 120 35S201 69 201 121V250" stroke="currentColor" strokeWidth="1" strokeOpacity=".62" />
            <path d="M120 12V2M222 118H238" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <div className={styles.visualOrb} aria-hidden="true"><div /><div /><div /></div>
          <div className={styles.visualTopline}>
            <span className={styles.visualMark}><Network size={17} aria-hidden="true" /></span>
            <span><strong>Participation with clear boundaries</strong><small>Review, consent and access stay distinct</small></span>
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
          <div className={styles.visualFootnote}><span aria-hidden="true" /> Public discovery does not override privacy settings, eligibility or required approvals.</div>
        </Reveal>
      </section>
    </div>
  );
}
