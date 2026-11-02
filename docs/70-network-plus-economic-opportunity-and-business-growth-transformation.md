# Network-Plus — Economic Opportunity & Business Growth Transformation Plan

**Repository:** `mpaproject1/MPA-Professionals-Network`  
**Target branch:** `feat/workstream-3-progress-members-workspace`  
**PR:** #18 (keep draft; this document does not authorize merge or deployment)  
**Planning baseline:** branch head `3e038dae220edb26b24256506339510ed85fa96b` (2026-11-02)  
**Related contracts:** docs/53, docs/58, docs/59, docs/60, docs/62 (Network-Plus quality/release gate)  
**Status:** Proposed product transformation and implementation plan; no feature implementation or production migration is authorized by this planning document.

## 1. Executive direction

Transform Network-Plus from a professional discovery and collaboration destination into MPA's **Economic Opportunity & Business Growth Platform**. Professional networking remains a core capability, but the product's primary promise expands: help members and eligible organizations start businesses, obtain expertise and resources, find customers and suppliers, access suitable finance, form partnerships, expand to new locations, and demonstrate measurable economic results.

The platform must support the full journey:

**Need or opportunity → guided assessment → verified business/person/programme → discover and match → request / application → due diligence → terms and decision → execution → evidence → independently credible outcome.**

It is not enough to publish listings, count views, collect expressions of interest or mark milestones complete. Each pathway must identify the real-world result sought, the party responsible, the evidence needed, the next action, and whether the result is self-reported, counterparty-confirmed or independently verified.

Network-Plus is not a bank, securities exchange, payment escrow provider, credit bureau, legal adviser or guarantor. It facilitates discovery, applications, due diligence, structured introductions, documented decisions and evidence-based reporting. Any regulated financing, investment solicitation, lending, franchise, payment, escrow or securities activity must be gated by jurisdiction-specific legal and compliance approval and an approved provider/partner model.

## 2. Repository inspection — current architecture and gaps

Inspection was performed against the specified branch at the planning baseline above. This is a source/document inspection, not a claim that all current endpoints or browser journeys have passed runtime validation.

### 2.1 Existing foundations to preserve

| Existing foundation | Current source / route | Reuse decision |
|---|---|---|
| Network-Plus access and eligibility | `src/platform/network-plus-access.js`, access guard | Keep server-side eligibility checks; entry eligibility never grants resource mutation rights |
| Verified member discovery | `/network`, talent service | Reuse canonical people, membership, profile visibility and verified professional claims |
| Organization discovery | `/network-plus/organizations` | Reuse canonical verified organizations and explicit opt-in visibility |
| Business ownership and verification | `src/network-plus/business-discovery.js`, Increment 5 migration | Reuse individual, organization and joint ownership; separate business verification from member/organization verification |
| Business and commercial listings | Increment 5 business-discovery service and schema | Extend the existing business/listing domain; do not create a second business identity or convert old service records automatically |
| Typed collaboration requests | `src/network-plus/request-collaboration.js` | Reuse participant consent, idempotency, explicit acceptance, audit, notifications and collaboration workspaces |
| Service delivery | Existing services/mentorship service foundation | Reuse only validated delivery primitives; retain distinct commercial and community-impact policies |
| Organization resource permissions | `organization_membership` and scoped capabilities | Enforce exact organization and business resource scope |
| Private files and evidence | Existing private-file service | Reuse private evidence storage, access checks and reviewer audit |
| Serve-Community | `/serve-community` | Keep volunteering, community initiatives, impact commitments and community grants distinct from commercial business discovery |

### 2.2 Gaps established by the inspected source

1. The current `/network-plus` landing page presents member discovery, organization discovery and requests/collaboration. It does not yet communicate or guide a complete business-growth journey.
2. Increment 5 documents business ownership, verification, business profiles, commercial listings, discovery APIs and moderation queues. Its implementation record explicitly says browser business management and reviewer screens are not included and the full exit gate is not passed.
3. Increment 6 implements a private request lifecycle and accepted collaboration workspace. Its implementation record documents six request intents in the current service: `service_request`, `supplier_inquiry`, `referral`, `expertise_request`, `partnership_proposal`, and `collaboration_request`.
4. The approved Increment 4 domain design lists a seventh `business_opportunity` intent, but the inspected Increment 6 implementation's `INTENTS` set does not include it. Reconcile this contract mismatch before relying on business-opportunity intake.
5. The existing request workflow does not constitute a financing application, investor pipeline, grant award, disbursement, franchise process, branch expansion workflow or capital performance ledger.
6. The inspected Network-Plus UI does not yet demonstrate a complete product catalog, quote/request-for-quotation journey, structured buyer inquiries, business discussion rooms or meeting booking workflow.
7. The current collaboration milestone/event model is useful for execution but does not by itself verify funding received, equipment acquired, new branches opened, sales generated, jobs created or regional distribution achieved.
8. Existing Network-Plus documentation states Increment 5/6 disposable PostgreSQL, API, browser, accessibility and complete CI exit gates remain pending. Do not describe the current feature as production-ready until those gates are evidenced.

### 2.3 Architectural conclusion

Extend the existing Network-Plus bounded context in additive, independently testable increments. Reuse canonical identity, organization, business ownership, verification, private-file, notification, audit, consent, idempotency and collaboration infrastructure. Add dedicated domains for business growth plans, capital programmes/applications, investor/partner matching, expansion projects, product commerce inquiries and measurable outcomes.

