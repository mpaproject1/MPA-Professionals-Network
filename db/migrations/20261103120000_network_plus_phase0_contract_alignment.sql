-- Phase 0 Network-Plus contract reconciliation.
-- Forward-only: align the request intent constraint and preserve existing request history.
-- Collaboration workspaces are opt-in through the API after explicit recipient acceptance;
-- no existing request, business, listing, participant or workspace row is rewritten.
alter table network_plus_request
  drop constraint if exists network_plus_request_intent_check;
alter table network_plus_request
  add constraint network_plus_request_intent_check
  check (intent in (
    'service_request',
    'supplier_inquiry',
    'referral',
    'expertise_request',
    'partnership_proposal',
    'collaboration_request',
    'business_opportunity'
  ));
