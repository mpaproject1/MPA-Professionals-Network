import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { register } from "../../src/membership/service.js";
import { getPool } from "../../src/platform/db.js";
import { exportDirectory, listDirectoryExportFields, previewDirectoryExport } from "../../src/platform/directory-exports.js";

const admin = { sub: "directory-export-admin", roles: ["system_admin"], permissions: [] };
const memberAdmin = { sub: "directory-export-member-admin", roles: ["membership_reviewer"], permissions: [] };
const support = { sub: "directory-export-support", roles: ["supporting_staff"], permissions: [] };

test("directory export field catalogues preserve role boundaries and never offer unapproved profile fields", () => {
  const memberFields = listDirectoryExportFields(memberAdmin, "members").fields.map(field => field.key);
  assert.ok(memberFields.includes("membership_number"));
  assert.ok(memberFields.includes("email"));
  assert.equal(memberFields.includes("gender"), false);
  assert.equal(memberFields.includes("private_evidence"), false);
  assert.throws(() => listDirectoryExportFields(support, "members"), error => error.statusCode === 403);
  assert.throws(() => listDirectoryExportFields(support, "accounts"), error => error.statusCode === 403);
  const accountFields = listDirectoryExportFields(admin, "accounts").fields.map(field => field.key);
  assert.ok(accountFields.includes("account_reference"));
  assert.ok(accountFields.includes("membership_status"));
  assert.ok(accountFields.includes("organization_names"));
});

test("directory export rejects unauthorized columns, invalid date ranges and unsupported formats", async () => {
  await assert.rejects(() => previewDirectoryExport(admin, "accounts", { fields: ["gender"] }), error => error.statusCode === 403);
  await assert.rejects(() => previewDirectoryExport(admin, "accounts", { from: "2026-12-31", to: "2026-01-01" }), error => error.statusCode === 400);
  await assert.rejects(() => exportDirectory(admin, "accounts", { fields: ["account_reference"], format: "pdf" }, "directory-export-invalid-format"), error => error.statusCode === 400);
  await assert.rejects(() => previewDirectoryExport({ sub: "scoped-user", roles: [], permissions: ["users.view"] }, "accounts", { organizationId: "org-private", fields: ["account_reference"] }), error => error.statusCode === 403);
});

async function createDirectoryFixture() {
  const suffix = randomUUID();
  const digits = suffix.replace(/[^0-9]/g, "").slice(0, 8).padEnd(8, "7");
  const created = await register({
    email: `directory-export-${suffix}@example.test`,
    password: "DirectoryExportP1Password!2026",
    firstName: "Directory",
    lastName: "Fixture",
    phone: `07${digits}`,
  }, "directory-export-fixture");
  const db = getPool();
  const role = (await db.query("select id from app_role where role_code='system_admin'")).rows[0];
  assert.ok(role, "system_admin role must exist in the migrated test database");
  await db.query("insert into app_user_role(user_id,role_id) values($1,$2) on conflict do nothing", [created.user.id, role.id]);
  await db.query("update person set display_name=$2 where user_id=$1", [created.user.id, "=SUM(1,2) · የአባል ማውጫ · " + "long-value-".repeat(18)]);
  const account = (await db.query("select account_reference from app_user where id=$1", [created.user.id])).rows[0];
  return { id: created.user.id, email: created.user.email, accountReference: account.account_reference };
}