Do not put financing, franchise, supplier, product inquiry and partnership semantics into one generic free-text request or one overloaded status field. Do not repurpose Jobs applications, mentorship requests, community initiatives, legacy service requests or donation records.

## 3. Users and needs — end-to-end coverage

The experience begins with the member's goal, not with a long application form. A member may select more than one goal and can save progress.

| User / business situation | Need and supported pathway | Target tangible outcome |
|---|---|---|
| Has an idea but no registered business | Idea validation, problem/customer discovery, co-founder search, feasibility support, business-plan guidance, registration checklist and mentor matching | Validated concept, evidence of demand, launch plan and first customer/pilot |
| Has skills but lacks capital | Skills-to-enterprise assessment, equipment/working-capital/seed-fund needs assessment, suitable grant or finance programme discovery, business partner/co-founder matching | Eligible funding application, partner match, equipment or working capital secured |
| Has an existing small business and wants to scale | Business performance baseline, growth-readiness assessment, finance and market access, operations/management mentoring | Revenue/customer growth, capacity increase, new product/service, improved margins |
| Needs a business partner or co-founder | Find complementary skills, capital, operating experience or market access; structured partner proposals, references and consent-based due diligence | Accepted partnership with documented responsibilities, contributions, governance and milestones |
| Wants to open a new branch | Location feasibility, demand evidence, branch budget, lease/equipment/staffing needs, local operating partner and finance programme matching | Branch approved, financed, opened and trading |
| Needs equipment or productive assets | Define equipment specification, supplier options, purchase/lease/asset-finance need, quotation comparison and delivery evidence | Equipment installed, operational capacity added and utilization measured |
| Wants a franchise | Discover approved franchise opportunities, territory availability, franchisor due diligence, fees/royalties/obligations, franchisee readiness and finance | Signed/approved franchise arrangement and operating location |
| Wants to offer a franchise | Franchise-readiness assessment, operating manual, unit economics, brand/IP, support model, territory design, legal review and franchisee discovery | Qualified franchise leads and opened/operating franchise units |
| Wants to distribute or represent a product | Distributor/agent search, territory and channel fit, product capacity, minimum order quantities, exclusivity and commercial terms | Distribution agreement, active outlets/territories and sales |
| Wants to finance a business | Publish a finance need with amount/range, instrument preference, use of funds, business readiness and milestones; discover eligible investors/programmes | Qualified funding interest, due diligence, accepted terms and verified capital received |
| Wants to invest in a business | Investor profile, sectors, geography, ticket range, instrument and risk preference; discover consented eligible opportunities | Qualified introductions, documented decision and monitored investment outcomes |
| Organization wants to provide seed funds/grants | Create a grant/seed-fund programme, define eligibility, geography, sectors, amounts, deadlines, scoring rubric, conflict rules and reporting requirements | Transparent eligible pipeline, awards, disbursement evidence and beneficiary outcomes |
| Wants customers or new markets | Verified business/product catalog, customer segments, regional demand, buyer inquiries, quotations, meetings and distribution channels | Qualified leads, orders/contracts, repeat customers and new markets served |
| Wants to source goods/services | Supplier catalog, specification and quantity request, quote comparison, supplier verification and procurement discussions | Qualified supplier, accepted quote, delivered order and verified fulfilment |
| Wants to collaborate with a larger organization | Procurement/supplier registration, subcontracting, local partner, institutional buyer and consortium opportunities | Contract, subcontract, partnership or supplier onboarding |
| Wants business mentorship | Mentor matching for finance, operations, marketing, export, governance, technology, franchise and sector-specific expertise | Completed advisory milestones and documented operational improvements |

## 4. Product structure and member experience

### 4.1 Network-Plus becomes a compact business-growth workspace

Keep the app-like, minimal desktop/mobile design language already established in the branch. The landing page should make the member's next useful action obvious, with a visual shelf of compact workspaces rather than a marketing website or an enormous form.

Proposed primary areas:

1. **My Business Journey** — personal dashboard of goals, readiness, applications, requests, matches, decisions, tasks and outcomes.
2. **Start & Validate** — idea validation, co-founder discovery, business model, customer research and launch checklist.
3. **Grow My Business** — business profile, performance baseline, growth plan, funding needs, branch/equipment projects and execution.
4. **Finance & Funding** — grant/seed-fund programmes, finance requests, investor/financier discovery, applications and due diligence.
5. **Partners & Opportunities** — co-founders, business partners, joint ventures, franchise, agents, distributors, regional operators and institutional opportunities.
6. **Products & Market** — verified product/service catalog, customer segments, buyers, supplier discovery, RFQs, quotations and meetings.
7. **Business Support** — mentors, advisers, professional services, training, legal/accounting referrals and business clinics.
8. **My Business Workspace** — owner/team workspace for business details, evidence, team permissions, catalog, requests, negotiations, projects and results.

An organization sees the same capabilities only for the businesses and opportunities it is authorized to manage. An investor, funder or programme operator receives a separate role-scoped workspace; access is never inferred from a member role or from merely owning an organization.

### 4.2 Goal-first onboarding

