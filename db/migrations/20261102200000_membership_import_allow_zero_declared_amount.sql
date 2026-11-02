-- A required imported Amount paid value may be zero for a genuinely unpaid/pending historical record.
-- Remove only existing CHECK constraints that specifically constrain paid_amount, then enforce non-negative values.
do $$
declare item record;
begin
  for item in
    select conname
    from pg_constraint
    where conrelid='membership_import_row'::regclass
      and contype='c'
      and pg_get_constraintdef(oid) ilike '%paid_amount%'
  loop
    execute format('alter table membership_import_row drop constraint %I',item.conname);
  end loop;
end $$;
alter table membership_import_row
  add constraint membership_import_row_paid_amount_nonnegative
  check (paid_amount is null or paid_amount >= 0);
