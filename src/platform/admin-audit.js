import { getPool } from "./db.js";

export async function listAdminAuditEvents(filters={}) {
  const limit = Math.max(1, Math.min(200, Number.parseInt(filters.limit || "50", 10) || 50));
  const offset = Math.max(0, Number.parseInt(filters.offset || "0", 10) || 0);
  const action = String(filters.action || "").trim().slice(0, 120) || null;
  const resourceType = String(filters.resourceType || "").trim().slice(0, 80) || null;
  const result = await getPool().query(`
    select id,actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata,created_at
    from audit_log
    where ($1::text is null or action ilike '%' || $1 || '%')
      and ($2::text is null or resource_type=$2)
    order by created_at desc,id desc
    limit $3 offset $4
  `, [action, resourceType, limit, offset]);
  return { items: result.rows, limit, offset };
}