Ask one short question first: **“What business result are you working towards?”** Offer goal cards such as start a business, find funding, scale, find a partner, open a branch, buy equipment, find customers, distribute a product, franchise, or invest/support businesses.

Then reveal only the next relevant questions. Save drafts, explain why evidence is needed, show estimated completion time and allow the user to return later. A person with a skill but no business should not be forced to complete a business financial statement before the system can recommend a co-founder, mentor or start-up support pathway.

### 4.3 One progress timeline

Integrate Network-Plus actions into the existing member progress/track experience where appropriate. Show every business journey as a timeline: submitted → qualification → review → meeting → terms → decision → execution → evidence → outcome. Keep separate records and authorization boundaries underneath. The timeline is a unified view, not a unified database table.

Every card should show: current state, who must act next, due date, outstanding evidence, last update and a direct action. No silent “pending” states.

## 5. Business profile, readiness and performance

### 5.1 Business profile and catalog identity

Build on `network_plus_business`, explicit ownership and `network_plus_service_listing`. Extend listing types and structured attributes for physical products, wholesale/retail supply, professional services, subscriptions, distribution, franchise offers and business opportunities. A business may publish multiple catalog items.

A product/service record should support:
- approved business identity and verification scope;
- product/service name, category, description, specifications and media;
- variants, units, minimum order quantity, production/supply capacity and lead time;
- price, currency, price validity, volume tiers, tax/shipping assumptions and quote-required state;
- inventory/availability status where the owner can substantiate it;
- target customer segments, B2B/B2C/institutional audience and use cases;
- service/delivery areas, export/remote availability and distribution territory;
- certifications, standards, origin and claims with evidence scope;
- request-quote, ask-question, request-sample (where feasible), request-meeting and supplier inquiry actions;
- visibility, moderation, expiry, audit and owner-controlled contact release.

Do not represent unverified inventory, capacity, certification or sales as facts. Display “owner supplied” versus “reviewed/verified” data provenance.

### 5.2 Business performance baseline

Provide an optional, privacy-protected performance snapshot. Collect only data needed for a selected goal and allow ranges where exact values are commercially sensitive.

Potential measures:
- business age, sector, operating locations and business model;
- monthly/annual revenue range and trend, gross margin range and cash-flow position;
- customer count, repeat-customer share, active contracts/orders and pipeline;
- production/service capacity, utilization, delivery lead time and stock-outs;
- employees and full-time-equivalent jobs, with privacy-preserving aggregation;
- current channels, target customer segments and geographic coverage;
- assets/equipment, financing already secured and current obligations (only where necessary for the selected financing process);
- business continuity, governance, ownership and key-person dependencies.

Separate self-declared information from evidence-backed and independently reviewed metrics. Never expose confidential financial data in public discovery. Use explicit consent and field-level disclosure for each funder or partner.

### 5.3 Expansion-readiness assessment

Create a guided, explainable readiness assessment, not an opaque credit score. Evaluate:
- validated demand and customer evidence;
- business model and unit economics;
- financial records and cash-flow forecast;
- management/team capability;
- operating capacity and quality controls;
- legal/registration/licensing status relevant to the activity;
- market access and distribution;
- project cost, use of funds, contribution and contingency;
- risk register and mitigation;
- reporting and evidence readiness.

Return a readiness profile with strengths, missing evidence, recommended support and next actions. It must not promise financing or imply creditworthiness. Any scoring rubric must be versioned, transparent, bias-tested and approved; keep the raw inputs private.

### 5.4 Business plan and financial projection builder

Offer templates and assisted workflows for:
- problem, solution, value proposition and business model;
- customer segments, market size assumptions and competitor analysis;
- marketing, sales and distribution strategy;
- operations, procurement, staffing and capacity;
- launch/expansion budget and sources/uses of funds;
- sales forecast, cost of goods/services, operating expenses, cash flow, break-even and scenario analysis;
- risks, assumptions, milestones and implementation schedule.

Every projection must label assumptions, period, currency, scenario and author. Store version history and export a reviewable PDF/XLSX. Generated forecasts are planning aids, not audited accounts, guarantees or investment advice. Allow an accountant/adviser to comment with explicit business-owner consent.

## 6. Capital, funding and investment ecosystem

### 6.1 Separate capital pathways

Do not collapse all capital into a generic “investment” request. Support distinct pathways with separate eligibility, terms, decisions and outcome evidence:

1. **Grant / seed grant** — non-repayable programme funding with eligibility, selection criteria, award conditions, milestones and reporting.
2. **Interest-free or other debt finance** — principal, fees, repayment schedule, grace period, security/collateral where lawful, default and settlement terms. Instrument options and ethical constraints must be configurable; do not imply any instrument is automatically compliant with a user's beliefs or local law.
3. **Equity / ownership investment** — proposed valuation, amount sought, equity/instrument, governance, dilution, shareholder approvals and required professional/legal review.
4. **Revenue/profit-sharing or other structured finance** — clear formula, term, reporting basis, caps/limits and professional review; enabled only after legal approval.
5. **Asset/equipment finance or leasing** — asset specification, supplier quote, deposit, term, ownership/maintenance and end-of-term obligations.
6. **Working capital / purchase-order finance** — cash-flow need, order/contract evidence, supplier/customer and repayment/settlement source.
7. **Founder/co-founder contribution** — skills, time, operating responsibility and agreed contribution; do not treat this as an investment security by default.
8. **Franchise or branch finance** — project-level capital request tied to site, territory, fit-out, equipment, staffing and launch working capital.

