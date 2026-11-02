# MPA Unified Membership Management Center — Product, UX, Analytics and Governance Plan

**Target repository:** `mpaproject1/MPA-Professionals-Network`  
**Target branch:** `feat/workstream-3-progress-members-workspace`  
**Status:** Proposed implementation plan; no application code or database lifecycle has been changed by this document.

## 1. Executive direction

Create one dedicated **Membership Management Center** inside `/admin`. It is the operational and management home for the full membership lifecycle: acquisition, application review, payment verification, activation, member servicing, renewal, expiry, retention, geographic coverage and performance analysis.

The change is a consolidation of navigation, workflows and analytical presentation—not a collapse of authorization boundaries or a rewrite of the existing membership/payment state machines. Existing member import/export, catalogue, plans, payment methods, cards, reports, payment verification/reversal and audit functionality must remain available through the new workspace.

The workspace serves four distinct audiences:

1. Membership officers: process applications, resolve missing information, communicate decisions and monitor renewals.
2. Finance officers: verify payment evidence, reconcile transactions and identify outstanding dues without gaining membership decision authority or unnecessary member PII.
3. Supervisors: balance workloads, monitor service levels, review exceptions and assess team performance.
4. MPA management: evaluate acquisition, approval conversion, paid conversion, active membership, revenue collection, retention and regional reach.

## 2. Current branch findings and fragmentation

The inspected branch currently exposes separate destinations from `web/app/admin/page.tsx`:

- `/admin/membership`: membership operations and the existing membership workspace.
- `/admin/members`: bulk import and export of approved member registers.
- `/admin/members/catalog`: member catalogue.
- `/admin/membership/payment-methods`: payment-method configuration.
- `/admin/membership-cards`: eligible member card viewing/printing.
- `/admin/reports`: general and finance report catalogue.
- `/admin/accounts`: account and team administration.
- `/admin/finance`: separate finance workspace.

The current admin overview lists these as independent workspaces. The membership page wraps the existing member-facing membership workspace in admin access checks. The bulk member administration page handles historical approved-register import and member export separately. As a result, staff cannot see the complete funnel, decision queue, payment state, member register, renewal risk and management trends from one place.

The branch already contains important safeguards documented in:

- `docs/43-pr18-phase-1-authorization-and-role-reconciliation.md`
- `docs/44-pr18-phase-2-finance-workspace-and-reporting.md`

Those documents establish distinct membership review/activation permissions and finance verification/reversal permissions, server-authoritative authorization, finance report privacy boundaries, and currency-separated financial calculations. This plan extends the user experience without weakening those contracts.

## 3. Non-negotiable lifecycle and account-claim rule

### 3.1 Separate decisions

Membership review and payment verification are independent decisions:

- Membership reviewer checks eligibility, completeness, membership category and governance requirements.
- Finance officer verifies the payment or an explicitly authorized historical payment proof.
- Membership activation is allowed only when the application is eligible/approved AND the linked required fee is verified and not reversed.
- Account claim/linking is a separate privileged operation and is also blocked until Finance has verified the required payment.

**No system administrator, membership officer, support staff member, account manager or bulk-import operator may bypass the payment gate to claim/link an account or activate a paid membership.** UI hiding is not sufficient: the API and service layer must reject the operation.

### 3.2 Proposed lifecycle presentation

Use a lifecycle that maps to existing persisted states rather than inventing duplicate status records:

1. Application submitted — awaiting review.
2. Under review — assigned to an authorized reviewer.
3. Needs information — applicant action required; show what is missing and when requested.
4. Rejected/withdrawn — terminal decision with reason and audit trail.
5. Approved — eligibility decision made; membership is not yet active.
6. Payment pending — payment evidence/transaction not yet verified.
7. Payment under finance review — evidence submitted or transaction awaiting confirmation.
8. Payment verified — authorized Finance confirmation recorded; reversal state is checked live.
9. Ready to activate — approval and verified, non-reversed payment both present.
10. Active — activation completed through the authorized lifecycle action.
11. Renewal due / overdue — derived from membership end date and renewal policy.
12. Expired / suspended / cancelled — distinct operational states; never collapse them into one inactive label.

The exact mapping to existing enums and transitions must be established by inspecting the current service, schema and tests before implementation. Do not add a second competing source of truth.

### 3.3 Account claim/link guard

Every account-claim, account-link, imported-account association and activation path must call the same server-side eligibility guard. The guard should verify:

