import assert from "node:assert/strict";
import test from "node:test";
import { listMemberCatalog } from "../../src/membership/admin-bulk.js";

test("Finance-only access cannot enumerate the member catalogue", async () => {
  const financeOnly = { sub: "finance-directory-guard", roles: ["finance_officer"], permissions: [] };
  await assert.rejects(
    listMemberCatalog(financeOnly, {}),
    error => error.statusCode === 403 && error.code === "FORBIDDEN"
  );
});