### 6.2 Business finance request

A guided finance request should capture:
- verified business and accountable owner;
- goal: launch, equipment, inventory, working capital, branch, distribution, franchise or scale;
- requested amount or range and currency;
- instrument(s) considered and acceptable alternatives;
- use-of-funds line items and supplier estimates;
- owner contribution and other confirmed funding;
- business performance baseline and projection version;
- target market, customer evidence and operating capacity;
- timeline, milestones, expected economic outcomes and risks;
- documents/evidence and who may view each item;
- preferred geography and funder/programme eligibility.

The member chooses whether the opportunity is visible to a defined programme, selected funders or eligible Network-Plus partners. No public display of confidential financials or private documents.

### 6.3 Grant and seed-fund programme operator

An eligible organization/funder can create a programme with:
- sponsor identity and authority verification;
- programme objective, geography, sectors and beneficiary criteria;
- grant/seed budget, per-award min/max, available budget and funding source attestation;
- eligible and excluded business stages/types;
- required application questions and evidence;
- deadline, review stages, published scoring rubric and conflict-of-interest declarations;
- selection panel, independent reviewer assignment and decision reasons;
- award agreement/conditions, milestone schedule and disbursement evidence;
- monitoring, reporting, corrective action, closeout and unused-fund reconciliation.

Programme publication and award authority must be separate permissions. Reviewers must disclose conflicts and recuse themselves. The platform must not label a programme “funded” or “guaranteed” without verified sponsor and budget evidence.

### 6.4 Investor and financier discovery

Create structured investor/funder profiles with:
- organization identity and authority verification;
- investor/programme type and sectors;
- geography, ticket range, stage and instrument preferences;
- eligibility, exclusions, deadlines and typical diligence requirements;
- publicly shareable investment thesis or programme criteria;
- clear statement of whether the provider is a direct funder, intermediary, adviser or introducer.

Matching should explain why an opportunity is relevant (sector, stage, geography, amount, instrument, readiness gaps). It must not rank by hidden credit score or promise funding. The platform should record introduction consent, NDA/confidentiality state where applicable, data-room access grants and expiry, meetings, diligence questions, decision, terms and close status.

### 6.5 Due diligence, decisions and capital ledger

A finance/investment case should progress through:
`draft → submitted → eligibility_check → due_diligence → clarification → committee_decision → approved / declined / withdrawn`.

Approved grants/financing then use a distinct execution lifecycle:
`terms_issued → terms_accepted → conditions_pending → ready_to_disburse → partially_disbursed → fully_disbursed → monitoring → completed / cancelled / default_or_recovery`.

Record approved amount, actual tranche amounts, dates, destination/use-of-funds categories, conditions, proof of transfer or provider confirmation, beneficiary acknowledgement and reconciliation. Do not store full card/bank credentials. Do not mark funds as received solely because an administrator clicked “paid”; require a source-of-truth settlement/provider reference and beneficiary confirmation or independent verification as defined by the programme. Repayment schedules and arrears are enabled only for approved debt products and must not be simulated as real payments.

### 6.6 Investment and financial safety boundaries

- No open, unmoderated public solicitation of securities or pooled investment.
- No public “invest now” execution or matching that bypasses required eligibility, investor classification, legal disclosures or suitability rules.
- No custody of investor funds, escrow, payment routing or guarantee by MPA unless a separately approved licensed-provider architecture and legal review authorizes it.
- No public display of personal financial records, bank statements, tax files, identity documents, investor contact data or private business plans.
- Risk statements, fees, conflicts, commissions, referral compensation and intermediary status must be disclosed.
- Any paid intermediary/referral arrangement needs explicit terms, approval, audit and jurisdiction-specific legal review.
- Provide reporting/complaint channels, fraud flags, suspicious-offer escalation, suspension and appeal.
- Clearly distinguish “introduced”, “interested”, “approved”, “terms accepted”, “disbursed” and “capital independently confirmed”.

## 7. Partnerships, franchises, branches and regional expansion

### 7.1 Partner matching

Support explicit partner needs:
- co-founder with complementary skills;
- operating/management partner;
- local/regional branch operator;
- capital partner;
- technology/production partner;
- sales/marketing partner;
- supplier/manufacturer;
- distributor/agent/reseller;
- institutional or corporate partner;
- joint venture / consortium.

Capture desired contribution, decision rights, time commitment, territory, capital/asset contribution, risk allocation, governance and exit/termination expectations. Use private introductions and explicit acceptance. Preserve the existing Increment 6 collaboration workspace for agreed milestones and outcomes, but add typed partner-specific terms and due diligence.

### 7.2 Branch expansion project

A branch project should capture:
- target city/region and candidate site(s);
- demand/customer evidence and competitor/market assessment;
- lease/land/permit/utility assumptions and required approvals;
- fit-out, equipment, inventory, staffing and launch budget;
- operating partner/branch manager and authority;
- capital source, conditions and cash-flow forecast;
- planned opening date, dependencies and risk register;
- actual opening evidence and first-trading confirmation.

Outcomes: site secured, approvals obtained, equipment installed, staff recruited, branch opened, first sale, 3/6/12-month operating status and contribution to business performance.

