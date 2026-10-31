# Community Impact & Recognition — Design and Increment Plan

**Status:** Design proposal for review; implementation is not authorized by this document alone  
**Target workstream:** `feat/workstream-3-progress-members-workspace`  
**Scope:** Member and non-member contribution records, evidence, verification, impact scoring, profile presentation, and recognition  
**Last updated:** 2026-10-31

## 1. Purpose and product principles

Community Impact & Recognition makes useful contributions visible and trustworthy. It should help professionals, organizations, reviewers, and the wider community understand **what was contributed, who benefited, what changed, and how the contribution was verified**.

It is not a popularity score, a social engagement counter, or a substitute for professional qualifications. It must not reward volume of uploads, self-claims, endorsements, page views, or time spent in the portal.

Principles:

1. **Evidence before points.** A claim is not a verified achievement until the required review is complete.
2. **Outcome over activity.** Record activities and outputs, but distinguish them from outcomes and longer-term impact.
3. **One source of truth.** Link to existing initiative, participation, completed-project, mentorship, referral, or collaboration records instead of duplicating their business data.
4. **Recognition without membership discrimination.** A person may submit a claim for a contribution made before joining or while not an active member. Membership eligibility and contribution recognition are separate decisions.
5. **Privacy by default.** Public display is opt-in and field-specific. Beneficiary identities and sensitive evidence remain private.
6. **Fairness and explainability.** Scores must be explainable, versioned, reviewable, and correctable.
7. **Human accountability.** Automated matching can suggest or assemble evidence; it must not independently certify disputed or high-impact claims.
8. **No weakening of existing controls.** Preserve current authorization, consent, audit, moderation, membership, and lifecycle rules in source workflows.

## 2. What users see

The capability has three related but distinct views:

- **Community Impact Score:** a summarized, versioned indicator derived only from verified contributions under a published scoring policy.
- **Verified Achievements:** individual, reviewable achievement records with category, role, date, contribution summary, evidence status, and approved outcome details.
- **Impact Record:** a chronological portfolio showing the person's verified contribution history, with visibility controls.

The score must never replace the underlying record. A public viewer should be able to understand the basis of a score through approved achievement summaries, without seeing private evidence or beneficiary data.

### Member workspace

Provide a dedicated Community Impact area with:

- current score, score-policy version, last calculation date, and a clear explanation link;
- verified, pending-review, clarification-requested, declined, and withdrawn claim counts;
- a timeline and category breakdown of verified contributions;
- outcomes and outputs clearly distinguished;
- progress indicators for a claim that needs evidence or clarification;
- actions to review an automatically detected contribution, submit an off-platform claim, correct a record, or request a review;
- a privacy preview showing exactly what the public profile will display.

Progress bars should be responsive and accessible. They must describe a meaningful target or workflow state, not imply that a person must accumulate points to be valued.

### Public profile

Add an optional Community Impact section to the existing profile. The member controls visibility for the overall section and for sensitive fields. Public display can include:

- verified achievement title and category;
- contribution role and date or date range;
- approved public summary and outcome statement;
- approved project media where consent and rights are confirmed;
- score and policy explanation, only if the member opts in.

Do not expose private evidence files, reviewer notes, beneficiary-level data, private organization information, claim history, or internal risk signals. Provide a hide/unpublish control and a public-profile preview.

## 3. Contribution taxonomy

Use a stable top-level taxonomy and map existing service categories into it rather than renaming or breaking existing stored values.

| Canonical category | Examples | Existing category mapping |
|---|---|---|
| Education and skills | teaching, training, scholarships, learning resources | education |
| Community care and wellbeing | community support, relief, care initiatives | community_care |
| Digital inclusion | digital literacy, access, technology support | digital_inclusion |
| Environment and sustainability | conservation, clean-up, climate resilience | environment |
| Livelihoods and economic opportunity | enterprise support, employability, skills-to-work | livelihoods |
| Accessibility and inclusion | accessible services, inclusion improvements | accessibility |
| Mentorship and knowledge sharing | mentoring, coaching, professional learning | new canonical subcategory; map to existing activity types |
| Professional and pro-bono services | donated expertise, discounted professional services | map to Serve-Community service classifications |
| Employment and referrals | verified hiring support, qualified referrals | map to existing jobs/referral workflows |
| Partnerships and organizational capacity | governance, systems, partnerships, institutional strengthening | map to collaboration/workspace records |

Each contribution also carries independent dimensions:

- **Contribution type:** initiative participation, project delivery, mentoring, professional service, referral, partnership, knowledge resource, or other approved type.
- **Role:** lead, co-lead, contributor, mentor, reviewer/organizer, partner organization, or other controlled role.
- **Lifecycle state:** detected, claimed, submitted, under review, clarification requested, verified, declined, withdrawn, revoked, or archived.
- **Source:** system-linked record, staff-entered offline project, or member-submitted claim.
- **Outcome maturity:** activity, output, outcome, or sustained impact. These are not interchangeable.
- **Visibility:** private, member-visible, or public-approved, with field-level controls.

The taxonomy is extensible through governed additions. Free-text labels must not become uncontrolled scoring categories.

## 4. Data contract and record linkage

Create a unified impact layer that references source records. Avoid a second initiative, participation, request, project, or membership lifecycle.

Conceptual entities:

### Impact contribution

- immutable identifier;
- contributor person identifier and, where relevant, organization identifier;
- canonical category and contribution type;
- source type and source record type/ID;
- title, concise summary, role, start/end dates, and location at an appropriately broad level;
- activity/output/outcome statements as separate fields;
- beneficiary count only with a defined counting method and evidence;
- lifecycle state, created/updated timestamps, and actor attribution;
- visibility policy and consent references;
- scoring eligibility and reason codes.

### Evidence item

- contribution ID;
- evidence type (linked system record, document, image, video, URL, attestation, metric source, or other approved type);
- storage/reference locator and integrity metadata;
- submitter and submission timestamp;
- consent, rights, and permitted-use metadata;
- access classification, retention rule, and review state;
- reviewer decision and reason, kept separate from public content.

### Verification decision

- contribution and evidence references;
- reviewer identity and role;
- decision (verified, partially verified, clarification, declined, or revoked);
- reason code and reviewer rationale;
- conflict-of-interest declaration/check;
- decision timestamp and any expiry/recheck condition;
- appeal/reconsideration reference.

### Score ledger entry

- person ID, contribution ID, score-policy version;
- dimension, calculated points, cap/diminishing-return adjustment;
- calculation inputs and reason code;
- effective date, supersession/reversal link, and calculation run ID.

### Recognition record

- recognition type, criterion/policy version, nomination or selection source;
- decision-maker and conflict checks;
- rationale, status, and public visibility/consent.

Enforce idempotency for source-event ingestion. A source record must not create duplicate contributions on retries, edits, or webhook replay. Use a stable source key and unique constraint where appropriate. A member claim that matches a system record should be attached to or merged into the existing contribution through an audited reconciliation flow, not counted twice.

## 5. Automatic tracking and manual claims

### Automatic tracking

Potential source events include:

- accepted and completed Serve-Community participation;
- approved offline completed projects;
- completed mentorship engagements, when a suitable completion and consent record exists;
- completed and verified collaboration or service requests;
- verified employment/referral outcomes, where the existing workflow records the result;
- other source workflows only after their lifecycle and evidence semantics are audited.

Automatic tracking should create a **detected contribution** or link an existing contribution. It must not automatically award verified points merely because a status changed. The source workflow's own verification state, evidence, participant attribution, and consent must satisfy the impact policy.

For group projects, record individual roles and attribution. Do not copy the whole project outcome to every participant without a defensible contribution method. Project owners may propose role attribution; contributors should be able to confirm or dispute it.

#### Automatic detection and attribution are policy-configured

Automatic detection is a configurable rules-and-adapters service, not a list of status strings hard-coded into route handlers. Each source adapter must publish a versioned capability contract and emit candidate events only when its source-specific eligibility rule is satisfied. The following settings are policy data, editable by authorized policy administrators and approved through change control:

- enabled/disabled source systems, source record types and event codes;
- qualifying source states and required predecessor states;
- required source evidence, consent state, completion confirmation and source-owner authority;
- event freshness window, backfill window, replay handling and retry policy;
- person-resolution strategy and minimum identity-match confidence;
- contributor-role vocabulary, role confirmation requirements and allowed attribution cardinality;
- whether a source event creates a candidate, updates an existing candidate, or is ineligible;
- duplicate matching keys, source-specific uniqueness/cardinality constraints and human-review thresholds;
- automatic attribution confidence thresholds and the conditions that require claimant/source-owner confirmation;
- permitted outcome maturity, evidence classes and score eligibility gates;
- notification behavior, rate limits, and exception queue routing.

**Detection flow (required):**
1. Receive a source event or scheduled reconciliation signal through an authenticated, source-scoped adapter.
2. Validate source ownership, event authenticity, source state, source version and required completion/consent facts against the active detection policy.
3. Resolve the canonical person identifier using the source's authoritative identity link. Do not infer identity from display names or unverified email similarity.
4. Resolve the event's contributor list and role evidence. If the source only identifies a project or organization and not an individual, create an unattributed candidate or route for confirmation; never assign the full project outcome to its owner by default.
5. Apply the source-specific idempotency key and duplicate rules. Replays update/reconcile the same candidate and append ingestion history; they do not create a second contribution or score event.
6. Calculate a detection confidence and record the rule/policy version, source event version, evidence references, matching rationale and unresolved fields.
7. Auto-link only when all configured high-confidence conditions pass. Otherwise place the candidate in attribution-pending or human-review state.
8. Notify the contributor/source owner where configured and provide confirm, dispute, correct or decline actions.
9. Keep detected, attributed, submitted, verified and score-eligible states distinct. Detection or attribution alone never means verification or points.
10. Reconcile source changes, cancellations, reversals and consent withdrawals. Reopen or flag the impact record according to policy; preserve the full event history.

**Attribution rules:** Attribution is per person and per contribution, not a blanket copy of project metrics. The policy may define role-specific contribution shares, equal-share defaults only where explicitly justified, or evidence-based reviewer allocation. The sum of allocated shares for a shared metric must not exceed 100% unless the metric is explicitly non-additive and the policy says how it is represented. A reviewer may correct role, person, dates, share or outcome attribution after examining evidence, but must record before/after values, evidence references, reason code, rationale, reviewer identity, timestamp and policy version. Material attribution changes require independent second review when configured by risk tier.

