# Network-Plus — Economic Connections & Opportunity Exchange

**Repository:** `mpaproject1/MPA-Professionals-Network`  
**Branch:** `feat/workstream-3-progress-members-workspace`  
**PR:** #18  
**Status:** Revised product requirements and architecture plan. Phase 0 contract-alignment changes are implemented on this branch; Phase 1 and later feature work remain separate. No production migration, merge or deployment is authorized.

## 1. Product mandate

Network-Plus is an **economic connection platform**, not a business management system, transaction platform, online shop, CRM, investment execution platform or project-management tool.

Its purpose is to help members, businesses, professionals, organizations, funders, buyers, suppliers, investors and potential partners discover one another and make meaningful contact around a clearly expressed need or offer. Negotiation, due diligence, contracting, payment, delivery, mentoring sessions, investment execution, franchise operations and other real-world work normally take place directly between the parties, outside Network-Plus.

The system helps users:
1. Explain a business need, opportunity, offer or support request in a structured, understandable way.
2. Discover relevant people, businesses, organizations, products, services, programmes and opportunities.
3. Express interest and initiate a purposeful connection.
4. Obtain consent before personal/business contact details are disclosed.
5. Let the parties decide whether to exchange contact details, request a quotation or arrange a meeting.
6. Record only the connection disposition and the requester's concise outcome/remark.
7. Keep a simple record of each request so its initiator can mark it **In progress**, **Completed** or **Cancelled**, with a short remark.

**The system records the connection outcome, not the deal.** It must not require users to enter negotiations, contract terms, payment schedules, delivery milestones, investment tranches, operational KPIs or every step of a business relationship.

North star: **more meaningful, consent-based connections that help members access skills, resources, finance, partners and markets.**

## 2. Firm product boundaries

### Network-Plus does
- Publish and discover structured business needs, support requests, opportunities, business profiles, product/service catalogs and provider/programme profiles.
- Match through category, geography, capability, sector, stage, amount/range, customer segment and other appropriate filters.
- Provide a lightweight interest/request-to-connect workflow.
- Support mutual consent for contact-detail exchange.
- Support a request for a meeting, with a proposed/confirmed time and place or direct-contact handoff.
- Let parties ask for a quotation or provide a quotation response as a connection artefact where useful; commercial negotiation itself happens outside the platform.
- Keep an initiator's requests in a personal **My Requests** list (the user's demand cart / connection inbox).
- Require a simple closure disposition and short remark for each initiated request.
- Notify parties of new interest, consent decisions and status changes.
- Provide aggregate counts of connection activity and self-reported connection outcomes, clearly labelled as self-reported.

### Network-Plus does not
- Sell products/services, host checkout, process orders, collect payments or act as escrow.
- Operate a full marketplace, auction, procurement system or merchant inventory system.
- Run negotiations, contract execution, invoicing, fulfilment, delivery or returns.
- Administer loans, investments, grant disbursements, repayments, securities or fund custody.
- Manage franchise operations, branch implementation, construction, staffing or equipment installation.
- Replace email, phone, messaging, meetings, professional advisers or parties' own business systems.
- Track detailed deal stages, every milestone, financial performance, sales, business operations or the lifecycle of an external agreement.
- Claim an economic impact is independently verified merely because a user marks a request completed.

Any regulated activity or payment functionality requires a separate product decision, legal review and architecture approval; it is outside this scope.

## 3. Repository architecture — preserve and simplify

Inspection of the specified branch identified foundations to reuse:
- `src/platform/network-plus-access.js` and the Network-Plus access guard.
- Existing member/talent and organization discovery.
- `src/network-plus/business-discovery.js` and Increment 5 business identity, ownership, verification, business profile and listing model.
- `src/network-plus/request-collaboration.js` and Increment 6 typed requests, consent, acceptance, notifications, audit and collaboration records.
- Existing organization membership and scoped business capabilities.
- Existing private-file, moderation, notification and audit infrastructure.
- Existing mentorship, professional services and Serve-Community domains, retaining their distinct purposes.

### Architecture corrections
1. Reuse the business identity and listing domain. Do not create another business registry.
2. Reuse the typed request foundation, but simplify the user-facing model to a **connection request** and a small, consistent set of disposition states.
3. Reconcile the mismatch between the seven intents described in the Increment 4 design and the six intents implemented in the Increment 6 service. Add missing intents only where needed for the taxonomy below.
4. Do not make the collaboration workspace mandatory for every connection. It may remain optional for users who explicitly want a shared work area.
5. Do not introduce business performance ledgers, financial projection engines, investor pipelines, deal rooms, order fulfilment, disbursement ledgers or milestone tracking as part of this product.
6. Complete existing Increment 5/6 validation and security gates before extending the feature. Source files/migrations do not prove that all journeys are implemented or production-ready.

## 4. Need and opportunity taxonomy

A person or organization can publish a **Need**, an **Offer**, or both. Start with a category and ask only relevant fields. Use structured fields to improve discovery, plus a clear free-text description.

