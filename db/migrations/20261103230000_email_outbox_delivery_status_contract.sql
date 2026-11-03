-- Align the outbox delivery evidence constraint with the provider and Test Lab
-- lifecycle states written by email-operations.js. This is additive and preserves
-- historical rows while allowing provider events and capture/suppression outcomes.
alter table notification_outbox
  drop constraint if exists notification_outbox_delivery_status_check;

alter table notification_outbox
  add constraint notification_outbox_delivery_status_check
  check (delivery_status in (
    'unknown',
    'queued',
    'pending',
    'processing',
    'sent',
    'delivered',
    'bounced',
    'complained',
    'failed',
    'suppressed',
    'captured',
    'cancelled'
  ));
