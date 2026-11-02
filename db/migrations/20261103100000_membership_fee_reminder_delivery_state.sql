-- Track member reminder preference suppression separately from the Finance/staff queue.
alter table membership_fee_reminder
  add column if not exists member_delivery_status text not null default 'not_queued',
  add column if not exists member_delivery_note text;

alter table membership_fee_reminder
  drop constraint if exists membership_fee_reminder_member_delivery_status_check;
alter table membership_fee_reminder
  add constraint membership_fee_reminder_member_delivery_status_check
  check (member_delivery_status in ('not_queued','queued','in_app','suppressed','sent','failed'));

create index if not exists membership_fee_reminder_member_delivery_idx
  on membership_fee_reminder(member_delivery_status,scheduled_for);