### 7.3 Franchise lifecycle

For franchisors:
- evidence of an operating and replicable model;
- brand/IP rights and franchise authority;
- operating manual, training and support capacity;
- unit economics and disclosure materials;
- territories available, fees, royalties and ongoing obligations;
- franchisee qualification and review.

For franchisees:
- target geography, budget, experience, operating role and readiness;
- independent due diligence checklist;
- fee, royalty, minimum capital, fit-out and working-capital requirements;
- territory exclusivity and performance obligations;
- legal review and contract evidence.

Lifecycle: opportunity published → enquiry → qualification → disclosure/diligence → site/territory approval → terms negotiation → authorized agreement → setup → opening → ongoing performance. A listing is not a franchise grant and MPA does not certify commercial viability.

### 7.4 Distribution and regional market access

Support manufacturers, wholesalers and service providers to find:
- importers/exporters where legally permitted;
- regional distributors and wholesalers;
- retailers, agents, resellers and institutional buyers;
- logistics, warehousing and last-mile partners;
- local representatives and branch operators.

Capture territory, channel, product category, capacity, exclusivity, minimum sales, price/discount structure, service levels, stock/returns obligations, compliance and reporting. Outcomes include territories covered, active distributors, outlets onboarded, orders fulfilled, sales and repeat orders.

## 8. Customer discovery, product catalog and business-to-business marketplace

### 8.1 Verified catalog and discovery

Search/filter by category, product, use case, customer segment, price/quote status, capacity, minimum order, delivery lead time, region/territory, verification scope and supplier type. Provide comparison and saved lists. Use clear trust labels: business verified, listing reviewed, product evidence reviewed, owner supplied, and last revalidated.

### 8.2 Buyer interactions

Each catalog item should support:
- ask a product question;
- request a quotation (RFQ);
- request a sample/demo where offered;
- request a business meeting;
- discuss supply capacity and delivery;
- save/follow a business or product;
- submit a structured purchase/supplier inquiry.

RFQ fields: item/specification, quantity/unit, quality/standard, delivery location/date, packaging, budget/range if optional, payment/credit expectations, required documents and response deadline. Suppliers can ask clarification, submit a versioned quotation, revise/withdraw quote, and record acceptance/decline. Quote acceptance is not proof of payment or delivery; use a separately authorized purchase/order and fulfilment workflow if/when implemented.

### 8.3 Discussion and meeting rooms

Provide a private, request-scoped discussion thread for the buyer and seller/authorized representatives. Support message history, attachments through private-file controls, clarification, quote versions, meeting proposals, timezone-aware meeting confirmation and calendar invitation integrations where available. Additional participants require invitation and consent. No public comments on private negotiation records. Provide report/block/abuse controls and retention rules.

### 8.4 Lead and sales pipeline

Business owners need a compact CRM-like pipeline:
`new inquiry → qualified → meeting → quotation sent → negotiation → won / lost / not proceeding`.

Track lead source, product, customer segment, territory, next action, owner, expected value/range, conversion date and loss reason. Provide aggregates to the business owner only. Never equate impressions, views or saves with sales.

## 9. Business support, skills and knowledge exchange

Connect the existing mentorship and professional-services capabilities to specific business goals:
- business model validation and customer research;
- bookkeeping, accounting and cash-flow discipline;
- business plan and financial projection review;
- marketing, sales, branding and digital commerce;
- operations, procurement, quality and productivity;
- technology adoption and cybersecurity;
- legal, tax, licensing and governance referrals;
- export readiness, standards and logistics;
- franchise development and branch operations;
- investor readiness and grant application support.

The user requests an adviser/mentor for a defined outcome and receives a scoped plan, sessions, actions and completion feedback. Mentorship remains its own relationship and consent model; it is not reclassified as an investment or commercial contract. Pro-bono and community-benefit support must remain clearly distinguished from paid commercial services and approved Serve-Community programmes.

## 10. Shared lifecycle, permissions and data architecture

### 10.1 Proposed bounded domains and additive entities

Names are conceptual; exact schema names and relationships must be settled by the migration design after reviewing all current migrations and constraints.

| Domain | Proposed records / responsibility |
|---|---|
| Business growth | Business goal, growth plan, readiness assessment/version, performance snapshot/version, business plan/version, projection/scenario |
| Market research | Customer segment, demand evidence, target market, territory/market assessment |
| Capital programmes | Funder profile, funding programme, eligibility rule, application, application version, reviewer assignment, due-diligence checklist, decision, conflict declaration |
| Capital execution | Award/finance agreement reference, conditions, disbursement tranche, proof/confirmation, use-of-funds report, repayment schedule/payment reference where applicable |
| Investor matching | Investor mandate/profile, match explanation, introduction consent, data-room grant, meeting, diligence question and decision |
| Partnering | Partner opportunity, partner profile/need, qualification, proposal, consented participant, terms version, agreement reference |
| Expansion | Expansion project, branch/site, equipment requirement, asset quote, franchise opportunity/case, distribution territory/appointment |
| Commerce | Product/catalog item, variant, stock/capacity snapshot, RFQ, quotation/version, inquiry thread, meeting, order/fulfilment reference if approved |
| Outcomes | Outcome target, baseline, metric observation, evidence reference, verification event, attribution and follow-up review |
| Governance | Audit event, consent, moderation/review decision, dispute, complaint, retention classification and policy version |

