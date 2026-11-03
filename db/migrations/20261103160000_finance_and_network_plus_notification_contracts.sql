-- Extend the existing payment-source and notification-category contracts additively.
-- Preserve every value already permitted by the deployed constraints; only add the two
-- Finance receipt origins and the Network-Plus inbox category used by the application.
DO $migration$
DECLARE
  source_expression text;
  category_expression text;
BEGIN
  SELECT pg_get_expr(conbin, conrelid)
    INTO source_expression
    FROM pg_constraint
   WHERE conrelid = 'public.payment_transaction'::regclass
     AND conname = 'payment_transaction_source_check'
     AND contype = 'c';

  IF source_expression IS NULL THEN
    RAISE EXCEPTION 'Expected payment_transaction_source_check before extending Finance receipt sources';
  END IF;

  IF position('finance_manual_record' in source_expression) = 0
     OR position('finance_bulk_import' in source_expression) = 0 THEN
    ALTER TABLE public.payment_transaction
      DROP CONSTRAINT payment_transaction_source_check;
    EXECUTE format(
      'ALTER TABLE public.payment_transaction ADD CONSTRAINT payment_transaction_source_check CHECK ((%s) OR source IN (%L, %L))',
      source_expression,
      'finance_manual_record',
      'finance_bulk_import'
    );
  END IF;

  SELECT pg_get_expr(conbin, conrelid)
    INTO category_expression
    FROM pg_constraint
   WHERE conrelid = 'public.notification_event'::regclass
     AND conname = 'notification_event_category_valid'
     AND contype = 'c';

  IF category_expression IS NULL THEN
    RAISE EXCEPTION 'Expected notification_event_category_valid before extending Network-Plus notifications';
  END IF;

  IF position('network_plus' in category_expression) = 0 THEN
    ALTER TABLE public.notification_event
      DROP CONSTRAINT notification_event_category_valid;
    EXECUTE format(
      'ALTER TABLE public.notification_event ADD CONSTRAINT notification_event_category_valid CHECK ((%s) OR category = %L)',
      category_expression,
      'network_plus'
    );
  END IF;
END
$migration$;