- Membership application is approved under the existing membership decision workflow.
- The required payment is linked to the same application/member and is currently succeeded/verified.
- No refund, reversal, cancellation or disqualifying dispute has invalidated payment eligibility.
- Amount and currency match the immutable fee snapshot for that application.
- The finance verification actor, timestamp, reference and evidence are present as required by the payment method.
- The caller has the specific permission for the requested operation.
- The action is idempotent and audited.

A finance verification does not itself approve the application or silently activate the account. A later authorized activation/claim action is explicit and audited. A system-admin role is not a payment-verification substitute. If historical imported members are supported, they require a Finance-approved historical payment proof/authorized waiver recorded in the same auditable payment eligibility model; an “approved_membership=yes” CSV flag alone must never create a verified payment or unlock account claiming.

### 3.4 UI treatment

For a blocked claim, show a clear state such as **“Account claim locked — finance verification required”**, the missing requirement, the finance queue/reference and a link to the payment record for authorized staff. Do not expose payment mutation controls to membership-only users. Do not show a bypass button, hidden override, or client-side-only restriction.

## 4. Proposed Membership Center navigation

Create a dedicated membership shell with compact, app-like navigation, consistent with the MPA minimal workspace direction.

1. **Overview** — management dashboard and action summary.
2. **Applications** — review pipeline and application decisions.
3. **Payments** — payment status visibility and Finance-owned verification handoff.
4. **Members** — searchable member register and detailed profiles.
5. **Renewals & expiry** — upcoming dues, overdue and retention.
6. **Geographic intelligence** — region, zone, woreda, city and diaspora coverage where supported.
7. **Reports & exports** — saved filters, analytical reports and secure downloads.
8. **Configuration** — membership plans, payment methods, card settings and governed reference data.

The Overview is the default landing page. Tabs should be local to the Membership Center, not a row of unrelated links in the global admin homepage. Use role-aware visibility while preserving direct-route backend authorization.

### Existing route compatibility

- Make the Membership Center the single entry point from `/admin`.
- Move or embed current functionality under the new navigation without deleting it.
- Keep old URLs operational through redirects or compatibility wrappers; preserve bookmarked links and report deep links.
- Keep `/admin/finance` as the finance-owned workspace. The Membership Center may show payment status and route Finance to their queue, but must not duplicate finance mutation authority.
- Keep `/admin/accounts` as the account administration workspace. It must consume the shared payment eligibility guard for membership claim/link operations.
- Retain existing membership-card printing, import preview/apply, member catalogue, payment-method configuration and report functionality.

## 5. Overview dashboard: management intelligence

### 5.1 Global filter bar

Place a persistent filter bar above dashboard metrics:

- Date basis: application submitted, membership decision, payment verified, activation, renewal/expiry.
- Presets: today, 7 days, 30 days, current month, previous month, quarter, year-to-date, previous year, custom range.
- Calendar month and year selectors.
- Geography: region → zone → woreda → city (only valid stored levels).
- Membership plan/type: Basic, Lifetime, Premium and any configured active plan.
- Application source/channel, where reliably captured.
- Current lifecycle state.
- Assigned reviewer/team (authorized supervisory users only).
- Payment method and currency (Finance-authorized views only).
- Include/exclude test fixtures and imported historical records, with explicit labels and safe defaults.

Show active filter chips, a clear-all action, last-updated time and the reporting timezone. Default reporting timezone should be the approved MPA reporting timezone (currently GMT+3/Ethiopia) and timestamps must be stored consistently. All charts, KPI cards, tables and exports must use the same filter object.

### 5.2 KPI cards

Each KPI card shows current value, comparison with the previous equivalent period, trend direction, definition tooltip and a click-through to the filtered underlying records.

**Acquisition and application**
- Applications received.
- Unique applicants (deduplicated by the authoritative identity rules).
- Applications awaiting first review.
- Applications under review.
- Applications needing applicant information.
- Applications approved.
- Applications rejected.
- Applications withdrawn.
- Application completion rate.
- Median and 90th percentile time to first review.
- Median and 90th percentile time to decision.

**Payment and conversion**
- Approved applications awaiting payment.
- Payments submitted/initiated.
- Payments awaiting Finance verification.
- Verified/approved membership payments.
- Failed payments.
- Refunded/reversed payments.
- Outstanding membership balance by currency.
- Paid conversion rate.
- Approval-to-payment median time.
- Payment verification median time.
- Gross verified collections, refunds/reversals and net retained collections, grouped by currency—never sum ETB, USD or other currencies into a false grand total.

