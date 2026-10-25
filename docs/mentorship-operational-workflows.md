# Mentorship operational workflows

This increment adds operational controls without introducing private messaging or exposing participant contact addresses.

## Consent-safe mentor interest pool

A mentee can opt in when creating a request to let eligible approved mentors view a minimized summary. The mentor pool returns the request reference, goal, topics, preferred modes, languages, days and creation time only. It does not return the mentee name, email, phone or other contact fields. A mentor can register interest; this does not create a match. The matching team must review and propose a specific match, and both participants must still accept it.

The API requires the mentor to have an active membership, verified professional identity, active profile and moderation approval. A request must be unmatched, open for matching and explicitly shared by its owner.

## Notification evidence

The email outbox records a separate delivery_status:
- queued: an email delivery attempt is waiting in the outbox.
- sent: the configured provider accepted the send request. This is not proof of delivery.
- delivered: a trusted provider delivery event was received.
- failed: the provider/dispatcher recorded a terminal delivery failure.
- unknown: no verified delivery state is available (including legacy rows).

A trusted provider adapter must post a normalized JSON event to POST /api/v1/email/delivery-webhook with the X-Email-Delivery-Webhook-Secret header. Configure EMAIL_DELIVERY_EVENT_WEBHOOK_SECRET independently from the outbound EMAIL_DELIVERY_WEBHOOK_SECRET.

Accepted body shape:
- providerMessageId: the exact provider message ID returned when sending.
- eventType: one of delivered, bounced, complained, or failed.

Only a trusted delivered event marks an email as delivered. A provider delivery event does not prove the person read it. If the provider cannot supply delivery events, the interface must continue to report delivery as unconfirmed; do not fabricate delivered or read states.

## First-session coordination

Creating a session now creates a proposal. The other participant must accept or decline it. Session completion, cancellation and no-show outcomes are blocked until the proposal is accepted. The workflow uses platform notifications and saved session details; it does not create a private chat or expose personal contact addresses.

## Mentor circles

Mentor circles are opt-in, disabled by default. Active members can join or leave an enabled circle. The mentor and participants see an aggregate active count; the circle counter API does not return participant identities. The counter is calculated from persisted membership rows.

## Participant reports

Participants can submit a confidential report from their mentorship relationship. The reporter is identified through the authenticated account; no contact-address field is collected. The report queue and review transitions are restricted to Support Desk/system administrator roles and are audit-logged. A resolution note is required before a report can be marked resolved.

## Operational metrics

The mentor workspace reports persisted invitation counts, invitations older than seven days, average response time from recorded proposal/response timestamps, active relationships, pending session confirmations, upcoming confirmed sessions, feedback submissions and email delivery states from the outbox. A missing/failed report is not represented as zero. sent and queued are not labelled delivered.
