-- Network-Plus organization discovery requires an explicit organization opt-in.
-- This is separate from public_visible, which controls existing public opportunity/job behavior.
-- Existing organizations remain undiscoverable until an authorized owner/administrator opts in.
alter table organization
  add column if not exists network_plus_visible boolean not null default false;

comment on column organization.network_plus_visible is
  'Explicit opt-in to the read-only Network-Plus verified organization directory; independent of public_visible.';

create index if not exists organization_network_plus_directory_idx
  on organization (display_name)
  where network_plus_visible = true and verification_status = 'verified';
