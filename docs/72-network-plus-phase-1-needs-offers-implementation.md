# Network-Plus Phase 1 — Needs & Offers implementation

**Repository:** `mpaproject1/MPA-Professionals-Network`  
**Branch:** `feat/workstream-3-progress-members-workspace`  
**PR:** #18 (keep draft)  
**Scope:** Phase 1 Needs & Offers directory and publishing experience. This builds on the Phase 0 alignment audit in `docs/71-network-plus-phase-0-alignment-audit.md`.

## 1. Canonical implementation boundary

Phase 1 extends the existing Increment 5/6 Network-Plus model; it does not create a second marketplace or commerce subsystem.

- Business identity remains `network_plus_business`, with existing accepted ownership and capability-scoped delegation.
- Needs, offers, product profiles and service profiles all use `network_plus_service_listing`.
- Category/subcategory definitions live in `network_plus_listing_taxonomy`.
- Structured service areas are relations from the canonical listing to the published membership geography reference through `network_plus_service_listing_geography`.
- Connection requests remain `network_plus_request`; product profiles permit inquiry/referral connections only and reject service-order intent.
- Product/service profiles are discovery-only. There is no cart, checkout, order, payment, inventory, delivery or transaction workflow.

## 2. Taxonomy and structured fields

The forward-only migration `20261103130000_network_plus_phase1_needs_offers.sql`:

- Seeds broad categories and specific subcategories with supported listing kinds and per-category `field_schema`.
- Adds `listing_kind`, `subcategory_code`, `structured_attributes`, `taxonomy_version`, `wizard_step` and `draft_saved_at` to the canonical listing table.
- Relaxes legacy non-null/check assumptions only where required for an incomplete private wizard draft; publication still validates required fields.
- Adds secondary tags, target-audience segments, capacity, availability, lead-time, timezone and structured pricing-disclosure columns.
- Adds the service-area relation to the published, versioned `membership_geography_unit` hierarchy. No new geography registry or free-form home-address field is introduced.
- Preserves existing remote listings during migration and maps pre-existing complete drafts to the review step.

Canonical listing kinds:

| Kind | Purpose |
|---|---|
| `need` | A member-owned or organization-owned need seeking a suitable connection |
| `offer` | A capability, resource, opportunity or offer seeking a suitable connection |
| `product_profile` | A product discovery profile; inquiry/referral only |
| `service_profile` | A professional service discovery profile |

Categories cover professional services, consulting, technology, design, education, healthcare, legal, finance, construction, products and supply, business services, creative/media, facilities/operations, agriculture/food, transport/logistics, specialist/regulatory services, trade, manufacturing and other. The taxonomy contains category-specific subcategories and structured required fields.

The wizard collects primary category first, then reveals only its subcategories and field schema. Secondary tags are controlled taxonomy codes, not arbitrary labels. Public attributes reject contact details and private-address fields.

## 3. Geography, availability and capacity

Listing geography reuses the same published versioned reference data as membership residence. Owners may select multiple country, region, federal-city, zone, sub-city, district or town units. The server verifies every selected unit belongs to the current published version and stores references rather than user-entered place names. A new reference version requires re-selection rather than silently reinterpreting old IDs.

Each listing may also disclose:

- Remote availability separately from on-site/hybrid delivery.
- Optional service radius (requires a structured service area).
- Capacity and maximum active engagements.
- Intake state: accepting requests, limited, paused or unavailable.
- Lead time, next-available local date/time and IANA timezone.
- Target audience segments (individuals, start-ups, SMEs, nonprofits and public institutions).

Listings cannot be submitted without a service area or explicit remote availability. A paused/unavailable listing remains discoverable as appropriate but the connection-request service rejects new requests to it.

## 4. Pricing disclosures — not payment collection

Supported pricing descriptions are quotation/discuss directly, free, fixed reference price, hourly reference rate, per-unit, range, subscription/retainer and not applicable.

- Fixed/hourly/unit/subscription require a positive amount and ISO currency.
- Unit pricing requires a unit label.
- Subscription requires a billing period.
- Range requires ordered minimum/maximum amounts and currency.
- Optional tax/fee inclusion and pricing assumptions are explicit fields.
- These values are public reference disclosures only; they never create a payable balance or transaction.

## 5. Publishing and moderation lifecycle