**Reviewer-adjustable case details:** Reviewers may select a more accurate canonical category, contribution type, role, evidence quality, outcome maturity, confidence band, attribution share, rubric ratings, and scoring modifiers where the active policy allows them. Each adjustment must cite evidence and explain why the default or automated suggestion was inaccurate. Reviewers cannot edit the underlying source record, erase source history, change another person's identity without an identity-resolution process, or bypass required evidence/consent. A disputed or low-confidence attribution remains pending and cannot contribute to a public score.

**Policy changes vs. case decisions:** A reviewer decision changes only the individual contribution assessment. Changes to global detection rules, thresholds, scoring weights, taxonomy, identity matching or retention are policy changes and require a separate authorized policy-administration workflow, approval and a new immutable policy version. Policy changes apply prospectively by default. Retroactive recalculation requires an explicit migration/recalculation decision, impact analysis, audit record and notification plan.

### Manual claims

Members and non-members can submit claims for off-platform, historical, or otherwise untracked contributions. The flow should support:

1. identify the contributor (authenticated member; non-member through an identity-verification flow);
2. select category, type, dates, role, and organization/project context;
3. describe activity, outputs, and outcomes separately;
4. provide evidence and identify people who can attest, without making public contact details mandatory;
5. select desired visibility and confirm rights/consent for submitted media;
6. submit and receive a tracking reference;
7. respond to clarification requests, withdraw, or appeal a decision.

Claims remain unverified until review. A non-member claim must not create membership, grant member-only access, or bypass identity and anti-impersonation controls. Membership status must not be used as a proxy for the truth or value of a contribution.

## 6. Evidence and outcome quality

Evidence requirements should be proportionate to the claim's risk and impact. Examples:

- **Participation:** accepted participation record plus completion confirmation from an authorized project owner or coordinator.
- **Offline project:** staff-entered project record, source reference, delivery summary, dated media or documents, and independent approval.
- **Mentorship:** engagement dates, mentor/mentee confirmation or approved coordinator confirmation, and a non-sensitive completion/outcome summary.
- **Professional service:** service scope, completion confirmation, recipient organization attestation, and redacted deliverable evidence where lawful.
- **Referral/employment:** confirmation from an authorized source or recipient with minimal disclosure; never expose private candidate or employer data.
- **Measured outcomes:** metric definition, baseline where available, measurement period, collection method, source, and limitations.

Evidence quality labels should distinguish self-reported, corroborated, system-recorded, and independently verified. These labels describe provenance; they are not public endorsements.

For every numeric claim, capture the unit, definition, period, counting method, source, and who validated it. Beneficiary counts must not be treated as outcomes. Do not infer causality from correlation or claim that a project caused a change without adequate evidence.

Media must have rights and consent for the intended use, meaningful alt text, safe HTTPS links or approved storage, and no private contact details or sensitive personal information. Public stories should be reviewed for inadvertent disclosure. Small-group suppression should follow the platform's established privacy threshold; use a minimum group size of five as the baseline unless a stricter policy applies.

## 7. Review, permissions, appeals, and audit

Reuse the repository's existing reviewer authorization and conflict-of-interest patterns where suitable. Do not create a single broad reviewer role that silently grants unrelated verification, membership, ethics, or appeal powers.

Proposed capability boundaries:

- **Contributor:** create and manage own draft/claim; submit evidence; respond to clarification; withdraw; request correction or appeal.
- **Source owner/coordinator:** confirm participation or delivery facts within their source workflow; cannot self-approve an impact claim they created or materially edited.
- **Impact reviewer:** review assigned claims and evidence; request clarification, verify, or decline within the impact domain.
- **Senior reviewer/appeal reviewer:** independently review appeals and reversals; must not be the original decision-maker.
- **Staff project editor:** enter offline project facts and media metadata; cannot approve their own record.
- **Impact administrator:** manage taxonomy and policy versions, queues, and operational configuration; policy changes require auditable approval.
- **System administrator:** platform-level access subject to least privilege and audit.

Required controls:

- server-side authorization on every API operation and object lookup;
- assignment/queue scoping and reviewer workload visibility;
- conflict-of-interest detection for contributor, organization, source owner, and reviewer relationships;
- creator/last-editor self-review prevention;
- reason codes and meaningful reviewer rationale;
- immutable decision history and audit events for create, edit, submit, assign, view sensitive evidence, decide, appeal, revoke, and publish;
- appeal/reconsideration path with a different reviewer;
- correction and revocation process with score recalculation and a visible audit trail;
- no public display before verification and explicit publication consent.

The impact review workflow must remain separate from membership review, identity verification, ethics review, and appeals. Reuse shared primitives only where their domain boundaries remain explicit.

## 8. Score methodology

The score is a summary of verified contribution quality and outcomes, not a direct sum of raw activity. Publish the methodology, caps, and limitations before enabling public scores.

The project owner has approved the following **initial policy baseline for design and controlled evaluation**. It is a starting configuration, not a hard-coded formula or an authorization to publish live scores. The values must be stored as versioned policy data and be adjustable through governed configuration.

| Dimension | Initial baseline weight | Configurable behavior |
|---|---:|---|
| Measurable community outcomes | 30% | Weight, evidence threshold, outcome maturity and measurement rules |
| Quality and significance | 25% | Rubric criteria, rating scale, evidence requirements and caps |
| Verified contribution/responsibility | 20% | Role factors, attribution confidence and contribution-share rules |
| Sustainability | 15% | Follow-up period, durability evidence and decay/review rules |
| Collaboration and knowledge sharing | 10% | Collaboration evidence, recipient confirmation and category rules |

The initial weights total 100%. They are the default policy version for evaluation. A policy administrator/governance approver may revise them prospectively through a new policy version after documenting rationale, impact analysis, approval and effective date. Reviewers may adjust an individual case's evidence-supported rubric ratings, role attribution, contribution share, outcome maturity and applicable modifiers within the active policy's permitted ranges. Reviewers must not silently edit global weights or invent an ad hoc scoring formula for one person.

The score engine must read all weights, rubrics, thresholds, caps, modifiers, rounding rules, eligibility gates and effective dates from the active immutable policy version. No scoring constant or category-to-points mapping may be embedded as application logic. If a required policy setting is missing, invalid, or outside approved bounds, scoring must fail closed and leave the contribution unscored pending policy correction.

Scoring safeguards:

- only verified, eligible contributions earn points;
- no points for claims submitted, evidence uploads, endorsements, views, likes, or raw attendance without verified contribution;
- use contribution-specific scoring rubrics and documented evidence thresholds;
- apply diminishing returns and category/time caps to reduce repeated low-value activity farming;
- avoid double counting the same output across a project, participation record, and personal claim;
- account for role and attributable contribution rather than assigning the full project score to all participants;
- do not penalize people for choosing private visibility;
- provide a score explanation and a record-level breakdown;
- version policies; retain historical calculations and recompute transparently after policy changes;
- support corrections, reversals, and score recalculation with ledger entries rather than destructive edits;
- monitor score distributions for demographic, geographic, disability, organization-size, and opportunity-access bias, without collecting unnecessary sensitive data;
- do not make the score the sole criterion for awards, access, hiring, membership, or opportunity eligibility.

Consider showing a score band or qualitative summary instead of a precise number if the data volume or calibration does not support false precision. A minimum evidence threshold and confidence indicator may be more honest than a number for early-stage users.

## 8A. Configurable policy registry, reviewer adjustments, and automatic attribution governance

All operational policy must be stored as versioned configuration records, not embedded constants. The registry should support independently versioned policy families:

- taxonomy and source-to-canonical category mappings;
- source detection adapters, event eligibility and reconciliation rules;
- identity resolution and attribution confidence thresholds;
- role definitions, attribution-share methods and confirmation requirements;
- evidence classes, quality levels and risk-tier evidence thresholds;
- verification decision rules, reviewer adjustment ranges and second-review triggers;
- score dimensions, weights, rubrics, caps, diminishing returns, modifiers, rounding and eligibility;
- visibility, consent, publication and redaction rules;
- retention, deletion, legal hold and audit requirements;
- notifications, escalation, queue routing and rate limits.

Each policy version must include a stable identifier, semantic version, status (draft, in_review, approved, scheduled, active, superseded, revoked), owner, approver(s), rationale, change summary, created/approved/effective timestamps, applicable source/category/risk scope, configuration schema version, and integrity hash. Approved versions are immutable. Editing an approved policy creates a new version; it must never mutate historical decisions or score calculations.

### Reviewer case-level adjustment contract

The review interface must show, side by side:
- source-provided values and their provenance;
- automatic detection/attribution suggestions and confidence;
- claimant-provided values;
- current reviewer-assessed values;
- the evidence supporting each value;
- the active policy version and permitted adjustment ranges.

For every reviewer adjustment, require:
- field changed and before/after values;
- one or more evidence references (or a documented reason why no evidence exists);
- standardized reason code plus meaningful rationale;
- reviewer identity, role, assignment and conflict check;
- timestamp and active policy version;
- whether a second approval is required and its outcome.

Reviewers may correct the individual record within policy bounds; they may not change global policy, suppress required evidence, bypass consent, override a source's authoritative lifecycle, self-approve their own entry, or grant themselves permissions. Out-of-range changes must be blocked or routed to a senior/policy approver rather than silently accepted. Appeals must be handled by an independent reviewer.

### Initial policy activation and safe defaults

The initial score baseline in Section 8 is the starting configuration. It remains in evaluation mode until a separately recorded governance activation decision. Detection rules may be enabled source by source after source-contract tests pass. For an unconfigured source, missing identity link, ambiguous role, unsupported event version, conflicting evidence, or failed confidence threshold, the safe default is **do not auto-attribute and do not score**; route to a confirmation/review queue where appropriate.

A reviewer can make an evidence-backed case adjustment without changing the initial global policy. If the evidence shows the rubric itself is inadequate, the reviewer should flag a policy-change proposal rather than invent a one-off rule. Policy administrators must analyze consistency and fairness before approval.

### Required audit and reproducibility

Persist the exact policy versions used for detection, identity resolution, attribution, verification and score calculation. Preserve raw source event identifiers and versions, normalized event payload fingerprints, adapter version, rule outcomes, confidence components, reviewer changes and score ledger inputs. A historical decision must be reproducible from its preserved inputs and policy version, subject to lawful retention and privacy constraints. A policy update must not silently change an already published score; use explicit recalculation and ledger reversal/supersession records.

## 9. Privacy, consent, retention, and safety

