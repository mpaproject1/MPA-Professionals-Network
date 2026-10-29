"use client";

import { ArrowLeft, ArrowRight, BriefcaseBusiness, Handshake, HeartHandshake, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const slides = [
  { eyebrow: "Job Portal", title: "Find your next professional opportunity.", description: "Explore public job listings and follow the application steps provided for each role.", href: "/jobs", action: "Browse jobs", Icon: BriefcaseBusiness },
  { eyebrow: "Serve-Community", title: "Put professional skills to community use.", description: "Explore published services and reviewed community pathways. Availability and eligibility follow each service’s workflow.", href: "/serve-community", action: "Explore community service", Icon: HeartHandshake },
  { eyebrow: "Grow with MPA", title: "Build your professional journey.", description: "Learn about mentorship and membership, and choose the pathway that fits your goals.", href: "/mentorship", action: "Explore mentorship", Icon: Handshake },
] as const;

export function PortalPathwaysSlider() {
  const [active, setActive] = useState(0);
  const slide = slides[active];
  const previous = () => setActive((current) => (current + slides.length - 1) % slides.length);
  const next = () => setActive((current) => (current + 1) % slides.length);

  return (
    <section aria-label="Explore MPA pathways" aria-roledescription="carousel" className="mx-auto w-full max-w-6xl px-4 pb-10 sm:px-6 lg:px-10">
      <div className="relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] p-6 shadow-[0_18px_60px_rgba(7,25,39,.08)] sm:p-9">
        <div className="grid items-center gap-7 md:grid-cols-[minmax(0,1fr)_auto]">
          <div key={slide.eyebrow} aria-live="polite" aria-atomic="true" className="min-w-0">
            <div className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.14em] text-[var(--primary)]"><span className="h-2 w-2 rounded-full bg-[#97C024]" />{slide.eyebrow}</div>
            <h2 className="m-0 max-w-2xl text-balance text-2xl font-extrabold leading-tight tracking-tight text-[var(--text)] sm:text-3xl">{slide.title}</h2>
            <p className="mb-0 mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">{slide.description}</p>
            <Link href={slide.href} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0A3258] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#174a76] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#97C024]">{slide.action}<ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <div className="flex items-center gap-3 md:flex-col md:items-end">
            <span className="grid h-16 w-16 place-items-center rounded-2xl border border-[#97C024]/35 bg-[#97C024]/10 text-[#0A3258] dark:text-[#D9F58A]"><slide.Icon size={30} aria-hidden="true" /></span>
            <span className="text-xs font-semibold tabular-nums text-[var(--muted)]">0{active + 1} / 0{slides.length}</span>
          </div>
        </div>
        <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border)] pt-5">
          <div className="flex items-center gap-2" role="group" aria-label="Choose pathway slide">
            {slides.map((item, index) => <button key={item.eyebrow} type="button" aria-label={`Show ${item.eyebrow} slide`} aria-pressed={active === index} onClick={() => setActive(index)} className={active === index ? "h-2.5 w-8 rounded-full bg-[#0A3258] ring-2 ring-[#97C024]/60 dark:bg-[#D9F58A]" : "h-2.5 w-2.5 rounded-full bg-[var(--border)] transition hover:bg-[#97C024]"} />)}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={previous} aria-label="Previous pathway" className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border)] text-[var(--text)] transition hover:border-[#97C024] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#97C024]"><ArrowLeft size={17} aria-hidden="true" /></button>
            <button type="button" onClick={next} aria-label="Next pathway" className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--border)] text-[var(--text)] transition hover:border-[#97C024] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#97C024]"><ArrowRight size={17} aria-hidden="true" /></button>
          </div>
        </div>
      </div>
    </section>
  );
}
