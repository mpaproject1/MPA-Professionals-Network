"use client";

import {
  ArrowRight, BriefcaseBusiness, CheckCircle2, Clock3, Compass, FileCheck2,
  GraduationCap, HelpCircle, RefreshCw, ShieldCheck, UserRound, Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OperationStatus } from "../../components/operation-status";
import { SupportAction } from "../../components/support-action";
import { Badge, Card } from "../../components/ui";
import { VolunteerPledgePanel } from "../../components/volunteer-pledge-panel";
import { CommunityImpactWorkspacePanel } from "../../components/community-impact-workspace-panel";
import { ApiError, api } from "../../lib/api";
import { useUiStore } from "../../lib/store";

type Me = {
  user_id: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  has_active_membership?: boolean;
  completion_percent?: number;
  roles?: string[];
  permissions?: string[];
};
type TrackingItem = {
  id?: string;
  type?: string;
  title?: string;
  status?: string;
  statusLabel?: string;
  updatedAt?: string;
  submittedAt?: string | null;
  nextAction?: string;
  trackingReference?: string;
};
type Tracking = {
  summary?: { total?: number; active?: number; nextSteps?: number; jobApplications?: number };
  items?: TrackingItem[];
};
type Application = {
  id: string;
  status: string;
  created_at?: string;
  submitted_at?: string | null;
  updated_at?: string;
  tracking_reference?: string;
  application_type?: string;
  payment?: { status?: string; retryable?: boolean } | null;
  latest_correction?: { status?: string } | null;
};
type Inbox = { items?: { id?: string; title?: string; body?: string; created_at?: string; actionUrl?: string }[]; counts?: { unread?: number; action_required?: number } };
type MembershipHistory = { memberships?: { status?: string; start_date?: string | null; end_date?: string | null; membership_number?: string }[] };
type WorkspaceData = { me: Me; tracking: Tracking; applications: Application[]; history: MembershipHistory; inbox: Inbox; errors: string[] };

type JourneyStep = {
  title: string;
  description: string;
  state: "complete" | "current" | "waiting" | "locked" | "attention" | "unknown";
  href?: string;
  action?: string;
};

const pendingApplication = new Set(["submitted", "in_review", "pending_review", "under_review"]);
const correctionApplication = new Set(["correction_required", "changes_requested"]);
const rejectedApplication = new Set(["rejected", "declined"]);
const paymentStatusesComplete = new Set(["verified", "succeeded", "successful", "paid", "completed"]);
const paymentStatusesPending = new Set(["pending", "submitted", "submitted_for_verification", "under_review"]);
const paymentStatusesFailed = new Set(["rejected", "failed", "cancelled"]);

function cleanStatus(value?: string | null) {
  return String(value || "").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}
function labelStatus(value?: string | null) {
  const clean = cleanStatus(value);
  if (!clean) return "Status not returned";
  return clean.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
function safeInternalHref(value?: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes(String.fromCharCode(92))) return null;
  return value;
}
function dateLabel(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
}