Use canonical `app_user`, `person`, `organization`, `membership_record`, `organization_membership`, `network_plus_business`, `network_plus_business_ownership`, `network_plus_business_access`, private-file references and existing audit/notification infrastructure. Do not create a second person, member, organization or business table.

### 10.2 Role and authority matrix

Roles are capability-based and resource-scoped. A user may hold multiple roles, but receives only the explicit union of authorized capabilities.

- Business owner/co-owner: manage their business, invite owners subject to consent rules, manage catalog, requests, business plans and own performance data.
- Business delegate/manager: only explicitly assigned capabilities on a specific business, with expiry and revocation.
- Organization owner/administrator: act for the exact verified organization and its authorized businesses.
- Funder/programme owner: create/manage their own funding programme, criteria, budget attestation and awards within delegated authority.
- Programme reviewer: review assigned applications, declare conflicts and submit recommendations; cannot self-approve awards or disburse.
- Investment/finance provider: manage its verified profile, mandates and assigned cases; no access to unrelated cases.
- Independent reviewer/moderator: decide verification, moderation, complaints or disputes; cannot review their own business or cases where conflicted.
- MPA programme administrator: operational programme governance, not automatic power to approve a funder's disbursement.
- Auditor/monitor: read-only, time-bound, case-scoped access with reason and audit.
- Buyer/supplier/partner: access only their own inquiry, quote, meeting and accepted engagement records.

Sensitive actions (ownership transfer, finance decision, award, disbursement, change to terms, conflict override, dispute decision) require separation of duties and append-only audit.

### 10.3 Privacy, evidence and consent

Consent purposes are separate: directory discovery, business financial disclosure, investor introduction, data-room access, referral, buyer contact release, meeting participation, outcome publication and third-party verification. Store purpose, data categories, audience, version, actor, time and revocation. Public profiles never expose private evidence or financial data. Use private files, short-lived scoped access, least privilege, access logs and retention schedules. Never place sensitive data in push/email notification payloads.

### 10.4 Reliability and audit

All mutations use existing high-entropy idempotency and request-fingerprint patterns. State changes occur transactionally with audit events and deduplicated notifications. Store terms and application versions as immutable snapshots at submission/acceptance. Corrections create new versions; they do not rewrite the history of what a funder, buyer or partner reviewed.

## 11. Measurable outcomes and evidence model

### 11.1 Outcome hierarchy

**Activity** (profile, view, inquiry, application) → **qualified opportunity** (eligibility/need validated) → **commitment** (accepted quote, partner agreement, approved award) → **resource received** (capital/equipment/contract/market access confirmed) → **execution** (asset installed, branch opened, distributor active) → **economic result** (revenue, margin, productivity, jobs, customer and market growth).

Only later stages count as tangible economic outcomes. Report each stage separately.

### 11.2 Core KPI catalogue

| Outcome area | Measures | Evidence level |
|---|---|---|
| Start-up creation | Ideas validated, businesses formally launched, first customer/order, time from intake to first transaction | Self-reported → counterparty confirmed → independently verified |
| Finance access | Qualified applications, approval rate, approved value, amount actually disbursed, time to decision, use-of-funds completion | Programme decision + provider/beneficiary confirmation + source reference |
| Business growth | Revenue trend/range, gross margin trend, repeat customers, order value, capacity utilization | Baseline and follow-up snapshots with provenance |
| Employment | Jobs created/retained, FTE change, paid roles sustained at 3/6/12 months | Employer and worker/independent evidence under privacy controls |
| Equipment/assets | Assets financed/acquired, installed, operational, utilization and downtime | Invoice/asset record, delivery/installation evidence and owner confirmation |
| Branch expansion | Sites assessed, approved, opened, first trading date, branch survival at 6/12 months | Site/permit/lease evidence as appropriate, opening evidence and follow-up |
| Franchise | Qualified leads, franchise agreements, units opened and operating at 6/12 months | Authorized agreement and unit operating confirmation |
| Distribution/market | Territories reached, distributors appointed/active, outlets served, orders and repeat orders | Agreement, distributor confirmation and order/fulfilment evidence |
| Product commerce | Qualified inquiries, RFQs, quotes, quote acceptance, orders, fulfilled orders and repeat buyers | Buyer/seller confirmation and permitted transaction references |
| Partnerships | Partner matches, accepted proposals, active joint projects, deliverables and outcomes | Both-party confirmation and milestone/evidence records |
| Business capability | Readiness improvement, plans completed, advisory actions adopted, reporting quality | Versioned assessment and documented action/evidence |
| MPA programme performance | Cost per qualified application, award conversion, decision time, programme utilization, verified outcome rate | Audited programme operations and cohort reporting |

### 11.3 Evidence and attribution rules

Every metric stores:
- metric code, definition and unit;
- baseline, target, observed value and period;
- currency and conversion basis where relevant;
- source type and evidence reference;
- reporter and verification actor;
- evidence level: self-reported, counterparty-confirmed, provider-confirmed or independently verified;
- timestamp, review status, correction/version history and attribution confidence.