- Default new claims and evidence to private.
- Keep public profile visibility separate from internal verification and score eligibility.
- Require explicit, revocable consent for public names, stories, images, video, and organizational attribution.
- Obtain appropriate consent/authorization for beneficiary images and testimonials; do not assume a project organizer can consent on behalf of every person shown.
- Do not publish beneficiary identities, contact details, private documents, reviewer comments, internal risk flags, or precise sensitive locations.
- Minimize identity data for non-member claimants and define a retention period for verification artifacts.
- Restrict evidence access to assigned reviewers and authorized staff; log sensitive evidence access.
- Provide deletion/correction workflows subject to legal, audit, and fraud-prevention retention obligations.
- Sanitize URLs and uploaded metadata; prevent malicious content, tracking tokens, expiring/private links, and unsafe media embeds.
- Make privacy choices understandable and reversible; explain what remains in the audit record after unpublishing.

## 10. Engagement prompts and discovery

Prompts should help members complete useful records, not pressure them to chase points. Trigger contextual prompts only when a relevant event occurs, for example:

- a verified source workflow has completed but the member has not confirmed their role;
- a member has a detected contribution awaiting attribution;
- an incomplete claim needs evidence or clarification;
- a member's visibility preference is unset before a public profile preview.

Use in-product notices first. Respect notification preferences, rate limits, quiet periods, dismissal, and a global frequency cap. Do not repeatedly prompt on every dashboard visit. Never imply that a low or empty score means a member is not valuable.

Verified achievements may later support opt-in discovery for mentorship, volunteering, pro-bono projects, speaking, or partnership opportunities. Do not expose private profiles or use score alone to rank people.

## 11. Recognition and awards

Keep recognition distinct from the score. Possible recognition types include:

- verified service milestone;
- sustained contribution;
- measurable outcome;
- mentorship and knowledge sharing;
- collaborative leadership;
- innovation or capacity building;
- community-nominated contribution.

Each recognition type needs published eligibility criteria, evidence requirements, nomination/selection process, decision authority, conflict checks, appeal/correction route, and public consent. Do not automate awards solely from score thresholds. Recognition decisions must be explainable and auditable.

## 12. Integration boundaries and repository reuse

The repository already contains foundations that should be reused rather than duplicated:

- `web/app/profile/page.tsx` provides the profile foundation and existing profile/talent visibility controls. Add impact presentation as an optional section; preserve existing profile behavior and visibility semantics.
- `web/app/members/page.tsx` currently presents authenticated account/membership progress and related member data. Community Impact should be a separate workspace capability, not mixed into membership application status or treated as a membership eligibility signal.
- `src/platform/serve-community-initiatives.js` provides initiative and participation lifecycle foundations, owner/reviewer authorization, membership checks for participation, and consent-related behavior. Preserve its source lifecycle. The active-membership requirement for participation must not be copied into the separate claim/recognition path.
- `src/platform/serve-community-offline-projects.js` provides staff-entered offline project records, media/consent validation, approval, audit events, self-review prevention, public-approved filtering, and small-count suppression. Link approved project records and attributable contributors into impact; do not create a second offline project store.
- `src/platform/serve-community-impact-reports.js` is an existing reporting foundation. Reuse privacy-safe aggregate reporting patterns, while keeping individual contribution evidence access separate.
- Existing ethics and verification services provide domain-specific review patterns. Reuse authorization and conflict-check concepts without collapsing separate reviewer responsibilities.
- Existing request/collaboration workflows should be considered as future source events only after their completion and outcome semantics are confirmed.

Before implementation, re-check these files at the target branch HEAD and confirm current schemas, permissions, tests, and API routes. This document is a design-level audit, not a claim that every integration is already implemented.

## 13. API and implementation boundaries

Proposed API capabilities (names illustrative; align with established route conventions):

- list current user's impact summary and timeline;
- list detected contributions awaiting attribution;
- create/update/submit a manual claim;
- attach/remove evidence subject to lifecycle and retention rules;
- respond to clarification and withdraw a claim;
- list assigned reviewer queue and retrieve authorized claim detail;
- assign/reassign, request clarification, verify, decline, and revoke;
- submit and decide appeals;
- retrieve public-approved impact profile;
- retrieve policy version and score explanation;
- manage taxonomy/policy versions under privileged approval.

Use the repository's existing authentication, permission middleware, validation, audit, pagination, rate limiting, idempotency, and error response conventions. All authorization must be enforced server-side; hiding UI controls is not access control.

Do not introduce a new migration until the current schema and source-record keys are mapped and a migration plan is reviewed. Avoid storing duplicate personal, organization, membership, or initiative data. Add indexes for contributor, source key, lifecycle queue, category/date, and score ledger access based on measured query needs.

## 14. Increment plan

### Increment 0 — Re-audit and architecture freeze
- Re-fetch target branch HEAD and inspect profile, member workspace, initiative, participation, offline-project, impact-report, request/collaboration, verification, ethics, permissions, and migration foundations.
- Produce source-to-impact mapping and identify exact gaps.
- Confirm privacy roles, data retention, identity verification for non-members, and score governance.
- **Exit:** approved data flow and permission matrix; no duplicate business records proposed.

### Increment 1 — Taxonomy and source-link contract
- Define canonical categories, contribution types, roles, lifecycle, evidence classes, visibility, and source-key rules.
- Map existing categories without changing existing stored values.
- Define idempotency and duplicate reconciliation.
- **Exit:** reviewed schema/API contract and migration plan.

### Increment 2 — Automatic detection and attribution
- Ingest eligible source events as detected contributions or links.
- Add role confirmation/dispute and source-event idempotency.
- Keep detection distinct from verification and scoring.
- **Exit:** replay-safe integration tests; no duplicate contribution or points.

### Increment 3 — Manual claims and evidence
- [x] Add authenticated-account claim drafts and lifecycle without requiring active membership.
- [x] Capture the full category taxonomy, contribution type/role, date range, organization/project context, broad location, and separate activity, output, outcome and sustained-impact summaries; optional beneficiary counts require a stated aggregate counting method.
- [x] Add private evidence uploads and HTTPS video/URL references; upload authorization is claim-scoped and captures the active raw-evidence retention version before bytes are accepted. External links reject credentials, IP literals and local/internal hosts and are never fetched by the platform. Claim-specific evidence downloads are limited to the claimant and currently assigned reviewer/appeal reviewer.
- [x] Require approved active retention rules for claim metadata, consent/rights, raw evidence and audit events; snapshot each applicable policy version/rule with the record.
- [x] Add private-by-default visibility requests, explicit public-consent/media-rights checks, clarification response, withdrawal, appeal submission and draft evidence detachment (without bypassing retention or immediately deleting file bytes).
- [ ] Non-member claimants remain gated until MPA approves a separate identity-assurance and anti-impersonation standard; no membership is created or granted by this flow.
- [ ] Reconcile a manual claim with an existing detected contribution through a reviewer-controlled, idempotent link/merge flow; fuzzy matching must not auto-merge or reject.
- [ ] Complete upload, storage, access, retention and cross-user privacy tests; CI and migration rehearsal must pass before exit.
- **Exit:** complete claimant journey and privacy tests, including the approved non-member boundary.

### Increment 4 — Reviewer operations
- [x] Add permission-gated claim queues, reviewer assignment, organization-affiliation conflict checks, independent decisions, appeal assignment and independent appeal decisions.
- [x] Preserve separate review/assignment/appeal permissions and assigned-reviewer-only evidence downloads.
- [x] Record immutable decisions and append-only claim events with retention snapshots.
- [ ] Add verified-claim revocation and correction/recalculation workflow.
- [ ] Complete role/action/object permission matrix, IDOR, conflict and cross-organization tests; CI and migration rehearsal remain pending.
- **Exit:** permission matrix tests for every role/action/object; no self-review path.

### Increment 5 — Score ledger and explanations
- Finalize and approve scoring policy before enabling points.
- Implement versioned calculation, caps, diminishing returns, reversals, and explanations.
- Run fairness and gaming simulations.
- **Exit:** reproducible calculations and auditable recalculation; governance approval.

### Increment 6 — Member workspace and profile
- [x] Add a responsive authenticated-account contribution-claim workspace with draft creation, private evidence attachment, submission, status, clarification response, withdrawal and appeal.
- [ ] Add the full impact dashboard, progress states, verified timeline and category breakdown.
- [ ] Add optional public profile projection and field-level visibility preview; no claim is published by the claim workspace.
- **Exit:** accessibility and privacy acceptance across desktop/mobile.

### Increment 7 — Prompts, recognition, and opportunity discovery
- Add contextual, rate-limited prompts.
- Add separately governed recognition records and opt-in opportunity discovery.
- **Exit:** no score-only awards; consent, fairness, and notification controls verified.

### Increment 8 — Operational readiness
- Add monitoring, abuse detection, support runbooks, retention/deletion workflows, and aggregate privacy-safe reporting.
- Complete security review, load checks, migrations rehearsal, and rollback plan.
- **Exit:** release approval after all blocking checks pass.

## 15. Acceptance criteria and test strategy

### Functional
- System-linked events and manual claims must resolve through an explicit, idempotent, reviewer-approved link/merge to one contribution record; automatic matching must not merge or reject claims.
- Authenticated accounts can create claims without active membership or membership privileges; broader non-member identity assurance must be approved by MPA before it is enabled.
- Activity, output, outcome, and sustained impact remain distinct in data and UI.
- Only verified eligible contributions affect the score.
- Users can see status, reviewer clarification, decision reasons, and appeal state.
- Public profile displays only verified, explicitly approved fields and media.
- Corrections and revocations recalculate scores without erasing history.

### Authorization and privacy
- Test unauthenticated, member, non-member claimant, source owner, staff editor, impact reviewer, appeal reviewer, administrator, and unrelated user.
- Test cross-user and cross-organization object access, IDOR, queue scoping, evidence access, public API leakage, and hidden/private fields.
- Test creator/last-editor self-review, reviewer conflicts, appeal independence, and permission changes.
- Test consent withdrawal, unpublishing, evidence retention, and audit access.
- Confirm no membership status or score grants privileges outside its intended domain.

### Integrity and resilience
- Test duplicate source events, webhook replay, concurrent claim submission, repeated decisions, stale updates, partial failures, and retry behavior.
- Test score version upgrades, caps, diminishing returns, reversals, and deterministic recomputation.
- Test evidence validation, unsafe URLs, private/expiring media, consent gaps, and malicious uploads.
- Test small-group suppression and beneficiary-count definitions.

### Accessibility and UX
- Semantic headings, landmarks, labels, keyboard operation, visible focus, logical focus order, screen-reader status announcements, and WCAG AA contrast.
- Responsive layouts at narrow mobile, tablet, desktop, zoom, and text scaling.
- Status must not rely on color alone; progress bars must expose accessible names and values.
- Clear empty, loading, error, success, pending, clarification, declined, and revoked states.
- No deceptive counters, fake impact claims, or pressure to maximize score.

