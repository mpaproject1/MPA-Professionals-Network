"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, GraduationCap, LayoutDashboard, LockKeyhole, Network, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import styles from "./landing-redesign.module.css";
import { LandingLoginForm } from "../components/landing-login-form";
import { PortalPathwaysSlider } from "../components/portal-pathways-slider";
import { useUiStore } from "../lib/store";


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
  const token = useUiStore((state) => state.token);

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
          <Link href="#live-network" className={styles.scrollHint}>Explore what is available <ArrowDown size={15} aria-hidden="true" /></Link>
        </div>

        {token ? (
          <Reveal className={styles.heroVisual}>
            <div className={styles.visualTopline}>
              <span className={styles.visualMark}><Network size={17} aria-hidden="true" /></span>
              <span><strong>Your MPA workspace</strong><small>Continue your professional journey</small></span>
              <Sparkles className={styles.sparkle} size={19} aria-hidden="true" />
            </div>
            <p className={styles.visualPrompt}>Where would you like to continue?</p>
            <div className={styles.quickStarts}>
              <Link href="/members" className={styles.quickStart}>
                <span className={styles.quickIcon}><LayoutDashboard size={19} aria-hidden="true" /></span>
                <span className={styles.quickText}><strong>My-Workspace</strong><small>Membership and application progress</small></span>
                <ArrowRight size={16} aria-hidden="true" className={styles.quickArrow} />
              </Link>
              <Link href="/learning" className={styles.quickStart}>
                <span className={styles.quickIcon}><GraduationCap size={19} aria-hidden="true" /></span>
                <span className={styles.quickText}><strong>My-Learning</strong><small>Resources, courses and certifications</small></span>
                <ArrowRight size={16} aria-hidden="true" className={styles.quickArrow} />
              </Link>
            </div>
            <div className={styles.visualFootnote}><span aria-hidden="true" /> Learning areas are labelled clearly until supported features are released.</div>
          </Reveal>
        ) : (
          <Reveal className={styles.heroVisual}><LandingLoginForm /></Reveal>
        )}
      </section>

      <PortalPathwaysSlider />
