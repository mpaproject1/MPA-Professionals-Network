"use client";

import { ArrowRight, HeartHandshake, ShieldCheck, UsersRound, Wrench } from "lucide-react";
import Link from "next/link";
import styles from "./landing-redesign.module.css";

const destinations = [
  { href: "/serve-community", title: "Serve-Community", description: "Discover community service programs, make commitments and follow delivery through to verified outcomes.", detail: "Services · Needs · Impact", icon: Wrench },
  { href: "/mentorship", title: "Mentorship", description: "Find guidance, share professional experience and follow a clear, consent-based mentorship journey.", detail: "Guidance · Growth · Connection", icon: HeartHandshake },
  { href: "/membership", title: "Membership", description: "Understand membership, eligibility and the steps required to participate in the professional network.", detail: "Eligibility · Approval · Participation", icon: ShieldCheck },
] as const;

export default function Home() {
  return (
    <main className={styles.homeMinimal}>
      <header className={styles.homeIntro}>
        <span className={styles.homeKicker}><UsersRound size={15} aria-hidden="true" /> Ethiopian Muslim Professionals Association</span>
        <h1>Professional connection.<br /><span>Community impact.</span></h1>
        <p>A clear place to contribute expertise, find guidance and take part in meaningful community work.</p>
      </header>
      <nav className={styles.homeDestinations} aria-label="Explore the network">
        {destinations.map(({ href, title, description, detail, icon: Icon }) => (
          <Link href={href} key={href} className={styles.homeDestination}>
            <span className={styles.homeDestinationIcon}><Icon size={22} aria-hidden="true" /></span>
            <span className={styles.homeDestinationCopy}>
              <span className={styles.homeDestinationTitle}>{title}</span>
              <span className={styles.homeDestinationDescription}>{description}</span>
              <span className={styles.homeDestinationDetail}>{detail}</span>
            </span>
            <ArrowRight className={styles.homeDestinationArrow} size={19} aria-hidden="true" />
          </Link>
        ))}
      </nav>
      <p className={styles.homeTrust}><ShieldCheck size={15} aria-hidden="true" /> Participation follows applicable verification, consent and approval requirements.</p>
    </main>
  );
}