### Release gates
- All relevant unit, integration, API authorization, end-to-end, accessibility, and migration tests pass.
- No weakening of existing authorization, privacy, membership, consent, audit, or lifecycle protections.
- Database migrations are reviewed, reversible where feasible, and rehearsed against a representative backup.
- CI remains pre-deployment; no production deployment is authorized by this design document.
- Public score launch requires approved scoring governance and an explainability/privacy review.

## 16. Decisions required before implementation

1. Approve the canonical taxonomy and source-to-category mappings.
2. Decide the identity assurance level for non-member claims and historical contributions.
3. Approve evidence thresholds and who may attest to each contribution type.
4. Approve public visibility defaults and retention periods.
5. Approve the score model, or choose score bands/qualitative recognition instead.
6. Establish governance for score-policy changes and recognition decisions.
7. Confirm whether any score should be visible before a minimum number of verified records exists.

**Implementation boundary:** This commit documents the proposed design only. It does not add database migrations, API routes, UI, background jobs, scoring calculations, permissions, or production changes. Those belong in separately reviewed increments after the decisions above and the branch-level re-audit are complete.


---

# Delivery record — Increment 0 and Increment 1

**Audit/update baseline:** branch `feat/workstream-3-progress-members-workspace`, HEAD `afdffb401a981d65769692b3463b3d389c5b8ec4` (parent `557e03a7048fc94e863decc8347fd1e33ba28016`), audited 2026-10-31.  
**Scope of this delivery:** source re-audit and architecture/data-contract documentation only. No migrations, application code, API routes, UI, background jobs, role grants, or production operations were performed.

## Increment 0 — Re-audit and architecture freeze

<badge>Source review completed</badge>

### 0.1 Audit evidence and branch baseline

The target branch was re-fetched before the audit. The branch HEAD at the start of this work was `afdffb401a981d65769692b3463b3d389c5b8ec4`. The inspected source and document revisions were:

| Area | Inspected source | Blob SHA |
|---|---|---|
| Profile and professional profile | `web/app/profile/page.tsx` | `362e1b12c7b55cb43a1bb7e32882996095ae4cdf` |
| Member workspace | `web/app/members/page.tsx` | `cc30936fb7bf4e742361d94fc9066184f1068086` |
| Initiatives and participation | `src/platform/serve-community-initiatives.js` | `35a2568707bb089b33225fbf26c195dd4d437b7c` |
| Offline completed projects | `src/platform/serve-community-offline-projects.js` | `bb6ae9b6a6e8ee8ffb6b22d69e492338b06c77bc` |
| Existing impact reports | `src/platform/serve-community-impact-reports.js` | `95e9c9f6c9baea01437f080e9d6971b1e5aadbe7` |
| Professional verification | `src/verification/service.js` | `336da71de573eda07484952fe194857c6f74cb72` |
| Ethics cases | `src/ethics/service.js` | `8093b75d48ab65f5aeea411f6d3cf68d48b85c3d` |
| Initiative schema | `db/migrations/20261031130000_serve_community_initiatives.sql` | `d3b3b4618c36fc830f8ebe2f716e86cf705a7617` |
| Offline-project schema | `db/migrations/20261031140000_serve_community_offline_completed_projects.sql` | `4130d40d82e9c54f69131a10723c94b51c82d11f` |
| Network-Plus outcome proof | `db/migrations/20261025150000_serve_community_g6_outcome_proof.sql` | `0d2750e381885ca96fec8e5cf4264536ff821631` |
| Request/collaboration contract | `docs/60-network-plus-increment-6-request-collaboration-implementation.md` | inspected at this baseline |
| Source integration plan | `docs/53-network-plus-discovery-and-collaboration-integration-plan.md` | inspected at this baseline |
| Existing impact data contract | `docs/serve-community-impact-data-contract.md` | inspected at this baseline |
| Role workspace contract | `docs/56-phase-3-unified-role-workspaces.md` | inspected at this baseline |
| Serve-Community workflow record | `docs/61-network-plus-increment-7-serve-community-ux.md` | `baf2d7440abfe99698d2236ac751c930b0902502` |
| Member workspace regression test | `test/p1/members-progress-workspace.test.js` | `7311482fd11f842d989ba7929877f3050480d5c0` |

This was a source and migration inspection. It was not a fresh runtime test, a complete route-by-route API authorization test, a disposable-database migration rehearsal, or an accessibility sign-off. Those remain separate validation gates.

### 0.2 Source-to-impact mapping and exact gaps

| Existing source | What it authoritatively records today | Proposed impact integration | Gap / restriction |
|---|---|---|---|
| Canonical identity: `app_user`, `person`, `professional_profile` and existing profile services | Account/person identity, professional profile, experience, profile completion and visibility preferences | Reference the canonical person/user IDs; show an optional impact section on the existing profile | No impact contribution portfolio or score is present in the inspected profile page. Do not create a second person or profile model. |
| `web/app/profile/page.tsx` | Professional identity and talent visibility are separately controlled; private verification evidence is not directory content | Read profile identity and disclosure settings; add independent impact visibility preferences later | Existing talent visibility settings do not grant public consent for impact stories, media, outcomes or beneficiary information. Separate consent is required. |
| `web/app/members/page.tsx` | Server-backed membership application, payment, review, activation/history, tracking and notification progress | Link to a distinct Community Impact workspace; do not treat membership progress as contribution progress | The page is explicitly a membership journey. No impact score, claim, achievement or contribution tracking exists there. Preserve payment, review and activation as separate states. |
| `serve_community_initiative` and `serve_community_initiative_event` | Initiative owner, organization, category, lifecycle, moderation and append-only events | Source project/initiative identity and approved public metadata; one impact contribution per attributable person and eligible completed activity | Initiative completion is not automatically an individual's verified outcome. The current source category list is fixed to education, community care, digital inclusion, environment, livelihoods, accessibility and other. No person-level impact attribution ledger exists. |
| `serve_community_participation`, consent and participation event tables | Private participant application, status, participant identity, idempotency, explicit consent and append-only lifecycle/consent history | Candidate source for a participant's role and completion claim, after participant/source-owner confirmation | Participation currently requires current active membership and affirmative participation plus contact-sharing consent. Do not weaken this requirement for participation. Do not copy it into historical/off-platform impact claims. Participant name/email is coordination-only and not public. A completed status alone is insufficient evidence of personal outcomes. |
| `serve_community_offline_project` and event table | Staff-entered offline project summary/story, category, completion date, activity/output, optional evidenced beneficiary count, outcome metrics, media links/alt text, consent, source reference, approval and audit history | Reuse approved project as a project-level source; create separate contributor-attribution records only when the staff workflow can substantiate individual roles | Existing categories are the same six named categories plus other. Staff roles with `serve_community.projects.manage` may create/edit/submit; approval is separately permissioned through `serve_community.projects.approve`. Creator/last editor self-approval is blocked. No normalized contributor-to-project attribution is present in the inspected migration. |
| Public offline project projection | Approved and `public_visible=true` project records; public text rejects direct contact data; media must be safe public HTTPS, videos YouTube/Vimeo, alt text is required | Reuse approved public project story/media only when the relevant media/story consent covers this use | Project-level consent is not proof that every depicted person consented. No private evidence, staff notes, contact details or unapproved media may flow to a public member portfolio. |
| `src/platform/serve-community-impact-reports.js` | Existing service-listing aggregate metrics and governance reports; listing owner/authorized organization manager/governance access; audit logging; suppression for groups below five | Reuse aggregation and privacy suppression patterns for future aggregate reporting | This is not an individual contribution ledger or a personal impact score. It measures listing interest, pledges, requests, completion and related decisions. It must not be repurposed as a personal score. |
| Network-Plus service/request and G6 outcome-proof records | Existing listing, request, milestone/delivery, completion evidence, provider completion submission and requester outcome acceptance/dispute; paid-work finance checks remain distinct | Candidate future source for a verified service contribution only after the request is completed, evidence conditions are met, requester outcome is accepted (or explicitly authorized resolution exists), and contributor attribution is confirmed | Interest, pledge, notification, submitted delivery, provider completion claim or disputed request is not a verified outcome. Keep commercial Network-Plus records separate from Serve-Community initiatives. |
| Network-Plus Increment 6 request/collaboration | Typed intents (service, supplier, referral, expertise, partnership, collaboration), explicit recipient acceptance, request history and engagement workspace rules | Candidate source for accepted and later completed collaborations, with participant-specific role attribution | Acceptance creates an engagement/workspace, not a completed impact result. Referral does not automatically create a workspace. A completed status alone must not bypass evidence, counterpart confirmation, dispute state or finance checks where applicable. |
| Mentorship workflow (documented in the source integration plan) | Distinct mentorship request, mutual acceptance, session coordination, feedback and outcome process; consent-controlled sharing | Candidate source after the engagement has reached its actual completion gate and participant attribution/consent are verified | A request, match, scheduled session or attendance signal is not by itself a verified outcome. Do not copy mentorship tables or treat mentor eligibility as a generic impact reviewer role. |
| `src/verification/service.js` | Professional verification cases, claim/evidence/checklist decisions, assigned reviewers, case audit and separate appeal reviewer access | Reuse technical patterns for private evidence, assignment, reviewer scoping, independent appeals and audit where domain-compatible | Its member verification entry/evidence path requires active membership. It is not the non-member community-contribution claim service. Do not use professional verification decisions as automatic impact approval or share its confidential evidence with public profiles. |
| `src/ethics/service.js` | Confidential ethics case lifecycle, assigned ethics reviewers/panel, conflict declarations/recusal and restricted case access | Reuse generic conflict-of-interest and audit design principles only | Ethics cases are highly sensitive and a separate domain. Do not link ethics evidence or findings to impact achievements, expose ethics reviewers to impact claims by default, or reuse ethics-case permissions as impact permissions. |
| Existing permissions and role workspaces | Platform roles, explicit permissions, organization-scoped membership, reviewer assignment patterns and server-side authorization | Add a narrowly scoped impact-review capability and impact-specific policy administration after approval | A generic reviewer/platform role must not imply unrestricted impact evidence access. Organization owners can attest only to records within their organization/source scope. |

### 0.3 Privacy and authorization decisions

**Confirmed architecture decisions**