export default function MembersWorkspacePage() {
  const token = useUiStore((state) => state.token);
  const hydrated = useUiStore((state) => state.hydrated);
  const hydrateToken = useUiStore((state) => state.hydrateToken);
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    if (!token) {
      setData(null);
      setLoading(false);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    const results = await Promise.allSettled([
      api<Me>("/api/v1/me", {}, token),
      api<Tracking>("/api/v1/me/application-tracking?limit=5", {}, token),
      api<Application[]>("/api/v1/membership/applications/me", {}, token),
      api<MembershipHistory>("/api/v1/membership/history", {}, token),
      api<Inbox>("/api/v1/notifications?limit=5", {}, token),
    ]);
    if (sequence !== requestSequence.current) return;
    if (results[0].status === "rejected") {
      const cause = results[0].reason;
      setError(cause instanceof ApiError ? cause.message : "Your account status could not be loaded. Retry before relying on this workspace.");
      setData(null);
      setLoading(false);
      return;
    }
    const failures = ["Application and request activity", "Membership application status", "Membership history", "Recent notifications"]
      .filter((_, index) => results[index + 1].status === "rejected");
    setData({
      me: results[0].value as Me,
      tracking: results[1].status === "fulfilled" ? results[1].value as Tracking : {},
      applications: results[2].status === "fulfilled" && Array.isArray(results[2].value) ? results[2].value as Application[] : [],
      history: results[3].status === "fulfilled" ? results[3].value as MembershipHistory : {},
      inbox: results[4].status === "fulfilled" ? results[4].value as Inbox : {},
      errors: failures,
    });
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (!hydrated) hydrateToken();
  }, [hydrated, hydrateToken]);
  useEffect(() => {
    if (hydrated) void load();
  }, [hydrated, load]);

  const latestApplication = useMemo(() => {
    if (!data?.applications.length) return null;
    return [...data.applications].sort((a, b) => {
      const aDate = new Date(a.updated_at || a.submitted_at || a.created_at || 0).getTime();
      const bDate = new Date(b.updated_at || b.submitted_at || b.created_at || 0).getTime();
      return bDate - aDate;
    })[0];
  }, [data?.applications]);

  const journey = useMemo<JourneyStep[]>(() => {
    if (!data) return [];
    const me = data.me;
    const active = me.has_active_membership === true;
    const profilePercent = typeof me.completion_percent === "number" ? Math.max(0, Math.min(100, me.completion_percent)) : null;
    const applicationStatus = cleanStatus(latestApplication?.status);
    const paymentStatus = cleanStatus(latestApplication?.payment?.status);
    const hasApplication = Boolean(latestApplication);
    const applicationDataUnavailable = data.errors.includes("Membership application status");
    const correction = correctionApplication.has(applicationStatus);
    const rejected = rejectedApplication.has(applicationStatus);
    const waitingReview = pendingApplication.has(applicationStatus);
    const paymentComplete = paymentStatusesComplete.has(paymentStatus) || ["paid", "active"].includes(applicationStatus);
    const paymentPending = paymentStatusesPending.has(paymentStatus) || applicationStatus === "payment_pending";
    const paymentFailed = paymentStatusesFailed.has(paymentStatus) || latestApplication?.payment?.retryable === true;
    const profileComplete = profilePercent !== null && profilePercent >= 100;
    const membershipRecord = me.has_active_membership === true ? null : data.history.memberships?.[0];
    const membershipStatus = cleanStatus(membershipRecord?.status);
    const membershipExpired = membershipStatus === "expired" || Boolean(membershipRecord?.end_date && String(membershipRecord.end_date).slice(0, 10) < new Date().toISOString().slice(0, 10));

    const profileStep: JourneyStep = profilePercent === null
      ? { title: "Complete your profile", description: "The service did not return a profile-completion value, so this step is not marked complete.", state: "unknown", href: "/profile", action: "Review profile" }
      : profileComplete
        ? { title: "Profile", description: "Your server-reported profile completion is 100%.", state: "complete", href: "/profile", action: "Review profile" }
        : { title: "Complete your profile", description: profilePercent + "% complete according to your account record.", state: "current", href: "/profile", action: "Continue profile" };

    const applicationStep: JourneyStep = applicationDataUnavailable
      ? { title: "Membership status unavailable", description: "The application service did not return a status. Do not assume there is no application or start a duplicate; refresh or open the membership workspace to check the server record.", state: "unknown", href: "/membership", action: "Check membership status" }
      : active
      ? { title: "Membership application", description: "Your account confirms active membership.", state: "complete", href: "/membership", action: "View membership" }
      : correction
        ? { title: "Update requested information", description: "The application has a correction request. Review the current server status and requested next step.", state: "attention", href: "/membership", action: "Review correction" }
        : rejected
          ? { title: "Application outcome", description: "The latest application was rejected. Review the outcome before deciding what is permitted next.", state: "attention", href: "/membership", action: "Review outcome" }
          : waitingReview || applicationStatus === "approved" || applicationStatus === "payment_pending" || applicationStatus === "paid"
            ? { title: "Membership application", description: "Application status: " + labelStatus(latestApplication?.status) + ".", state: "complete", href: "/membership", action: "View application" }
            : hasApplication
              ? { title: "Continue your application", description: "Application status: " + labelStatus(latestApplication?.status) + ".", state: "current", href: "/membership", action: "Continue application" }
              : { title: "Membership application", description: "No application was returned for your account. Start only if the membership service confirms you are eligible.", state: "current", href: "/membership", action: "Review membership" };

    const paymentStep: JourneyStep = applicationDataUnavailable
      ? { title: "Payment, if required", description: "Payment requirements cannot be confirmed until the current application status loads.", state: "unknown", href: "/membership", action: "Check application" }
      : active || paymentComplete
      ? { title: "Payment", description: "Payment is complete or not needed for the active membership confirmed by the service.", state: "complete" }
      : paymentFailed
        ? { title: "Payment follow-up", description: "The payment record needs attention. Check the server's current instructions before retrying.", state: "attention", href: "/membership", action: "Review payment" }
        : paymentPending
          ? { title: "Payment", description: "Payment status: " + labelStatus(latestApplication?.payment?.status || latestApplication?.status) + ". Follow the current instructions; this is not an approval or activation.", state: "current", href: "/membership", action: "Continue payment" }
          : ["approved", "payment_pending"].includes(applicationStatus)
            ? { title: "Payment", description: "The application status indicates payment may be required. Check the configured instructions.", state: "current", href: "/membership", action: "Review payment instructions" }
            : hasApplication
              ? { title: "Payment, if required", description: "Payment requirements depend on your application and configured membership plan; no payment completion is inferred here.", state: "waiting" }
              : { title: "Payment, if required", description: "This step becomes relevant only if the server's application and plan require payment.", state: "locked" };

    const reviewStep: JourneyStep = applicationDataUnavailable
      ? { title: "Review status unavailable", description: "The current application state could not be confirmed. No review progress is inferred.", state: "unknown", href: "/membership", action: "Check application" }
      : active
      ? { title: "Review", description: "Active membership confirms the service completed its required review and activation gates.", state: "complete" }
      : correction
        ? { title: "Review", description: "The reviewer has requested changes before the application can proceed.", state: "attention" }
        : rejected
          ? { title: "Review outcome", description: "Review is complete for the latest application; see the recorded outcome.", state: "attention" }
          : waitingReview || ["approved", "payment_pending", "paid"].includes(applicationStatus)
            ? { title: "Review", description: "Application status: " + labelStatus(latestApplication?.status) + ". Payment status does not itself approve or activate membership.", state: "waiting" }
            : { title: "Review", description: "Review becomes available after the application is submitted.", state: "locked" };

    const activeStep: JourneyStep = active
      ? { title: "Active membership", description: "Your account currently has active membership.", state: "complete", href: "/membership", action: "View membership" }
      : { title: "Active membership", description: membershipExpired ? "The account reports expired membership. Review renewal options and current eligibility." : "Membership benefits unlock only after the service confirms activation.", state: "locked", href: "/membership", action: membershipExpired ? "Review renewal" : undefined };

    return [profileStep, applicationStep, paymentStep, reviewStep, activeStep];
  }, [data, latestApplication]);

  if (!hydrated) return <main className="mx-auto max-w-6xl px-4 py-10"><OperationStatus state="loading" title="Preparing your workspace" detail="Restoring your sign-in state before loading private account information." /></main>;
  if (!token) return <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6"><Card><div className="eyebrow">My workspace</div><h1 className="h1">Your next step, in one place.</h1><p className="muted">Sign in to see your own membership status, profile progress and recent requests. We only show account information returned for your session.</p><div className="mt-5 flex flex-wrap gap-3"><Link className="btn btn-primary" href="/login?next=/members">Sign in to continue <ArrowRight size={16} /></Link><Link className="btn btn-ghost" href="/jobs">Browse jobs</Link></div></Card></main>;

  const me = data?.me;
  const name = me?.display_name || [me?.first_name, me?.last_name].filter(Boolean).join(" ") || "there";
  const active = me?.has_active_membership === true;
  const appStatus = cleanStatus(latestApplication?.status);
  const correction = correctionApplication.has(appStatus);
  const rejected = rejectedApplication.has(appStatus);
  const waitingReview = pendingApplication.has(appStatus) || ["approved", "payment_pending", "paid"].includes(appStatus);
  const paymentStatus = cleanStatus(latestApplication?.payment?.status);
  const paymentAttention = paymentStatusesFailed.has(paymentStatus) || correction || rejected;
  const profilePercent = typeof me?.completion_percent === "number" ? Math.max(0, Math.min(100, me.completion_percent)) : null;
  const latestMembership = data?.history.memberships?.[0];
  const membershipStatus = cleanStatus(latestMembership?.status);
  const membershipExpired = membershipStatus === "expired" || Boolean(latestMembership?.end_date && String(latestMembership.end_date).slice(0, 10) < new Date().toISOString().slice(0, 10));

  let next = { title: "Review your membership options", detail: "Check your current eligibility and the server-provided application status before starting or continuing.", href: "/membership", label: "Continue to membership" };
  if (error) next = { title: "Refresh your account status", detail: "Your current account state could not be confirmed. Retry before relying on progress or starting another action.", href: "#refresh-workspace", label: "Retry account status" };
  else if (data?.errors.includes("Membership application status")) next = { title: "Confirm your membership status", detail: "The application service did not return your current record. Refresh before starting or resubmitting an application.", href: "#refresh-workspace", label: "Retry membership status" };
  else if (active) next = { title: "Your membership is active", detail: "Your account confirms active membership. Keep your profile current and use the services available to you.", href: "/profile", label: "Review your profile" };
  else if (correction) next = { title: "Your application needs an update", detail: "Review the correction request and submit only the information requested by the membership service.", href: "/membership", label: "Continue requested update" };
  else if (rejected) next = { title: "Review your application outcome", detail: "Your latest application was rejected. Read the recorded outcome and check the permitted next step; do not assume a new application is available.", href: "/membership", label: "Review application outcome" };
  else if (paymentAttention) next = { title: "Check your payment status", detail: "Review the payment record and current method-specific instructions. A submitted receipt is not proof of verification.", href: "/membership", label: "Review payment" };
  else if (waitingReview) next = { title: "Your application is being processed", detail: "The service reports " + labelStatus(latestApplication?.status) + ". Check status updates; payment and application approval remain separate decisions.", href: "/track", label: "Check application status" };
  else if (latestApplication) next = { title: "Continue your membership application", detail: "Resume the current application and follow the instructions shown by the membership service.", href: "/membership", label: "Continue application" };
  else if (membershipExpired) next = { title: "Review your expired membership", detail: "Your membership history reports an expired or ended membership. Review renewal options and current eligibility with the membership service.", href: "/membership", label: "Review renewal options" };
  else if (profilePercent !== null && profilePercent < 100) next = { title: "Complete your professional profile", detail: "Your account reports " + profilePercent + "% completion. Finish the profile details relevant to your professional record.", href: "/profile", label: "Continue profile" };

  const recentItems = (data?.tracking.items || []).slice(0, 3);
  const notifications = (data?.inbox.items || []).slice(0, 2);
  const shortcutItems = [
    { href: "/profile", label: "Profile", detail: "Identity and professional details", icon: UserRound, visible: true },
    { href: "/membership", label: "Membership", detail: active ? "Membership and renewal details" : "Application and status", icon: ShieldCheck, visible: true },
    { href: "/membership/card", label: "Membership card", detail: "Active members", icon: FileCheck2, visible: active },
    { href: "/jobs", label: "Jobs", detail: "Explore opportunities", icon: BriefcaseBusiness, visible: true },
    { href: "/mentorship", label: "Mentorship", detail: "Mentor and mentee requests", icon: Users, visible: true },
    { href: "/serve-community", label: "Serve-Community", detail: "Community service opportunities", icon: Compass, visible: active },
    { href: "/verification", label: "Professional verification", detail: "Eligible members", icon: GraduationCap, visible: active },
  ].filter((item) => item.visible);

  return <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-9">
    <header data-guide-target="workspace-overview" className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0"><div className="eyebrow">My MPA workspace</div><h1 className="h1">Welcome back, {name}.</h1><p className="muted max-w-3xl">See where things stand and continue with the next step. Progress reflects account and application records returned by the service, not pages you have opened.</p></div>
      <button id="refresh-workspace" type="button" className="btn btn-ghost shrink-0" onClick={() => void load()} disabled={loading} aria-label="Refresh your workspace status"><RefreshCw size={16} aria-hidden="true" /> {loading ? "Refreshing…" : "Refresh status"}</button>
    </header>

    {error ? <Card><p className="form-error" role="alert">{error}</p><button type="button" className="btn btn-secondary mt-3" onClick={() => void load()} disabled={loading}>Retry loading account status</button></Card> : null}
    {loading && !data ? <OperationStatus state="loading" title="Loading your workspace" detail="Checking your account, membership application, recent requests and notifications." /> : null}
    {data?.errors.length ? <Card><p className="muted" role="status">Some workspace information could not be loaded: {data.errors.join(", ")}. Missing data is not treated as completed progress.</p><button type="button" className="btn btn-ghost mt-2" onClick={() => void load()} disabled={loading}>Retry loading missing information</button></Card> : null}

    {data ? <>
      <section aria-labelledby="continue-title" className="mb-6 rounded-2xl border border-[var(--primary)]/35 bg-[var(--surface)] p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="eyebrow">Continue where you left off</div>
            <h2 id="continue-title" className="h2 mt-1">{next.title}</h2>
            <p className="muted mt-2 max-w-2xl">{next.detail}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Current account status">
              <Badge tone={active ? "green" : paymentAttention ? "gold" : "slate"}>{active ? "Active member" : membershipExpired ? "Expired membership" : latestMembership?.status ? labelStatus(latestMembership.status) : "Not currently an active member"}</Badge>
              {latestApplication ? <Badge tone={paymentAttention ? "gold" : waitingReview ? "slate" : "green"}>Application: {labelStatus(latestApplication.status)}</Badge> : <Badge tone="slate">No application returned</Badge>}
              {profilePercent !== null ? <Badge tone={profilePercent >= 100 ? "green" : "slate"}>Profile {profilePercent}%</Badge> : <Badge tone="slate">Profile progress unavailable</Badge>}
            </div>
          </div>
          <div className="w-full sm:w-auto sm:min-w-52">
            {next.href === "#refresh-workspace"
              ? <button type="button" className="btn btn-primary w-full justify-center" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : next.label} <ArrowRight size={16} /></button>
              : <Link className="btn btn-primary w-full justify-center" href={next.href}>{next.label} <ArrowRight size={16} /></Link>}
            <p className="muted mt-2 text-xs">Only server-confirmed account and application states count as progress.</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="progress-title" className="mb-7">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><div className="eyebrow">Your journey</div><h2 id="progress-title" data-guide-target="workspace-progress" className="h2">Membership progress</h2></div><span className="muted text-sm">{journey.filter((step) => step.state === "complete").length} of {journey.length} steps confirmed</span></div>
        <ol className="grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-5" aria-label="Membership progress steps">
          {journey.map((step, index) => {
            const completed = step.state === "complete";
            const attention = step.state === "attention";
            const current = step.state === "current";
            const Icon = completed ? CheckCircle2 : attention ? Clock3 : step.state === "locked" ? ShieldCheck : step.state === "unknown" ? HelpCircle : Clock3;
            return <li key={step.title} className="min-w-0">
              <Card>
                <div className="flex items-start gap-3">
                  <span className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-full border " + (completed ? "border-emerald-600/40 bg-emerald-500/10 text-emerald-700" : attention ? "border-amber-600/50 bg-amber-500/10 text-amber-800" : current ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--text)]" : "border-[var(--border)] text-[var(--muted)]")} aria-hidden="true"><Icon size={18} /></span>
                  <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Step {index + 1}</p><h3 className="mt-1 font-semibold">{step.title}</h3><p className="muted mt-1 text-sm">{step.description}</p></div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2"><Badge tone={completed ? "green" : attention ? "gold" : "slate"}>{completed ? "Confirmed" : attention ? "Needs attention" : current ? "Next step" : step.state === "unknown" ? "Not confirmed" : step.state === "waiting" ? "Waiting" : "Locked"}</Badge>{step.href ? <Link href={step.href} className="text-sm underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4" aria-label={step.action || "Open " + step.title}>{step.action || "Open"}</Link> : null}</div>
              </Card>
            </li>;
          })}
        </ol>
      </section>

      <CommunityImpactWorkspacePanel token={token || ""} />

      <VolunteerPledgePanel token={token || ""} active={active} />

      <section aria-labelledby="shortcuts-title" className="mb-7">
        <div className="mb-3"><div className="eyebrow">Quick access</div><h2 id="shortcuts-title" data-guide-target="workspace-shortcuts" className="h2">Your workspace</h2></div>
        <nav aria-label="Your workspace shortcuts" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shortcutItems.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} className="group flex min-w-0 items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 transition hover:border-[var(--primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:p-4"><Icon size={20} className="mt-0.5 shrink-0" aria-hidden="true" /><span className="min-w-0"><span className="block font-semibold">{item.label}</span><span className="muted mt-1 block text-sm">{item.detail}</span></span><ArrowRight size={15} className="ml-auto mt-1 shrink-0 opacity-70" aria-hidden="true" /></Link>; })}
        </nav>
      </section>

      <section aria-labelledby="activity-title" className="mb-7 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><div className="eyebrow">Status updates</div><h2 id="activity-title" className="h2">Recent activity</h2></div><Link className="text-sm underline underline-offset-4" href="/track">View all activity</Link></div>
          {recentItems.length ? <ol className="m-0 list-none p-0">{recentItems.map((item, index) => <li key={item.id || item.trackingReference || index} className="border-t border-[var(--border)] py-3 first:border-t-0"><div className="flex items-start gap-3"><Clock3 size={17} className="mt-1 shrink-0" aria-hidden="true" /><div className="min-w-0"><p className="font-semibold">{item.title || "Application or request update"}</p><p className="muted text-sm">{labelStatus(item.statusLabel || item.status)}{item.nextAction ? " · " + item.nextAction : ""}</p>{dateLabel(item.updatedAt || item.submittedAt) ? <p className="muted mt-1 text-xs">Updated {dateLabel(item.updatedAt || item.submittedAt)}</p> : null}</div></div></li>)}</ol> : <p className="muted">{data.errors.includes("Application and request activity") ? "Recent activity could not be loaded. Retry to check your current server-reported status." : "No recent activity was returned. When you submit a request or application, its server-reported status will appear here."}</p>}
        </Card>
        <Card><div className="mb-3 flex items-center justify-between gap-3"><div><div className="eyebrow">Your inbox</div><h2 className="h2">Recent updates</h2></div><Link className="text-sm underline underline-offset-4" href="/notifications">Open notifications</Link></div>
          {notifications.length ? <ul className="m-0 list-none p-0">{notifications.map((item, index) => <li key={item.id || index} className="border-t border-[var(--border)] py-3 first:border-t-0"><p className="font-semibold">{item.title || "Update"}</p><p className="muted mt-1 text-sm">{item.body || "Open notifications to review this update."}</p>{safeInternalHref(item.actionUrl) ? <Link href={safeInternalHref(item.actionUrl)!} className="mt-2 inline-flex items-center gap-1 text-sm underline underline-offset-4">Review update <ArrowRight size={14} /></Link> : null}</li>)}</ul> : <p className="muted">{data.errors.includes("Recent notifications") ? "Recent notifications could not be loaded. Retry to check for updates." : "No recent notifications were returned."}</p>}
        </Card>
      </section>

      <footer className="flex flex-wrap items-start justify-between gap-4 border-t border-[var(--border)] pt-5">
        <div className="max-w-2xl"><h2 className="font-semibold">Need a hand?</h2><p className="muted mt-1 text-sm">Use the Guide control for the current screen tour, or contact support if a status looks incorrect. Your application, payment and membership activation are separate server-controlled decisions.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" data-guide-target="workspace-help" className="btn btn-primary" onClick={()=>window.dispatchEvent(new Event("mpa:open-guide"))}>Show me around</button><SupportAction label="Get help" /><Link href="/membership" className="btn btn-ghost">Membership guidance <ArrowRight size={15} /></Link></div>
      </footer>
    </> : null}
  </main>;
}