Do not add all programme funding to “member revenue”. Do not count a loan as revenue, an application as funding, an accepted quotation as a completed sale, a promised job as a created job, or an opened listing as a branch. Attribute outcomes to the relevant business/project and report contribution rather than claiming MPA caused every outcome. Aggregate reporting must protect small cohorts and suppress confidential details.

### 11.4 Follow-up and impact measurement

Capture a baseline before intervention where feasible; follow up at project completion and 3/6/12 months for relevant programmes. Track business survival, actual capital received, asset use, branch operation, sales/orders, jobs and repayment status only where the programme instrument requires it. Allow a business to decline public outcome publication while still providing required confidential programme reporting.

## 12. Administration and governance workspaces

Create a consolidated Network-Plus operations area with separate queues and permissions:
- business identity verification and revalidation;
- business/listing moderation;
- programme/funder verification;
- funding programme approval and publication;
- application eligibility and reviewer assignment;
- conflict-of-interest and committee decisions;
- award conditions and disbursement reconciliation;
- partner/franchise opportunity review;
- product catalog/RFQ abuse and listing quality;
- complaints, fraud reports, disputes, appeals and suspensions;
- outcome evidence verification and programme monitoring;
- retention, access audit and aggregate performance reporting.

Use two-person approval for high-risk programme publication, award, disbursement reconciliation override, policy changes and public impact claims. Reviewers must be independent from applicants, business owners and funder beneficiaries. All override actions require a reason and audit trail.

## 13. Phased delivery plan

Each phase is additive, feature-flagged, independently testable and gated. Sequence phases to deliver useful value without building a large untestable monolith.

### Phase 0 — Contract reconciliation and architecture audit
- Reconcile docs/58 seven-intent contract with docs/60 and the actual six-intent service implementation.
- Inspect all current Network-Plus migrations, API dispatchers, schemas, private file, notifications, permission catalogue, UI routes and test coverage at the live branch head before coding.
- Inventory existing Increment 5/6 unvalidated work and finish their disposable PostgreSQL, API, browser, keyboard and accessibility gates.
- Decide supported jurisdictions, regulated financial activities, programme authority, data retention and legal-review gates.
- Produce data dictionary, state diagrams, role matrix and compatibility plan.

**Exit:** no duplicate canonical entities; all existing routes and records have an owner/policy; open gaps and release blockers are explicit.

### Phase 1 — Complete Business Workspace and Catalog
- Deliver business owner onboarding, business dashboard, ownership/co-owner management and delegated team access.
- Deliver business verification submission, reviewer UI, moderation UI, revalidation, suspension and appeal.
- Deliver catalog creation/editing for products/services, media, availability, pricing, capacity and target markets.
- Deliver business discovery/search/detail and owner publication controls.
- Add product inquiry and RFQ foundation only after catalog permissions and request privacy are validated.

**Exit:** an eligible member can create and verify a business, publish an approved catalog item, receive a scoped inquiry and manage it end-to-end on desktop and mobile.

### Phase 2 — Business Growth Plans and Readiness
- Deliver goal-first onboarding and business journey dashboard.
- Add performance baseline, readiness assessment, business plan and projection versioning/export.
- Add goal-specific action plan and adviser/mentor referrals.
- Add evidence-backed targets and follow-up schedule.

**Exit:** a business can create a growth plan with baseline, target, owner, tasks, budget, evidence and measurable follow-up.

### Phase 3 — Market Access, Buyers and Suppliers
- Complete catalog search, saved items, buyer segments and territory targeting.
- Add structured RFQs, quote versions, buyer/seller discussion, meeting requests and lead pipeline.
- Add supplier qualification and order/fulfilment reference workflow only with clear terms and payment boundaries.
- Add product/distribution analytics based on qualified leads and confirmed transactions, not views.

**Exit:** a buyer can discover, inquire, request and compare quotations; a seller can respond, meet, track lead progression and confirm outcomes with both-party evidence.

### Phase 4 — Partner, Franchise, Branch and Distribution Growth
- Add partner/co-founder/operating partner opportunities and structured matching.
- Add branch expansion project, location readiness, budget, equipment and launch milestones.
- Add franchisor/franchisee profiles, territory and due diligence workflow.
- Add distributor/agent/representative search and appointment lifecycle.
- Extend collaboration workspace for project-specific milestones and evidence.

**Exit:** a business can complete a partner or expansion journey from discovery through authorized agreement to operational evidence.

### Phase 5 — Grants, Seed Funding and Finance Applications
- Add verified funder profiles and grant/seed-fund programme builder.
- Add application forms, eligibility, evidence checklist, reviewer assignments, conflict declarations, scoring rubric and decision history.
- Add award conditions, tranche schedule, disbursement reconciliation and beneficiary reporting.
- Add application progress and transparent status communication.

**Exit:** a funder can publish an approved programme, receive eligible applications, conduct independent review, make an auditable award and verify disbursement/outcomes without MPA taking custody of funds.

### Phase 6 — Investor and Financier Matching
- Add investor/finance-provider mandates and qualification.
- Add finance requests, explained matching, consented introductions, scoped data rooms and meetings.
- Add diligence questions, term versions, professional/legal review flags, decision and close status.
- Enable instrument-specific workflows only after jurisdictional legal approval.

**Exit:** a business and a qualified provider can complete a consented, auditable introduction and record an independently supported decision/transaction status without unapproved securities solicitation or custody.