1. A contribution claim is owned by a canonical person/account. Organization attribution is a separate relationship and does not replace the individual contributor.
2. The claimant may view and manage their own draft, evidence submission, clarification response, withdrawal and appeal. They cannot verify their own claim.
3. A source owner/coordinator may confirm facts in the source workflow but cannot approve an impact claim they created, materially edited, or have a declared conflict with.
4. Offline-project editors may enter project facts under the existing `serve_community.projects.manage` permission. Approval remains a separate `serve_community.projects.approve` decision. The existing self-review prohibition must remain.
5. An impact reviewer must have an impact-specific role/permission and an assigned claim. A reviewer must not receive unrelated membership, professional verification, ethics, finance or organization-wide access.
6. An appeal reviewer must be independent of the original decision-maker and must receive only the scope needed for the appeal.
7. Organization representatives may attest only to the relevant organization/project records under a current active organization relationship. A platform role alone does not grant access to an arbitrary organization's records.
8. Public output is a separate projection of verified, explicitly approved fields. Private evidence, contact information, beneficiary identities, reviewer notes, risk signals and internal claim states are excluded.
9. The existing small-group suppression threshold of five is a minimum privacy baseline for aggregates. It does not authorize publication of individual-level beneficiary details.

**Non-member identity assurance — gap and proposed policy**

The inspected professional-verification path requires active membership; the inspected initiative participation path also requires active membership. No verified, general-purpose external/non-member community-impact claim identity flow was found in the reviewed sources.

Therefore, non-member claims are **not implementation-ready**. Before enabling them, define a separate claim-only identity assurance flow:
- require a verified account/session and control of the account's contact channel;
- verify identity to a risk-proportionate standard before attributing a claim to a real person or publishing it;
- keep identity documents and verification outcomes separate from contribution evidence and public profile data;
- never create membership or member privileges as a side effect;
- support correction, impersonation reporting, account recovery and appeal;
- do not accept an anonymous public claim as a verified achievement.

The exact identity proof standard, provider, lawful basis, access controls and retention period require policy approval. Do not assume professional membership verification is available to non-members.

**Evidence retention — gap and proposed hold point**

An MPA-governed, versioned retention-policy registry now exists. Claim and evidence collection is gated on an active schedule and stores the applicable policy version/rule snapshot. Automated expiry, deletion/anonymization, legal-hold execution and backup-expiry workflows are not yet implemented. Existing append-only audit/event history does not by itself define how long uploaded evidence, identity documents, media consent artifacts or rejected claims should be retained.

Before the first evidence migration/API is implemented, approve a retention schedule by data class (claim metadata, identity assurance artifacts, raw evidence, public media/consent, reviewer notes, audit events and score ledger), with legal hold, appeal window, withdrawal, deletion/anonymization and backup-expiry behavior. Until then, do not invent a retention duration or silently retain all uploads indefinitely.

**Score governance — gap and proposed hold point**

No live Community Impact Score, approved score policy, score ledger or award threshold was found in the inspected foundations. The weights earlier in this proposal are illustrative only. Score policy requires named governance ownership, versioning, public explanation, conflict checks, fairness review, appeal/correction and explicit approval before any calculation is enabled.

### 0.4 Increment 0 exit assessment

- [x] Re-fetched the target branch and recorded the exact audit baseline.
- [x] Inspected profile, member workspace, initiatives/participation, offline projects, impact reports, requests/collaboration, verification, ethics, relevant migrations and existing design/role contracts.
- [x] Produced the source-to-impact mapping and identified the exact reuse boundaries and gaps above.
- [x] Defined the proposed privacy and reviewer permission boundaries.
- [x] Identified non-member identity assurance, evidence retention and score governance as policy gaps rather than inventing implementation assumptions.
- [x] No duplicate person, profile, organization, initiative, participation, request, delivery, outcome or membership business record is proposed.
- [ ] Formal project-owner approval of the policy decisions listed in section 16 is still required.
- [ ] Runtime/API authorization, migration rehearsal, retention/legal review and accessibility validation remain future gates.

**Increment 0 status: source audit and architecture proposal complete; architecture freeze is conditional, not formally approved.** The technical data flow and permission boundary are documented, but policy decisions requiring project-owner/governance approval remain open. Do not represent the architecture as formally approved until those decisions are recorded.

## Increment 1 — Taxonomy and source-link contract

<badge>Contract drafted</badge>

### 1.1 Canonical category contract

Use stable canonical codes in the impact layer. Existing source category values remain unchanged; mappings are explicit and reversible.

| Canonical code | Display label | Existing source values / allowed source mapping |
|---|---|---|
| `education_skills` | Education and skills | Serve-Community `education` |
| `community_care` | Community care and wellbeing | `community_care` |
| `digital_inclusion` | Digital inclusion | `digital_inclusion` |
| `environment_sustainability` | Environment and sustainability | `environment` |
| `livelihoods_economic_opportunity` | Livelihoods and economic opportunity | `livelihoods` |
| `accessibility_inclusion` | Accessibility and inclusion | `accessibility` |
| `mentorship_knowledge_sharing` | Mentorship and knowledge sharing | Explicit mapping from approved mentorship engagement types; no new source category value |
| `professional_pro_bono_service` | Professional and pro-bono service | Approved Serve-Community service classification or verified pro-bono service completion |
| `employment_referral` | Employment and referral | Verified Jobs/referral outcome source only |
| `partnership_capacity_building` | Partnership and organizational capacity | Accepted and completed Network-Plus partnership/collaboration source |
| `other_review_required` | Other (review required) | Existing source `other`; requires reviewer-selected canonical mapping before score eligibility |

The mapping must be stored/versioned in the impact domain, not implemented by changing existing source constraints or rewriting legacy category columns. Preserve source-native category for display/audit and store canonical category separately. Category changes require a reason and append-only mapping history.

### 1.2 Contribution type and role vocabularies

Contribution type is independent of category:

- `initiative_participation`
- `offline_project_delivery`
- `mentorship_engagement`
- `professional_service_delivery`
- `knowledge_resource`
- `employment_referral_outcome`
- `partnership_delivery`
- `collaboration_delivery`
- `other_approved`

Controlled contributor roles:

- `lead`
- `co_lead`
- `delivery_contributor`
- `mentor`
- `subject_expert`
- `organizer_coordinator`
- `partner_representative`
- `referrer`
- `resource_contributor`
- `other_review_required`

A contributor's role is a claim that must be confirmed by the source owner, counterpart, or reviewer using evidence appropriate to the source type. A project-wide beneficiary/output/outcome value must not be copied in full to each individual contributor without an approved attribution rule. Role changes are versioned and auditable.

### 1.3 Outcome maturity and evidence classes

Outcome maturity is not a contribution type or a score:

| Maturity | Definition | Example | Scoring eligibility |
|---|---|---|---|
| `activity` | Work performed | Volunteer hours, sessions delivered | Not automatically eligible |
| `output` | Direct product/service delivered | Training sessions, completed report, devices distributed | Eligible only under an approved rubric and verified delivery |
| `outcome` | Observable change for people/organizations | Skills assessment improvement, service access improved | Eligible only with defined measurement and corroboration |
| `sustained_impact` | Change maintained over a stated follow-up period | Continued employment, durable accessibility improvement | Requires follow-up evidence and approved measurement period |

Evidence classes:

- `system_source_record` — immutable reference to an authoritative application record/event;
- `private_document` — access-controlled document or file object;
- `public_media` — image/video/URL specifically approved for public use;
- `counterparty_attestation` — confirmation from an authorized recipient, partner or coordinator;
- `measurement_record` — baseline, metric definition, period, method, source and result;
- `official_reference` — verifiable external institutional reference;
- `claimant_statement` — self-reported narrative, always labeled as such and never sufficient alone for verified status.

Evidence quality/provenance labels must be separate from claim lifecycle status. Public media consent is separate from evidence validity and from consent to attribute an individual by name.

### 1.4 Contribution lifecycle

The impact lifecycle is independent of source-workflow lifecycle:

`detected → attribution_pending → submitted → under_review → verified`

Alternative transitions:

- `detected` → `dismissed` when the candidate source event is ineligible or a duplicate;
- `attribution_pending` → `claimed` by the identified contributor, then `submitted`;
- `submitted` / `under_review` → `clarification_requested` → `submitted`;
- `submitted` / `under_review` → `declined` with a reason;
- claimant may `withdrawn` before final verification, preserving the event history;
- `verified` → `revoked` only through an authorized, reasoned review/reversal;
- any eligible record may be `archived` for display/lifecycle purposes without erasing audit history.

Only `verified` records can be considered by a separately approved score policy. `verified` does not imply `public`: publication consent and field-level visibility are separate. A correction after verification creates a new version/decision and, where necessary, a score-ledger reversal/recalculation; it does not overwrite the prior decision.

### 1.5 Visibility contract

Use three primary visibility classes plus field-level consent:

- `private`: claimant and specifically authorized reviewers/source actors only;
- `members`: approved summary visible to authenticated eligible members under server-side access rules;
- `public`: only verified, moderated, explicitly consented fields in the public profile projection.

Evidence files, identity assurance artifacts, reviewer notes, private source records, beneficiary identities, contact details, risk flags and appeals remain private regardless of the summary's visibility. Public visibility is opt-in, revocable, and must not affect verification or score eligibility. A public media permission is not inferred from an internal project record's general consent flag without confirming that the consent covers this specific publication and subject.

### 1.6 Source-link and idempotency contract

The impact contribution is a projection/verification record over a source business record, not a replacement source record.

Proposed source identity fields:

- `source_system`: controlled domain identifier (for example `serve_community`, `network_plus`, `mentorship`, `jobs`, `manual_claim`);
- `source_type`: controlled record type (initiative participation, offline project, service request, mentorship engagement, etc.);
- `source_record_id`: canonical source record identifier, nullable only for a manual claim;
- `source_event_code`: the qualifying source event or completion gate;
- `contributor_person_id`: canonical person identity to whom this contribution is attributed;
- `attribution_version`: incremented when the confirmed role/attribution changes;
- `source_event_version` or immutable event reference where the source has versioned events;
- `idempotency_key` and request fingerprint for claim/source ingestion retries.

Recommended uniqueness rule for system-derived records: one active contribution for the tuple `(source_system, source_type, source_record_id, source_event_code, contributor_person_id)`, with a documented exception/version strategy if the source supports genuinely distinct contribution units. The exact constraint must be validated against source cardinality before migration.

Manual claims have no source record ID. They must use a generated claim idempotency key, claimant identity and normalized duplicate-review metadata. Similarity matching may flag possible duplicates for a human; it must never auto-merge or auto-reject claims based only on fuzzy text matching.

On source event replay:
1. resolve the canonical source event and person attribution;
2. find the matching source key;
3. return/update the existing contribution according to allowed transition/version rules;
4. append an ingestion/audit event;
5. never create a second score event for the same verified contribution and score-policy version.

A member claim matching a system record is reconciled by an authorized, auditable link/merge operation. Preserve both provenance histories and claimant evidence. Do not delete either source record.

### 1.7 Source readiness matrix