### A. Business start-up and development
- Business idea validation / feasibility advice.
- Co-founder or founding-team member.
- Business partner / joint-venture partner.
- Technical, operational or management expertise.
- Business plan or financial projection assistance.
- Registration, licensing, accounting, tax or legal referral.
- Mentorship, coaching or professional advice.
- Training, knowledge sharing or business clinics.
- Incubation, acceleration or enterprise-support programme.
- General start-up support.

### B. Finance and resource support
- Seed funding / grant support.
- Business financing / working capital.
- Equipment or machinery support.
- Material, raw-material or inventory support.
- Premises, workspace, land or facility support.
- In-kind contribution or donated business resources.
- Investor / financier seeking suitable businesses.
- Organization offering a grant, seed fund or business-support programme.
- Finance-readiness or funding-application assistance.

### C. Growth and expansion
- Scale existing production or service capacity.
- Open a new branch / regional office / outlet.
- Find a local operating partner or branch manager.
- Acquire equipment, technology or productive assets.
- Find a new supplier or manufacturer.
- Expand to a new customer segment or geographic market.
- Find a distributor, wholesaler, agent, reseller or representative.
- Export / import / market-entry support.
- Franchise opportunity sought.
- Franchise partner / franchisee sought.
- Franchise development expertise.
- Business acquisition or succession interest, subject to legal review.

### D. Products, services and market connections
- Publish a business profile and product/service catalog for discovery.
- Find potential buyers, customers or institutional clients.
- Find suppliers, manufacturers or service providers.
- Ask a product/service question.
- Request a quotation (RFQ).
- Offer to provide a quotation.
- Request a meeting or product demonstration.
- Find a distribution or sales channel.
- Find a commercial or institutional partner.

### E. Organization and community economic opportunities
- Organization seeks a provider, supplier, consultant or local partner.
- Organization offers a business-support programme or seed-fund opportunity.
- Organization seeks eligible businesses for a programme.
- Organization seeks trainers, mentors or technical experts.
- Organization seeks distributors, regional representatives or implementation partners.

Community volunteering and donations remain in Serve-Community unless the request is genuinely a commercial/business opportunity.

## 5. Structured listing design

Each Need or Offer contains only enough information to make discovery and first contact useful.

Common fields:
- title, short summary, category/type and detailed description;
- what kind of response is sought;
- publisher (person/business/organization);
- location, preferred regions and remote/in-person preference;
- sector, expertise, customer segment or target market as relevant;
- visibility and eligibility;
- response preference: contact exchange, ask a question, request a quote or request a meeting;
- optional attachments/links with privacy controls;
- status: draft, published, paused, closed, expired or removed;
- created/updated date and optional expiry.

Category-specific optional fields:
- **Finance/resource need:** amount/range, currency, intended use, preferred support type and broad eligibility/context. No bank details or public sensitive financial records.
- **Equipment/material:** type/specification, quantity, location and whether seeking purchase, lease, donation or supplier introduction.
- **Partner/co-founder:** skills, experience, contribution sought, geography, time commitment and preferred involvement.
- **Branch/expansion:** target region, type of support/partner sought, optional broad budget range and market context.
- **Franchise/distribution:** territory, product/sector, role sought/offered and broad qualification criteria.
- **Product/service catalog:** description, images, specifications, indicative price or quote-required, capacity/availability statement, target customer, service/delivery area and business contact preference.
- **Mentorship:** subject, desired experience, format, language, location/remote preference and availability.

Avoid collecting detailed business plans or sensitive financial evidence by default. If a user chooses to share a document with a specific interested party, require explicit scoped consent and secure access.

A catalog is a **discovery profile**, not an online shop. It may describe products, indicative prices or price-on-request, specifications, capacity, minimum order, delivery areas and contact preferences. No checkout, cart of goods, order acceptance, inventory reservation or payment is provided.

## 6. Lightweight connection workflow

### 6.1 Initiating interest
Every published need, offer, business profile or catalog item has a clear **I'm interested / Connect** action. The short contextual request asks:
- What are you interested in?
- What do you want to discuss or offer?
- Optional short message/question.
- Desired next step: ask a question; request/provide a quotation; exchange contact details; request a meeting; discuss a potential partnership/support opportunity.

Additional fields appear only when relevant (e.g. quantity/specification for an RFQ or target region for distribution). Do not require a long application for an ordinary introduction.

### 6.2 Consent-controlled contact exchange
Contact details are private by default. An expression of interest does not automatically disclose either party's phone, email or other private details.

1. A sends interest/request and selects the desired connection method.
2. B receives a notification and can accept, decline, ask a question or propose a different next step.
3. If contact exchange is selected, each party separately consents to release the specified contact fields.
4. Only fields explicitly authorized by each party are revealed.
5. If one party does not consent, details remain hidden. The parties may use a limited in-platform exchange or decline.
6. Record that contact exchange was consented to and made available; do not monitor subsequent phone calls, email or messaging.

The consent screen names the exact fields (e.g. business email, phone, public business address). Consent is purpose-specific, revocable for future access and audited. Public business contacts intentionally published by the owner remain visible according to listing settings.

