"use client";

import { ArrowUpRight, BriefcaseBusiness, Check, Copy, Link2, RefreshCw, Share2, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, api } from "../lib/api";
import { useUiStore } from "../lib/store";
import styles from "./member-referral-workspace.module.css";

type ReferralItem = {
  id: string;
  referral_type: "membership" | "employment" | string;
  status: string;
  created_at?: string;
  job_id?: string | null;
  job_title?: string | null;
  referred_person?: string;
};
type ReferralCount = { referral_type: string; status: string; count: number };
type ReferralData = {
  code?: { code?: string; status?: string; created_at?: string; shareUrl?: string } | string;
  counts?: ReferralCount[];
  items?: ReferralItem[];
  score?: number;
  scoringActive?: boolean;
};

const statusLabels: Record<string, string> = {
  registered: "Registered",
  email_verified: "Email verified",
  membership_application_submitted: "Application submitted",
  membership_approved: "Approved",
  membership_declined: "Declined",
  membership_activated: "Membership activated",
  application_submitted: "Application submitted",
  shortlisted: "Shortlisted",
  interview: "Interview",
  offer_accepted: "Offer accepted",
  employment_reported: "Employment reported",
  employment_verified: "Employment verified",
  declined: "Not proceeding",
  withdrawn: "Withdrawn",
};
const label = (value: string) => statusLabels[value] || value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const dateLabel = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
};