**Membership base**
- Active members.
- Active paid members.
- Active lifetime members.
- Active members by plan.
- Members due for renewal in 30/60/90 days.
- Overdue/expired members.
- Suspended members.
- Cancelled memberships.
- New activations in selected period.
- Renewals completed.
- Lapsed members.
- Net membership growth.

**Operational performance**
- Unassigned applications.
- Queue size by stage and age.
- Cases beyond service-level target.
- Reviewer workload and throughput.
- Finance verification backlog and ageing (only Finance/supervisor roles authorized).
- Incomplete profiles or missing geography.
- Data-quality exceptions and duplicate candidates.

### 5.3 Dashboard visualizations

Use charts to answer specific management questions rather than decorative graphs:

1. **Membership funnel:** applications → eligible/approved → payment verified → activated. Display both counts and conversion percentages; distinguish application cohorts from period event totals.
2. **Application trend:** daily/weekly/monthly submissions and decisions, with comparison period.
3. **Status distribution:** pending review, needs information, approved awaiting payment, payment pending, paid/ready to activate, active, rejected and withdrawn.
4. **Growth trend:** active membership at each month-end, new activations, renewals, lapses and net growth.
5. **Plan mix:** Basic, Lifetime, Premium and other configured plans; count and share.
6. **Geographic distribution:** region/zone/woreda ranked bars and map only where location data is sufficiently complete and privacy-safe.
7. **Payment collection:** gross, refunds/reversals and net retained amount by currency and period; never combine currencies.
8. **Renewal cohort:** due vs renewed vs lapsed by month/cohort.
9. **Review efficiency:** median decision time, age buckets and SLA attainment by team/reviewer.
10. **Source/channel performance:** applications, approval conversion, paid conversion and cost per acquisition only if trustworthy campaign-cost data exists.

Every visualization must have accessible labels, empty/error states, date basis, drill-down behavior and a tabular alternative. Avoid 3D charts, misleading truncated axes and unlabeled percentages.

### 5.4 Management insight panel

Add a concise “What needs attention” panel with rule-based observations, for example:

- Application volume increased while approval conversion declined.
- A region has high application volume but low paid conversion.
- Payment verification backlog is older than the agreed target.
- Renewal completion is below the previous cohort.
- A reviewer queue has exceeded capacity.
- Geography or plan fields are missing for a material share of records.

Insights must be explainable and traceable to filtered source counts. Do not label correlation as causation or generate unsupported AI conclusions.

## 6. Applications: complete approval workflow

Build a focused review queue with saved views:

- New/unassigned.
- Assigned to me.
- Awaiting review.
- Needs information.
- Decision-ready.
- Approved awaiting payment.
- Rejected/withdrawn.
- Ageing / SLA breached.

Each row should show reference, applicant name and minimum contact details permitted for that role, plan, submission date, location, completeness, assigned reviewer, current stage, age and next action.

### Application detail workspace

Use a split-pane or full-screen detail view with progressive disclosure:

- Applicant identity and contact.
- Profile and professional information relevant to eligibility.
- Requested plan and fee snapshot.
- Location and source.
- Submitted documents/evidence with access logging.
- Completeness checklist.
- Reviewer notes (internal/private) and applicant-facing messages clearly separated.
- Timeline of submissions, information requests, decisions, payment events and activation.
- Assignment and reassignment history.
- Duplicate identity warnings with safe comparison tools.

### Decision actions

- Assign/reassign reviewer.
- Mark under review.
- Request missing information with structured reason and due date.
- Approve eligibility (not activation).
- Reject with mandatory reason and optional policy reference.
- Record withdrawal where supported.
- Return to queue.

Approval must create the approved-but-not-yet-active state and expose the payment next step. It must not create an active membership or unlock account claiming. Bulk decisions should be limited to safe, homogeneous actions, require preview and confirmation, and never bulk-activate or bypass Finance.

## 7. Payments: show the handoff without merging authority

Membership staff need to understand whether an approved application is waiting for payment, while Finance owns verification and reversal.

The Membership Center may show a privacy-minimized payment status strip:

- Not due / awaiting payment.
- Payment initiated.
- Evidence submitted.
- Awaiting Finance review.
- Verified and eligible.
- Failed.
- Refunded/reversed.
- Disputed or unreconciled (as authorized).
- Outstanding amount/currency and due date.

