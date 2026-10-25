"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpenCheck, ExternalLink, FlaskConical, HelpCircle, PauseCircle, PlayCircle, Edit3, Save } from "lucide-react";
import { FormFeedback } from "../../../components/form-feedback";
import { OperationStatus } from "../../../components/operation-status";
import { Badge, Card } from "../../../components/ui";
import { api } from "../../../lib/api";
import { useUiStore } from "../../../lib/store";
import { AdminPageHeader } from "../admin-page-header";

type Demo = { id: string; case_key: string; title: string; business_area: string; persona: string; description: string; start_path: string; scenario: any; active: boolean };
type Guide = { id: string; guide_key: string; route_pattern: string; title: string; description: string; steps: any[]; active: boolean };
type Tab = "guides" | "demos" | "help";

function tokenRoles(token: string) {
  try {
    const part = token.split(".")[1];
    const claims = part ? JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) : {};
    return Array.isArray(claims.roles) ? claims.roles.map((role: any) => typeof role === "string" ? role : role?.role_code).filter(Boolean) as string[] : [];
  } catch { return []; }
}

export default function AdminExperiencePage() {
  const token = useUiStore((state) => state.token);
  const hydrated = useUiStore((state) => state.hydrated);
  const hydrateToken = useUiStore((state) => state.hydrateToken);
  const [tab, setTab] = useState<Tab>("guides");
  const roles = token ? tokenRoles(token) : [];
  const isPlatformAdmin = roles.some((role) => ["system_admin", "admin", "platform_admin"].includes(role));
  const [demos, setDemos] = useState<Demo[]>([]);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState({ demos: false, guides: false });
  const [editing, setEditing] = useState<Demo | null>(null);

  useEffect(() => { hydrateToken(); }, [hydrateToken]);
  const load = useCallback(async () => {
    if (!token || !isPlatformAdmin) return;
    setLoading(true); setError(""); setFailed({ demos: false, guides: false });
    const [demoResult, guideResult] = await Promise.allSettled([
      api<any>("/api/v1/experience/demo-cases", {}, token),
      api<any>("/api/v1/experience/guides", {}, token),
    ]);
    const getRows = (value: any, key: string) => Array.isArray(value) ? value : Array.isArray(value?.[key]) ? value[key] : Array.isArray(value?.items) ? value.items : null;
    if (demoResult.status === "fulfilled") {
      const rows = getRows(demoResult.value, "cases");
      if (rows) setDemos(rows); else { setFailed(s => ({ ...s, demos: true })); setError("Demo service returned an unexpected list response."); }
    } else { setFailed(s => ({ ...s, demos: true })); setError(demoResult.reason instanceof Error ? demoResult.reason.message : "Demo scenarios could not be loaded."); }
    if (guideResult.status === "fulfilled") {
      const rows = getRows(guideResult.value, "guides");
      if (rows) setGuides(rows); else { setFailed(s => ({ ...s, guides: true })); setError(s => s ? s + " Guides returned an unexpected list response." : "Guides returned an unexpected list response."); }
    } else { setFailed(s => ({ ...s, guides: true })); setError(s => s ? s + " Guides could not be loaded." : guideResult.reason instanceof Error ? guideResult.reason.message : "Guides could not be loaded."); }
    setLoading(false);
  }, [token, isPlatformAdmin]);

  useEffect(() => { if (hydrated && token && isPlatformAdmin) void load(); }, [hydrated, token, isPlatformAdmin, load]);

  async function updateDemo(demo: Demo, patch: Record<string, unknown>, success: string) {
    setError(""); setNotice("");
    try { await api("/api/v1/admin/experience/demo-cases/" + encodeURIComponent(demo.id), { method: "PATCH", body: JSON.stringify(patch) }, token); setNotice(success); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Demo change was not confirmed."); }
  }
  async function updateGuide(guide: Guide, active: boolean) {
    setError(""); setNotice("");
    try { await api("/api/v1/admin/experience/guides/" + encodeURIComponent(guide.id), { method: "PATCH", body: JSON.stringify({ active }) }, token); setNotice(active ? "Guide enabled." : "Guide disabled."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Guide change was not confirmed."); }
  }
  function play(demo: Demo) { if (demo.active && typeof window !== "undefined") window.location.assign(demo.start_path || "/"); }

  if (!hydrated) return <div className="grid"><Card><OperationStatus state="loading" title="Preparing help and learning tools" detail="Restoring your session before loading guide and demo configuration." /></Card></div>;
  if (!token) return <div className="grid"><AdminPageHeader eyebrow="Administration · Enablement" title="Help, Guides & Demos" description="Manage contextual guidance, training walkthroughs and help resources."/><Card><p className="muted">Sign in with an authorized administrator account to continue.</p><a className="btn btn-primary" href="/login?next=/admin/experience">Sign in</a></Card></div>;
  if (!isPlatformAdmin) return <div className="grid"><AdminPageHeader eyebrow="Administration · Enablement" title="Help, Guides & Demos" description="Manage contextual guidance, training walkthroughs and help resources."/><Card><OperationStatus state="error" title="Platform administrator access required" detail="Only authorized platform administrators can manage guide and demo configuration."/><a className="btn btn-ghost" href="/admin">Return to admin overview</a></Card></div>;

  return <div className="grid" style={{ gap: 18, minWidth: 0 }}>
    <AdminPageHeader eyebrow="Administration · Enablement" title="Help, Guides & Demos" description="A single place to maintain contextual user guides, launch demonstration scenarios and find support resources. Public guidance stays separate from administrative configuration." actions={<><a className="btn btn-ghost" href="/admin">Admin overview</a><a className="btn btn-ghost" href="/admin/support">Support knowledge base</a></>} />
    <div role="tablist" aria-label="Help and learning sections" className="row" style={{ gap: 8, flexWrap: "wrap" }}>
      <button type="button" role="tab" aria-selected={tab === "guides"} className={tab === "guides" ? "btn btn-primary" : "btn btn-ghost"} onClick={() => setTab("guides")}><BookOpenCheck size={16}/> Guides ({failed.guides ? "—" : guides.length})</button>
      <button type="button" role="tab" aria-selected={tab === "demos"} className={tab === "demos" ? "btn btn-primary" : "btn btn-ghost"} onClick={() => setTab("demos")}><FlaskConical size={16}/> Demos ({failed.demos ? "—" : demos.length})</button>
      <button type="button" role="tab" aria-selected={tab === "help"} className={tab === "help" ? "btn btn-primary" : "btn btn-ghost"} onClick={() => setTab("help")}><HelpCircle size={16}/> Help & support</button>
    </div>
    {error && <FormFeedback kind="error" message={error}/>}
    {notice && <FormFeedback kind="success" message={notice}/>}
    {loading && (tab === "guides" ? guides.length === 0 : tab === "demos" ? demos.length === 0 : false) && <Card><OperationStatus state="loading" title="Loading learning resources" detail="Retrieving the latest configured records. Failed sections are reported separately from empty results." /></Card>}
    {tab === "guides" && <Card><h2 className="h2">Contextual user guides</h2><p className="muted">Guides appear in relevant areas of the product and explain real tasks. Enable or disable a guide here; this does not edit its content.</p>{failed.guides ? <OperationStatus state="error" title="Guides unavailable" detail="The guide catalogue did not load. Retry to check it again."/> : guides.length === 0 ? <p className="muted">No guide records were returned by the service.</p> : guides.map(guide => <div className="case-row" key={guide.id}><div style={{ minWidth: 0, flex: 1 }}><div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}><b>{guide.title}</b><Badge tone={guide.active ? "green" : "slate"}>{guide.active ? "Enabled" : "Disabled"}</Badge><Badge>{guide.route_pattern}</Badge></div><p className="muted">{guide.description}</p><small className="muted">{guide.steps.length} guided steps</small></div><button type="button" className="btn btn-ghost" onClick={() => void updateGuide(guide, !guide.active)} disabled={loading}>{guide.active ? <><PauseCircle size={15}/> Disable</> : <><PlayCircle size={15}/> Enable</>}</button></div>)}</Card>}
    {tab === "demos" && <Card><h2 className="h2">Demo and training scenarios</h2><p className="muted">Use these scenarios for demonstrations, training and UAT. Editing updates the configured scenario; Play only opens active scenarios.</p>{failed.demos ? <OperationStatus state="error" title="Demo scenarios unavailable" detail="The demo catalogue did not load. Retry to check it again."/> : demos.length === 0 ? <p className="muted">No demo scenarios were returned by the service.</p> : demos.map(demo => <div className="case-row" key={demo.id}><div style={{ minWidth: 0, flex: 1 }}><div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}><b>{demo.title}</b><Badge tone={demo.active ? "green" : "slate"}>{demo.active ? "Active" : "Paused"}</Badge></div><div className="muted">{demo.business_area} · {demo.persona}</div><p className="muted">{demo.description}</p></div><div className="row" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}><button type="button" className="btn btn-ghost" onClick={() => setEditing(demo)}><Edit3 size={15}/> Edit</button><button type="button" className="btn btn-primary" onClick={() => play(demo)} disabled={!demo.active}><PlayCircle size={15}/> Play</button><button type="button" className="btn btn-ghost" onClick={() => void updateDemo(demo, { active: !demo.active }, demo.active ? "Demo paused." : "Demo activated.")} disabled={loading}>{demo.active ? <><PauseCircle size={15}/> Pause</> : <><PlayCircle size={15}/> Activate</>}</button></div></div>)}</Card>}
    {tab === "help" && <div className="grid grid-2" style={{ gap: 12 }}><Card><div className="row" style={{ gap: 10, alignItems: "flex-start" }}><HelpCircle size={20}/><div><h2 className="h2">Support knowledge base</h2><p className="muted">Maintain help categories, published answers, inquiries and support handoffs.</p><a className="btn btn-primary" href="/admin/support">Open support workspace</a></div></div></Card><Card><div className="row" style={{ gap: 10, alignItems: "flex-start" }}><ExternalLink size={20}/><div><h2 className="h2">Platform introduction</h2><p className="muted">Public overview of MPA, intended audiences and service pathways.</p><a className="btn btn-ghost" href="/about">Open platform overview</a></div></div></Card><Card><div className="row" style={{ gap: 10, alignItems: "flex-start" }}><BookOpenCheck size={20}/><div><h2 className="h2">User-facing guide catalogue</h2><p className="muted">Open the application home to see contextual guides where they are available.</p><a className="btn btn-ghost" href="/">Open public home</a></div></div></Card></div>}
    {editing && <DemoEditor demo={editing} token={token} onClose={() => setEditing(null)} onSaved={load}/>}
    <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn btn-ghost" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh learning resources"}</button></div>
  </div>;
}