| Source | Qualifying candidate event | Required verification before impact status | Increment 1 disposition |
|---|---|---|---|
| Initiative participation | Existing participation reaches `completed` | Source initiative is valid; participant identity and role confirmed; completion accepted by authorized owner; no withdrawal/consent conflict; outcome claims separately evidenced | Map as candidate; no automatic points |
| Offline completed project | Staff project reaches `approved` and public-visible where public display is requested | Staff entry and independent approval; named contributor attribution and role evidence; media/beneficiary consent scope checked | Project record reusable; individual attribution is a schema/workflow gap |
| Network-Plus service request | Request is completed and required requester outcome acceptance/evidence gates pass | Delivery evidence, requester acceptance or authorized resolution, no unresolved dispute, required finance checks, contributor identity/role | Candidate only after source-specific gate; no inference from interest/pledge/acceptance |
| Network-Plus collaboration | Engagement reaches completed with recorded outcome | Both-party/authorized outcome confirmation and attributable roles; preserve agreement/workspace history | Candidate only after lifecycle evidence is runtime-validated |
| Mentorship | Existing engagement/session workflow reaches its actual completion/outcome gate | Participant confirmation or approved coordinator evidence; consent and confidentiality respected | Candidate; inspect exact runtime source and schema before adapter |
| Jobs/referrals | A hiring/referral outcome is authoritatively confirmed | Minimize candidate/employer data; verify outcome and referrer attribution without exposing confidential recruitment data | Deferred until authoritative event and privacy contract are mapped |
| Manual/offline claim | Claimant submits a contribution not represented by a source record | Identity assurance, evidence threshold, independent review and conflict checks | Supported as a separate claim path after non-member identity policy is approved |

### 1.8 Proposed storage/API contract (design only)

The migration plan should be additive and source-reference based. Proposed logical records (final names and constraints to be confirmed against the full schema before migration):

- `community_impact_contribution`: canonical person, optional organization attribution, taxonomy, role, lifecycle, source key, visibility and timestamps;
- `community_impact_evidence`: private file/reference metadata, evidence class, consent/rights, integrity, access and review state;
- `community_impact_decision_event`: append-only assignment, clarification, verification, decline, appeal and revocation history;
- `community_impact_attribution`: source project/request to person role and confirmation provenance, where the source schema cannot express it;
- `community_impact_category_mapping`: versioned source-native to canonical category mapping;
- `community_impact_ingestion_event`: source event idempotency/fingerprint and processing outcome;
- future `community_impact_score_ledger` and `community_impact_policy_version`: **not part of Increment 1 implementation**; only after score governance approval.

API contract (route names illustrative; align with existing router conventions):
- claimant: create/update draft, submit claim, list own claims, attach/remove evidence while allowed, respond to clarification, withdraw, request appeal;
- source adapter: idempotently ingest eligible source event and resolve contributor attribution;
- source owner/coordinator: confirm or dispute source facts within their scope;
- reviewer: list assigned claims, retrieve permitted evidence, assign/reassign where authorized, request clarification, verify/decline/revoke with reason;
- appeal reviewer: retrieve assigned appeal with original decision and evidence needed for independent review;
- public projection: retrieve only verified, public-consented fields;
- taxonomy/policy administration: separately permissioned and audited.

Every route must enforce object ownership, organization scope, assignment, consent and state transition server-side. A public projection must be a purpose-built allowlist, not serialization of an internal contribution/evidence row.

### 1.9 Migration and implementation constraints

Before creating the first migration:
- inspect the complete existing table definitions, constraints, indexes, file-object access model, event tables, deletion behavior and migration conventions at the then-current branch HEAD;
- validate source cardinality and contributor attribution for every source adapter;
- confirm whether canonical `person` identity is one-to-one with `app_user` for all supported claimant types;
- decide how non-member claim-only accounts are authenticated and verified;
- approve evidence retention and deletion/anonymization rules;
- approve role/permission seed semantics without auto-assigning privileged roles;
- choose foreign-key deletion behavior that preserves audit/provenance and does not orphan records;
- design indexes for contributor timeline, reviewer queue, source-key lookup, status/date and category/date based on expected queries;
- prove idempotency under concurrent retries and replay;
- plan migration rollback and ensure no legacy data backfill or source-table mutation is necessary.

No schema migration should modify the existing initiative/participation, offline project, membership, verification, ethics, Network-Plus request, mentorship or Jobs lifecycle tables merely to make the impact layer easier. Add only the minimum source attribution reference/adapter needed after a documented gap is confirmed.

### 1.10 Increment 1 acceptance criteria

- [x] Canonical categories and explicit source mappings are documented without changing existing category values.
- [x] Contribution types, roles, outcome maturity, evidence classes, lifecycle and visibility are defined.
- [x] Source-link key, idempotency, replay and duplicate reconciliation rules are documented.
- [x] Source readiness matrix distinguishes project/engagement completion from verified individual outcome.
- [x] Proposed logical records and API boundaries are documented without creating migrations or routes.
- [ ] Project owner approves taxonomy, category mapping and contribution/role vocabulary.
- [ ] Project owner/privacy governance approves non-member identity assurance, retention and visibility defaults.
- [ ] Database/schema owner confirms source cardinality, canonical person mapping, attribution gaps and exact uniqueness constraints.
- [ ] API/security review approves role/permission matrix and evidence access contract.
- [ ] A migration plan is reviewed and approved before implementation.

**Increment 1 status: contract drafted and source mapping documented; formal review/approval gates remain open.** No migration or implementation should begin until the unchecked acceptance items are resolved.

## Consolidated role/action matrix (proposed)

| Actor | Create/submit | Confirm source facts | Verify impact | View private evidence | Appeal decision | Publish public summary |
|---|---|---|---|---|---|---|
| Claimant/contributor | Own claim only | Confirm own attribution | No | Own evidence only | Submit own appeal | Consent to specific fields; cannot self-publish unverified claim |
| Source owner/coordinator | No impact decision | Within own source scope | No | Only source evidence already authorized to them | No | No independent publication authority |
| Offline project editor (`serve_community.projects.manage`) | Existing offline project record only | Enter project facts/media/consent | No | Existing staff scope | No | Cannot publish/approve own record |
| Offline project approver (`serve_community.projects.approve`) | No | Review source project | Existing project approval only, not automatically impact approval | Project evidence as authorized | No impact appeal unless separately assigned | Existing approved-project projection only |
| Impact reviewer (new scoped permission/role, proposed) | No | May request source confirmation | Assigned impact claim only | Assigned claim evidence only | No, if original decision-maker | No |
| Independent impact appeal reviewer (new scoped permission/role, proposed) | No | As needed for appeal | Reconsider appeal only | Appeal-scoped evidence | Yes, independently | No |
| Impact policy administrator (new scoped permission, proposed) | No | No | No | No raw evidence by default | No | Manages taxonomy/policy configuration with approval/audit |
| Organization owner/administrator | No | Only their organization's source records | No by default | Source-scope only | No | No unilateral verification or publication |
| System administrator | No ordinary claim action | No ordinary attestation | Only if explicitly assigned/authorized and conflict-free | Exceptional audited access | Only if independently assigned and not conflicted | No bypass of consent/moderation |

A generic `admin`, `reviewer`, `supporting_staff`, `verification_reviewer` or `ethics_reviewer` role must not silently inherit impact permissions. Role grants are explicit, least-privilege, audited and subject to assignment/conflict checks.

## Increment 2 — Policy-driven detection and attribution implementation

**Status:** Source adapters and private detection-candidate foundation committed; runtime/database/CI validation remains required before the increment can be marked fully accepted.

### 2.1 Implemented source adapters

| Source | Detection trigger | Identity and attribution | Candidate result |
|---|---|---|---|
| Serve-Community participation | Append-only participation event completed; participation remains completed; parent initiative is published or completed | Exact participant_user_id from the authoritative participation record; suggested role from active policy; contributor must confirm attribution | Private detected candidate with pending_confirmation attribution |
| Staff-entered offline completed project | Append-only offline-project event approve; project remains approved | No individual identity exists in the source record; the adapter deliberately does not assign the project editor or organization owner as contributor | Private detected candidate with unattributed state |

Participation completion is eligible while the parent initiative is in a policy-approved published or completed state. If the parent is still a draft, under review, suspended or otherwise outside the active policy, the reconciliation scan can detect it later only if the parent subsequently reaches an eligible state. The source workflows remain authoritative and are not rewritten.

Offline approval records project-level delivery facts, not individual contributor participation. Its candidate is a discovery prompt for later evidence-backed attribution; no project-wide metric is copied to an individual.

### 2.2 Configurable detection policy storage

The Increment 2 migration adds:

- community_impact_detection_policy_version: immutable, versioned source-specific rule documents;
- community_impact_detection_active_policy: pointer to the active policy version per source adapter;
- community_impact_detection_candidate: idempotent private projection keyed by source system, source type and source event ID;
- community_impact_detection_candidate_event: append-only detection and attribution history.

The initial policy versions are seeded as version 1 using the approved initial baseline. Source event codes, eligible source/parent states, enablement, attribution mode, confidence, role defaults, confirmation requirement and source-category-to-canonical-category mapping are read from policy JSON. The adapter code contains no score weights or category mapping constants. A policy change requires a new immutable version and active-pointer change; it does not mutate prior candidate history.

### 2.3 Event-driven ingestion and reconciliation

- The participation completion transition invokes the participation adapter inside the existing source transaction.
- Independent offline-project approval invokes the offline adapter inside its existing approval transaction.
- Both adapters use ON CONFLICT (source_system, source_type, source_event_id) DO NOTHING; webhook/retry/reconciliation replay cannot create a second candidate for the same source event.
- The protected admin reconciliation endpoint scans already-existing eligible source events to backfill candidates missed before the adapter was deployed or while a policy was disabled. It also compares each existing candidate against its original immutable policy version and marks it source_reversed, with append-only history, if the authoritative source event or lifecycle state is no longer eligible.
- Candidate metadata retains policy version and adapter identifier. Source record IDs and event IDs are references; the source tables remain authoritative.
- Detection is private and unverified. There is no score ledger write, public profile projection or automatic recognition.

### 2.4 Contributor confirmation and dispute

A participant whose exact user ID is proposed by the source can list their own detected candidates and confirm or dispute the attribution. Confirmation rechecks the source participation, initiative state and exact source event before changing the attribution state. Disputes require a reason. Both actions append immutable candidate events and platform audit records. Candidate source identity, event provenance, original category, proposed role, confidence and policy version are protected by a database guard; source reversals and attribution decisions are the only allowed candidate state changes.