Finance users should be routed to `/admin/finance` for verification, reversal and reconciliation actions. Finance must not be granted membership approval/activation controls by virtue of its payment role. Membership reviewers must not gain Finance-only transaction evidence or payment mutation access.

Payment status should be linked to the immutable application fee snapshot and exact application/member reference. The workspace must explain why a payment is not eligible (wrong amount, wrong currency, missing evidence, failed status, reversal, unmatched reference) without exposing restricted bank or payer data to unauthorized roles.

## 8. Members: authoritative register and profile

Consolidate member catalogue and member operational actions into one searchable register.

### Table columns

- Member number / stable public reference.
- Name.
- Plan.
- Membership lifecycle status.
- Application reference and decision date.
- Payment eligibility indicator (role-scoped).
- Activation/start date.
- Expiry/renewal date.
- Region, zone, woreda and city.
- Professional category/sector (where available).
- Account linked / claim status.
- Last meaningful activity (if supported).
- Assigned membership officer (if applicable).

Support saved views: Active, New, Pending, Approved awaiting payment, Payment verified awaiting activation, Due in 30/60/90 days, Overdue, Expired, Suspended, Lifetime, Missing profile/location, and historical/imported records.

### Member profile

One profile with sections: overview, identity/contact, membership and plan history, payment summary (permission-scoped), renewals, applications and service history, documents, account linkage, communication history and audit timeline. Apply least-privilege field masking.

### Member actions

Permitted actions depend on explicit capabilities: update allowed profile data, correct governed location data with audit, resend invitation, open member progress, print eligible card, inspect history, initiate renewal reminder, suspend/cancel only through the existing authorized workflow, and export under audited permission.

Account claim/link action is disabled until the shared Finance verification guard returns eligible. Never allow manual membership-number assignment or admin impersonation to fabricate paid membership.

## 9. Renewals, expiry and retention

Create a dedicated renewal operations board:

- Due in 90, 60, 30, 7 days.
- Due today.
- Overdue grace period (if a policy exists).
- Expired.
- Renewal initiated.
- Renewal payment pending Finance.
- Renewed/retained.
- Lapsed.
- Lifetime (excluded from ordinary expiry cohorts unless a governed exception applies).

Display upcoming renewal value by currency, cohort size, reminder delivery status, renewal conversion and lapse reasons where captured. Provide audited reminder scheduling and existing notification integration; avoid sending duplicate reminders. Do not silently change expiry dates when payment is received; use the established renewal/activation transition.

## 10. Geographic intelligence and data quality

Use a governed hierarchy rather than free-text aggregation wherever possible:

- Country (for diaspora/international members).
- Ethiopia region/city administration level as supported by current reference data.
- Zone.
- Woreda.
- City/town/neighborhood where captured and appropriate.

Do not infer missing location from IP, phone number or approximate user location. Keep unknown/unreported as a visible category. Distinguish residence, workplace and preferred service location if the data model supports all three.

Regional analysis should include applications, approval rate, paid conversion, active members, plan mix, renewal rate, net growth, overdue cases and data completeness. Show sample sizes and suppress small groups in broadly accessible exports where re-identification risk exists.

Create a data-quality panel for missing/invalid geography, duplicate identities, conflicting membership numbers, missing fee snapshots, orphaned payment links, impossible date ranges, active status without verified payment, and account claim without eligibility. The last two are critical invariant violations and should trigger investigation, not automatic repair.

## 11. Reports, filtering and exports

Every table and report must support server-side filters, sorting and pagination. Filters include:

- Date range and selected event date.
- Calendar month/year.
- Region, zone, woreda, city and country.
- Plan/type.
- Application, payment and membership status.
- Application source.
- Assigned reviewer/team.
- Payment method/currency for Finance-authorized users.
- Renewal cohort and expiry window.
- Member type (new, renewal, lifetime, imported historical).
- Include/exclude test fixtures and historical imports.

### Required downloadable reports

1. Application register and funnel.
2. Pending application ageing and SLA.
3. Approval/rejection decisions and reasons.
4. Approved-but-unpaid applications.
5. Payment verification queue (Finance only).
6. Collections by currency and period (Finance only).
7. Active member register.
8. Member growth by month/year.
9. Member distribution by region/zone/woreda.
10. Plan/category distribution.
11. Renewal due list and renewal conversion.
12. Expired/lapsed membership register.
13. Reviewer workload and decision performance.
14. Data quality and reconciliation exceptions.
15. Account-claim eligibility exceptions and audit review.

