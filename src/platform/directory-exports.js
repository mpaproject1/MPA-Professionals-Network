import { getPool } from "./db.js";
import { makeXlsx } from "./reports.js";

const MEMBER_ROLES = ["system_admin", "admin", "membership_reviewer"];
const ACCOUNT_ROLES = ["system_admin", "admin", "platform_admin"];
const MAX_ROWS = 20000;
const PAGE_SIZE = 500;

function fail(status, message, code = "DIRECTORY_EXPORT_ERROR") {
  const error = new Error(message);
  error.statusCode = status;
  error.code = code;
  return error;
}
function roles(identity) { return Array.isArray(identity?.roles) ? identity.roles : []; }
function permissions(identity) { return Array.isArray(identity?.permissions) ? identity.permissions : []; }
function isPlatformAdmin(identity) { return roles(identity).some(role => ACCOUNT_ROLES.includes(role)); }
function canViewOrganizations(identity) { return isPlatformAdmin(identity) || permissions(identity).includes("organizations.manage"); }
function authorize(identity, kind) {
  if (kind === "members") {
    if (!roles(identity).some(role => [...MEMBER_ROLES, "finance_officer"].includes(role)) && !permissions(identity).some(permission => ["members.view", "members.export", "members.import"].includes(permission))) {
      throw fail(403, "Member directory export requires the same authorized membership-administration access as the member catalogue.", "FORBIDDEN");
    }
    return;
  }
  if (kind === "accounts") {
    if (!roles(identity).some(role => ACCOUNT_ROLES.includes(role)) && !permissions(identity).includes("users.view")) {
      throw fail(403, "Account directory export requires authorized account-directory access.", "FORBIDDEN");
    }
    return;
  }
  throw fail(400, "Choose the members or accounts directory.", "INVALID_DIRECTORY");
}

const DEFINITIONS = {
  members: [
    { key: "account_reference", label: "Account reference", preset: ["standard", "identity"], sensitive: false },
    { key: "full_name", label: "Full name", preset: ["standard", "identity"], sensitive: false },
    { key: "membership_number", label: "Membership number", preset: ["standard", "membership"], sensitive: false },
    { key: "membership_status", label: "Membership status", preset: ["standard", "membership"], sensitive: false },
    { key: "product_code", label: "Membership product code", preset: ["standard", "membership"], sensitive: false },
    { key: "product_name", label: "Membership product", preset: ["standard", "membership"], sensitive: false },
    { key: "start_date", label: "Membership start date", preset: ["standard", "membership"], sensitive: false },
    { key: "end_date", label: "Membership end date", preset: ["standard", "membership"], sensitive: false },
    { key: "account_status", label: "Account status", preset: ["standard", "identity"], sensitive: false },
    { key: "email", label: "Email address", preset: ["contacts"], sensitive: true },
    { key: "phone", label: "Phone number", preset: ["contacts"], sensitive: true },
    { key: "import_batch", label: "Import batch reference", preset: ["provenance"], sensitive: false },
    { key: "import_source", label: "Import provenance", preset: ["provenance"], sensitive: false },
    { key: "record_created_at", label: "Membership record created at", preset: ["provenance"], sensitive: false },
  ],
  accounts: [
    { key: "account_reference", label: "Account reference", preset: ["standard", "identity"], sensitive: false },
    { key: "full_name", label: "Full name", preset: ["standard", "identity"], sensitive: false },
    { key: "account_status", label: "Account status", preset: ["standard", "identity"], sensitive: false },
    { key: "membership_status", label: "Membership status", preset: ["standard", "membership"], sensitive: false },
    { key: "created_at", label: "Account created at", preset: ["standard", "provenance"], sensitive: false },
    { key: "updated_at", label: "Account last updated at", preset: ["provenance"], sensitive: false },
    { key: "email", label: "Email address", preset: ["contacts"], sensitive: true },
    { key: "phone", label: "Phone number", preset: ["contacts"], sensitive: true },
    { key: "organization_names", label: "Authorized organizations", preset: ["organizations"], sensitive: true, organization: true },
  ],
};
const PRESETS = [
  { id: "standard", label: "Standard directory", description: "Core identity and current status." },
  { id: "identity", label: "Identity and status", description: "Account reference, name and account status." },
  { id: "membership", label: "Membership details", description: "Membership state, product and validity dates." },
  { id: "contacts", label: "Contact details", description: "Email and phone; restricted personal data." },
  { id: "provenance", label: "Audit and provenance", description: "Record timestamps and import provenance where available." },
  { id: "organizations", label: "Organization relationships", description: "Organization names only when the session is authorized to view them." },
];