function DemoEditor({ demo, token, onClose, onSaved }: { demo: Demo; token: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState(demo.title);
  const [description, setDescription] = useState(demo.description);
  const [persona, setPersona] = useState(demo.persona);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (saving) return;
    setSaving(true); setError("");
    try {
      await api("/api/v1/admin/experience/demo-cases/" + encodeURIComponent(demo.id), { method: "PATCH", body: JSON.stringify({ title, description, persona }) }, token);
      await onSaved(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Demo changes were not confirmed."); }
    finally { setSaving(false); }
  }
  return <div className="guide-overlay"><button type="button" className="guide-dim" aria-label="Close demo editor" onClick={onClose}/><aside className="guide-card"><div className="row"><b>Edit demo scenario</b><button type="button" className="icon-btn" onClick={onClose} disabled={saving}>×</button></div>{error && <FormFeedback kind="error" message={error}/>}<label>Title<input value={title} onChange={event => setTitle(event.target.value)}/></label><label>Persona<input value={persona} onChange={event => setPersona(event.target.value)}/></label><label>Description<textarea rows={5} value={description} onChange={event => setDescription(event.target.value)}/></label><button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving || !title.trim() || !description.trim()}><Save size={15}/>{saving ? "Saving…" : "Save changes"}</button></aside></div>;
}