Support XLSX and CSV; PDF only for formatted management summaries if already supported. Export must use the same server-side filters as the visible table, include applied filters, generation timestamp, timezone, row count, currency labels and data dictionary/definitions where useful. Large exports should be asynchronous or paginated; do not silently truncate. Keep existing 5,000-row cap disclosure or replace it with a transparent job-based export. Every export must be permission-checked and audited, and sensitive columns must be role-scoped.

## 12. KPI dictionary for MPA membership performance evaluation

Management must use stable, documented definitions. Each KPI should specify numerator, denominator, event date, cohort/period, exclusions, owner and refresh frequency.

| KPI | Recommended definition | Management question |
|---|---|---|
| Application growth | Submitted applications in period vs prior equivalent period | Is acquisition increasing? |
| Application completeness | Complete applications / submitted applications | Are applicants able to complete the process? |
| First-review SLA | Applications receiving first review within target / applications due for first review | Is the team responding promptly? |
| Decision turnaround | Median elapsed time from submission to final eligibility decision | How quickly are applications decided? |
| Approval rate | Approved applications / decided applications (approved + rejected; withdrawals reported separately) | Are applicants eligible and criteria applied consistently? |
| Paid conversion | Approved applications with verified, non-reversed payment / approved applications eligible to pay in the cohort | Do approved applicants complete payment? |
| Activation conversion | Activated memberships / approved applications with verified payment eligible for activation | Are ready cases being completed? |
| Payment verification SLA | Eligible submitted payment cases verified within target / cases due for verification | Is Finance clearing payments promptly? |
| Active paid members | Count of active memberships satisfying the payment eligibility invariant | What is the current paid membership base? |
| Net membership growth | New activations + completed renewals − lapses/expiries in the period | Is the base growing sustainably? |
| Renewal rate | Renewed eligible memberships / memberships due for renewal in the cohort | Are members staying? |
| Lapse rate | Eligible due memberships not renewed by end of policy grace period / memberships due | Where is retention failing? |
| 90-day retention | Members still active 90 days after activation / activation cohort | Does early membership engagement retain people? |
| Geographic coverage | Active members by valid geographic hierarchy and share of total | Where is MPA represented or underserved? |
| Regional conversion | Paid conversions / eligible approved applications by region | Which regions need support? |
| Plan mix | Active members by plan / total active members | Which membership products are adopted? |
| Net collections | Verified succeeded non-reversed amount, net of refunds/reversals, by currency | What has actually been retained? |
| Cost per acquired member | Attributable acquisition spend / new paid activations | Is acquisition efficient? Only publish when spend attribution is reliable. |
| Reviewer productivity | Decisions per reviewer, adjusted for case complexity and assigned workload | Is work distributed fairly? |
| Backlog ageing | Open cases by age bands and stage | Where are cases getting stuck? |
| Data completeness | Records with all required valid fields / records in scope | Can management trust the analysis? |

### KPI interpretation safeguards

- Do not calculate approval rate with pending cases in the denominator.
- Report withdrawals separately; do not silently treat them as rejected.
- Use application cohorts for conversion (applications submitted in a period followed through their lifecycle) and event-period counts for operational throughput. Label the distinction.
- Use month-end snapshots for active membership stock; do not equate all-time activations with current active members.
- Count active members only under the authoritative membership status and payment eligibility invariant.
- Treat lifetime memberships separately in renewal metrics.
- Keep currencies separate. No inferred exchange rate or cross-currency total.
- Separate failed payments from refunds/reversals.
- Report median and percentile times, not only averages.
- Segment performance by geography/plan only where sample size is meaningful.
- Attribute performance to the responsible team and case assignment at the time of work; do not penalize staff for waiting on applicants or external payment providers without showing the wait category.

## 13. Staff performance and management scorecard

Provide supervisors a role-restricted scorecard:

- Incoming cases, assigned cases, decisions and unresolved workload.
- Median first-response and decision time.
- SLA attainment.
- Rework rate / repeated information requests.
- Pending cases by age.
- Applicant withdrawal and abandonment rates.
- Reviewer decisions by outcome, with quality sampling and appeal/reversal context.
- Finance queue volume and verification turnaround, visible only to authorized finance management.

