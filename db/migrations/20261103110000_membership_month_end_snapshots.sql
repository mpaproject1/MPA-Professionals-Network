create table if not exists membership_month_end_snapshot (
  snapshot_date date not null,
  membership_status text not null,
  product_code text not null,
  member_count integer not null check (member_count >= 0),
  captured_at timestamptz not null default now(),
  primary key (snapshot_date, membership_status, product_code)
);

create index if not exists membership_month_end_snapshot_date_idx
  on membership_month_end_snapshot(snapshot_date, membership_status);
