"use client";

import {Activity, ArrowRight, BriefcaseBusiness, ChartNoAxesCombined, CheckCircle2, Compass, FileCheck2, GraduationCap, HandHeart, IdCard, LayoutDashboard, Network, RefreshCw, Users, UserRound} from "lucide-react";
import Link from "next/link";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {CommunityImpactWorkspacePanel} from "../../components/community-impact-workspace-panel";
import {OperationStatus} from "../../components/operation-status";
import {SupportAction} from "../../components/support-action";
import {Badge, Card} from "../../components/ui";
import {VolunteerPledgePanel} from "../../components/volunteer-pledge-panel";
import {ApiError, api} from "../../lib/api";
import {useUiStore} from "../../lib/store";

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
  errors?: { source: string; category: string; message: string }[];
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

function AnimatedNumber({value,decimals=0}:{value:number;decimals?:number}) {
 const [shown,setShown]=useState(0);
 useEffect(()=>{
  if(!Number.isFinite(value))return;
  if(window.matchMedia("(prefers-reduced-motion: reduce)").matches){setShown(value);return;}
  const start=performance.now();let frame=0;
  const tick=(now:number)=>{const p=Math.min(1,(now-start)/760);setShown(value*(1-Math.pow(1-p,3)));if(p<1)frame=requestAnimationFrame(tick);};
  frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
 },[value]);
 return <>{shown.toFixed(decimals)}</>;
}