Do not rank staff using raw decision volume alone. Show case complexity, assignment dates, leave/availability where legitimately recorded, external waiting time and quality review. Never reward high approval rates or fast rejections as a standalone target; this can create poor eligibility decisions. Use balanced service, accuracy, fairness and timeliness measures.

## 14. Role-based workspace and permissions

The backend remains the authority. The frontend derives navigation from current `/api/v1/me` roles/permissions and the authorized backend catalogue; direct API and deep-link access must enforce the same permissions.

| Role/capability | Overview | Application PII/review | Payment verification | Member register | Exports |
|---|---|---|---|---|---|
| Membership reviewer (`membership.review`) | Membership operational KPIs | Assigned/authorized cases | No mutation; minimal status only | Only permitted member fields | Scoped membership exports |
| Membership activation (`membership.activate`) | Activation queue | Approved/eligible cases | No payment mutation | Activation-eligible records | Audited, scoped |
| Finance (`finance.payment.verify`, `finance.payment.reverse`) | Finance-specific summary | No membership decision/PII by default | Yes, authorized actions | No general member directory | Finance-only |
| Finance read-only (`finance.view`) | Finance summary | No | No | No | Finance reports only |
| Supervisor | Team KPIs and queues | Team-scoped review | Only if separately granted Finance authority | Team-scoped | Audited and scoped |
| System admin | Platform overview and authorized administration | Explicitly permission-gated | Only with finance permission | Admin view as authorized | Audited; no bypass of payment eligibility |
| Account administrator | Account operations | No membership decision by account role alone | No | Minimal claim eligibility signal | No membership PII by default |

Role names alone must not be used as a blanket mutation permission when explicit capabilities exist. The current branch's explicit permission catalogue and role reconciliation must be reviewed before adding or renaming permissions. Do not seed permissions directly onto users. Any new capability requires additive catalogue migration, explicit assignment governance and negative authorization tests.

## 15. Technical architecture and data contract

Before implementation, trace existing tables, state transitions, services, report definitions, API routes and browser tests. Reuse existing persisted application, payment, reversal, reconciliation, member, membership, plan, audit and reference-data sources.

Recommended architecture:

- A membership overview read model/service that composes authoritative aggregates without changing lifecycle writes.
- A single normalized filter contract shared by KPI endpoints, chart endpoints, lists and exports.
- Server-side aggregation with indexes on event timestamps, lifecycle states, plan IDs, geography IDs and assignment IDs as supported by schema.
- Cohort queries and month-end active snapshots calculated consistently; if historical point-in-time reporting is not supported by current event history, explicitly state that limitation rather than fabricating historical active stock.
- Stable report definitions with named metric formulas and event-date semantics.
- Reusable payment eligibility guard invoked by every activation and account-claim/link entry point.
- Existing audit event infrastructure for assignment, decision, verification, reversal, claim/link, import, profile correction, export and configuration changes.
- No duplicate payment ledger, member status table or parallel application lifecycle.

Potential additive data is only justified where current records cannot answer a requirement—for example, immutable reviewer assignment history, decision reason taxonomy, or historical point-in-time membership snapshots. Any additions require a forward-only migration, data retention rules, indexes, rollback/compatibility review and migration tests. Do not denormalize sensitive personal data into analytics tables.

## 16. Visual and interaction design

The target is a compact professional application, not a long website:

- Navy and lemon MPA brand palette, consistent with the existing brand tokens.
- Persistent compact membership navigation and a clear workspace title.
- High-value KPI cards above the fold, with compact trend indicators and clear definitions.
- Charts arranged by decision question; avoid a wall of graphs.
- Dense but readable desktop tables, sticky column headers, saved views and keyboard-accessible filters.
- Responsive mobile layout with horizontally scrollable tables or purpose-built member/case cards, touch-sized actions and no hover-only controls.
- Progressive disclosure for advanced filters and profile sections.
- Detail drawer/split view for review work, with explicit save/decision confirmation.
- Distinct status labels for eligibility, payment and activation; never use one ambiguous “Approved” badge for all three.
- Loading skeletons, empty states, partial-data warnings, permission-denied states and retry controls.
- Accessible chart summaries and equivalent data tables; keyboard navigation, focus management and WCAG contrast.
- Display source timestamp and reporting timezone. Never render stale cached counts as current without labeling them.

## 17. Delivery phases

