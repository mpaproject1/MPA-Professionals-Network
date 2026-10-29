"use client";

import { ArrowDownToLine, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FormFeedback } from "../../components/form-feedback";
import { Card } from "../../components/ui";
import { api, ApiError } from "../../lib/api";

type ExportField = { key: string; label: string; preset: string[] };
type Preset = { id: string; label: string; description: string; fields: string[] };
type Catalogue = { kind: string; fields: ExportField[]; presets: Preset[]; defaultFields: string[]; formats: string[]; maxRows: number };
type Preview = { kind: string; expectedRows: number; selectedFields: { key: string; label: string }[]; filters: Record<string, string>; maxRows: number; exceedsLimit: boolean };
type Props = { kind: "members" | "accounts"; token: string };

export function DirectoryExportBuilder({ kind, token }: Props) {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [preset, setPreset] = useState("standard");
  const [format, setFormat] = useState<"csv" | "xlsx">("xlsx");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [membershipStatus, setMembershipStatus] = useState("");
  const [membershipScope, setMembershipScope] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [importBatch, setImportBatch] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    api<Catalogue>(`/api/v1/admin/directory-export/fields?kind=${kind}`, {}, token)
      .then(result => { if (!cancelled) { setCatalogue(result); setSelected(result.defaultFields); } })
      .catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Export field permissions could not be loaded."); });
    return () => { cancelled = true; };
  }, [kind, token]);

  const hasOrganizationScope = Boolean(catalogue?.fields.some(field => field.key === "organization_names"));
  const filters = useMemo(() => ({ kind, fields: selected, preset, q, status, membershipStatus, membershipScope, from, to, organizationId, importBatch }), [kind, selected, preset, q, status, membershipStatus, membershipScope, from, to, organizationId, importBatch]);
  async function buildPreview() {
    setLoading(true); setError(""); setNotice(""); setPreview(null);
    try {
      const result = await api<Preview>("/api/v1/admin/directory-export/preview", { method: "POST", body: JSON.stringify(filters) }, token);
      setPreview(result);
      if (result.exceedsLimit) setNotice(`The matching result has ${result.expectedRows.toLocaleString()} rows, above the safe ${result.maxRows.toLocaleString()}-row limit. Narrow the filters before exporting.`);
    } catch (cause) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : "Export preview failed. No file was generated.");
    } finally { setLoading(false); }
  }
  async function exportFile() {
    if (!preview || preview.exceedsLimit || exporting) return;
    setExporting(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/v1/admin/directory-export", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...filters, format }), cache: "no-store" });
      if (!response.ok) {
        let message = "Export failed. No successful file was reported.";
        try { const body = await response.json(); message = body?.error?.message || message; } catch {}
        throw new Error(message);
      }
      const blob = await response.blob();
      if (blob.size < 64) throw new Error("The server returned an empty or invalid file. It was not downloaded as a successful export.");
      const expected = Number(response.headers.get("x-export-expected-row-count") || "-1");
      const actual = Number(response.headers.get("x-export-row-count") || "-1");
      if (expected < 0 || actual !== expected) throw new Error("The export row count could not be verified. Please retry and contact an administrator if this repeats.");
      const url = URL.createObjectURL(blob), anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = response.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/i)?.[1] || `mpa-${kind}-directory.${format}`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
      setNotice(`Export completed: ${actual.toLocaleString()} row(s), ${selected.length} selected field(s). Generated files contain restricted administrative data; store and share them only through approved MPA channels.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Export failed. No successful file was confirmed.");
    } finally { setExporting(false); }
  }
  function choosePreset(next: string) {
    setPreview(null);
    setPreset(next);
    const match = catalogue?.presets.find(item => item.id === next);
    if (match) setSelected(match.fields);
  }
  function toggleField(key: string, checked: boolean) {
    setSelected(current => checked ? [...current, key] : current.filter(value => value !== key));
    setPreset("");
    setPreview(null);
  }

  return <Card>
    <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
      <div className="icon-tile"><FileSpreadsheet size={22} /></div>
      <div><h2 className="h2">Selective directory export</h2><p className="muted">Choose permitted fields, apply the same directory filters and preview the exact expected row count before generating a CSV or Excel workbook.</p></div>
    </div>
    {error && <FormFeedback kind="error" message={error} />}
    {notice && <FormFeedback kind="success" message={notice} />}
    {!catalogue ? <p className="muted">Loading fields allowed for this administrator…</p> : <>
      <div className="grid grid-2" style={{ gap: 12, marginTop: 16 }}>
        <label>Field preset<select value={preset} onChange={event => choosePreset(event.target.value)}><option value="">Custom selection</option>{catalogue.presets.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>File format<select value={format} onChange={event => setFormat(event.target.value as "csv" | "xlsx")}><option value="xlsx">Excel workbook (.xlsx)</option><option value="csv">CSV (.csv)</option></select></label>
      </div>
      {preset && <p className="muted">{catalogue.presets.find(item => item.id === preset)?.description}</p>}
      <fieldset style={{ border: "1px solid var(--border, #cbd5e1)", borderRadius: 10, padding: 12, margin: "12px 0" }}>
        <legend>Export columns ({selected.length})</legend>
        <div className="grid grid-2" style={{ gap: 8 }}>
          {catalogue.fields.map(field => <label key={field.key} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><input type="checkbox" checked={selected.includes(field.key)} onChange={event => toggleField(field.key, event.target.checked)} /><span>{field.label}</span></label>)}
        </div>
      </fieldset>
      <div className="grid grid-2" style={{ gap: 12 }}>
        <label>Search name, account reference, email or membership number<input value={q} maxLength={120} onChange={event => { setQ(event.target.value); setPreview(null); }} placeholder="Optional search phrase" /></label>
        <label>{kind === "members" ? "Membership status" : "Account status"}<select value={status} onChange={event => { setStatus(event.target.value); setPreview(null); }}><option value="">All statuses</option>{(kind === "members" ? ["active", "expired", "pending", "suspended", "cancelled"] : ["active", "suspended", "pending", "disabled"]).map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
        {kind === "accounts" && <label>Membership status<select value={membershipStatus} onChange={event => { setMembershipStatus(event.target.value); setPreview(null); }}><option value="">All membership statuses</option>{["active", "pending", "suspended", "expired", "cancelled", "not_enrolled", "unknown"].map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>}
        {kind === "accounts" && <label>Member scope<select value={membershipScope} onChange={event => { setMembershipScope(event.target.value); setPreview(null); }}><option value="all">All accounts</option><option value="members">Members (any non-merged membership)</option><option value="non_members">Non-members</option></select></label>}
        <label>Created from<input type="date" value={from} onChange={event => { setFrom(event.target.value); setPreview(null); }} /></label>
        <label>Created to<input type="date" value={to} onChange={event => { setTo(event.target.value); setPreview(null); }} /></label>
        {hasOrganizationScope && <label>Organization ID (authorized scope)<input value={organizationId} maxLength={100} onChange={event => { setOrganizationId(event.target.value); setPreview(null); }} placeholder="Optional organization ID" /></label>}
        <label>Import batch ID<input value={importBatch} maxLength={100} onChange={event => { setImportBatch(event.target.value); setPreview(null); }} placeholder="Optional import batch ID" /></label>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 16 }}>
        <button className="btn btn-ghost" type="button" disabled={loading || exporting || selected.length === 0} onClick={() => void buildPreview()}>{loading ? "Counting matching records…" : "Preview columns and row count"}</button>
        <button className="btn btn-primary" type="button" disabled={!preview || preview.exceedsLimit || loading || exporting || selected.length === 0} onClick={() => void exportFile()}><ArrowDownToLine size={16} />{exporting ? "Generating and validating file…" : `Export ${format.toUpperCase()}`}</button>
      </div>
      {preview && <div className="case-row" style={{ marginTop: 14 }} aria-live="polite">
        <strong>Export preview</strong>
        <p>{preview.expectedRows.toLocaleString()} expected row(s) · {preview.selectedFields.length} selected column(s) · maximum {preview.maxRows.toLocaleString()} rows per export.</p>
        <p className="muted">Generated-at time, applied filters and selected columns are recorded in the file manifest/header. Only fields approved by the server for this session are available.</p>
        <ol>{preview.selectedFields.map(field => <li key={field.key}>{field.label}</li>)}</ol>
        {preview.exceedsLimit && <p role="alert">Narrow the filters. Large exports are capped rather than silently truncated.</p>}
        {preview.expectedRows === 0 && <p>No records match these filters. The export may contain headers and manifest only; the server validates the file before recording success.</p>}
      </div>}
      <p className="muted" style={{ fontSize: 13, marginTop: 12 }}><ShieldCheck size={14} style={{ display: "inline", verticalAlign: "text-bottom" }} /> Exports use server-side field allowlists and row filters, reject unauthorized fields, cap result size, protect spreadsheet formula-like values and record successful exports in the audit log. No gender, private profile evidence or unrestricted profile fields are included in this export contract.</p>
    </>}
  </Card>;
}