function allowedFields(identity, kind) {
  authorize(identity, kind);
  const canSeeSensitive = isPlatformAdmin(identity) || (kind === "members" && roles(identity).some(role => MEMBER_ROLES.includes(role))) || permissions(identity).some(code => ["users.view", "members.export"].includes(code));
  return DEFINITIONS[kind].filter(field => (!field.sensitive || canSeeSensitive) && (!field.organization || canViewOrganizations(identity)));
}
export function listDirectoryExportFields(identity, kind) {
  const fields = allowedFields(identity, kind).map(({ key, label, preset }) => ({ key, label, preset }));
  const allowed = new Set(fields.map(field => field.key));
  return {
    kind,
    fields,
    presets: PRESETS.map(preset => ({ ...preset, fields: fields.filter(field => field.preset.includes(preset.id)).map(field => field.key) })).filter(preset => preset.fields.length),
    defaultFields: fields.filter(field => field.preset.includes("standard")).map(field => field.key).filter(key => allowed.has(key)),
    formats: ["csv", "xlsx"],
    maxRows: MAX_ROWS,
  };
}
function cleanFilters(input = {}) {
  const from = String(input.from || "").trim();
  const to = String(input.to || "").trim();
  const status = String(input.status || "").trim().slice(0, 40);
  const membershipStatus = String(input.membershipStatus || "").trim().slice(0, 40);
  const membershipScope = String(input.membershipScope || "all").trim();
  const organizationId = String(input.organizationId || "").trim().slice(0, 100);
  const importBatch = String(input.importBatch || "").trim().slice(0, 100);
  const q = String(input.q || "").trim().slice(0, 120);
  const validDate = value => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + "T00:00:00Z")));
  if (!validDate(from) || !validDate(to)) throw fail(400, "Date filters must use YYYY-MM-DD.", "INVALID_DATE");
  if (from && to && from > to) throw fail(400, "The start date must be on or before the end date.", "INVALID_DATE_RANGE");
  if (!["all", "members", "non_members"].includes(membershipScope)) throw fail(400, "Choose all accounts, members, or non-members.", "INVALID_MEMBERSHIP_SCOPE");
  if (membershipStatus && !["active", "pending", "suspended", "expired", "cancelled", "not_enrolled", "unknown"].includes(membershipStatus)) throw fail(400, "Choose a recognized membership status.", "INVALID_MEMBERSHIP_STATUS");
  return { from, to, status, membershipStatus, membershipScope, organizationId, importBatch, q };
}
function chooseFields(identity, kind, input) {
  const available = allowedFields(identity, kind);
  const availableKeys = new Set(available.map(field => field.key));
  let requested = Array.isArray(input.fields) ? input.fields.map(String) : [];
  if (!requested.length && input.preset) {
    const preset = PRESETS.find(item => item.id === String(input.preset));
    if (!preset) throw fail(400, "Choose a recognized field preset.", "INVALID_PRESET");
    requested = available.filter(field => field.preset.includes(preset.id)).map(field => field.key);
  }
  if (!requested.length) requested = available.filter(field => field.preset.includes("standard")).map(field => field.key);
  requested = [...new Set(requested)];
  if (!requested.length) throw fail(400, "Select at least one export field.", "NO_FIELDS_SELECTED");
  if (requested.length > 30 || requested.some(key => !availableKeys.has(key))) throw fail(403, "One or more selected fields are not permitted for this directory or administrator.", "FIELD_NOT_ALLOWED");
  return available.filter(field => requested.includes(field.key));
}
function buildQuery(kind, identity, filters) {
  const args = [];
  const clauses = [];
  const orgFilter = filters.organizationId || null;
  const batchFilter = filters.importBatch || null;
  const canOrgs = canViewOrganizations(identity);
  if (filters.organizationId && !canOrgs) throw fail(403, "Organization filtering requires authorized organization-directory access.", "ORGANIZATION_SCOPE_FORBIDDEN");
  let select, fromSql, dateColumn;
  if (kind === "members") {
    dateColumn = "mr.created_at";
    select = `mr.id, u.account_reference, p.display_name full_name, u.status account_status, u.email, p.phone,
      mr.membership_number, case when mr.status in ('merged','cancelled','suspended') then mr.status when mr.source='legacy_import' and not exists(select 1 from payment_reconciliation pr join payment_transaction pt on pt.id=pr.payment_transaction_id where pr.membership_id=mr.id and pr.reconciliation_status='matched' and pt.source='legacy_import' and pt.status='succeeded' and not exists(select 1 from membership_payment_reversal rev where rev.payment_transaction_id=pt.id)) then 'payment_verification_required' else mr.status end membership_status, mp.product_code, mp.name product_name, mr.start_date, mr.end_date,
      mr.source_import_id import_batch, mr.source import_source, mr.created_at record_created_at`;
    fromSql = `membership_record mr
      left join app_user u on u.id=mr.user_id
      left join person p on p.user_id=u.id
      left join membership_product mp on mp.id=mr.membership_product_id`;
    clauses.push(`($${args.length + 1}::date is null or mr.created_at >= $${args.length + 1}::date)`); args.push(filters.from || null);
    clauses.push(`($${args.length + 1}::date is null or mr.created_at < ($${args.length + 1}::date + interval '1 day'))`); args.push(filters.to || null);
    clauses.push(`($${args.length + 1}='' or (case when mr.status in ('merged','cancelled','suspended') then mr.status when mr.source='legacy_import' and not exists(select 1 from payment_reconciliation pr join payment_transaction pt on pt.id=pr.payment_transaction_id where pr.membership_id=mr.id and pr.reconciliation_status='matched' and pt.source='legacy_import' and pt.status='succeeded' and not exists(select 1 from membership_payment_reversal rev where rev.payment_transaction_id=pt.id)) then 'payment_verification_required' else mr.status end)=${args.length + 1}::text)`); args.push(filters.status);
    clauses.push(`($${args.length + 1}='' or lower(coalesce(p.display_name,'')||' '||coalesce(u.email,'')||' '||coalesce(u.account_reference,'')||' '||coalesce(mr.membership_number,'')) like lower('%'||$${args.length + 1}||'%'))`); args.push(filters.q);
    if (filters.membershipStatus) { clauses.push(`(case when mr.status in ('merged','cancelled','suspended') then mr.status when mr.source='legacy_import' and not exists(select 1 from payment_reconciliation pr join payment_transaction pt on pt.id=pr.payment_transaction_id where pr.membership_id=mr.id and pr.reconciliation_status='matched' and pt.source='legacy_import' and pt.status='succeeded' and not exists(select 1 from membership_payment_reversal rev where rev.payment_transaction_id=pt.id)) then 'payment_verification_required' else mr.status end)=${args.length + 1}::text`); args.push(filters.membershipStatus); }
    if (batchFilter) { clauses.push(`mr.source_import_id::text=$${args.length + 1}`); args.push(filters.importBatch); }
    if (orgFilter) { clauses.push(`exists(select 1 from organization_membership om where om.user_id=u.id and om.organization_id::text=$${args.length + 1} and om.status='active')`); args.push(filters.organizationId); }
  } else {
    dateColumn = "u.created_at";
    const membershipState = `case when not exists(select 1 from membership_record mr where mr.user_id=u.id and mr.status<>'merged') then 'not_enrolled'
      when exists(select 1 from membership_record mr where mr.user_id=u.id and mr.status='active' and mr.start_date is not null and mr.start_date<=current_date and (mr.end_date is null or mr.end_date>=current_date) and (mr.source<>'legacy_import' or exists(select 1 from payment_reconciliation pr join payment_transaction pt on pt.id=pr.payment_transaction_id where pr.membership_id=mr.id and pr.reconciliation_status='matched' and pt.source='legacy_import' and pt.status='succeeded' and not exists(select 1 from membership_payment_reversal rev where rev.payment_transaction_id=pt.id)))) then 'active'
      when exists(select 1 from membership_record mr where mr.user_id=u.id and mr.source='legacy_import' and not exists(select 1 from payment_reconciliation pr join payment_transaction pt on pt.id=pr.payment_transaction_id where pr.membership_id=mr.id and pr.reconciliation_status='matched' and pt.source='legacy_import' and pt.status='succeeded' and not exists(select 1 from membership_payment_reversal rev where rev.payment_transaction_id=pt.id))) then 'payment_verification_required'
      when exists(select 1 from membership_record mr where mr.user_id=u.id and mr.status='pending') then 'pending'
      when exists(select 1 from membership_record mr where mr.user_id=u.id and mr.status='suspended') then 'suspended'
      when exists(select 1 from membership_record mr where mr.user_id=u.id and (mr.status='expired' or (mr.status='active' and mr.end_date<current_date))) then 'expired' else 'unknown' end`;
    select = `u.id, u.account_reference, p.display_name full_name, u.status account_status, u.email, p.phone,
      u.created_at, u.updated_at, ${membershipState} membership_status,
      ${canOrgs ? "coalesce((select string_agg(distinct o.display_name, '; ' order by o.display_name) from organization_membership om join organization o on o.id=om.organization_id where om.user_id=u.id and om.status='active'),'') organization_names" : "null::text organization_names"}`;
    fromSql = "app_user u left join person p on p.user_id=u.id";
    clauses.push(`($${args.length + 1}::date is null or u.created_at >= $${args.length + 1}::date)`); args.push(filters.from || null);
    clauses.push(`($${args.length + 1}::date is null or u.created_at < ($${args.length + 1}::date + interval '1 day'))`); args.push(filters.to || null);
    clauses.push(`(${args.length + 1}::text='' or u.status=${args.length + 1}::text)`); args.push(filters.status);
    clauses.push(`($${args.length + 1}='' or lower(coalesce(p.display_name,'')||' '||coalesce(u.email,'')||' '||coalesce(u.account_reference,'')) like lower('%'||$${args.length + 1}||'%'))`); args.push(filters.q);
    if (filters.membershipStatus) { clauses.push(`(${membershipState})=$${args.length + 1}`); args.push(filters.membershipStatus); }
    if (filters.membershipScope === "members") clauses.push("exists(select 1 from membership_record mr where mr.user_id=u.id and mr.status<>'merged')");
    if (filters.membershipScope === "non_members") clauses.push("not exists(select 1 from membership_record mr where mr.user_id=u.id and mr.status<>'merged')");
    if (batchFilter) { clauses.push(`exists(select 1 from membership_record mr where mr.user_id=u.id and mr.source_import_id::text=$${args.length + 1})`); args.push(filters.importBatch); }
    if (orgFilter) { clauses.push(`exists(select 1 from organization_membership om where om.user_id=u.id and om.organization_id::text=$${args.length + 1} and om.status='active')`); args.push(filters.organizationId); }
  }
  const where = clauses.join(" and ");
  const count = `select count(*)::int total from ${fromSql} where ${where}`;
  const stableKey = kind === "members" ? "mr.id" : "u.id";
  const rows = `select ${select} from ${fromSql} where ${where} order by ${dateColumn} desc, ${stableKey}`;
  return { args, count, rows };
}
function valueFor(row, key) {
  const mapping = {
    membership_status: row.membership_status,
    record_created_at: row.record_created_at,
  };
  const value = Object.hasOwn(mapping, key) ? mapping[key] : row[key];
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && /^[\s]*[=+\-@]/.test(value)) return "'" + value;
  return value;
}
function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}
function makeCsv(result) {
  const lines = [
    ["Export generated at", result.generatedAt],
    ["Directory", result.kind === "members" ? "Member directory" : "Account directory"],
    ["Expected rows", String(result.expectedRows)],
    ["Applied filters", JSON.stringify(result.filters)],
    ["Selected fields", result.fields.map(field => field.key).join(", ")],
    [],
    result.fields.map(field => field.label),
    ...result.rows.map(row => result.fields.map(field => valueFor(row, field.key))),
  ];
  const csv = lines.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
  const buffer = Buffer.from("\uFEFF" + csv, "utf8");
  if (!buffer.length || !buffer.toString("utf8").includes(result.fields[0].label)) throw fail(500, "CSV generation produced an invalid file.", "INVALID_EXPORT_FILE");
  return buffer;
}
export async function previewDirectoryExport(identity, kind, input = {}) {
  authorize(identity, kind);
  const filters = cleanFilters(input);
  const fields = chooseFields(identity, kind, input);
  const query = buildQuery(kind, identity, filters, fields);
  const total = Number((await getPool().query(query.count, query.args)).rows[0]?.total || 0);
  return { kind, expectedRows: total, selectedFields: fields.map(field => ({ key: field.key, label: field.label })), filters, maxRows: MAX_ROWS, exceedsLimit: total > MAX_ROWS };
}
export async function exportDirectory(identity, kind, input = {}, requestId) {
  authorize(identity, kind);
  const filters = cleanFilters(input);
  const fields = chooseFields(identity, kind, input);
  const format = String(input.format || "csv").toLowerCase();
  if (!["csv", "xlsx"].includes(format)) throw fail(400, "Choose CSV or XLSX. PDF is reserved for printable reports.", "UNSUPPORTED_FORMAT");
  const db = getPool(), query = buildQuery(kind, identity, filters, fields);
  const total = Number((await db.query(query.count, query.args)).rows[0]?.total || 0);
  if (total > MAX_ROWS) throw fail(413, `This export contains ${total} rows, exceeding the safe ${MAX_ROWS}-row limit. Narrow the filters and retry.`, "EXPORT_ROW_LIMIT");
  const rows = [];
  for (let offset = 0; offset < total; offset += PAGE_SIZE) {
    const args = [...query.args, PAGE_SIZE, offset];
    const result = await db.query(query.rows + ` limit $${args.length - 1} offset $${args.length}`, args);
    rows.push(...result.rows);
  }
  if (rows.length !== total) throw fail(409, "The directory changed while the export was being generated. Refresh the preview and retry; no successful export was recorded.", "EXPORT_SNAPSHOT_CHANGED");
  const generatedAt = new Date().toISOString();
  const result = { kind, report: { title: kind === "members" ? "MPA member directory export" : "MPA account directory export", scope: "Restricted administrative data", definition: "Generated for authorized administration. Store and share only through approved MPA channels.", columns: fields.map(field => field.label) }, fields, filters, generatedAt, expectedRows: total, rows, totals: { rows: rows.length } };
  let buffer, contentType;
  if (format === "csv") { buffer = makeCsv(result); contentType = "text/csv; charset=utf-8"; }
  else {
    const safeRows = rows.map(row => Object.fromEntries(fields.map(field => [field.label, valueFor(row, field.key)])));
    buffer = makeXlsx({ report: result.report, filters: { ...filters, selectedFields: fields.map(field => field.key).join(", ") }, generatedAt, rows: safeRows, totals: { rows: safeRows.length } });
    contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (!Buffer.isBuffer(buffer) || buffer.length < 64 || (format === "csv" && !buffer.toString("utf8").includes(fields[0].label)) || (format === "xlsx" && buffer.readUInt32LE(0) !== 0x04034b50)) {
    throw fail(500, "The export file failed validation. No successful export was recorded.", "INVALID_EXPORT_FILE");
  }
  await db.query("insert into audit_log(actor_user_id,action,resource_type,request_id,outcome,metadata) values($1,$2,$3,$4,'success',$5)", [
    identity.sub, "directory.exported", kind === "members" ? "membership_record" : "app_user", requestId,
    JSON.stringify({ kind, format, rowCount: rows.length, expectedRows: total, fields: fields.map(field => field.key), filters, generatedAt }),
  ]);
  return { buffer, rowCount: rows.length, expectedRows: total, filename: `mpa-${kind}-directory-${generatedAt.slice(0, 10)}.${format}`, contentType };
}
