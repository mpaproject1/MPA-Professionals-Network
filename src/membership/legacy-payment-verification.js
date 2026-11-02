import { getPool, withTransaction } from "../platform/db.js";
import { assertFinancePaymentQueueAccess, assertPaymentVerificationAccess } from "../platform/workspace-authorization.js";

function problem(statusCode, message, code = "BUSINESS_RULE") {
  return Object.assign(new Error(message), { statusCode, code });
}

const METHODS = new Set(["bank_transfer", "telebirr", "cash", "mobile_money", "other"]);
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export async function listLegacyMembershipPaymentVerificationQueue(identity) {
  assertFinancePaymentQueueAccess(identity);
  const result = await getPool().query(`
    select mr.id membership_id, mr.membership_number, mr.status membership_status,
      mr.start_date, mr.end_date, mr.created_at imported_at,
      mp.name product_name, mp.product_code,
      p.display_name member_name, u.email,
      mr.legacy_payload->>'payment_reference' imported_payment_reference,
      mr.legacy_payload->>'payment_amount' imported_payment_amount,
      mr.legacy_payload->>'payment_currency' imported_payment_currency,
      mr.legacy_payload->>'payment_date' imported_payment_date,
      mr.legacy_payload->>'payment_method' imported_payment_method,
      mr.legacy_payload->>'payment_evidence_reference' imported_evidence_reference,
      inv.expires_at invitation_expires_at, inv.consumed_at invitation_claimed_at
    from membership_record mr
    join membership_product mp on mp.id=mr.membership_product_id
    left join app_user u on u.id=mr.user_id
    left join person p on p.user_id=mr.user_id
    left join lateral (
      select expires_at,consumed_at from member_invitation
      where user_id=mr.user_id and import_id=mr.source_import_id
      order by created_at desc limit 1
    ) inv on true
    where mr.source='legacy_import' and mr.status<>'merged'
      and not exists (
        select 1 from membership_legacy_payment_verification v
        where v.membership_id=mr.id
      )
    order by mr.created_at desc
    limit 500
  `);
  return { rows: result.rows, total: result.rows.length };
}

export async function verifyLegacyMembershipPayment(identity, membershipId, input = {}, requestId) {
  assertPaymentVerificationAccess(identity);
  const amount = Number(input.amount);
  const currency = String(input.currency || "").trim().toUpperCase();
  const paymentReference = String(input.paymentReference || "").trim().slice(0, 180);
  const paymentDate = String(input.paymentDate || "").trim();
  const paymentMethod = String(input.paymentMethod || "").trim();
  const evidenceReference = String(input.evidenceReference || "").trim().slice(0, 300);
  const financeNote = String(input.financeNote || "").trim().slice(0, 1000) || null;

  if (!Number.isFinite(amount) || amount <= 0 || !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(String(input.amount || "").trim())) {
    throw problem(400, "Enter the amount confirmed against the historical payment evidence.", "INVALID_AMOUNT");
  }
  if (!/^[A-Z]{3}$/.test(currency)) throw problem(400, "Currency must be a three-letter ISO code.", "INVALID_CURRENCY");
  if (paymentReference.length < 4) throw problem(400, "Enter the bank, cash or provider payment reference.", "PAYMENT_REFERENCE_REQUIRED");
  if (!validDate(paymentDate)) throw problem(400, "Payment date must use YYYY-MM-DD.", "INVALID_PAYMENT_DATE");
  if (!METHODS.has(paymentMethod)) throw problem(400, "Choose a supported historical payment method.", "INVALID_PAYMENT_METHOD");
  if (evidenceReference.length < 4) throw problem(400, "Record the evidence reference checked by Finance.", "EVIDENCE_REFERENCE_REQUIRED");

  return withTransaction(async tx => {
    const membership = (await tx.query(`
      select mr.id,mr.user_id,mr.source_import_id,mr.membership_number,mr.status,
        mr.legacy_payload,mp.name product_name
      from membership_record mr
      join membership_product mp on mp.id=mr.membership_product_id
      where mr.id=$1 and mr.source='legacy_import'
      for update of mr
    `, [membershipId])).rows[0];
    if (!membership) throw problem(404, "Imported membership record was not found.", "NOT_FOUND");

    const existing = (await tx.query(
      "select id,payment_reference from membership_legacy_payment_verification where membership_id=$1 for update",
      [membershipId]
    )).rows[0];
    if (existing) {
      if (existing.payment_reference.toLowerCase() === paymentReference.toLowerCase()) {
        return { membershipId, alreadyVerified: true, verificationId: existing.id };
      }
      throw problem(409, "A Finance-approved historical payment is already linked to this membership.", "PAYMENT_ALREADY_VERIFIED");
    }

    const reusedReference = (await tx.query("select membership_id from membership_legacy_payment_verification where lower(payment_reference)=lower($1) for update", [paymentReference])).rows[0];
    if (reusedReference && reusedReference.membership_id !== membershipId) throw problem(409, "This payment reference is already allocated to another membership record.", "PAYMENT_REFERENCE_ALREADY_USED");
    const verification = (await tx.query(`
      insert into membership_legacy_payment_verification
        (membership_id,payment_reference,amount,currency,payment_date,payment_method,evidence_reference,finance_note,verified_by)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9)
      returning id,verified_at
    `, [membershipId, paymentReference, amount, currency, paymentDate, paymentMethod, evidenceReference, financeNote, identity.sub])).rows[0];

    await tx.query(
      "update member_invitation set expires_at=greatest(expires_at,now()+interval '7 days') where user_id=$1 and import_id=$2 and consumed_at is null",
      [membership.user_id, membership.source_import_id]
    const outstandingInvitation = await tx.query("select id from member_invitation where user_id=$1 and import_id=$2 and consumed_at is null", [membership.user_id, membership.source_import_id]);
    );
    await tx.query(
      "insert into membership_event(membership_id,event_type,effective_at,actor_user_id,source,details) values($1,'legacy_payment_verified',now(),$2,'legacy_import',$3)",
      [membershipId, identity.sub, JSON.stringify({ verificationId: verification.id, paymentReference, amount, currency, paymentDate, paymentMethod, evidenceReference })]
    );
    await tx.query(
      "insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'membership.legacy_payment_verified','membership_record',$2,$3,'success',$4)",
      [identity.sub, membershipId, requestId, JSON.stringify({ verificationId: verification.id, membershipNumber: membership.membership_number, paymentReference, amount, currency, paymentDate, paymentMethod, evidenceReference })]
    );
    return { membershipId, verificationId: verification.id, verifiedAt: verification.verified_at, claimUnlocked: outstandingInvitation.rowCount > 0 };
  });
}
