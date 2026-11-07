-- Network-Plus: allow offer moderation before business publication, while withholding discovery.
-- Also provide a durable human-readable reference for each opportunity.

alter table network_plus_service_listing
  add column if not exists public_reference text;

update network_plus_service_listing
set public_reference = 'MPA-OPP-' || to_char(created_at at time zone 'UTC','YYYYMMDD') || '-' || upper(substr(replace(id::text,'-',''),1,8))
where public_reference is null;

alter table network_plus_service_listing
  alter column public_reference set not null;

create unique index if not exists ux_network_plus_service_listing_public_reference
  on network_plus_service_listing(public_reference);

alter table network_plus_service_listing
  drop constraint if exists network_plus_service_listing_status_check,
  add constraint network_plus_service_listing_status_check
    check (status in ('draft','pending_review','approved_pending_business','changes_requested','published','paused','suspended','rejected','archived'));

comment on column network_plus_service_listing.public_reference is
  'Stable, human-readable opportunity reference shown to owners; internal UUID remains the API identity.';
comment on column network_plus_service_listing.status is
  'approved_pending_business means content moderation is complete but business verification/profile publication still blocks public discovery.';