Confirmation only means “this is my participation record.” It does not certify outcome quality, prove a measurable impact, authorize public publication or award points. Disputed candidates remain excluded from later verification/scoring.

Offline project candidates remain unattributed until a later increment provides a permissioned, evidence-backed person-to-project attribution workflow. This is intentional and safer than guessing from project ownership or staff data-entry identity.

### 2.5 API surface and permissions

- GET /api/v1/me/community-impact/detected — own detected contribution candidates only;
- POST /api/v1/me/community-impact/detected/:id/confirm — confirm own source-linked attribution;
- POST /api/v1/me/community-impact/detected/:id/dispute — dispute own proposed attribution with a reason;
- GET /api/v1/admin/community-impact/detection/candidates — private operational candidate queue;
- POST /api/v1/admin/community-impact/detection/scan — bounded reconciliation scan.

Admin scan and queue access require system_admin or the explicit system-only community_impact.detection.manage permission. This permission does not grant impact verification, appeal, scoring, policy editing, membership review or ethics review authority. Member endpoints scope every candidate lookup to the authenticated contributor.

### 2.6 Increment 2 acceptance and remaining validation

- [x] Additive detection/policy schema; existing source tables and lifecycle constraints are not altered.
- [x] Versioned source-specific policy configuration and immutable policy/event history.
- [x] Participation completion event detection with authoritative identity and contributor confirmation.
- [x] Approved offline-project event detection without guessed individual attribution.
- [x] Event-driven candidate creation plus bounded backfill/reconciliation endpoint.
- [x] Idempotent source-event key and replay-safe insert semantics.
- [x] Reconciliation marks candidates source_reversed when the authoritative source no longer meets the original policy; source provenance is immutable.
- [x] Private own-candidate API, confirmation and dispute actions with audit history.
- [x] Scoped admin scan/queue permission; no broad reviewer role inheritance.
- [ ] Execute migration compatibility check against a disposable PostgreSQL database.
- [ ] Run targeted platform tests and the full relevant CI matrix; fix all failures.
- [ ] Validate concurrency/replay and source-state reversal behavior against a disposable database.
- [ ] Security review of admin permission assignment, candidate queue, and contributor object scoping.
- [ ] Configure and verify the operational reconciliation schedule if missed-event backfill must run periodically.
- [ ] Confirm the offline-project contributor attribution evidence workflow in Increment 3/4.

**Increment 2 status:** Implementation committed; acceptance remains pending runtime/database/CI and security validation. Do not deploy or apply the migration to production as part of this increment.

## Updated increment tracker

| Increment | Status | Evidence / next gate |
|---|---|---|
| 0 — Re-audit and architecture freeze | Source audit complete; formal freeze pending | This delivery record; project-owner approval and policy decisions still required |
| 1 — Taxonomy and source-link contract | Contract drafted; approval pending | This delivery record; schema/API/privacy review still required |
| 2 — Automatic detection and attribution | Implementation committed; validation pending | Two Serve-Community adapters, immutable source policy versions, event-driven candidates, replay-safe reconciliation, contributor confirm/dispute; disposable DB, CI, security and scheduler validation remain |
| 3 — Manual claims and evidence | Core backend extended; validation pending | Identity assurance, evidence-backed offline attribution, reviewer-controlled claim/source reconciliation, evidence privacy and non-destructive retention evaluation added; claimant/admin UI and runtime/security validation remain pending |
| 4 — Reviewer operations | Core backend extended; validation pending | Case assessments, conflict declarations, database-enforced assignment/decision conflict blocks and independent second-review controls added; operational UI, role matrix and runtime/security validation remain pending |
| 5 — Score ledger and explanations | Not started | Depends on score governance and approved rubric; no score calculation before approval |
| 6 — Member workspace and profile | Not started | Depends on stable APIs, privacy projections and consent controls |
| 7 — Prompts, recognition and discovery | Not started | Depends on rate-limit, notification, recognition governance and opt-in policies |
| 8 — Operational readiness | Not started | Security, monitoring, retention, support, migration and rollback readiness |

**Change-control note:** The governance completion implementation below adds source code, migration, API and regression-contract coverage. It does not claim that Increment 0 has formal governance approval or that Increment 1 has passed its approval gates. Keep all work on this branch and preserve the existing source workflows and protections.


## Policy decision update — initial approval and configurability (2026-10-31)

**Project-owner direction recorded:** Use the five-dimension score weights in Section 8 (30/25/20/15/10) as the initial policy baseline for evaluation. Do not hard-code those values. All scoring, detection, attribution, evidence, taxonomy and reviewer-adjustment rules must be configurable through immutable, versioned policy records.

**Reviewer adjustment authority:** An authorized impact reviewer may adjust an individual contribution's category, type, role, evidence assessment, outcome maturity, attribution share, rubric ratings and permitted modifiers after reviewing evidence. The reviewer must record evidence references, before/after values, rationale, reason code and identity. Higher-risk or out-of-range changes require independent second review. Reviewers do not acquire authority to change global policy or source records.

**Automatic detection direction:** Source detection must use configurable, versioned adapters and rules. Each source event is validated, identity-resolved, attributed only when evidence/confidence thresholds pass, deduplicated idempotently and recorded as detected/attribution-pending until the appropriate confirmation and verification gates are satisfied. No detection-only event awards points or becomes public.

**Approval boundary:** This is approval of the initial policy approach and baseline for design/evaluation. It is not approval to enable public scoring, deploy detection adapters, create migrations, assign reviewer permissions or change production data. Those require the relevant increment's schema, security, privacy, fairness and operational gates.

**Progress:** Policy configurability, reviewer case-level adjustments and automatic detection/attribution governance are now specified. Increment 2 implementation is committed on this branch; acceptance remains pending runtime, disposable-database, CI and security validation.


## CI root-cause audit and remediation — run 41208799114 (2026-10-31)