### 6.3 Question, quotation and meeting
- **Question:** concise question and response to clarify interest; no full discussion platform required.
- **Quotation:** buyer may request a quote and optionally provide specification, quantity and delivery location. Provider may respond with a quote summary or indicate they will contact the requester. Negotiation, quote acceptance, contract and order happen directly between parties. Record only that a quote was requested/offered and the connection disposition.
- **Meeting:** a party requests a meeting; the other accepts, declines or proposes another time/place. Record agreed details only after both confirm. A physical place may be a public address or mutually agreed venue; online details may be exchanged by consent. The platform does not manage the meeting or its outcome.
- **Direct handoff:** after consent, parties deal with one another outside the platform.

No checkout, purchase order, contract signing, payment, escrow or delivery workflow.

### 6.4 Decline and no response
Recipient can decline with optional reason. Requester can withdraw. Expired/unanswered requests can be closed by requester; reminders should be sparing. No one is forced into contact or has private details exposed because another user expressed interest.

## 7. My Requests — demand cart / connection register

Implement the user's “demand cart” as **My Requests** (or **My Connections**), not as a shopping cart. It is the durable personal list of connection requests initiated by the user across Network-Plus categories.

Every time a user sends a connect request, asks a question, requests a quote or meeting, or applies to contact an offer, a request record is automatically saved in My Requests. Saving a listing as a favourite does not create a request; favourites and submitted requests remain distinct.

Each request card shows only:
- need/offer and other party;
- request type and date;
- response/consent state;
- contact/meeting/quote handoff state where relevant;
- requester's outcome status;
- last short remark and update date;
- one action to review/update/close.

### 7.1 Required disposition
The requester must be able to mark every initiated request:
- **In progress** — connection made or requester is still pursuing it; does not imply a contract or work inside Network-Plus.
- **Completed** — requester considers the purpose of the connection achieved or concluded (e.g. useful advice received, contact exchanged, meeting held, quotation received, partner identified, finance/support connection made, supplier/customer connected). This does not assert a sale, investment, financing or contract was executed.
- **Cancelled** — requester no longer wishes to pursue it, need changed, no suitable connection was made, other party declined, or request is no longer relevant.

Require a short closing remark when marking Completed or Cancelled. Optional outcome category examples:
- contact exchanged;
- meeting arranged/held;
- quotation received;
- mentor/support connected;
- partner identified;
- funding/support contact made;
- supplier/buyer connected;
- no suitable match;
- need withdrawn;
- other.

Example remarks:
- “Contact exchanged; we will discuss directly.”
- “Meeting arranged at Bole, Addis Ababa.”
- “Received the quotation; follow-up is outside the platform.”
- “Connected with a mentor; support arranged directly.”
- “Found a suitable regional distributor.”
- “No suitable partner found.”
- “Need withdrawn; funding no longer required.”

Do not require amounts, contract copies, payment proofs, revenue, detailed milestones or private negotiation information. Allow “prefer not to disclose details”.

### 7.2 System enforcement without over-tracking
- Every submitted request appears in My Requests and cannot disappear because a listing is later paused or removed.
- Show open requests (awaiting response or in progress) prominently.
- Prompt requester to review older unanswered/in-progress requests at a reasonable interval.
- When requester closes a request, require status plus short remark; do not silently auto-complete.
- Recipient decline/withdrawal is recorded as recipient-side response; initiator chooses own disposition (e.g. Cancelled, “recipient declined”).
- A request may be reopened by initiator with a new remark; preserve previous closure event.
- Do not make Completed dependent on recipient confirming a commercial deal. Other party may optionally confirm only that contact was made, not private deal details.
- Distinguish platform-generated facts from user-reported outcomes.

### 7.3 Example: product discovery to contact handoff
1. Business X publishes a product listing with specifications, location, indicative price or “request quotation”, and contact preference.
2. Member Y selects **I'm interested**.
3. If Y has a question, Y sends it. If Y needs a quote, Y optionally supplies quantity/specification/location. If details are clear, Y requests contact or a meeting directly.
4. X accepts, declines, asks a question, responds to the quote request or proposes a meeting.
5. If contact details are to be shared, X and Y each consent to specific fields. The system releases only approved details.
6. If they prefer a meeting, they agree a time/place; the system records mutually confirmed meeting information.
7. X and Y conduct quotation discussion, negotiation, sale, contract, payment and delivery outside Network-Plus.
8. Y's request remains in My Requests. Y later marks In progress, Completed or Cancelled with a short remark (e.g. “Quotation received; negotiating directly”).
9. Platform records connection events and Y's self-reported disposition, not the transaction.

## 8. Same connection pattern across all business needs

