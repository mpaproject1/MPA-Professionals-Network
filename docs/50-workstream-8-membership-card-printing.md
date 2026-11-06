# Workstream 8 — Membership card issuance and bulk printing

## Source of truth and identifier contract

Membership cards are rendered on demand from `membership_record`; there is no separate card row that must be created before a member can view or print a card. Membership eligibility is checked against the record status and its start/end dates at the time the card data is requested.

- The member-facing identifier is `membership_record.membership_number` (the canonical MPA membership number).
- `app_user.id`, `membership_record.id`, account references, application references and payment references are not membership numbers.
- Administrator lookup accepts `membershipNumber` and rejects UUID-shaped internal references and MPA payment/application reference prefixes with an actionable error.
- New QR URLs use the canonical membership number plus the existing signed, versioned verification token. Existing QR URLs that contain the legacy record identifier remain verifiable.

## Eligibility and access

- A member can load their own card only when the backend finds their membership record and confirms that it is active, started and not past its end date.
- Administrator single-card lookup, candidate listing, batch preparation and print-request recording require `system_admin` or `reviewer`, or `members.view` / `members.manage` permission. The service independently checks eligibility; an account role is not membership evidence.
- Bulk selection is revalidated server-side at generation time. A selected member who is missing or no longer eligible is returned in the skipped list with a reason.
- A batch is limited to 100 unique canonical membership numbers.

## Card data and privacy

The card payload includes only member name, canonical membership number, membership type, validity dates, active-at-issuance status, card branding and a signed verification path. It does not return or print internal UUIDs, account references, recovery email, contact phone, private address, payment evidence or profile-photo file identifiers.

The QR code contains the verification URL, not a printed internal record UUID. Online verification resolves the canonical membership number and checks the current record status. A printed card is not proof of current status after expiry, suspension or revocation.

## Single and bulk workflows

- Member workspace: **View / print membership ID** loads the signed-in member's own backend-confirmed card.
- Administrator catalogue: **View card** opens a selected eligible member by canonical membership number.
- Administrator workspace: **Membership cards & printing** supports name/number search, select visible members, a selected-count preview, a server-generated card preview, skipped-member reasons and print/save-to-PDF.
- Bulk output uses one card centered on each A4 page with explicit page breaks. The browser's print dialog can print or save the paginated output as PDF.
- The print action records a print request against the same administrator-generated batch reference. It does not claim that the user completed the physical print or saved the PDF.

## Audit and validation

Batch generation and print requests are recorded in `audit_log` with the actor, batch reference and aggregate selected/generated/skipped counts. Member names, membership numbers and other personal details are not copied into batch audit metadata.

Backend contract tests cover eligibility, identifier separation, authorization routes, the 100-card cap, minimal payload fields, audit events and QR compatibility. Browser acceptance selects two fixture members, prepares and requests printing, creates an A4 PDF through Chromium, then independently parses it with `pypdf` to verify page count, A4 page dimensions, member names, membership numbers, QR label and absence of internal UUIDs or contact/payment data.

No production migration or deployment is required for this workstream.


## Member command-centre status and exact-size single-card output

The member workspace now leads with a status summary before the application and plan content. Its checklist is derived from the current account response, persisted application timestamps/status, payment state and the active membership record; it does not mark review, settlement or activation complete merely because an application form was opened. Activated applications remain visible in **My applications** with the literal `activated` state and a direct membership-ID link when the active record is eligible.

Card-loading errors are retained and shown in the member workspace. They are no longer silently converted to a missing card, so an active membership and a card-service failure can be distinguished.

### Shared eligibility contract

- `/api/v1/me.has_active_membership` and member card issuance use the same effective membership status, Addis Ababa civil date and legacy-import Finance reconciliation requirement.
- Administrator single-card issuance now loads the legacy-import source and reconciliation evidence before applying the same eligibility guard. It cannot bypass the legacy payment safeguard by omitting those fields.
- Candidate listing, batch issuance and profile-picture eligibility use the same Addis Ababa date boundary and preserve the existing Finance verification/reversal requirement for imported records.
- No role or permission is added, and the UI does not grant access independently of the API.

### Single-member PDF / print acceptance

The member card print stylesheet isolates the card from the shared application shell and prints one landscape page at exactly **85.6 × 53.98 mm**, with zero page margin. The toolbar, page note, portal navigation, mobile navigation and all other shell content are hidden from print. The card remains the only visible print surface; its QR verification and card details are preserved. The browser print dialog provides **Save as PDF** and physical printing.

The single-card Playwright acceptance test creates a PDF and parses it independently with `pypdf`. It asserts one page, exact ID-card page dimensions, the expected member name and canonical membership number, QR label, and absence of portal navigation, page-toolbar text, contact details and internal UUIDs. This is separate from the existing A4 bulk-print acceptance test.
