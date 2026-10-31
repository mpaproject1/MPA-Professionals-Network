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

A possible initial policy for evaluation (not approved for production) uses these weights:

| Dimension | Illustrative weight |
|---|---:|
| Measurable community outcomes | 30% |
| Quality and significance | 25% |
| Verified contribution/responsibility | 20% |
| Sustainability | 15% |
| Collaboration and knowledge sharing | 10% |

These weights are a discussion baseline only. Validate them with community governance, diverse member cohorts, and fairness analysis before adoption.

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
- Support member and non-member claims with identity assurance appropriate to risk.
- Add evidence handling, consent, private defaults, clarification, and withdrawal.
- **Exit:** complete claimant journey and privacy tests.

### Increment 4 — Reviewer operations
- Add scoped queues, assignment, conflict checks, independent decisions, appeals, revocation, and audit.
- Preserve separation from membership, verification, and ethics decisions.
- **Exit:** permission matrix tests for every role/action/object; no self-review path.

### Increment 5 — Score ledger and explanations
- Finalize and approve scoring policy before enabling points.
- Implement versioned calculation, caps, diminishing returns, reversals, and explanations.
- Run fairness and gaming simulations.
- **Exit:** reproducible calculations and auditable recalculation; governance approval.

### Increment 6 — Member workspace and profile
- Add responsive impact dashboard, progress states, timeline, category breakdown, and claim management.
- Add optional public profile section and field-level visibility preview.
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
- System-linked events and manual claims resolve to one contribution record.
- Claims can be created by eligible non-members without granting membership or member privileges.
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