| Need | What requester publishes | Interested party action | What Network-Plus records |
|---|---|---|---|
| Mentorship | Topic, experience sought, preferred format | Offers support / requests introduction | Interest, acceptance, contact consent, requester disposition |
| Finance support | Type, amount/range, purpose, broad eligibility | Funder/financier expresses interest or requests contact | Introduction and consent; requester marks outcome |
| Grant/seed support | Programme, eligibility, deadline, sponsor | Business expresses interest / asks to connect | Application/connection receipt and outcome remark; no disbursement tracking |
| Material/equipment | Specification, quantity, location, support type | Supplier/donor offers help or asks for details | Connection, quote/contact handoff, requester disposition |
| Co-founder | Skills, role, contribution and stage | Candidate expresses interest | Mutual interest/contact consent and outcome remark |
| Business partner | Contribution, role, geography and purpose | Potential partner responds | Introduction/meeting handoff and outcome remark |
| Investment | Business seeking investor or investor seeking opportunities | Expresses interest and requests consented introduction | Connection only, subject to legal boundaries; no execution ledger |
| Financing | Finance need and broad parameters | Eligible provider asks to connect | Consent-based introduction; no loan/repayment system |
| Scaling | Growth need and support sought | Adviser, partner or provider offers assistance | Contact/meeting handoff and requester disposition |
| New branch | Target location and partner/resource sought | Regional operator, landlord, supplier or financier responds | Connection and optional meeting details |
| Franchise | Franchisee/franchisor interest, territory and criteria | Interested party requests details/contact | Introduction and outcome remark; no franchise contract/operations |
| Distribution | Product, target territory/channel and distributor sought | Distributor/agent expresses interest | Contact exchange/meeting and outcome remark |
| Product/service | Catalog description and target customers | Buyer asks, requests quote or meeting | Inquiry/quote request and connection disposition; no sale processing |
| Supplier | Supply need and basic specifications | Supplier responds or quotes | Quote/contact handoff and requester disposition |
| Business plan support | Advice sought | Qualified adviser offers assistance | Introduction and outcome remark |

For financing, investment, grants, franchise and other regulated/high-risk categories, listings and introductions must comply with applicable law and platform policy. Network-Plus does not endorse an offer, guarantee a return or certify a provider merely by allowing a listing. Apply appropriate identity/business verification, moderation, warnings and reporting.

## 9. Outcome model — measure connections, not deals

### Platform-observed events
- need/offer published, paused or closed;
- interest/request sent;
- recipient accepted, declined or asked for clarification;
- contact details consented to and released;
- quotation requested or response indicated;
- meeting proposed, accepted or declined;
- requester changed status to In progress, Completed or Cancelled.

### Requester-reported outcome
At closure capture:
- final status: Completed or Cancelled;
- optional outcome category;
- required short remark;
- closure date.

These are self-reported unless the other party separately confirms a limited fact. Do not call them independently verified economic impacts.

### Useful aggregate measures
- published needs/offers by category and region;
- unique interested parties and response rate;
- accepted connections and mutual contact-consent rate;
- questions, quote requests and meeting requests;
- requests marked In progress, Completed and Cancelled;
- completion/cancellation rate by category;
- common reasons for no connection;
- median time to first response and requester closure;
- repeat connections and cross-region introductions.

Use privacy-safe aggregates and suppress small cohorts. Views, impressions and favourites are discovery signals, not connection outcomes. A “completed connection” is not a completed sale, financed business, opened branch or created job.

## 10. Minimal data model and separate states

Finalize exact table/column names only after reviewing current migrations and avoiding duplication. Reuse canonical user, organization, business, listing, request, consent, notification and audit records.

Conceptual records:
- **Need/Offer listing:** publisher, type/category, description, relevant structured fields, geography, visibility, expiry and publication state.
- **Connection request:** listing reference (or direct member/business target), initiator, recipient, request type, short message, response state and timestamps.
- **Contact consent:** parties, specific contact fields, purpose, consent state, time and revocation.
- **Connection handoff:** optional quote-request summary, meeting proposal/confirmation or contact-release event; avoid storing private negotiation content.
- **Request disposition:** initiator, status (In progress / Completed / Cancelled), optional outcome category, required closing remark and timestamp.
- **Audit/notification events:** immutable platform-observed actions and deduplicated notifications.

Keep lifecycles separate:

**Listing:** Draft → Published ↔ Paused → Closed / Expired / Removed.

**Connection request:** Sent → Accepted / Declined / Withdrawn / Expired. Clarification/counterproposal may occur without a deal workflow.

**Contact consent:** Not requested → Awaiting each party's consent → Shared (only mutually authorized fields) / Declined / Revoked.

**Requester disposition:** In progress → Completed / Cancelled. Reopen only through explicit user action, preserving history.

Do not merge these lifecycles into one status field. Recipient can accept while initiator's request remains In progress. Contact can be shared while requester later cancels. Listing can close while historical requests remain accessible to their participants.

## 11. Permissions, privacy and trust

- Private requests visible only to participants and authorized scoped administrators.
- Listing visibility and contact-detail visibility are separate.
- Viewing a listing or sending interest never reveals a private phone/email.
- Contact exchange requires explicit, field-specific consent from the information owner.
- Organization/business representatives need current scoped authority to respond or disclose organizational contacts.
- No public exposure of financial statements, identity documents, business plans or private attachments.
- Verification labels state exactly what was reviewed; verified business does not mean every product, price, claim, finance offer or investment is verified.
- Provide report/block, abuse handling, duplicate/spam prevention, rate limits and appeal.
- High-risk offers need category-specific disclosures and review; no guarantee or implied endorsement.
- Keep audit events for consent and administrative action, not surveillance of off-platform conversations.