1. Member or authorized organization administrator creates/edits a canonical business identity.
2. Business owner uploads private PDF/PNG/JPEG/text verification evidence through the existing private-upload protocol (size/type/checksum validation).
3. Business submits the verification case.
4. An independent `business_verification_reviewer` reviews evidence and records a reasoned decision and revalidation date.
5. An independent `business_moderator` reviews the public business profile.
6. Authorized business owner starts a private listing draft, completes the guided wizard and submits.
7. An independent business moderator reviews category fields, service area, capacity, availability and pricing disclosure, then publishes, requests changes, rejects or suspends.
8. Owners may edit published/paused/rejected listings; an edit returns the listing to a private draft and requires a new moderation decision. Owners may pause or close (archive) a listing.
9. Only published listings attached to verified, approved and published businesses appear in discovery.

Private business evidence remains private. Authorized reviewers can download it through the existing file authorization boundary; owners cannot review or approve their own business/listing.

## 6. User experience

The new `/network-plus/opportunities` page is linked from the Network-Plus app home as the Opportunity mall. It provides:

- Server-driven search with text, listing kind, category, subcategory, structured service-area and location filters.
- Compact listing cards and a details view, including business identity, service areas, remote availability, intake state, lead time, capacity and pricing disclosure.
- Eight focused wizard steps: listing kind, broad category, description, category-specific details, audience/geography, capacity/pricing, review, submit.
- Structured fields first, category-specific progressive disclosure, one focused step at a time.
- Debounced autosave to the server, persisted wizard step and answers, saved-state feedback, resume and edit flows.
- A My listings shelf with draft/resume, review status, edit, pause and close actions.
- A business identity setup flow with private evidence upload and verification submission.

The experience is an app-like professional directory. It is not a transactional marketplace.

## 7. API surface

- `GET /api/v1/network-plus/listing-taxonomy` — controlled category/subcategory field schema.
- `GET /api/v1/network-plus/geography-reference` — current published membership geography reference for structured service areas.
- `GET /api/v1/network-plus/listings` — server-filtered published directory.
- `GET /api/v1/network-plus/my/listings` — owner/delegate listing shelf.
- `POST /api/v1/network-plus/businesses/:id/listings/drafts` — idempotent private draft creation.
- `PATCH /api/v1/network-plus/services/:id/draft` — owner-authorized autosave/resume.
- `POST /api/v1/network-plus/services/:id/submit` — publication eligibility and required-field validation.
- Existing business create/edit/evidence/verification/moderation/publication routes are reused.
- Existing request routes remain the only connection-request foundation. Product profiles accept `supplier_inquiry` and `referral` only.

## 8. Admin review surface

- `/admin/network-plus/businesses` — business verification evidence and business profile moderation.
- `/admin/network-plus/services` — independent Needs & Offers listing moderation, including category-specific structured details and public disclosures.
- Admin navigation exposes each page only to the corresponding business verification reviewer or business moderator capability.
- Domain service authorization remains the security boundary; UI navigation is not authorization.

## 9. Regression and validation plan

1. Run the complete migration chain on a disposable PostgreSQL database, including the Phase 0 and Phase 1 migrations; verify rollback.
2. Verify taxonomy seeds, category/subcategory parent integrity, supported listing kinds, and absence of duplicate listing tables.
3. Create a member-owned and organization-owned business; verify accepted ownership and capability boundaries.
4. Upload and confirm private business evidence; verify evidence ownership, checksum/type validation and reviewer-only read access.
5. Exercise verification and profile moderation with independent reviewers; assert owner self-review is denied.
6. Create, autosave, reload and resume a draft; test idempotent create replay and conflicting key reuse.
7. Validate required category fields, secondary tags, structured service areas, version mismatch, remote/on-site rules, service radius, timezone-aware availability and every pricing model.
8. Publish a need, offer, product profile and service profile; verify only approved/published business listings appear in directory search and geographic filters.
9. Verify edits to published/paused/rejected listings return to private draft and require re-moderation; verify pause, republish and archive behavior.
10. Verify product profiles accept supplier inquiry/referral but reject service-order intent; paused/unavailable listings reject new connection requests.
11. Run Playwright desktop/mobile discovery, wizard autosave/resume, private evidence upload and moderation journeys.
12. Run Biome, TypeScript, production build, backend unit/integration suites, PostgreSQL compatibility and full Playwright gates.

## 10. Implementation status

The Phase 1 source implementation, forward-only migration, owner wizard, private evidence upload, admin review workspaces and regression tests are present on the PR #18 branch.

**Not asserted here:** successful execution of the PostgreSQL migration, full test suites, CI, production deployment or release. Keep PR #18 draft until all gates pass.
