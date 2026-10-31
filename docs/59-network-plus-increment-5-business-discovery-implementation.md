# Network-Plus Increment 5 — Business Discovery implementation record

**Branch:** `feat/workstream-3-progress-members-workspace`  
**PR:** [#18](https://github.com/mpaproject1/MPA-Professionals-Network/pull/18) (keep open and draft)  
**Plan:** [docs/53-network-plus-discovery-and-collaboration-integration-plan.md](53-network-plus-discovery-and-collaboration-integration-plan.md)  
**Approved domain contract:** [docs/58-network-plus-increment-4-business-discovery-domain-design.md](58-network-plus-increment-4-business-discovery-domain-design.md)  
**Status:** Implementation in progress; no production migration; exit gate not yet passed.

## 1. Scope and invariants

Increment 5 establishes the separate Network-Plus commercial Business Discovery data/API foundation. It does not implement the typed request/collaboration lifecycle (Increment 6), browser UI, bulk conversion of existing service records, or production migration.

- Canonical identities remain `app_user` and `organization`; there is no second person/member/organization table.
- `professional_profile`, membership, organization verification and organization membership remain authoritative sources for member and organization identity/access.
- `service_listing` and `service_request` remain the existing service/Serve-Community foundation. Increment 5 adds `network_plus_service_listing`; it does not alter old service records or states.
- A business is not automatically verified because its member or organization owner is verified.
- A listing is not published merely because it was created or submitted.
- Organization owner/admin roles are checked against the exact owning organization. Project managers require a separate business-scoped capability assignment. Recruiter/read-only roles receive no implicit business mutation authority.
- Public discovery is an eligible Network-Plus experience, not anonymous public access. Search/detail responses use explicit field projections.

## 2. Additive schema

Migration: `db/migrations/20261031110000_network_plus_business_discovery.sql`

| Table | Responsibility |
|---|---|
| `network_plus_business` | Business profile and separate verification, moderation and publication states |
| `network_plus_business_ownership` | Explicit member/organization owner parties, primary/co-owner roles and consent |
| `network_plus_business_access` | Capability-specific operational delegation scoped to one business |
| `network_plus_business_verification_case` | Independent business verification lifecycle, reviewer, decision and revalidation expiry |
| `network_plus_business_verification_evidence` | Private uploaded evidence references; no public evidence projection |
| `network_plus_service_listing` | Commercial/professional service listing fields, audience, price, availability, credentials and moderation state |
| `network_plus_business_event` | Business lifecycle event history |
| `network_plus_service_listing_event` | Service listing lifecycle event history |

The schema uses foreign keys to existing canonical user, organization, geography-reference and private-file records. It includes check constraints, partial unique indexes for owner/idempotency invariants, and search/management indexes. It does not seed, convert, or backfill business records.

### Ownership rules

- An individual business is owned by a canonical member identity.
- An organization business is owned by a canonical organization identity.
- A joint business starts with one accountable primary owner; each additional owner is represented by a separate pending ownership row and must explicitly accept before becoming active.
- Member co-owners must be active professional members. Organization owner parties must be represented by an authorized current organization owner/admin.
- Operational manager assignments are not legal ownership. The capability set is explicitly limited to listing management, request response and commercial-term acceptance. Assignments have expiry/revocation fields.

## 3. Lifecycle and moderation

Business verification and profile moderation are distinct:

- Verification case: draft evidence collection → submitted → under review → verified / changes requested / rejected / suspended; an expiry date is required for a verified decision.
- Business profile moderation: not submitted → pending review → approved / rejected / suspended.
- Business publication: draft → published / paused / suspended / archived.
- Service listing: draft → pending review → published / changes requested / rejected / paused / suspended / archived.

Publishing a service requires current Network-Plus access, authorized business management, business verification, unexpired verification, approved business moderation and a currently verified linked organization where the owner party is an organization. Listing moderation is independent of the creator. Owners cannot approve their own business/listing through the moderation functions.

## 4. API surface

All routes are authenticated and return no-store JSON through the existing API server. Discovery and management services re-resolve Network-Plus eligibility and/or exact resource ownership server-side; the UI is not an authorization boundary.

| Method and route | Purpose |
|---|---|
| `GET /api/v1/network-plus/businesses` | Search published verified/approved businesses |
| `GET /api/v1/network-plus/businesses/:id` | Published business detail and audience-filtered published services |
| `GET /api/v1/network-plus/services` | Search published services, filtered by member/organization audience |
| `GET /api/v1/network-plus/services/:id` | Published service detail with audience check |
| `GET /api/v1/network-plus/my/businesses` | Business management index for current owners/delegates |
| `POST /api/v1/network-plus/businesses` | Create business with canonical owner and idempotency key |
| `PATCH /api/v1/network-plus/businesses/:id` | Update authorized business profile |
| `POST /api/v1/network-plus/businesses/:id/owners` | Invite a co-owner to a joint business |
| `POST /api/v1/network-plus/business-ownership/:id/respond` | Accept/decline a pending owner invitation |
| `POST /api/v1/network-plus/businesses/:id/access` | Grant explicit scoped manager capability |
| `POST /api/v1/network-plus/businesses/:id/evidence` | Attach a private file owned by the current authorized business actor to a draft verification case |
| `POST /api/v1/network-plus/businesses/:id/verification` | Submit an evidence-backed business verification case |
| `POST /api/v1/network-plus/businesses/:id/moderation` | Submit a verified business profile for moderation |
| `POST /api/v1/network-plus/businesses/:id/publication` | Owner pause/publish/archive action subject to policy |
| `POST /api/v1/network-plus/businesses/:id/services` | Create a commercial/professional service listing with idempotency |
| `PATCH /api/v1/network-plus/services/:id` | Update an owned/delegated listing |
| `POST /api/v1/network-plus/services/:id/submit` | Submit an eligible listing for moderation |
| `POST /api/v1/admin/network-plus/businesses/:id/verification` | Independent verification decision |
| `POST /api/v1/admin/network-plus/businesses/:id/moderation` | Independent business profile moderation decision |
| `GET /api/v1/admin/network-plus/businesses/:id/evidence` | Reviewer-only evidence metadata list |
| `POST /api/v1/admin/network-plus/services/:id/moderation` | Independent listing moderation decision |

Creation and search/submission routes use persistent rate limits. Creation routes require an `X-Idempotency-Key`; hashes and payload fingerprints prevent accidental duplicate creation and reject key reuse with different payloads.

## 5. Privacy and authorization

- Discovery projections exclude legal names, member/organization owner identifiers, private contact details, verification evidence, reviewer notes and organization rosters.
- Business and service detail endpoints only return currently published records with verified/approved business state and unexpired verification.
- Service audience is checked against the resolved Network-Plus member/organization access context.
- Owner actions check current active ownership consent or a live, unrevoked, unexpired business capability assignment.
- Organization owner/admin actions check an active `organization_membership` row for the exact owner organization.
- Verification and moderation require independent reviewer roles or explicit `business.verify` / `business.moderate` permissions; self-review is rejected.
- Audit log entries, business/listing lifecycle events and in-app reviewer/owner notifications are written within the mutation transaction where implemented.

## 6. Migration, compatibility and rollback

The migration is additive and does not modify or backfill existing rows. Existing `service_listing`, `service_request`, mentorship, Jobs, membership, payment and Serve-Community records are untouched.

The migration compatibility script now includes the Increment 5 migration, required columns, core foreign-key targets and unique indexes. The script is designed to apply the migration chain to a clearly named disposable test/CI database and roll the transaction back. It refuses production/live database names and requires explicit disposable-database confirmation.

Rollback notes:
1. Do not run this migration in production as part of this PR.
2. If a disposable validation run fails, rollback is automatic through the compatibility transaction.
3. Before any future deployed rollback, first disable the Business Discovery API routes and ensure no new business/listing records are being written.
4. Preserve audit history and evidence records for investigation; do not cascade-delete business, ownership, verification or listing history.
5. Any production rollback must be a separately reviewed forward-only remediation/restore plan; do not blindly drop tables after records may have been created.

## 7. Tests and exit gate

Added `test/platform/network-plus-business-discovery.test.js` for schema/source/API contracts and extended `scripts/check-new-migration-compatibility.js`.

**Not yet evidenced as passed:**
- [ ] Execute migration compatibility on disposable PostgreSQL and confirm rollback.
- [ ] Add/run seeded PostgreSQL integration tests for individual, organization and joint ownership; duplicate owner/idempotency conflicts; cross-organization access; delegated project-manager capability; expired/revoked delegation.
- [ ] Add/run API tests for signed-out, expired membership, verified/unverified organization, direct endpoint access, field-level audience, private evidence isolation, self-review and unauthorized moderation.
- [ ] Execute and test reviewer-authorized private evidence download through the existing `GET /api/v1/files/:id` route. The private-file service now allows only an independent `verification_reviewer` / `system_admin` or explicit `business.verify` permission to read evidence attached to a submitted/under-review case, and rejects the case submitter. Validate the negative cases with PostgreSQL fixtures.
- [ ] Confirm the two system-only permission catalogue entries `business.verify` and `business.moderate` are present after migration and verify authorized reviewer assignment through the existing permission governance workflow. The migration does not grant either permission to any user.
- [ ] Run backend tests, Biome, TypeScript, production build and browser acceptance after all implementation fixes are ready.
- [ ] Complete manual privacy, accessibility and responsive checks before public release.

**Exit status: IN PROGRESS — NOT PASSED.** The current changes are a source implementation draft. No production migration, deployment, merge or main-branch change has occurred. Keep PR #18 draft until the full exit gate passes.