## 12. UI/UX direction — a professional opportunity mall, delivered as an app

### 12.1 Experience concept and design principle

Network-Plus should feel like entering a well-organized, modern professional business centre or curated opportunity mall: users can browse distinct “spaces” for needs, offers, products, services, finance, expertise, partners and growth opportunities, quickly recognize what is relevant, open a focused detail view and make a purposeful connection.

This is a **discovery and connection experience**, not an e-commerce mall. The visual metaphor is for orientation, browsing and discovery only. Do not introduce shopping carts, checkout, order placement, product purchase flows, payment, inventory reservation or transaction tracking. “My Requests” remains a personal connection register, not a basket of goods.

The interface must feel like a **minimal, modern desktop/mobile app**, not a conventional content-heavy website or a collection of long web forms. Prioritize:
- visual discovery over paragraphs of explanatory text;
- recognizable category tiles, icons, photography/illustration and concise listing cards;
- clear hierarchy, compact navigation and focused work surfaces;
- one obvious next action at a time;
- structured choices and filters over unrestricted free-text fields;
- progressive disclosure from broad intent to specific detail;
- continuity: users can pause, leave and resume without losing their work.

Use the MPA product design system and established brand tokens. Maintain a calm, professional visual language: consistent iconography, restrained color, strong spacing, clear status indicators and high-quality responsive layouts. Avoid a playful consumer-shopping aesthetic, excessive gradients, dense dashboards, decorative gamification or a marketing-site hero layout.

### 12.2 App shell and information architecture

Use a compact app shell with persistent, predictable navigation. Avoid duplicating the same destination in multiple navigation systems.

Primary destinations:
- **Discover** — browse the opportunity mall and search across needs, offers, businesses, products, services and programmes.
- **Needs & Offers** — publish, edit, pause and manage the user's own listings.
- **My Requests** — follow initiated connections and update their simple disposition.
- **Saved** — bookmark listings for later; saved items are not requests.
- **Notifications** — responses, consent decisions, meeting proposals and reminders.
- **My Profile / Business** — identity, business representation, visibility and contact-sharing preferences.

The Discover landing surface should open with a compact search field and a clear prompt such as **“What are you looking for?”** and **“What can you offer?”**. Present a browsable visual category shelf rather than a long list of links.

Suggested category spaces:
- Start a business
- Find finance & resources
- Grow or expand
- Find partners & co-founders
- Products & services
- Suppliers & distribution
- Grants & programmes
- Skills, advice & mentorship

Category labels and grouping must come from the canonical taxonomy in Section 4. Do not create duplicate taxonomies for separate screens.

### 12.3 Opportunity mall browsing and discovery

Make browsing feel like exploring a curated professional directory:
- Category spaces use distinct but consistent icons and subtle visual identities.
- Feature relevant opportunities in compact cards with a clear title, publisher identity, location, category, a few key structured attributes and a visible verification/eligibility label where applicable.
- Use product/service imagery where it improves recognition; never make imagery a substitute for specifications or accessible text.
- Provide search, filters and sort controls that can be combined without losing the user's place.
- Offer useful filter chips such as category, location/region, remote/in-person, sector, support type, amount range (where appropriate), expertise and recently added.
- Show useful empty states with a next action (change filters, explore a related category or publish a need); do not show dead ends.
- Use progressive loading or pagination appropriate to the existing stack; do not load an unbounded catalog.
- Keep the user's current category, query and filters when returning from a listing detail.
- Clearly distinguish **Need**, **Offer**, **Opportunity**, **Business**, and **Product/Service**. Never imply that a listing is endorsed, guaranteed or independently verified beyond the exact verification shown.

A listing detail should read as a concise opportunity profile, not a long landing page. Put the most decision-useful information first, then expandable sections for specifications, eligibility, publisher details and optional attachments. Keep the primary action visible: **I'm interested / Connect**. Secondary actions may include Save and Report.

### 12.4 Guided creation — broad choice first, specific details later

Publishing a Need or Offer must be a guided, step-by-step experience, not one large form.

The journey starts with a broad, plain-language choice:
1. **What would you like to do?** — I need something / I can offer something.
2. **What area is it about?** — choose a broad category (e.g. start-up, finance, equipment, partner, growth, product/service, supplier, expertise).
3. **What specifically do you need or offer?** — reveal the relevant subcategories based on the previous choice.
4. **Who or what are you looking for?** — select the target person/provider/organization or audience where relevant.
5. **Where does it apply?** — choose location/region and remote, in-person or either.
6. **What are the key details?** — show only the structured fields required for that selected type.
7. **How should interested people respond?** — question, quotation, contact exchange or meeting.
8. **Review and publish** — show a compact preview and visibility summary before publication.

The sequence is adaptive: skip irrelevant steps, combine very short steps when appropriate and never force every user through all eight screens. A user publishing a simple product/service offer should not see finance or co-founder fields. A user looking for a mentor should not see equipment quantity. Ask only for data that improves matching, eligibility, trust or first contact.

### 12.5 Structured input first; free text only where it adds meaning

