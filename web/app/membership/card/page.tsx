"use client";
import {QRCodeSVG} from "qrcode.react";
import {type CSSProperties, useEffect, useState} from "react";
import {OperationStatus} from "../../../components/operation-status";
import {ApiError, api} from "../../../lib/api";
import {useUiStore} from "../../../lib/store";
import styles from "./card.module.css";

type CardSettings = {
  header_text:string; subtitle_text:string; footer_text:string; background_style:"geometric"|"gradient"|"midnight";
  background_start:string; background_end:string; accent_color:string; text_color:string; show_membership_type:boolean;
};
type MembershipCard = {
  membershipNumber:string; memberName:string; membershipType:string;
  status:string; startDate:string|null; endDate:string|null; verificationPath:string; settings:CardSettings;
};
function dateLabel(value:string|null){ if(!value) return "No expiry"; const date=new Date(value); return Number.isNaN(date.getTime())?value:date.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"2-digit",timeZone:"UTC"}); }
export default function MembershipCardPage(){
  const token=useUiStore(s=>s.token),hydrateToken=useUiStore(s=>s.hydrateToken);
  const [membershipNumber,setMembershipNumber]=useState("");
  const [queryReady,setQueryReady]=useState(false);
  useEffect(()=>{setMembershipNumber(new URLSearchParams(window.location.search).get("membershipNumber")||"");setQueryReady(true);},[]);
  const [origin,setOrigin]=useState("");
  useEffect(()=>{hydrateToken();},[hydrateToken]);
  useEffect(()=>{setOrigin(window.location.origin);},[]);
  const [card,setCard]=useState<MembershipCard|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    let cancelled=false;
    if(!queryReady)return;
    if(!token){setCard(null);setError("");setLoading(false);return;}
    setCard(null);setError("");setLoading(true);
    const path=membershipNumber?`/api/v1/admin/membership-card?membershipNumber=${encodeURIComponent(membershipNumber)}`:"/api/v1/membership/card";
    void api<MembershipCard>(path,{},token).then(value=>{if(!cancelled)setCard(value);}).catch(e=>{if(!cancelled)setError(e instanceof ApiError?e.message:"We couldn't load your membership card.");}).finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[token,membershipNumber,queryReady]);
  if(!token) return <main className={styles.shell}><section className={styles.panel}><h1>Membership ID</h1><p>Sign in with your member account to view and print your card.</p><a className={styles.primary} href={`/login?next=${encodeURIComponent(membershipNumber?`/membership/card?membershipNumber=${membershipNumber}`:"/membership/card")}`}>Sign in</a></section></main>;
  if(loading) return <main className={styles.shell}><OperationStatus state="loading" title="Preparing your membership card" detail="We’re retrieving your current membership status and card details. A card is shown only when the server confirms eligibility." /></main>;
  if(error||!card) return <main className={styles.shell}><section className={styles.panel}><h1>Membership card unavailable</h1><p role="alert">{error||"No membership record is available for this account."}</p><a href="/membership">Open membership</a></section></main>;
  const s=card.settings;
  const verifyUrl=origin+card.verificationPath;
  const cardStyle={background:`linear-gradient(125deg,${s.background_start},${s.background_end})`,color:s.text_color,"--card-accent":s.accent_color} as CSSProperties;
  return <main className={styles.shell}>
    <div className={styles.toolbar}><div><p className={styles.eyebrow}>OFFICIAL MEMBER CREDENTIAL</p><h1>Membership ID</h1><p>Exact-size membership ID · 85.6 × 53.98 mm · Download PDF or print</p></div><div className={styles.actions}><a href="/profile" className={styles.secondary}>Profile & photo</a><button type="button" onClick={()=>window.print()} className={styles.primary}>Download PDF / Print ID</button></div></div>
    <section className={styles.preview} aria-label="Membership ID card preview">
      <article className={`${styles.card} ${s.background_style==="midnight"?styles.midnight:""} ${s.background_style==="gradient"?styles.gradient:""}`} style={cardStyle}>
        <div className={styles.orbOne}/><div className={styles.orbTwo}/><div className={styles.lines}/>
        <header className={styles.cardHeader}><span className={styles.brandMark}><img src="/brand/mpa-logo-light.svg" alt="MPA" /></span><div className={styles.brandText}><strong>{s.header_text||"Muslim Professionals Association"}</strong><span>{s.subtitle_text||"Membership ID"}</span></div><span className={styles.status} data-status={card.status}>{card.status}</span></header>
        <div className={styles.cardBody}>
          <div className={styles.photoSide}><div className={styles.photoPlaceholder}><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="22" r="12" fill="currentColor" opacity=".92"/><path d="M9 57c1-13 10-21 23-21s22 8 23 21" fill="currentColor" opacity=".92"/></svg><span>MEMBER</span></div></div>
          <div className={styles.details}><p className={styles.memberName}>{card.memberName}</p>{s.show_membership_type&&<p className={styles.memberType}>{card.membershipType}</p>}<p className={styles.idLabel}>MEMBERSHIP ID</p><p className={styles.idValue}>{card.membershipNumber}</p><div className={styles.dates}><span>VALID FROM <b>{dateLabel(card.startDate)}</b></span><span>VALID UNTIL <b>{dateLabel(card.endDate)}</b></span></div></div>
          <div className={styles.qrSide}><div className={styles.qrFrame}><QRCodeSVG value={verifyUrl} size={132} level="M" includeMargin={false} bgColor="#FFFFFF" fgColor="#0A3258" /></div><span>SCAN TO VERIFY</span></div>
        </div>
        <footer className={styles.cardFooter}><span>{s.footer_text}</span><span className={styles.footerSeal}>● VERIFY ONLINE</span></footer>
      </article>
    </section>
    <p className={styles.note}>Choose “Save as PDF” in the print dialog to download the exact-size membership ID. Your membership ID is issued by MPA and cannot be edited from this page. The QR code checks the current record online; a printed card is not proof of active status if the membership has expired, been suspended, or been revoked.</p>
  </main>;
}
