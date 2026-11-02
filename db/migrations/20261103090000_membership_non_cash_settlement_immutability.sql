-- Approved non-cash membership settlements are final. A later cash-payment reversal
-- may reopen the cash portion of an obligation, but must never revoke sponsorship,
-- Honored Member exemption, or volunteer valuation coverage.
create or replace function guard_membership_fee_adjustment_immutability()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'approved' then
      raise exception 'Approved membership fee adjustments are immutable';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.status = 'approved' then
    raise exception 'Approved membership fee adjustments are immutable';
  end if;

  if new.status = 'reversed' then
    raise exception 'Approved non-cash membership fee adjustments cannot be reversed';
  end if;
  return new;
end;
$$;

drop trigger if exists membership_fee_adjustment_immutable_guard on membership_fee_adjustment;
create trigger membership_fee_adjustment_immutable_guard
before insert or update or delete on membership_fee_adjustment
for each row execute function guard_membership_fee_adjustment_immutability();

create or replace function guard_membership_fee_disposition_immutability()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'approved' then
      raise exception 'Approved membership fee dispositions are immutable';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.status = 'approved' then
    raise exception 'Approved membership fee dispositions are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists membership_fee_disposition_immutable_guard on membership_fee_balance_disposition;
create trigger membership_fee_disposition_immutable_guard
before update or delete on membership_fee_balance_disposition
for each row execute function guard_membership_fee_disposition_immutability();