The platform needs consistent data for matching, reporting and analysis. Therefore:
- Prefer single-select, multi-select, searchable reference lists, range controls, location selectors, toggles and date pickers over unrestricted text boxes.
- Use canonical category/subcategory values, sector lists, geography hierarchy, support types, skills, experience bands and response preferences.
- Use controlled units and currencies for amounts, quantities and capacity; store normalized values and display localized labels.
- Use structured options for common reasons, outcomes, meeting preferences, contact methods and cancellation/decline reasons.
- Provide “Other” only when necessary; if selected, reveal a short supporting field and retain the canonical parent category.
- Use free text for a concise title (when not generated), a short context/message, an optional description and closure remarks. Give clear character guidance and sensible limits.
- Never require a long narrative to submit an ordinary listing or connection request.
- Avoid asking the same question in multiple steps. Reuse values already provided and let users edit them from the review screen.
- Use conditional validation and explain errors beside the relevant control; preserve entered values after validation failures.

Where possible, generate a readable summary from structured answers (for example, “Looking for an equipment supplier in Addis Ababa; small production machinery; quotation or direct contact”). Let the user edit the short summary without forcing them to rewrite the structured data.

This is not a requirement to eliminate all text. It is a requirement to make structured data the default and free text the exception, so reports and matching are comparable across users.

### 12.6 One focused step at a time — progressive disclosure

At any point in a guided flow, show the current task and only the fields needed to complete it. Hide unrelated steps and fields until their parent choice makes them relevant.

Each step should include:
- a short question as the heading;
- a one-line explanation only when needed;
- a small set of clear selectable options or a compact control;
- a visible **Back** action and a clear **Continue** action;
- a discreet progress indicator (e.g. “Step 2 of 5”) and a meaningful step label;
- a clear indication when a step is optional.

Do not render the entire form with disabled, hidden-looking or collapsed sections. Do not make users scroll through a long form to discover what comes next. On mobile, keep the active task comfortably within the viewport where practical; on desktop, use a compact centered work area or side-by-side preview only when it helps the task.

The user must always understand:
- what decision is being made now;
- why the information is requested;
- what happens next;
- whether the information is private, shared with selected parties or public.

### 12.7 Lightweight gamification — progress, confidence and completion

Use gentle, task-oriented gamification to make the process encouraging without turning professional networking into a game.

Suitable patterns:
- step progress with a clear sense of advancement;
- small completion indicators for required sections;
- positive confirmation when a useful profile/listing is ready to publish;
- optional profile/listing completeness guidance;
- contextual suggestions such as “Add a service area to help nearby businesses find you”;
- a clear completion state and next useful action after publishing or sending a request.

Do not use points, leaderboards, streak pressure, public rankings, random rewards, manipulative urgency or badges that imply trust/verification. Never reward users for exposing more personal data, sending more requests or sharing contact details. Completion indicators must reflect useful information quality, not popularity or commercial success.

### 12.8 Save draft, autosave and resume exactly where the user left

Every multi-step listing creation/edit flow must support persistent drafts:
- Create a draft as soon as the user begins a publish flow, with an appropriate draft identifier and owner.
- Autosave changes after a short debounce and when moving between steps; also save on explicit **Save and exit**.
- Show a quiet save state such as **Saving…**, **Saved**, or **Couldn't save — retry**. Never imply that unsaved data is saved.
- Persist the current step, selected category/subcategory, structured answers, optional text, attachment references and relevant UI progress.
- When the user returns, offer **Continue draft** and reopen the same draft at the last completed/current step with previous answers restored.
- Support multiple drafts and make their category, last-updated time and status easy to recognize.
- Allow the user to discard a draft with a clear confirmation. Do not silently delete drafts on navigation, logout or browser refresh.
- Handle expired sessions, network interruptions and concurrent edits safely. Do not overwrite newer data silently; provide recovery or conflict guidance.
- Drafts remain private to their owner and are never discoverable or notified to potential recipients before publication.
- Draft state is distinct from Published, Paused, Closed and Expired listing states.

Connection requests should also preserve entered content if the user navigates backward or encounters a validation/network error. Do not create a submitted request or notify the recipient until the user confirms the final send action. If a draft connection is supported, label it clearly as unsent.

### 12.9 Connection initiation should be short and contextual

The **I'm interested / Connect** action should open a focused, contextual mini-flow:
1. Choose the reason/intent from relevant structured options.
2. Choose the desired next step (ask a question, request a quote, exchange contact details or request a meeting).
3. Add a short optional message or only the category-specific details needed.
4. Review what will be sent and who can see it.
5. Confirm **Send request**.

Do not ask the requester to re-enter listing information already known to the system. Do not expose private contact details at this stage. Keep the bilateral, field-specific consent workflow from Section 6.2 separate and explicit.

### 12.10 My Requests as a compact personal connection shelf

My Requests should feel like a tidy personal tray of active introductions, not a CRM pipeline or project board.

Use compact cards with:
- listing/opportunity title and publisher;
- request intent and date;
- a small, plain-language response/consent indicator;
- requester disposition: In progress, Completed or Cancelled;
- one contextual next action.

