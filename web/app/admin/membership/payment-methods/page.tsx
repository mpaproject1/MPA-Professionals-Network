"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Card } from "../../../../components/ui";
import { ApiError, api } from "../../../../lib/api";
import { useUiStore } from "../../../../lib/store";

type MethodType = "chapa" | "telebirr" | "bank_transfer" | "cash" | "manual";
type Method = {
  method_code: string; method_type: MethodType; display_name: string; enabled: boolean;
  currency: string; instructions: string; requires_evidence: boolean;
  bank_name?: string | null; account_name?: string | null; account_number?: string | null;
  provider_code?: string | null; qr_image_url?: string | null; updated_by?: string | null; updated_at?: string;
};
type Me = { roles?: string[]; permissions?: string[] };
type Draft = {
  methodCode: string; methodType: MethodType; displayName: string; enabled: boolean;
  requiresEvidence: boolean; currency: string; instructions: string; bankName: string;
  accountName: string; accountNumber: string; providerCode: string; qrImageUrl: string;
};
const blank: Draft = { methodCode: "", methodType: "bank_transfer", displayName: "", enabled: false, requiresEvidence: true, currency: "ETB", instructions: "", bankName: "", accountName: "", accountNumber: "", providerCode: "", qrImageUrl: "" };
const types: { value: MethodType; label: string }[] = [
  { value: "bank_transfer", label: "Bank transfer" }, { value: "telebirr", label: "Telebirr" },
  { value: "cash", label: "Cash / in-person" }, { value: "manual", label: "Other manual method" },
  { value: "chapa", label: "Chapa hosted checkout" },
];
function missingFields(d: Draft): string[] {
  const missing: string[] = [];
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(d.methodCode.trim())) missing.push("stable method code");
  if (!d.displayName.trim()) missing.push("display name");
  if (!/^[A-Z]{3}$/.test(d.currency.trim().toUpperCase())) missing.push("three-letter currency");
  if (d.methodType === "bank_transfer") {
    if (!d.bankName.trim()) missing.push("bank name");
    if (!d.accountName.trim()) missing.push("account holder");
    if (!d.accountNumber.trim()) missing.push("account number");
    if (!d.instructions.trim()) missing.push("payment instructions");
  } else if (d.methodType === "telebirr") {
    if (!d.accountName.trim()) missing.push("Telebirr account holder");
    if (!d.accountNumber.trim()) missing.push("Telebirr account/merchant number");
    if (!d.instructions.trim()) missing.push("payment instructions");
  } else if (["cash", "manual"].includes(d.methodType) && !d.instructions.trim()) missing.push("payment instructions");
  return missing;
}
function methodDraft(m: Method): Draft {
  return { methodCode: m.method_code, methodType: m.method_type, displayName: m.display_name, enabled: m.enabled,
    requiresEvidence: m.method_type === "chapa" ? false : m.requires_evidence !== false, currency: m.currency,
    instructions: m.instructions || "", bankName: m.bank_name || "", accountName: m.account_name || "",
    accountNumber: m.account_number || "", providerCode: m.provider_code || "", qrImageUrl: m.qr_image_url || "" };
}
function memberPreview(d: Draft) {
  return {
    displayName: d.displayName || "Method display name", currency: d.currency || "ETB",
    instructions: d.instructions || "Payment instructions will appear here.",
    bankName: d.methodType === "bank_transfer" ? d.bankName : "",
    accountName: ["bank_transfer", "telebirr"].includes(d.methodType) ? d.accountName : "",
    accountNumber: ["bank_transfer", "telebirr"].includes(d.methodType) ? d.accountNumber : "",
    providerCode: d.methodType === "telebirr" ? d.providerCode : "", qrImageUrl: d.qrImageUrl,
  };
}
export default function MembershipPaymentMethodsPage() {
  const token = useUiStore(s => s.token), hydrated = useUiStore(s => s.hydrated), hydrateToken = useUiStore(s => s.hydrateToken);
  const [access, setAccess] = useState<"loading" | "allowed" | "denied" | "signin">("loading");
  const [methods, setMethods] = useState<Method[]>([]), [draft, setDraft] = useState<Draft>(blank);
  const [editing, setEditing] = useState(false), [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    if (!token) return;
    setBusy(true); setError("");
    try { const rows = await api<Method[]>("/api/v1/admin/membership/payment-methods", {}, token); setMethods(Array.isArray(rows) ? rows : []); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Payment method configuration could not be loaded."); setAccess("denied"); }
    finally { setBusy(false); }
  }, [token]);
  useEffect(() => { hydrateToken(); }, [hydrateToken]);
  useEffect(() => {
    let cancelled = false;
    if (!hydrated) return () => { cancelled = true; };
    if (!token) { setAccess("signin"); return () => { cancelled = true; }; }
    api<Me>("/api/v1/me", {}, token).then(me => {
      if (cancelled) return;
      const roles = me.roles || [], permissions = me.permissions || [];
      const allowed = roles.includes("system_admin") || roles.includes("finance_officer") || permissions.includes("finance.manage");
      setAccess(allowed ? "allowed" : "denied");
      if (allowed) void load();
    }).catch(() => { if (!cancelled) setAccess("denied"); });
    return () => { cancelled = true; };
  }, [hydrated, token, load]);
  const missing = useMemo(() => missingFields(draft), [draft]);
  const memberView = useMemo(() => memberPreview(draft), [draft]);
  function edit(m: Method) {
    setDraft(methodDraft(m));
    setEditing(true); setPreview(false); setError(""); setNotice("");
  }
  async function save(e: FormEvent) {
    e.preventDefault(); setError(""); setNotice("");
    if (draft.enabled && missing.length) { setError("This method cannot be enabled until these fields are complete: " + missing.join(", ") + "."); return; }
    setBusy(true);
    try {
      await api("/api/v1/admin/membership/payment-methods", { method: "PUT", body: JSON.stringify({
        methodCode: draft.methodCode, methodType: draft.methodType, displayName: draft.displayName,
        enabled: draft.enabled, requiresEvidence: draft.methodType === "chapa" ? false : draft.requiresEvidence,
        currency: draft.currency, instructions: draft.instructions, bankName: draft.bankName,
        accountName: draft.accountName, accountNumber: draft.accountNumber, providerCode: draft.providerCode,
        qrImageUrl: draft.qrImageUrl,
      }) }, token);
      setNotice("Payment method configuration saved. Existing payment snapshots are preserved.");
      setDraft(blank); setEditing(false); setPreview(false); await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Payment method configuration could not be saved."); }
    finally { setBusy(false); }
  }
  if (!hydrated || access === "loading") return <div className="grid"><Card><p>Checking finance permissions before loading payment account details…</p></Card></div>;
  if (access === "signin") return <div className="grid"><Card><h1 className="h1">Sign in required</h1><p className="muted">Payment method account details are available only to authorized finance staff and administrators.</p><a className="btn btn-primary" href="/login?next=/admin/membership/payment-methods">Sign in</a></Card></div>;
  if (access === "denied") return <div className="grid"><Card><h1 className="h1">Payment methods access denied</h1><p className="muted">Your account is not authorized to view or change bank and manual payment configuration. The server enforces the same permission boundary.</p><a className="btn btn-ghost" href="/admin">Return to admin overview</a>{error && <p role="alert">{error}</p>}</Card></div>;
  return <div className="grid">
    <div><div className="eyebrow">Finance · membership</div><h1 className="h1">Membership payment methods</h1><p className="muted">Configure member-facing bank, Telebirr, cash and other manual payment instructions. Chapa secrets remain in API environment configuration and must never be entered here.</p><div className="row" style={{flexWrap:"wrap"}}><a className="btn btn-ghost" href="/admin/membership">Membership operations</a><a className="btn btn-ghost" href="/membership/payment">Member payment journey</a></div></div>
    {error && <div className="form-error" role="alert">{error}</div>}{notice && <div className="form-success" role="status" aria-live="polite">{notice}</div>}
    <Card><div className="row" style={{justifyContent:"space-between",alignItems:"center"}}><h2 className="h2">Configured methods</h2><button className="btn btn-primary" type="button" onClick={() => { setDraft(blank); setEditing(true); setPreview(false); setError(""); setNotice(""); }}>Add method</button></div>
      {methods.length === 0 ? <p className="muted">No payment methods are configured yet.</p> : methods.map(m => <div className="case-row" key={m.method_code}><div style={{flex:1,minWidth:0}}><div className="row"><b>{m.display_name}</b><Badge tone={m.enabled ? "green" : "slate"}>{m.enabled ? "Enabled" : "Disabled"}</Badge></div><p className="muted">{m.method_code} · {m.method_type.replaceAll("_"," ")} · {m.currency} · {m.requires_evidence ? "private evidence required" : "evidence optional / hosted checkout"}</p>{missingFields(methodDraft(m)).length > 0 && <p className="form-error" role="status">Configuration incomplete: {missingFields(methodDraft(m)).join(", ")}. This method is hidden from members until completed.</p>}{!m.enabled && <p className="muted">Disabled — members cannot select this method.</p>}<small className="muted">Last updated: {m.updated_at ? new Date(m.updated_at).toLocaleString() : "Not recorded"}</small></div><button type="button" className="btn btn-ghost" onClick={() => edit(m)}>Edit</button><button type="button" className="btn btn-ghost" onClick={() => { setDraft({methodCode:m.method_code,methodType:m.method_type,displayName:m.display_name,enabled:!m.enabled,requiresEvidence:m.requires_evidence,currency:m.currency,instructions:m.instructions||"",bankName:m.bank_name||"",accountName:m.account_name||"",accountNumber:m.account_number||"",providerCode:m.provider_code||"",qrImageUrl:m.qr_image_url||""}); setEditing(true); setPreview(false); }}> {m.enabled ? "Disable" : "Enable"} </button></div>)}
    </Card>
    {editing ? <Card><h2 className="h2">{methods.some(m => m.method_code === draft.methodCode) ? "Edit payment method" : "Add payment method"}</h2><form className="form-stack" onSubmit={save}>
      <div className="grid grid-2"><label>Stable method code<input required pattern="[a-z][a-z0-9_]{1,39}" disabled={methods.some(m => m.method_code === draft.methodCode)} value={draft.methodCode} onChange={e => setDraft({...draft,methodCode:e.target.value.toLowerCase()})} placeholder="bank_primary"/></label><label>Method type<select value={draft.methodType} onChange={e => setDraft({...draft,methodType:e.target.value as MethodType,requiresEvidence:e.target.value === "chapa" ? false : true,bankName:e.target.value === "bank_transfer" ? draft.bankName : "",accountName:["bank_transfer","telebirr"].includes(e.target.value) ? draft.accountName : "",accountNumber:["bank_transfer","telebirr"].includes(e.target.value) ? draft.accountNumber : "",providerCode:e.target.value === "telebirr" ? draft.providerCode : "",qrImageUrl:e.target.value === "chapa" ? "" : draft.qrImageUrl})}>{types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label><label>Display name<input required maxLength={120} value={draft.displayName} onChange={e => setDraft({...draft,displayName:e.target.value})}/></label><label>Supported currency<input required minLength={3} maxLength={3} value={draft.currency} onChange={e => setDraft({...draft,currency:e.target.value.toUpperCase()})}/></label></div>
      {draft.methodType === "bank_transfer" && <><label>Bank name<input maxLength={120} required={draft.enabled} value={draft.bankName} onChange={e => setDraft({...draft,bankName:e.target.value})}/></label><label>Account holder / name<input maxLength={120} required={draft.enabled} value={draft.accountName} onChange={e => setDraft({...draft,accountName:e.target.value})}/></label><label>Account number / approved identifier<input maxLength={120} required={draft.enabled} value={draft.accountNumber} onChange={e => setDraft({...draft,accountNumber:e.target.value})}/></label></>}
      {draft.methodType === "telebirr" && <><label>Telebirr account holder / merchant<input maxLength={120} required={draft.enabled} value={draft.accountName} onChange={e => setDraft({...draft,accountName:e.target.value})}/></label><label>Telebirr account / merchant number<input maxLength={120} required={draft.enabled} value={draft.accountNumber} onChange={e => setDraft({...draft,accountNumber:e.target.value})}/></label><label>Provider / merchant code (optional)<input maxLength={120} value={draft.providerCode} onChange={e => setDraft({...draft,providerCode:e.target.value})}/></label></>}
      <label>Payment instructions / branch / reference guidance<textarea rows={4} maxLength={2000} required={draft.enabled && draft.methodType !== "chapa"} value={draft.instructions} onChange={e => setDraft({...draft,instructions:e.target.value})}/></label><label>Optional QR image HTTPS URL<input type="url" value={draft.qrImageUrl} onChange={e => setDraft({...draft,qrImageUrl:e.target.value})} placeholder="https://…"/></label><label className="row"><input type="checkbox" checked={draft.requiresEvidence} disabled={draft.methodType === "chapa"} onChange={e => setDraft({...draft,requiresEvidence:e.target.checked})}/> Require private receipt/document evidence</label><label className="row"><input type="checkbox" checked={draft.enabled} onChange={e => setDraft({...draft,enabled:e.target.checked})}/> Enabled for members</label>
      {draft.enabled && missing.length > 0 && <p className="form-error" role="alert">Incomplete: {missing.join(", ")}. This method cannot be enabled until complete.</p>}{!draft.enabled && <p className="muted">This method is disabled. Members cannot select it; incomplete drafts remain hidden from members.</p>}
      <div className="row" style={{flexWrap:"wrap"}}><button type="button" className="btn btn-ghost" onClick={() => setPreview(v => !v)}>{preview ? "Hide member preview" : "Preview member instructions"}</button><button type="submit" className="btn btn-primary" disabled={busy || (draft.enabled && missing.length > 0)}>{busy ? "Saving…" : "Save payment method"}</button><button type="button" className="btn btn-ghost" onClick={() => {setDraft(blank);setEditing(false);setPreview(false);}}>Cancel</button></div>
    </form>
    {preview && <div className="membership-progress" aria-label="Member payment method preview"><h3>{memberView.displayName}</h3><p className="muted">Currency: {memberView.currency}</p>{memberView.bankName && <p><b>Bank:</b> {memberView.bankName}</p>}{memberView.accountName && <p><b>Account holder:</b> {memberView.accountName}</p>}{memberView.accountNumber && <p><b>Account / merchant number:</b> {memberView.accountNumber}</p>}{memberView.providerCode && <p><b>Provider code:</b> {memberView.providerCode}</p>}<p style={{whiteSpace:"pre-wrap"}}>{memberView.instructions}</p>{memberView.qrImageUrl && memberView.qrImageUrl.startsWith("https://") && <img src={memberView.qrImageUrl} alt={memberView.displayName + " QR payment image preview"} style={{display:"block",width:"min(240px,100%)",height:"auto",border:"1px solid var(--border)",borderRadius:12,background:"#fff",padding:8}}/>}<p className="muted">{draft.methodType === "chapa" ? "Hosted checkout is verified by the server; no receipt upload is required." : draft.requiresEvidence ? "A private receipt/document is required." : "Receipt evidence is optional for this configured method."}</p></div>}
    </Card> : null}
    <Card><p className="muted">Changes are audited by actor and timestamp. Audit metadata records changed field names and configuration state, never full bank/account values or provider secrets. Historical payment snapshots are retained separately from current configuration.</p></Card>
  </div>;
}
