// Shared source of truth for membership eligibility. Imported memberships require
// every linked historical fee obligation to be fully settled by verified cash or
// an approved non-cash adjustment. A successful installment alone is not enough.
function assertAlias(alias) {
  if (typeof alias !== "string" || !/^[a-z_][a-z0-9_]*$/i.test(alias)) {
    throw new TypeError("A trusted SQL table alias is required.");
  }
  return alias;
}

export function legacyMembershipFeeSettledSql(tableAlias) {
  const alias = assertAlias(tableAlias);
  const linked = `(ob.membership_record_id=${alias}.id or (${alias}.application_id is not null and ob.application_id=${alias}.application_id))`;
  return `(
    exists (
      select 1
      from membership_fee_obligation ob
      join membership_fee_obligation_balance balance on balance.obligation_id=ob.id
      where ${linked} and balance.outstanding_balance=0
    )
    and not exists (
      select 1
      from membership_fee_obligation ob
      join membership_fee_obligation_balance balance on balance.obligation_id=ob.id
      where ${linked} and balance.outstanding_balance>0
    )
  )`;
}

export function membershipIsCurrentlyActiveSql(tableAlias) {
  const alias = assertAlias(tableAlias);
  return `(
    ${alias}.status='active'
    and ${alias}.start_date<=(now() at time zone 'Africa/Addis_Ababa')::date
    and (${alias}.end_date is null or ${alias}.end_date>=(now() at time zone 'Africa/Addis_Ababa')::date)
    and (coalesce(${alias}.source,'')<>'legacy_import' or ${legacyMembershipFeeSettledSql(alias)})
  )`;
}
