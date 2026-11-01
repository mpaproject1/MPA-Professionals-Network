create table if not exists community_campaign_public_push_delivery(
 id uuid primary key default gen_random_uuid(),
 delivery_id uuid not null references community_campaign_delivery(id) on delete cascade,
 subscriber_id uuid not null references community_campaign_public_subscriber(id) on delete restrict,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','skipped')),
 attempts integer not null default 0,
 available_at timestamptz not null default now(),
 last_error_code text,
 last_status_code integer,
 delivered_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(delivery_id,subscriber_id)
);
create index if not exists ix_community_campaign_public_push_due on community_campaign_public_push_delivery(status,available_at);