test("account export applies member/non-member row scope and safely preserves Unicode and long values", async () => {
  const fixture = await createDirectoryFixture();
  const db = getPool();
  const identity = { sub: fixture.id, roles: ["system_admin"], permissions: [] };
  const nonMemberPreview = await previewDirectoryExport(identity, "accounts", { fields: ["account_reference", "full_name"], membershipScope: "non_members", q: fixture.email });
  assert.equal(nonMemberPreview.expectedRows, 1);
  const memberPreview = await previewDirectoryExport(identity, "accounts", { fields: ["account_reference"], membershipScope: "members", q: fixture.email });
  assert.equal(memberPreview.expectedRows, 0);

  const csv = await exportDirectory(identity, "accounts", { fields: ["account_reference", "full_name"], membershipScope: "non_members", q: fixture.email, format: "csv" }, "directory-export-csv-test");
  assert.equal(csv.rowCount, 1);
  assert.equal(csv.expectedRows, 1);
  assert.ok(csv.buffer.length > 64);
  const text = csv.buffer.toString("utf8");
  assert.ok(text.includes("የአባል ማውጫ"), "Unicode text must remain intact");
  assert.ok(text.includes("long-value-".repeat(18)), "long values must not be truncated");
  assert.ok(text.includes("'=SUM(1,2)"), "formula-like values must be neutralized before spreadsheet import");
  assert.ok(text.includes(fixture.accountReference), "account reference must be retained as text");

  const xlsx = await exportDirectory(identity, "accounts", { fields: ["account_reference", "full_name"], membershipScope: "non_members", q: fixture.email, format: "xlsx" }, "directory-export-xlsx-test");
  assert.equal(xlsx.rowCount, 1);
  assert.equal(xlsx.buffer.readUInt32LE(0), 0x04034b50, "XLSX must be a valid ZIP container");
  assert.ok(xlsx.buffer.length > 64);

  const empty = await exportDirectory(identity, "accounts", { fields: ["account_reference"], q: "no-match-" + randomUUID(), format: "csv" }, "directory-export-empty-test");
  assert.equal(empty.rowCount, 0);
  assert.ok(empty.buffer.length > 64, "empty results still produce a valid header/manifest file");
  assert.ok(empty.buffer.toString("utf8").includes("account_reference"));

  const product = (await db.query("select id from membership_product where active=true order by product_code limit 1")).rows[0];
  assert.ok(product, "an active membership product must exist in the migrated CI database");
  await db.query("insert into membership_record(user_id,membership_product_id,membership_number,status,start_date,source) values($1,$2,$3,'active',current_date,'admin')", [fixture.id, product.id, "000012340056"]);
  const nowMember = await previewDirectoryExport(identity, "accounts", { fields: ["account_reference"], membershipScope: "members", q: fixture.email });
  const noLongerNonMember = await previewDirectoryExport(identity, "accounts", { fields: ["account_reference"], membershipScope: "non_members", q: fixture.email });
  assert.equal(nowMember.expectedRows, 1, "membership scope must include an account with a membership record");
  assert.equal(noLongerNonMember.expectedRows, 0, "non-member scope must exclude an account with a membership record");
  const activeMembership = await previewDirectoryExport(identity, "accounts", { fields: ["account_reference"], membershipStatus: "active", q: fixture.email });
  const pendingMembership = await previewDirectoryExport(identity, "accounts", { fields: ["account_reference"], membershipStatus: "pending", q: fixture.email });
  assert.equal(activeMembership.expectedRows, 1, "membership status filter must use current membership state");
  assert.equal(pendingMembership.expectedRows, 0, "membership status filter must exclude accounts outside the requested state");
  const memberCsv = await exportDirectory({ sub: fixture.id, roles: ["membership_reviewer"], permissions: [] }, "members", { fields: ["membership_number", "full_name"], q: "000012340056", format: "csv" }, "directory-export-leading-zero-test");
  assert.ok(memberCsv.buffer.toString("utf8").includes("000012340056"), "leading zeros in membership numbers must be preserved");
  assert.equal(memberCsv.rowCount, 1);

  await db.query("insert into membership_record(user_id,membership_product_id,membership_number,status,start_date,source) select $1,$2,'BULK-'||lpad(n::text,8,'0'),'active',current_date,'admin' from generate_series(1,505) n", [fixture.id, product.id]);
  const paged = await exportDirectory({ sub: fixture.id, roles: ["membership_reviewer"], permissions: [] }, "members", { fields: ["membership_number"], q: fixture.email, format: "csv" }, "directory-export-paged-test");
  assert.equal(paged.rowCount, 506, "exports must fetch all rows across the 500-row database page boundary");
  assert.ok(paged.buffer.toString("utf8").includes("BULK-00000505"), "rows after the first page must be included");
  assert.ok((await db.query("select id from app_user where id=$1", [fixture.id])).rowCount === 1);
});
