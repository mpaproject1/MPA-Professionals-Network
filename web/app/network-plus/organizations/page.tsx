"use client";

import { ArrowLeft, Building2, ExternalLink, MapPin, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { DiscoveryPagination } from "../../../components/discovery-pagination";
import { OperationStatus } from "../../../components/operation-status";
import { FormFeedback } from "../../../components/form-feedback";
import { Badge, Card } from "../../../components/ui";
import { NetworkPlusAccessGuard } from "../../../components/network-plus-access-guard";
import { ApiError, api } from "../../../lib/api";
import { useUiStore } from "../../../lib/store";

type OrganizationResult = {
  id: string;
  display_name: string;
  organization_type?: string | null;
  description?: string | null;
  website?: string | null;
  location_label?: string | null;
};
type Filters = { q: string; organizationType: string; location: string };
type SearchResult = { items: OrganizationResult[]; limit: number; offset: number; total: number; hasMore: boolean };
const emptyFilters: Filters = { q: "", organizationType: "", location: "" };

function queryFor(filters: Filters) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value.trim()) query.set(key, value.trim());
  return query.toString();
}

export default function NetworkPlusOrganizationsPage() {
  const token = useUiStore(state => state.token);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [items, setItems] = useState<OrganizationResult[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const pageSize = 20;
  const load = useCallback(async (criteria: Filters, pageIndex = 0) => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams(queryFor(criteria));
      params.set("limit", String(pageSize + 1));
      params.set("offset", String(pageIndex * pageSize));
      const result = await api<SearchResult>(`/api/v1/network-plus/organizations?${params.toString()}`, {}, token);
      const rows = Array.isArray(result.items) ? result.items : [];
      setItems(rows.slice(0, pageSize));
      setHasMore(rows.length > pageSize);
      setTotal(Number(result.total) || 0);
      setPage(pageIndex);
    } catch (cause) {
      setItems([]);
      setTotal(0);
      setHasMore(false);
      setError(cause instanceof ApiError ? cause.message : "Verified organization discovery could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { if (token) void load(emptyFilters, 0); }, [token, load]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void load(filters, 0);
  }

  return (
    <NetworkPlusAccessGuard>
      <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 sm:px-6">
        <header className="grid gap-3">
          <Link className="btn btn-ghost w-fit" href="/network-plus"><ArrowLeft size={16} aria-hidden="true" /> Back to Network-Plus</Link>
          <div className="eyebrow">Network-Plus · Verified Organization Discovery</div>
          <h1 className="h1">Discover verified organizations.</h1>
          <p className="muted max-w-3xl">Explore organizations that have completed MPA verification and explicitly opted into Network-Plus discovery. This read-only directory displays only fields the organization chose to share: its display name, type, description, website and broad location. Private registration details, verification evidence, contacts and member rosters are not disclosed.</p>
        </header>

        <Card>
          <form className="grid gap-3" onSubmit={submit}>
            <fieldset className="grid gap-3 md:grid-cols-3">
              <legend className="font-semibold">Search and refine organizations</legend>
              <label className="grid gap-1 text-sm">Organization name or description
                <input value={filters.q} disabled={loading} onChange={event => setFilters(current => ({ ...current, q: event.target.value }))} placeholder="Search verified organizations" />
              </label>
              <label className="grid gap-1 text-sm">Organization type
                <input value={filters.organizationType} disabled={loading} onChange={event => setFilters(current => ({ ...current, organizationType: event.target.value }))} placeholder="Type or category" />
              </label>
              <label className="grid gap-1 text-sm">Location
                <input value={filters.location} disabled={loading} onChange={event => setFilters(current => ({ ...current, location: event.target.value }))} placeholder="City or region" />
              </label>
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" type="submit" disabled={loading}><Search size={16} aria-hidden="true" />{loading ? "Searching…" : "Search organizations"}</button>
              <button className="btn btn-ghost" type="button" disabled={loading} onClick={() => { setFilters(emptyFilters); void load(emptyFilters, 0); }}>Clear filters</button>
            </div>
          </form>
        </Card>

        {error ? <div className="grid gap-2"><FormFeedback kind="error" message={error}/><button className="btn btn-ghost w-fit" type="button" onClick={() => void load(filters, page)}>Retry</button></div> : null}
        {loading ? <Card><OperationStatus state="loading" title="Loading verified organizations" detail="Applying Network-Plus eligibility, organization verification and explicit visibility rules." /></Card> : null}
        {!loading && !error && items.length === 0 ? <Card><h2 className="h2">No organizations match these filters</h2><p className="muted mt-1">Only verified organizations that have opted into Network-Plus discovery appear here. Try a broader search or clear the filters.</p><button className="btn btn-primary mt-3" type="button" onClick={() => { setFilters(emptyFilters); void load(emptyFilters, 0); }}>Clear filters and explore</button></Card> : null}
        {!loading && items.length > 0 ? <section className="grid gap-4 md:grid-cols-2" aria-label="Verified organization results">
          {items.map(organization => <Card key={organization.id}>
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--surface)]"><Building2 size={22} aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <h2 className="h2">{organization.display_name}</h2>
                {organization.organization_type ? <p className="muted mt-1">{organization.organization_type}</p> : null}
              </div>
              <Badge><Building2 size={13} aria-hidden="true" /> MPA verified</Badge>
            </div>
            {organization.description ? <p className="mt-3">{organization.description}</p> : null}
            {organization.location_label ? <p className="muted mt-3 flex items-center gap-2"><MapPin size={15} aria-hidden="true" />{organization.location_label}</p> : null}
            {organization.website ? <a className="mt-3 inline-flex items-center gap-2 underline" href={organization.website} target="_blank" rel="noopener noreferrer">Organization website <ExternalLink size={14} aria-hidden="true" /></a> : null}
          </Card>)}
        </section> : null}
        {!loading && !error && items.length > 0 ? <div className="grid gap-2"><p className="muted text-sm" role="status">{total} verified {total === 1 ? "organization" : "organizations"} available</p><DiscoveryPagination page={page} pageSize={pageSize} itemCount={items.length} hasMore={hasMore} disabled={loading} label="organizations" onPageChange={next => void load(filters, next)} /></div> : null}
        <p className="muted text-sm">Organization discovery is read-only. To manage an organization’s visibility, an authorized owner or administrator must use its private organization workspace.</p>
      </main>
    </NetworkPlusAccessGuard>
  );
}