export default function MembersWorkspacePage() {
  const token = useUiStore((state) => state.token);
  const hydrated = useUiStore((state) => state.hydrated);
  const hydrateToken = useUiStore((state) => state.hydrateToken);
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);
  const [activeSection,setActiveSection] = useState("overview");

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
      api<Tracking>("/api/v1/me/progress?limit=5", {}, token),
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
      errors: [...failures, ...(results[1].status === "fulfilled" && (results[1].value as Tracking).errors?.length ? ["Some progress sections"] : [])],
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

  const recentItems=(data?.tracking.items||[]).slice(0,4),notifications=(data?.inbox.items||[]).slice(0,3);
  const sections=[{id:"overview",label:"Overview",icon:LayoutDashboard},{id:"membership",label:"Membership",icon:IdCard},{id:"career",label:"Career",icon:BriefcaseBusiness},{id:"mentorship",label:"Mentorship",icon:GraduationCap},{id:"services",label:"Services",icon:HandHeart},{id:"network",label:"Network",icon:Network},{id:"impact",label:"Impact",icon:ChartNoAxesCombined},{id:"activity",label:"Activity",icon:Activity}];
  const confirmedSteps=journey.filter(step=>step.state==="complete").length;
  return <main className="mpa-members-workspace member-command">
    <header className="member-topline" data-guide-target="workspace-overview"><div><div className="eyebrow">MPA · MEMBER COMMAND CENTRE</div><h1 className="member-welcome">Welcome back, {name}.</h1><p className="muted">Your membership, professional journey and community impact — in one focused workspace.</p></div><div className="member-top-actions"><Badge tone={active?"green":paymentAttention?"gold":"slate"}>{active?"Active member":membershipExpired?"Expired membership":"Membership status"}</Badge><button id="refresh-workspace" className="btn btn-ghost" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/>{loading?"Refreshing":"Refresh"}</button></div></header>
    {error?<Card><p className="form-error" role="alert">{error}</p><button className="btn btn-secondary mt-3" onClick={()=>void load()}>Retry account status</button></Card>:null}
    {loading&&!data?<OperationStatus state="loading" title="Loading your workspace" detail="Checking your account, membership application, recent requests and notifications."/>:null}
    {data?.errors.length?<Card><p className="muted" role="status">Some workspace information could not be loaded: {data.errors.join(", ")}. Missing data is not treated as completed progress.</p><button className="btn btn-ghost mt-2" onClick={()=>void load()}>Retry missing information</button></Card>:null}
    {data?<><section className="member-hero"><div><div className="member-hero-kicker">YOUR NEXT BEST ACTION</div><h2>{next.title}</h2><p>{next.detail}</p><div className="member-hero-tags"><Badge tone={active?"green":"slate"}>{active?"Membership active":"Membership status"}</Badge>{latestApplication?<Badge tone={paymentAttention?"gold":waitingReview?"slate":"green"}>Application · {labelStatus(latestApplication.status)}</Badge>:null}{profilePercent!==null?<Badge tone="slate">Profile · {profilePercent}%</Badge>:null}</div></div><div className="member-hero-action"><div className="member-profile-ring" style={{background:"conic-gradient(#c5f36b "+(profilePercent??0)+"%,rgba(166,198,218,.17) 0)"}}><strong>{profilePercent===null?"—":<AnimatedNumber value={profilePercent}/>} %</strong><span>PROFILE</span></div>{next.href==="#refresh-workspace"?<button className="btn btn-primary" onClick={()=>void load()}>{next.label}<ArrowRight size={14}/></button>:<Link className="btn btn-primary" href={next.href}>{next.label}<ArrowRight size={14}/></Link>}<small>Only server-confirmed states count as progress.</small></div></section>
      <nav className="member-category-nav" aria-label="Member workspace categories">{sections.map(s=>{const Icon=s.icon;return <button key={s.id} type="button" aria-pressed={activeSection===s.id} className={activeSection===s.id?"is-active":""} onClick={()=>setActiveSection(s.id)}><Icon size={16}/>{s.label}</button>;})}</nav>
      <div id="member-panel" className="member-section-panel">
        {activeSection==="overview"?<><div className="member-section-heading"><div><span className="eyebrow">AT A GLANCE</span><h2>Everything important, in focus.</h2></div><Link href="/track" className="member-text-link">All progress <ArrowRight size={14}/></Link></div>
          <div className="member-metric-grid"><Card><small>All records</small><div className="metric">{data.tracking.summary?.total===undefined?"—":<AnimatedNumber value={data.tracking.summary.total}/>}</div></Card><Card><small>Needs attention</small><div className="metric">{data.tracking.summary?.nextSteps===undefined?"—":<AnimatedNumber value={data.tracking.summary.nextSteps}/>}</div></Card><Card><small>Waiting or active</small><div className="metric">{data.tracking.summary?.active===undefined?"—":<AnimatedNumber value={data.tracking.summary.active}/>}</div></Card><Card><small>Journey confirmed</small><div className="metric"><AnimatedNumber value={confirmedSteps}/> / {journey.length}</div></Card></div>
          <section className="member-overview-journey"><div className="member-inline-heading"><h3>Your membership journey</h3><button className="member-text-link" onClick={()=>setActiveSection("membership")}>View details <ArrowRight size={13}/></button></div><div className="member-journey-track">{journey.map((step,i)=><div key={step.title} className={step.state==="complete"?"is-complete":""}><span>{step.state==="complete"?<CheckCircle2 size={14}/>:i+1}</span><small>{step.title}</small></div>)}</div></section>
          <CommunityImpactWorkspacePanel token={token||""} compact/><div className="member-overview-bottom"><Card><h3>Recent activity</h3>{recentItems.slice(0,3).map((x,i)=><p key={x.id||i} className="member-feed-row"><strong>{x.title||"Request update"}</strong><span>{labelStatus(x.statusLabel||x.status)} · {dateLabel(x.updatedAt||x.submittedAt)}</span></p>)}<button className="member-text-link" onClick={()=>setActiveSection("activity")}>View activity <ArrowRight size={13}/></button></Card><Card><h3>Recent updates</h3>{notifications.slice(0,2).map((x,i)=><p key={x.id||i} className="member-feed-row"><strong>{x.title||"Update"}</strong><span>{x.body}</span>{safeInternalHref(x.actionUrl)?<Link href={safeInternalHref(x.actionUrl)!} className="member-text-link">Review update <ArrowRight size={12}/></Link>:null}</p>)}<Link href="/notifications" className="member-text-link">Open inbox <ArrowRight size={13}/></Link></Card></div></>:null}
        {activeSection==="membership"?<><div className="member-section-heading"><div><span className="eyebrow">MEMBERSHIP</span><h2>{active?"Your membership is active":"Membership setup"}</h2><p>Application, payment, review and activation are separate service-controlled decisions.</p></div><div className="flex flex-wrap gap-2"><Link className="btn btn-primary" href="/membership">Open membership <ArrowRight size={14}/></Link>{active?<Link className="btn btn-ghost" href="/membership/card"><IdCard size={14}/> Membership card</Link>:null}</div></div><div className="member-journey-detail-grid">{journey.map((step,i)=><Card key={step.title}><small>STEP {i+1} · {step.state.toUpperCase()}</small><h3>{step.title}</h3><p className="muted text-sm">{step.description}</p>{step.href?<Link href={step.href}>{step.action||"Open"} <ArrowRight size={13}/></Link>:null}</Card>)}</div></>:null}
        {activeSection==="career"?<><div className="member-section-heading"><div><span className="eyebrow">CAREER</span><h2>Your professional identity</h2></div></div><div className="member-destination-grid"><Link href="/profile" className="member-destination-card"><UserRound/><div><strong>Professional profile</strong><p>Identity, experience, skills and credentials</p></div></Link>{active?<Link href="/verification" className="member-destination-card"><FileCheck2/><div><strong>Professional verification</strong><p>Evidence and verified professional claims</p></div></Link>:null}<Link href="/jobs" className="member-destination-card"><BriefcaseBusiness/><div><strong>Career opportunities</strong><p>Discover professional openings</p></div></Link></div></>:null}
        {activeSection==="mentorship"?<div className="member-section-heading"><div><span className="eyebrow">MENTORSHIP</span><h2>Guidance and professional learning</h2><p>Manage mentor and mentee requests, goals and learning.</p></div><Link className="btn btn-primary" href="/mentorship">Open mentorship <ArrowRight size={14}/></Link></div>:null}
        {activeSection==="services"?<><div className="member-section-heading"><div><span className="eyebrow">SERVICES</span><h2>Share your professional expertise</h2></div><Link href="/services" className="btn btn-ghost">Browse services</Link></div><VolunteerPledgePanel token={token||""} active={active}/></>:null}
        {activeSection==="network"?<><div className="member-section-heading"><div><span className="eyebrow">NETWORK</span><h2>Professional connections and community</h2></div></div><div className="member-destination-grid"><Link href="/network" className="member-destination-card"><Network/><div><strong>Professional network</strong><p>Connect with fellow professionals.</p></div></Link><Link href="/network-plus" className="member-destination-card"><Users/><div><strong>Network-Plus</strong><p>Enhanced collaboration and opportunities.</p></div></Link><Link href="/serve-community" className="member-destination-card"><Compass/><div><strong>Community initiatives</strong><p>Explore ways to contribute.</p></div></Link></div></>:null}
        {activeSection==="impact"?<><div className="member-section-heading"><div><span className="eyebrow">VERIFIED CONTRIBUTION</span><h2>Your Community Impact</h2></div><Link href="/community-impact/score" className="btn btn-ghost">Full score record</Link></div><CommunityImpactWorkspacePanel token={token||""}/></>:null}
        {activeSection==="activity"?<><div className="member-section-heading"><div><span className="eyebrow">REQUESTS & RESPONSES</span><h2>Your activity centre</h2></div><Link href="/track" className="btn btn-primary">All records</Link></div><div className="member-overview-bottom"><Card><h3>Recent activity</h3>{recentItems.map((x,i)=><p key={x.id||i} className="member-feed-row"><strong>{x.title||"Request update"}</strong><span>{labelStatus(x.statusLabel||x.status)} · {dateLabel(x.updatedAt||x.submittedAt)}</span></p>)}</Card><Card><h3>Recent notifications</h3>{notifications.map((x,i)=><p key={x.id||i} className="member-feed-row"><strong>{x.title||"Update"}</strong><span>{x.body}</span>{safeInternalHref(x.actionUrl)?<Link href={safeInternalHref(x.actionUrl)!}>Review update <ArrowRight size={12}/></Link>:null}</p>)}<Link href="/notifications">Open notifications</Link></Card></div></>:null}
      </div><footer className="member-help-footer"><div><strong>Need a hand?</strong><p>Use the Guide control for this screen or contact support if a status looks incorrect.</p></div><div><button data-guide-target="workspace-help" className="btn btn-ghost" onClick={()=>window.dispatchEvent(new Event("mpa:open-guide"))}>Show me around</button><SupportAction label="Get help"/><Link href="/membership" className="btn btn-ghost">Membership guidance</Link></div></footer>
    </>:null}
  </main>;
}