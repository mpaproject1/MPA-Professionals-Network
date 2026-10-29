"use client";

import { Award, BookOpen, FileText, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useUiStore } from "../../lib/store";

const learningAreas = [
  { title: "Resources", description: "Curated learning resources and professional references.", Icon: FileText },
  { title: "Courses", description: "A future learning catalogue for courses and structured study.", Icon: BookOpen },
  { title: "Certifications", description: "A future place to view eligible learning certificates and records.", Icon: Award },
] as const;

export default function MyLearningPage() {
  const token = useUiStore((state) => state.token);
  const hydrated = useUiStore((state) => state.hydrated);
  const router = useRouter();

  useEffect(() => {
    if (hydrated && !token) router.replace("/login?next=%2Flearning");
  }, [hydrated, token, router]);

  if (!hydrated || !token) {
    return <main className="mx-auto flex min-h-[55vh] max-w-xl items-center justify-center px-5 py-12"><p role="status" className="text-sm text-[var(--muted)]">Checking your sign-in status…</p></main>;
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-10">
      <header className="max-w-3xl">
        <p className="mb-3 text-xs font-extrabold uppercase tracking-[.15em] text-[var(--primary)]">My-Learning</p>
        <h1 className="m-0 text-3xl font-extrabold tracking-tight text-[var(--text)] sm:text-4xl">Keep your professional learning in one place.</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)]">Learning tools are being prepared. This page is a clear preview of planned areas—not a claim that courses, certificates or learning records are available today.</p>
      </header>
      <section aria-label="Planned learning areas" className="mt-8 grid gap-4 md:grid-cols-3">
        {learningAreas.map(({ title, description, Icon }) => (
          <article key={title} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#97C024]/15 text-[var(--primary)]"><Icon size={22} aria-hidden="true" /></span>
            <h2 className="mb-2 mt-5 text-lg font-bold text-[var(--text)]">{title}</h2>
            <p className="min-h-12 text-sm leading-6 text-[var(--muted)]">{description}</p>
            <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--muted)]"><LockKeyhole size={13} aria-hidden="true" /> Coming soon</span>
          </article>
        ))}
      </section>
      <p className="mt-6 rounded-xl border border-[#97C024]/30 bg-[#97C024]/10 p-4 text-sm leading-6 text-[var(--text)]">No learning activity, CPD credit or certification is created by this preview. Availability will be announced when the underlying service is implemented and approved.</p>
      <Link href="/members" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-[#0A3258] px-4 py-3 text-sm font-bold text-white hover:bg-[#174a76] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#97C024]">Go to My-Workspace</Link>
    </main>
  );
}