### Phase 0 — Discovery and invariant mapping
- Trace the membership schema, application/payment services, admin/account claim paths, import logic, payment reversal handling, reports and current tests.
- Inventory every membership-related route and navigation link.
- Write a state transition matrix and identify all account claim/link code paths.
- Baseline existing behavior with tests before changing UI.
- Confirm current role/permission catalogue and assigned roles without changing assignments.

### Phase 1 — Unified shell and navigation
- Add Membership Center route/layout and Overview entry.
- Consolidate links to applications, members, import/export, cards, payment methods and reports.
- Keep finance verification in Finance workspace.
- Add compatibility redirects/wrappers and preserve deep links.
- Implement role-aware tabs using server-derived authorization.

### Phase 2 — Application review and payment-gated claim
- Add/complete review queue and case detail.
- Implement the shared payment eligibility guard in every account-claim/link and activation route.
- Add clear payment handoff and blocked-state explanations.
- Add audit records and negative permission/invariant tests.
- Ensure imports do not fabricate payment verification or unlock account claims without Finance-approved historical evidence.

### Phase 3 — Membership overview analytics
- Add KPI aggregation endpoints and normalized filters.
- Implement funnel, trends, status distribution, plan mix and growth/renewal charts.
- Document event dates, cohort logic, denominators and currency rules.
- Add month-end snapshot support only if historical point-in-time counts cannot be reconstructed.

### Phase 4 — Member register, renewals and geography
- Bring member catalogue, profile and permitted actions into the Center.
- Add renewal/expiry views and reminder handoff.
- Add geography hierarchy, data quality and regional analysis.
- Preserve existing card eligibility and print workflows.

### Phase 5 — Reporting, exports and supervisor insights
- Add saved filters, Excel/CSV exports and management summary.
- Add team workload and SLA scorecards with fairness safeguards.
- Enforce export row limits transparently, field masking and audit logging.

### Phase 6 — Hardening and acceptance
- Complete desktop/mobile, accessibility, dark/light and browser acceptance.
- Run all backend tests, Biome, TypeScript, production build and full Playwright suite.
- Run all additive migrations against disposable PostgreSQL from a clean schema and supported prior migration states.
- Test every permission boundary and every claim/activation bypass attempt.
- Compare report totals with source records and Finance reports.
- Keep PR #18 draft and do not merge/deploy until all required checks pass.

## 18. Required test and acceptance matrix

### Lifecycle invariants
- Application approval alone does not activate membership.
- Payment verification alone does not approve the application or activate membership.
- Approved + pending/unverified payment cannot activate or claim account.
- Failed, cancelled, refunded, reversed or ineligible disputed payment cannot activate or claim.
- Correct amount/currency and current non-reversed verified payment plus application approval can enter the explicit activation path.
- A system admin without Finance verification authority cannot verify payment or bypass the claim guard.
- Account-management endpoints, bulk import, invitation, member-number assignment, admin UI and direct API all enforce the same gate.
- Reversal after activation follows the existing authorized suspension/review policy and never silently leaves a falsely eligible claim state.
- Idempotent retries do not create duplicate membership, payment or account links.

### Analytics correctness
- Funnel counts reconcile with source lifecycle records.
- Pending cases are excluded from decided-case approval denominators.
- Payment totals reconcile to the Finance workspace by currency.
- Refunded/reversed transactions are not counted as net retained collections.
- Month/year, timezone boundaries and inclusive/exclusive date ranges are tested.
- Geographic filters handle missing/unknown values and hierarchical selection correctly.
- Cohort conversion differs visibly and correctly from event-period throughput.
- Month-end active stock does not equal cumulative activations.

### Security and exports
- Reviewer cannot execute finance mutation or finance-only reports.
- Finance cannot access membership decision controls or unrestricted member PII.
- Account administrator cannot claim before Finance eligibility.
- Unauthorized users cannot retrieve protected records by guessing IDs or calling APIs directly.
- Export applies the same filters, role scope and field masking as the visible data.
- Exports and sensitive detail access are audited.
- Test fixture records are excluded by default from management KPIs and production-like exports.

### UX acceptance
- Staff can find every membership function from one Membership Center.
- Reviewers can complete a review without navigating unrelated admin pages.
- Finance verification remains in Finance workspace with a clear return link to the application.
- Management can see application, approval, payment, active, overdue and renewal performance for selected month/year and geography.
- Charts drill down to the matching records and show definitions.
- CSV/XLSX files open correctly and include filter/timezone metadata.
- Desktop and mobile flows are keyboard/touch accessible with meaningful empty/error/loading states.