export function MemberReferralWorkspace({ compact = false }: { compact?: boolean }) {
  const token = useUiStore((state) => state.token);
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const result = await api<ReferralData>("/api/v1/me/referrals", {}, token);
      setData(result);
    } catch (cause) {
      setError(cause instanceof ApiError && cause.code === "ACTIVE_MEMBERSHIP_REQUIRED" ? "Referral invitations are available to members with a currently active MPA membership. Your account and any existing referral records remain unchanged." : cause instanceof ApiError ? cause.message : "Referral information could not be loaded. Please retry.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const referralCode = typeof data?.code === "string" ? data.code : data?.code?.code || "";
  const sharePath = typeof data?.code === "object" && data.code?.shareUrl
    ? data.code.shareUrl
    : referralCode ? "/register?ref=" + encodeURIComponent(referralCode) : "";
  const shareUrl = typeof window !== "undefined" && sharePath
    ? new URL(sharePath, window.location.origin).toString()
    : sharePath;

  const items = data?.items || [];
  const counts = data?.counts || [];
  const countFor = (type: string, statuses?: string[]) => counts
    .filter((item) => (type === "all" || item.referral_type === type) && (!statuses || statuses.includes(item.status)))
    .reduce((total, item) => total + Number(item.count || 0), 0);
  const registrations = countFor("membership");
  const activeMembers = countFor("membership", ["membership_activated"]);
  const awaitingReview = countFor("membership", ["membership_application_submitted"]);
  const verifiedEmployment = countFor("employment", ["employment_verified"]);

  const visibleItems = useMemo(() => items.filter((item) => {
    const matchesKind = kind === "all" || item.referral_type === kind;
    const matchesStatus = status === "all" || item.status === status;
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [item.referred_person, item.job_title, label(item.status), item.referral_type]
      .some((value) => String(value || "").toLowerCase().includes(query));
    return matchesKind && matchesStatus && matchesSearch;
  }), [items, kind, status, search]);
  const statuses = [...new Set(items.map((item) => item.status))].sort();

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setNotice("Your referral link has been copied.");
    } catch {
      setNotice("Copy is unavailable in this browser. Select and copy the referral link above.");
    }
  };
  const shareLink = async () => {
    if (!shareUrl) return;
    if (navigator.share) {
      try { await navigator.share({ title: "Join the MPA professional network", text: "Join me in the MPA professional network.", url: shareUrl }); setNotice("Invitation shared."); }
      catch (cause) { if (cause instanceof Error && cause.name !== "AbortError") setNotice("Sharing was not completed. You can copy the link instead."); }
    } else {
      await copyLink();
    }
  };

  return <section className={styles.workspace} aria-labelledby={compact ? "profile-referrals-title" : "member-referrals-title"}>
    <div className={styles.heading}>
      <div>
        <span className="eyebrow">GROW THE PROFESSIONAL NETWORK</span>
        <h2 id={compact ? "profile-referrals-title" : "member-referrals-title"}>{compact ? "Your referral link" : "Member invitations & outcomes"}</h2>
        <p className="muted">{compact ? "Invite trusted professionals and follow your referral activity." : "One personal invitation link for membership and job opportunities. Progress is shown only at the level permitted by the referred person's consent."}</p>
      </div>
      {!compact && <button type="button" className="btn btn-ghost" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/>{loading ? "Refreshing…" : "Refresh"}</button>}
    </div>

    {error ? <div className={styles.notice} role="alert"><span>{error}</span><button type="button" className="btn btn-ghost" onClick={() => void load()} disabled={loading}>Retry</button></div> : null}
    {loading && !data ? <p className="muted" role="status">Loading your referral workspace…</p> : null}
    {data ? <>
      <div className={styles.invite}>
        <div className={styles.inviteIcon}><Link2 size={22}/></div>
        <div className={styles.inviteCopy}>
          <strong>YOUR PERSONAL INVITATION</strong>
          <p>{referralCode || "Referral code unavailable"}</p>
          <label className={styles.linkLabel} htmlFor={compact ? "profile-referral-url" : "member-referral-url"}>Referral URL</label>
          <input id={compact ? "profile-referral-url" : "member-referral-url"} className={styles.url} readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} aria-label="Your personal referral URL"/>
        </div>
        <div className={styles.actions}>
          <button type="button" className="btn btn-primary" onClick={() => void copyLink()} disabled={!shareUrl}><Copy size={15}/>Copy link</button>
          <button type="button" className="btn btn-ghost" onClick={() => void shareLink()} disabled={!shareUrl}><Share2 size={15}/>Share invitation</button>
        </div>
      </div>
      {notice ? <p className={styles.noticeText} role="status" aria-live="polite">{notice}</p> : null}
      {!compact ? <>
        <div className={styles.metrics} aria-label="Referral summary">
          <article><span><Users size={15}/>Registrations</span><strong>{registrations}</strong><small>Membership referrals</small></article>
          <article><span><Check size={15}/>Active members</span><strong>{activeMembers}</strong><small>Confirmed activation</small></article>
          <article><span><RefreshCw size={15}/>Awaiting review</span><strong>{awaitingReview}</strong><small>Membership applications</small></article>
          <article><span><BriefcaseBusiness size={15}/>Verified employment</span><strong>{verifiedEmployment}</strong><small>Independently verified</small></article>
        </div>
        <div className={styles.activityHeading}>
          <div><h3>Referral outcomes</h3><p className="muted">Membership and employment are tracked separately.</p></div>
          <span className={styles.total}>{visibleItems.length} of {items.length}</span>
        </div>
        <div className={styles.filters}>
          <label>Referral type<select value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">All referrals</option><option value="membership">Membership</option><option value="employment">Employment</option></select></label>
          <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>
          <label className={styles.search}>Search<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search status or opportunity"/></label>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Referral</th><th>Opportunity</th><th>Latest outcome</th><th>Date</th></tr></thead>
            <tbody>{visibleItems.map((item) => <tr key={item.id}>
              <td data-label="Referral"><strong>{item.referred_person || "Private referral"}</strong><small>{item.referral_type === "employment" ? "Employment referral" : "Membership referral"}</small></td>
              <td data-label="Opportunity">{item.referral_type === "employment" ? item.job_title || "Job opportunity" : "MPA membership"}</td>
              <td data-label="Latest outcome"><span className={styles.status}>{label(item.status)}</span></td>
              <td data-label="Date">{dateLabel(item.created_at)}</td>
            </tr>)}
            {!visibleItems.length ? <tr><td colSpan={4} className={styles.empty}>No referral outcomes match these filters.</td></tr> : null}</tbody>
          </table>
        </div>
        <p className={styles.privacy}><strong>Privacy by default.</strong> Referred people are shown as “Private referral” unless they explicitly consented to identity visibility. Application details, payments, contact information and evidence are never displayed here.</p>
        <div className={styles.footerLinks}><Link href="/profile">Profile settings <ArrowUpRight size={14}/></Link><Link href="/jobs">Explore jobs <ArrowUpRight size={14}/></Link></div>
      </> : <p className={styles.compactFootnote}>Referral milestones and privacy-safe outcomes are available in your <Link href="/members#referrals">member workspace</Link>.</p>}
    </> : !loading && !error ? <p className="muted">Referral details are not available yet.</p> : null}
  </section>;
}