### Phase 7 — Economic Outcomes, Reporting and Continuous Improvement
- Add baseline/target/actual metric ledger and evidence review.
- Add 3/6/12-month follow-ups, programme dashboards and cohort reporting.
- Add branch, equipment, finance, employment, market and franchise outcomes.
- Add independent verification sampling, correction/appeal and attribution confidence.
- Publish only approved, privacy-safe aggregate impact reports.

**Exit:** MPA can report how many businesses progressed, what resources were actually received, what expansions became operational and what economic outcomes were evidenced.

## 14. Cross-cutting acceptance and quality gates

### Product and usability
- Goal-first and progressive disclosure; no giant generic forms.
- Compact app-like desktop workspace and mobile-native responsive layouts.
- Keyboard-first navigation, semantic labels, visible focus, screen-reader announcements and WCAG AA contrast.
- Clear next action, responsible party, due date and status on every active case.
- Empty/loading/error/retry states; draft autosave and safe resume.
- Localized currency, timezone, geography and future multilingual-ready labels.

### Security and trust
- Server-side authorization on every read and mutation; never rely on hidden links or client role claims.
- Exact business/organization resource scope and current membership/assignment checks.
- No self-approval, self-moderation or conflicted reviewer decisions.
- Explicit consent for financial disclosure, introductions, meetings, evidence and outcome publication.
- Private evidence storage, access expiry, audit and retention policy.
- Rate limits, idempotency, replay conflict detection and transactional state changes.
- Fraud/complaint/suspension/appeal pathways.
- Legal and regulatory release gates for financing, investment, franchise, payments and consumer-facing commerce.

### Technical validation
- Migration compatibility against a disposable PostgreSQL database, including full ordered migration chain and rollback.
- Backend unit and integration tests for every role, state transition, idempotency conflict, privacy boundary and negative authorization case.
- API contract and schema tests.
- Playwright end-to-end tests for full user journeys, desktop/mobile, browser refresh, interrupted drafts and accessibility.
- Biome, TypeScript, production build and complete CI.
- Staging walkthrough with distinct member, organization, business owner, funder, reviewer, buyer and supplier accounts.
- No production migration, main-branch write, merge or deployment until separately authorized and all release gates pass.

## 15. Key end-to-end acceptance scenarios

1. Skilled member without capital: creates a skills-based business idea, finds a complementary co-founder, receives validation support, builds a plan, identifies an eligible seed programme and tracks the application.
2. Existing business seeking equipment: submits a performance baseline and equipment specification, receives supplier quotations, identifies eligible asset finance, records approval/disbursement and confirms installation/utilization.
3. Business opening a new branch: completes location/demand assessment, prepares project budget, matches a local operating partner, secures approved funding, tracks fit-out/staffing/opening and confirms first trading.
4. Business seeking franchise: discovers a franchisor, checks territory, reviews disclosure/due diligence, records authorized terms, completes setup and reports operating results.
5. Business seeking distributor: publishes verified products, selects target regions/customer segments, receives distributor inquiries, negotiates territory/terms and records active outlets/orders.
6. Funder running a seed programme: verifies sponsor, publishes eligibility and rubric, assigns independent reviewers, records conflicts, selects applicants, documents award conditions, reconciles tranches and monitors outcomes.
7. Investor exploring businesses: sets mandate and eligibility, sees only consented qualified opportunities, requests a meeting/data-room access, records diligence and decision; no unapproved public solicitation or payment custody.
8. Buyer requesting a quote: discovers a product, submits quantity/specification/delivery RFQ, receives versioned quote, requests meeting, accepts or declines and both parties confirm fulfilment outcome.
9. Jointly owned business: co-owners explicitly accept ownership, delegate listing/request tasks, revoke a delegate and retain historical actions without cross-business access.
10. Reviewer conflict: an owner or conflicted reviewer cannot approve their own business/application; the system requires recusal and independent reassignment.
11. Confidentiality: a funder sees only consented application evidence; a buyer cannot access another buyer's quote; public catalog never reveals private financials or identity documents.
12. Outcome verification: a business reports a branch opened and jobs created; MPA records source/evidence, counterparty confirmation and independent verification separately, and only approved metrics enter aggregate reporting.

## 16. Non-goals and explicit exclusions

- Replacing the canonical membership, talent, organization, mentorship, Jobs or Serve-Community systems.
- Automatically converting old service listings, volunteer commitments, donations or community grants into commercial business records.
- Treating views, clicks, likes, saved listings or unqualified inquiries as economic success.
- Promising funding, returns, creditworthiness, franchise success or business viability.
- Holding, routing, guaranteeing or investing funds on behalf of users without a separately approved licensed-provider and legal architecture.
- Publishing confidential business plans, financial statements, personal contacts or due-diligence evidence.
- Using an opaque AI score as the sole basis for eligibility, funding or partner selection.

## 17. Implementation governance and change control

This document is a transformation plan only. It does not authorize feature coding, production migration, PR merge, deployment, policy activation, public financing solicitation or fund custody. Before implementation begins, the product owner should approve the scope and the legal/compliance boundary. Each phase should then have its own implementation record, additive migration review, acceptance scenarios and evidence-based exit report.

**Recommended product north star:** businesses that become more capable, better connected to markets and resources, and demonstrably stronger — not merely more visible on a professional network.