## 19. Management decisions required before final implementation

The following policy details must be confirmed against existing MPA governance rather than hard-coded by developers:

1. Membership renewal grace period and exact point when overdue becomes expired.
2. Whether non-payment after approval has a deadline and whether an application auto-closes.
3. SLA targets for first review, final decision and Finance verification.
4. Official membership reporting timezone and calendar conventions (Gregorian, Ethiopian calendar display, or both).
5. Geographic reference hierarchy and canonical region/zone/woreda source.
6. Whether membership fee waivers, scholarships or sponsor-paid membership exist; if so, who authorizes and records them as payment-equivalent eligibility.
7. Which staff roles may view member contact details, professional profile, documents and historical payments.
8. Retention and privacy rules for rejected/withdrawn applications and exports.
9. Whether historic active membership can be reconstructed reliably from available event history.
10. Acquisition channel/campaign cost data availability before cost-per-acquisition is reported.

## 20. Definition of done

The Membership Center is complete only when:

- Membership-related work is discoverable and manageable from one coherent workspace.
- The dashboard presents accurate, filter-consistent KPIs, charts and drill-down records.
- Staff can process the full application review workflow.
- Finance payment verification remains separate and authoritative.
- No account can be claimed/linked and no paid membership activated before Finance-approved payment eligibility, including by system administrators or bulk tools.
- Member register, renewals, geography, reports, imports, exports, payment methods and cards remain functional.
- All metrics have documented formulas, cohort/date semantics and currency handling.
- Authorization, audit, privacy and accessibility tests pass.
- Full CI and disposable PostgreSQL/browser acceptance pass on the exact PR #18 head.

**Implementation boundary:** This document defines the proposed product and engineering plan only. It does not authorize production data changes, payment activation, deployment or weakening any existing PR #18 security/validation gate.

---

## 21. Implementation status on PR #18 (2026-11-02)

The following implementation has been committed to the target branch:

- Added `/admin/membership-center` with a compact membership navigation shell.
- Consolidated the global admin entry point so membership register, application operations, imports/exports, cards and payment settings are reached through Membership Center rather than appearing as unrelated global admin workspaces.
- Added period filters, month/year shortcuts, application-stage and member-status filters, plan search, CSV/XLSX application exports and aggregate member-status export.
- Added application funnel/status, monthly application trend, plan distribution, current member stock, open-application ageing and supervisor-scoped reviewer decision analytics.
- Added aggregate reporting permissions for membership reviewers and explicit membership permissions. Reviewer performance is treated as restricted staff-performance data.
- Added report acceptance coverage for membership aggregate access, monthly trends, backlog ageing, reviewer performance and Finance/report permission separation.
- Kept Finance payment operations and payment-method configuration under their existing Finance permissions. Finance-only roles do not receive member-catalogue PII access; limited non-PII membership export fields remain available under the existing export route.
- Added navigation back to Membership Center from membership operations, member catalogue, card and account-governance surfaces where the user's scope permits it.

### Known implementation boundaries

1. **Geographic filters are not enabled yet.** The current person/membership source schema does not persist a governed country/region/zone/woreda/city hierarchy. The dashboard deliberately does not fabricate location counts or use a generic text search as a location filter. MPA must approve the canonical hierarchy and the application/profile capture fields before geographic analysis can be implemented reliably.
2. **Active member stock is a current recorded-status count, not proof of payment by itself.** The existing `membership-status` report explicitly does not infer payment approval. Paid application counts use the payment-driven application states; imported historical membership records need Finance-approved historical payment evidence before they can be described as verified paid memberships.
3. **The existing membership activation service requires an approved application and a succeeded, non-reversed linked payment.** The Account and Team workspace does not expose a manual membership-claim control. The separate legacy-import invitation flow must be reviewed against a future Finance-approved historical-payment evidence workflow before claiming the payment gate covers every imported legacy account invitation.
4. **Validation is not complete until PR Quality runs against the latest PR #18 head.** The new report and authorization tests have been added, but no current-head GitHub Actions result is recorded in this implementation update. Do not merge or deploy based on documentation or code commits alone.

These boundaries are intentional: missing location and legacy payment evidence must be solved with authoritative data and Finance controls, not guessed values or an administrator override.