Default to open items and useful attention cues (awaiting response, consent decision needed, meeting proposal received, or requester review due). Provide filters for All, Awaiting response, In progress, Completed and Cancelled. Keep historical requests searchable and accessible without crowding the default view.

Do not add kanban columns, task assignments, milestone timelines, deal values, pipeline forecasts, transaction stages or performance dashboards. The three requester disposition states remain exactly as defined in Section 7.

### 12.11 Responsive app interaction and visual behavior

- Desktop: compact navigation rail/sidebar, restrained top bar, useful search, content-first discovery grid and focused detail/work surfaces. Do not stretch forms and cards across the full screen without purpose.
- Mobile: touch-friendly navigation, cards and controls; one primary action per screen; safe-area-aware layouts; no hover-only information or actions.
- Use consistent iconography and status treatments. Icons always have accessible labels where meaning is not obvious.
- Use subtle transitions for navigation, step changes, card selection and save confirmation. Respect reduced-motion preferences.
- Use skeletons or calm loading states; avoid layout shifts and blocking full-screen spinners for small operations.
- Support keyboard navigation, visible focus, semantic headings, accessible names, sufficient contrast, screen readers and error announcements.
- Maintain clear empty, loading, success, error, offline and permission-denied states.
- Preserve the user's scroll position and browsing context when opening/closing details or returning from a request.

### 12.12 Reporting and analytics quality by design

Structured inputs are a product requirement, not merely a UI preference. The UI must capture consistent dimensions so reporting can answer questions across categories and regions without manually interpreting long descriptions.

Define and reuse canonical values for:
- listing type, category and subcategory;
- sector and business stage;
- geography and service area;
- need/offer and support type;
- amount/currency and quantity/unit where relevant;
- target role, skill and experience;
- response preference and connection intent;
- recipient response, contact-consent state and meeting handoff state;
- requester disposition and standardized closure reason.

Keep optional narrative separate from these dimensions. Do not infer structured outcomes from free-text remarks. Report platform-observed events separately from self-reported status and remarks, as required by Section 9. Build filters and aggregate reports from canonical fields, with privacy-safe aggregation and small-cohort suppression.

### 12.13 UX acceptance criteria

The UI/UX is acceptable only when:
1. A new user can understand the main opportunity categories without reading a long explanation.
2. A user can begin with a broad need/offer choice and reach relevant specific fields without seeing unrelated fields.
3. Common listing and connection flows use structured options first and short text only where useful.
4. Users see one focused step at a time, with clear progress, Back and Continue controls.
5. A user can leave a multi-step draft, return later and resume at the same step with all saved answers restored.
6. Save state is honest and recoverable after network/session interruptions.
7. A listing can be browsed as a professional opportunity card and opened as a concise detail view.
8. A user can initiate interest, ask a question, request a quote or request a meeting without completing a long application.
9. Private contact information remains hidden until the exact required consent is obtained.
10. My Requests remains a simple connection register and does not become a CRM or deal pipeline.
11. Desktop and mobile both feel like the same coherent app, with keyboard and assistive-technology support.
12. Structured data is consistent enough to support meaningful cross-category and geographic reports.
13. Visual polish and gamification never imply endorsement, guaranteed results, verified transactions or economic impact.


## 13. Phased implementation

### Phase 0 — Align current implementation
- Inspect current branch code, migrations, API routes, UI, access controls and tests.
- Reconcile Increment 4/5/6 contracts and six-versus-seven request-intent mismatch.
- Confirm reusable request/collaboration functions and make collaboration workspace optional.
- Produce compact schema/state/permission map and regression plan.

**Exit:** one canonical business/listing model and one connection-request foundation, with no duplicate entities or contradictory intent contracts.

**Phase 0 implementation record:** [docs/71-network-plus-phase-0-alignment-audit.md](71-network-plus-phase-0-alignment-audit.md) — schema/state/permission map and regression plan. The seven-intent correction and optional-workspace behavior are implemented; automated CI/database/browser gates must still pass before this PR is ready.

### Phase 1 — Needs and Offers directory
- Implement taxonomy with progressive, category-specific fields and the professional opportunity-mall discovery experience.
- Implement the guided broad-to-specific listing wizard, structured-first inputs, one-step-at-a-time interaction, autosave, persistent drafts and resume.
- Reuse verified business/organization identity and moderation.
- Deliver member/business/organization publishing, editing, pausing, closing and discovery.
- Deliver product/service catalog as discovery-only profiles, not commerce listings.

**Exit:** users can publish and discover needs/offers across supported categories.

### Phase 2 — Connection request and consent handoff
- Implement interest, question, quote request and meeting request actions.
- Implement recipient accept/decline/clarify responses.
- Implement field-specific bilateral contact consent and release.
- Implement meeting-place/time confirmation as a simple handoff.
- Implement notifications and request privacy.

**Exit:** two parties can safely make contact or arrange a meeting without premature disclosure.