**Audited revision:** `ffe32ec225d64956cd494566f48d945ba74f5f59`  
**Workflow:** [PR Quality run 41208799114](https://github.com/mpaproject1/MPA-Professionals-Network/actions/runs/41208799114)  
**Result:** Four jobs failed. The failures were traced to multiple independent defects plus dependent reports; the backend test suite and browser acceptance did not run because earlier steps failed.

### Root-cause classification

| CI job | Root cause | Relationship / impact |
|---|---|---|
| TypeScript type check | Literal backslash-n sequences had been committed into `web/app/network-plus/requests/page.tsx` between declarations and hook calls | Primary TS parse failure; same malformed source also caused the Next.js parser failure |
| Lint (Biome) | The same malformed request-page source and over-escaped regular-expression literals / an unclosed expression in `src/network-plus/business-discovery.js` | Independent JavaScript parse failure in addition to the request-page parse failure; repeated diagnostics were cascades, not separate defects |
| Lint (Biome) | Missing explicit button types, unsorted imports, and duplicate `CONSENT_REQUIRED` keys in the client error-message map | Independent lint failures. Duplicate-key repair keeps the server error code unchanged and uses a neutral message valid for both consent contexts |
| Backend tests / disposable PostgreSQL | The new Community Impact migration opened the candidate-guard function with `as $` and closed it with `$;` instead of dollar-quoted `$$` delimiters | Independent SQL syntax failure during the legacy-schema upgrade; later migration checks and all backend tests were skipped |
| Next.js build | Incorrect relative imports in the two Serve-Community admin pages | Independent module-resolution failures, not consequences of the request-page parse error |
| Next.js build | Google-hosted font requests failed during build | Environment/network warning observed before the compile errors. It is not yet established as a fatal blocker; re-evaluate after source compilation succeeds |

### Remediation applied on this branch

- Corrected the Community Impact candidate-guard SQL function delimiters; no schema semantics, constraints, triggers or source records were weakened.
- Corrected the Network-Plus business-discovery regular expressions and the malformed ownership predicate while preserving public-contact filtering and ownership authorization.
- Replaced the three literal escaped line breaks in the Network-Plus request page with actual source line breaks. Added explicit button types while retaining the draft form's submit behavior.
- Corrected the two Serve-Community admin module paths to resolve to the existing shared API/store modules.
- Applied Biome import ordering and explicit form/button semantics to the affected pages and test files.
- Removed the duplicate client-side consent-message key without changing the server's `CONSENT_REQUIRED` code or consent enforcement.

### Validation still required

The remediation commits are source changes only. The latest branch revision must pass the complete PR Quality workflow. Specifically verify:
1. TypeScript and Biome report no parse, lint or accessibility errors.
2. The legacy-schema upgrade completes on its isolated disposable PostgreSQL database.
3. All repository migrations and rollback-only compatibility checks complete.
4. Every backend test file executes and passes.
5. Next.js production build, browser acceptance and membership-card PDF checks complete.
6. The build no longer depends on a successful external font download, or the font-download issue is independently shown not to block compilation.

**Safety boundary:** No production migration, deployment, data mutation, permission assignment, merge or main-branch change was performed. Keep PR #18 in draft until all validation gates pass. Do not treat this remediation as proof of runtime or database acceptance.


## CI root-cause audit and remediation — run 41211068657

The run checked out `ebf506db9ddf5beb322b54ac7d17486dac5c58a2` on `feat/workstream-3-progress-members-workspace`.

### Results and independent/dependent causes

| Area | Observed result | Root cause and treatment |
|---|---|---|
| Disposable PostgreSQL legacy upgrade | Passed | The prior SQL delimiter repair is effective. |
| Full migration application | Passed | No migration-application failure was reported. |
| Rollback-only migration compatibility | Passed | No rollback-compatibility failure was reported. |
| TypeScript | Failed | Three source defects: an untyped event-map index parameter in the Network-Plus request workspace, a missing optional `hasMore` field in the Serve-Community pagination response type, and a duplicate `CONSENT_REQUIRED` key in the client error map. Fixed the type declarations and removed the duplicate key without changing server authorization or consent enforcement. |
| Biome lint | Failed | Five blocking diagnostics: import organization in `server.js` and `src/network-plus/business-discovery.js`, import/declaration spacing in two Serve-Community E2E specs, and the duplicate client error-map key. Targeted source formatting and duplicate-key repair applied; non-blocking warnings were not suppressed. |
| Backend tests | 446 passed, 5 failed, 3 skipped (454 total) | All five failures were assertion drift or overly broad source-text matching, not PostgreSQL failures. The checks were updated to verify the current route boundary, the actual public projection, and the exact permission-seed statement while retaining privacy and authorization assertions. |
| Next.js build | Failed during type validation after successful compilation | Dependent on the Network-Plus event-map index type error; no independent bundler or font-download failure was shown in this run. |

### Backend test failures reconciled

- The homepage pathway test expected the retired `/service-demand` route in the Serve-Community landing page. It now verifies the live completed-project API and the explicit Network-Plus boundary.
- The role-workspace test expected the former Serve-Community page to link directly to commercial services, mentorship and demand routes. It now verifies the current separation: Serve-Community initiatives/completed projects remain distinct, Network-Plus is the commercial discovery boundary, and the existing services and private-demand workspaces remain independently available through their own routes.
- The About-page test's member-claim detector treated the phrase `, members` as a numeric member claim because its character class allowed a comma as the first character. The detector now requires a digit before the optional thousands separators.
- The Network-Plus public-projection test rejected `owner_organization_id` anywhere in the SQL text, including a private ownership join used only to suppress listings associated with unverified organizations. It now inspects the explicit selected projection for private fields and separately asserts that the eligibility filter remains present.
- The Serve-Community migration test's `[^;]+` expression stopped at a semicolon inside the quoted permission description. It now checks the permission row on its own SQL line and retains the required `true,true` seed values.

### Additional form behavior correction

The two collaboration-workspace forms had submit handlers but their action buttons were marked `type="button"`, so clicking them did not submit the forms. They are now `type="submit"`. The event-list index parameter is explicitly typed. This restores the intended Add milestone and Save update actions rather than merely silencing the compiler.

### Latest remediation revision and acceptance boundary

The fixes were committed to the same branch, including the request-page type/form correction, pagination typing, duplicate-key removal, import organization, and the five focused backend-test reconciliations. Latest recorded commit at the time of this note: `cd2777099f9d675e8694d177ddc58a98804e4bb7`.

No workflow run was returned for that latest revision when checked. Therefore TypeScript, Biome, backend tests, Next.js build, browser acceptance and PDF validation remain **unverified** until PR Quality runs against the latest branch head. The successful PostgreSQL checks above apply only to the earlier run's checked-out commit, not to the new commits.

**Safety boundary:** No production database, production deployment, permission assignment, merge, or main-branch change was made. Keep the workstream unmerged and the PR in draft until the complete workflow passes against the latest commit.


## Retention policy configurability decision — 2026-10-31

**Project-owner direction:** Retention periods and expiry/deletion treatment must be adjustable through MPA-governed, versioned policy data. Do not hard-code a retention duration or silently apply a global default. A policy schedule must define separate rules for claim metadata, non-member identity-assurance artifacts, raw evidence, consent/rights records, reviewer notes, audit events and score-ledger records. Each class carries its own retention start event, period, grace period and expiry action.

**Governance boundary:** The branch now provides an additive retention-policy registry and authenticated governance API. A policy proposal is immutable, records its schema version and canonical SHA-256 integrity hash, and must cover every required data class. The proposer cannot approve or activate their own proposal; approval requires a separate authorized actor and an approval reference. Activation is a separate explicit operation. Every proposal, approval, activation and supersession is recorded in append-only history and the platform audit log.

**No unapproved deletion:** The migration intentionally seeds no retention duration and no active policy. No evidence deletion job is enabled by this registry. Legal holds pause and preserve records. Actual expiry enforcement must be implemented only after the evidence/claim storage model is integrated, MPA approves the class-by-class schedule and deletion/anonymization rules, and backup-expiry and legal-hold behavior are tested. Policy changes create a new version and apply prospectively unless a separately approved, audited migration/recalculation plan explicitly says otherwise.

**Current implementation boundary:** The registry/API is an administrative foundation, not evidence deletion completion. Runtime database migration rehearsal, authorization tests, complete evidence lifecycle enforcement, retention/deletion execution and CI remain required. No production migration, data deletion or deployment is authorized by this work.


## Governance completion implementation — 2026-11-01

**Target:** `mpaproject1/MPA-Professionals-Network`, branch `feat/workstream-3-progress-members-workspace`.

The following additive backend work has been prepared for this branch. It does not change the existing source-of-truth Serve-Community project or participation workflows, does not award points, and does not publish contribution data.

### 3.1 Individual attribution for offline completed projects

- An offline-project detection candidate remains unattributed until a separate attribution proposal identifies a contributor account, contribution role, attribution share and rationale.
- The proposal requires at least one private evidence file and explicit confirmation by the named contributor before independent reviewer verification. Evidence is recorded with the active raw-evidence retention policy snapshot.
- A non-member contributor must have a verified identity-assurance case before attribution can be verified.
- An authorized offline-attribution reviewer makes the independent verification/decline decision. The proposer and contributor cannot verify their own proposal.
- Multiple contributors may be attributed to the same offline project. Combined submitted, under-review and verified attribution shares for a project cannot exceed 100 percent; candidate-row locking serializes concurrent proposals.
- Staff data-entry identity is never used as an inferred contributor.
- Attribution remains separate from project approval, impact verification and scoring.

### 3.2 Non-member identity assurance

- A person without active membership may submit an authenticated-account identity-assurance case with legal name, country, assurance level and private evidence.
- Identity evidence requires an active MPA-approved `identity_assurance_artifacts` retention rule before it is collected.
- A separate system-only `community_impact.identity.review` permission controls the reviewer queue and decision operation.
- A claimant cannot verify their own identity. The reviewer decision is retained with a policy snapshot and audit event.
- Manual claim submission now requires verified identity assurance when the claimant has no active membership. This does not create, approve or grant membership.
- Identity evidence downloads are limited to the owner and authorized identity reviewers while the case is submitted or under review.

### 3.3 Claim-to-detected-contribution reconciliation

- Reconciliation is an explicit reviewer operation, not a fuzzy-match job.
- The assigned impact reviewer must link an open manual claim to one detected candidate.
- The claimant account must match the authoritative contributor account. Offline candidates require exactly one verified individual attribution matching the claimant.
- One-to-one database uniqueness prevents a claim or candidate being linked more than once.
- The link stores reviewer identity, rationale and timestamp. It does not change source records, merge source rows, or award score.

### 3.4 Detection policy administration

- Detection policy proposals create a new immutable source-specific policy version and a separate governance record.
- Proposal, approval and activation are separate operations with separate system-only permissions.
- The proposer cannot approve or activate their own version. Approval reference and rationale are stored in the governance record and append-only policy events.
- Activation changes only the active policy pointer. Existing candidate provenance remains attached to the original policy version.
- The existing version-one source policy remains in place until a separately authorized version is approved and activated.

### 3.5 Reviewer-adjustable assessments

- An assigned reviewer may propose a case-level assessment with category, contribution type, role, evidence quality, outcome maturity, attribution share, rubric ratings, evidence references, rationale and risk level.
- Every evidence reference is checked against active evidence attached to that claim.
- Standard-risk assessments can be approved by the assigned reviewer; elevated/high-risk assessments remain pending until an independent second reviewer approves or rejects them.
- The original reviewer and claimant cannot perform the second review. An active declared/confirmed conflict blocks assessment.
- Assessments do not mutate the global scoring policy, source business records or claim provenance. They are not yet consumed by a score ledger.

### 3.6 Conflict-of-interest and second-review safeguards

- Reviewers can declare personal, financial, employment, project-involvement, prior-decision or other conflicts on claims to which they are assigned.
- Database triggers reject new claim assignments and reviewer decisions when an active conflict exists for that reviewer and claim.
- Assessment and second-review services repeat conflict checks server-side.
- A conflict declaration does not silently rewrite an existing assignment or decision. The assigned reviewer must be recused/reassigned through a governed operation; the database prevents further decisions while the conflict is active.

### 3.7 Retention lifecycle integration — non-destructive

- A retention evaluator reads the currently active MPA-approved version and evaluates supported claim, identity-assurance, evidence, consent, reviewer-note and claim-event record classes.
- It records the policy version, due date, configured action and evaluation disposition in a separate ledger.
- Due records are marked `deletion_not_authorized`. The evaluator performs no DELETE, anonymization, access restriction, file-object purge or backup purge.
- No retention period is seeded, no policy is activated by this implementation, and legal holds are not bypassed.
- Actual deletion/anonymization remains disabled until MPA approves the data-class schedule and a separately reviewed processor covers database rows, private storage objects, backups, audit/legal holds and restoration behavior.

### API operations added

- `POST /api/v1/me/community-impact/identity-assurance`
- `POST /api/v1/me/community-impact/identity-assurance/:id/evidence`
- `POST /api/v1/me/community-impact/identity-assurance/:id/submit`
- `GET /api/v1/admin/community-impact/identity-assurance`
- `POST /api/v1/admin/community-impact/identity-assurance/:id/decision`
- `GET /api/v1/admin/community-impact/offline-attributions`
- `POST /api/v1/admin/community-impact/detection/candidates/:id/offline-attributions`
- `POST /api/v1/me/community-impact/offline-attributions/:id/confirm`
- `POST /api/v1/admin/community-impact/offline-attributions/:id/assign`
- `POST /api/v1/admin/community-impact/offline-attributions/:id/decision`
- `GET /api/v1/admin/community-impact/detection/policies`
- `POST /api/v1/admin/community-impact/detection/policies`
- `POST /api/v1/admin/community-impact/detection/policies/:id/approve`
- `POST /api/v1/admin/community-impact/detection/policies/:id/activate`
- `POST /api/v1/admin/community-impact/claims/:id/reconcile`
- `POST /api/v1/admin/community-impact/claims/:id/conflicts`
- `POST /api/v1/admin/community-impact/claims/:id/assessment`
- `POST /api/v1/admin/community-impact/assessments/:id/second-review`
- `POST /api/v1/admin/community-impact/retention/evaluate`

### Validation and remaining gates

- [ ] Execute the new additive migration against a disposable PostgreSQL database and run all migration compatibility/rollback checks.
- [ ] Run targeted Community Impact tests and the full final-increment CI matrix.
- [ ] Add and verify the member identity-assurance UI and administrator operations UI for identity, offline attribution, detection policy, conflicts and assessments.
- [ ] Exercise private evidence reads for owners, assigned reviewers, unrelated users and revoked/closed cases.
- [ ] Exercise concurrent attribution proposals and share-cap races against PostgreSQL to confirm the candidate-row lock serializes concurrent writes.
- [ ] Validate policy proposal/approval/activation concurrency and ensure no unapproved policy pointer can become active.
- [ ] Validate retention start events, due-date calculations, legal holds, evidence storage objects, backups and restore behavior.
- [ ] Verify reviewer conflict declarations cause safe reassignment/recusal and that second review is independent in every role/action/object combination.

**Status boundary:** Backend schema/service/API foundations are added; they are not marked runtime-validated or release-ready. UI coverage and all database, security, migration and CI validation remain pending. No CI was run for this intermediate delivery, consistent with the instruction to run CI at the final increment. No production migration, deployment, data deletion, permission assignment, merge or branch change is authorized.
