"use client";

import { ArrowRight, LogIn } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { ApiError, api } from "../lib/api";
import { useUiStore } from "../lib/store";

export function LandingLoginForm() {
  const router = useRouter();
  const setToken = useUiStore((state) => state.setToken);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ token: string; passkeyEnrollmentRequired?: boolean }>(
        "/api/v1/auth/login",
        { method: "POST", body: JSON.stringify({ email, password }) },
      );
      setToken(result.token);
      if (result.passkeyEnrollmentRequired) {
        router.replace("/admin/security?enroll=1");
        return;
      }
      const requested = new URLSearchParams(window.location.search).get("next");
      const destination = requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/dashboard";
      router.replace(destination);
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "EMAIL_VERIFICATION_REQUIRED") {
        setError("Please verify your email address using the latest activation link before signing in.");
      } else {
        setError(cause instanceof Error ? cause.message : "We could not sign you in. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#0A3258] text-[#D9F58A]"><LogIn size={20} aria-hidden="true" /></span>
        <div><p className="m-0 text-xs font-bold uppercase tracking-[.13em] text-[var(--primary)]">Member access</p><h2 className="m-0 mt-1 text-xl font-extrabold tracking-tight text-[var(--text)]">Welcome back</h2></div>
      </div>
      <p className="mb-5 text-sm leading-6 text-[var(--muted)]">Sign in to continue to your MPA workspace.</p>
      <form onSubmit={submit} aria-busy={busy} className="grid gap-3">
        <label className="grid gap-1.5 text-sm font-semibold text-[var(--text)]">Email or username
          <input required name="username" type="text" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" placeholder="you@example.org" disabled={busy} className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-[#97C024]" />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-[var(--text)]">Password
          <input required name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" disabled={busy} className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-[#97C024]" />
        </label>
        {error ? <p role="alert" className="m-0 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm leading-5 text-red-700 dark:text-red-200">{error}</p> : null}
        <button type="submit" disabled={busy} className="mt-1 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#0A3258] bg-[#0A3258] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#174a76] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#97C024] disabled:cursor-wait disabled:opacity-70">{busy ? "Signing in securely…" : "Sign in"} <ArrowRight size={16} aria-hidden="true" /></button>
      </form>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link className="font-semibold text-[var(--primary)] underline-offset-4 hover:underline" href="/login">More sign-in options</Link>
        <Link className="font-semibold text-[var(--primary)] underline-offset-4 hover:underline" href="/register">Create an account</Link>
      </div>
    </div>
  );
}