### Phase 3 — My Requests and closure disposition
- Automatically save every initiated connection request in My Requests.
- Deliver the compact app-style My Requests shelf, contextual actions, status filters and preserved browsing/request context.
- Implement In progress, Completed and Cancelled with required short closing remark.
- Implement review reminders, reopen history and recipient-side decline/withdrawal.
- Label system-observed events separately from requester-reported outcomes.

**Exit:** requesters can review and close every request without entering deal milestones or private transaction details.

### Phase 4 — Outcomes and quality
- Add privacy-safe aggregate connection reporting.
- Add no-response/decline reasons, anti-spam, block/report, accessibility and usability.
- Validate all categories with distinct member, business, organization, funder, supplier and buyer roles.
- Complete migration, API, browser, security, keyboard, mobile and CI gates.

**Exit:** Network-Plus demonstrates meaningful connections and honest self-reported dispositions without becoming a marketplace or transaction-management product.

## 14. Acceptance scenarios

1. Member seeks mentorship: publishes topic/format; mentor expresses interest; both consent to contact; member marks In progress then Completed: “Mentor connected; we will continue directly.”
2. Skilled member lacks capital: publishes start-up support need; seed-support organization expresses interest; contact is shared with consent; member records connection outcome.
3. Business needs equipment: lists specification/location; supplier responds with quote or requests contact; parties negotiate directly; requester closes with short remark.
4. Business wants co-founder: describes skills/role; candidate expresses interest; they agree to meet; platform records confirmed meeting handoff and requester disposition only.
5. Business wants a new branch: describes target region and partner/resource needs; regional operators or suppliers connect; owner records outcome without branch-construction milestones.
6. Business seeks franchise: lists territory and support sought; interested party requests contact; due diligence and contract happen outside the platform.
7. Distributor discovers product: asks question, requests quotation or meeting; owner consents to share contacts; parties discuss terms externally; requester records disposition.
8. Buyer sees catalog item with no price: requests quotation; seller responds or contacts directly; no cart, order, payment or fulfilment record is created.
9. Buyer already has specifications: requests contact/meeting directly without a mandatory quote workflow.
10. User declines contact sharing: neither party's private details are disclosed; request may be declined/cancelled.
11. Unanswered request remains in My Requests; requester receives a reminder and marks Cancelled with remark.
12. Completed request is not represented as a verified sale, investment, loan, job or branch opening.
13. Listing is removed after a request: participants retain authorized request history; public discovery is removed.
14. Delegate loses business authority: they can no longer respond or disclose business contacts for that business.

## 15. Change control

This revised document **supersedes the earlier expansive business-growth plan's transaction, deal-execution and detailed economic-tracking requirements**. Preserve its broad taxonomy of needs and offers, but interpret each as a **connection use case**, not an end-to-end transaction workflow.

The next implementation should focus on a small number of excellent, secure capabilities: publish a need/offer, discover a relevant party, express interest, consent to contact, arrange a meeting or quotation handoff, and record a concise requester disposition.

Do not build a marketplace, CRM, investor execution system, business performance ledger or milestone tracker under Network-Plus. Keep any future proposal for such functionality separate and subject to explicit product approval.

**Product north star:** Network-Plus turns a member's need or offer into a relevant, trusted, consent-based human connection — then gets out of the way so the parties can do business.


## Phase 1 implementation record

The Needs & Offers implementation now extends the canonical business/listing model with governed category/subcategory taxonomy, category-specific structured fields, versioned service-area references, remote availability, capacity/intake/lead-time disclosures, target-audience segments and structured pricing disclosures. The `/network-plus/opportunities` app workspace provides server-driven discovery, an eight-step guided wizard, server-persisted autosave/resume, owner edit/pause/close controls, private business evidence upload and independent business/listing review workspaces.

Implementation details and the regression plan are recorded in [docs/72-network-plus-phase-1-needs-offers-implementation.md](72-network-plus-phase-1-needs-offers-implementation.md). This is a source-level implementation record, not a claim that CI, disposable PostgreSQL, full backend tests, Playwright or production deployment have passed.


## Phase 2 implementation record — connection requests and consent handoff

Phase 2 extends the canonical `network_plus_request` foundation with four lightweight intents (`interest`, `question`, `quote_request`, `meeting_request`), one-time recipient answers for question requests, structured recipient clarification, field-specific bilateral contact consent, one-time meeting proposal/counterproposal/confirmation, and a dedicated Network-Plus notification category. Contact values are application-encrypted and remain undisclosed until both participants consent to the same field. Icon-led listing detail actions deep-link into a four-step request wizard with listing context preselected. Lightweight requests do not enable collaboration workspaces; the existing optional workspace remains unchanged for eligible legacy engagement intents.

The implementation also closes Phase 1 integration gaps: product profiles now accept the four discovery-only connection intents without enabling commerce, listing detail cards expose contextual icon-led actions, paused/unavailable listings remain protected by the request service, and meeting location fields reject contact details or meeting links.

See [docs/73-network-plus-phase-2-connection-consent-handoff.md](73-network-plus-phase-2-connection-consent-handoff.md) for schema, routes, privacy rules, encryption configuration and regression plan. Source-level implementation is recorded; disposable PostgreSQL migration execution, full test suites, CI and deployed encryption-key configuration remain to be verified.
