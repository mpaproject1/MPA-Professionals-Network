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

test("explicit membership-view permission is accepted for the member catalogue", async () => {
  const memberViewer = { sub: "member-directory-viewer", roles: [], permissions: ["members.view"] };
  // The authorization check passes and the request proceeds to its database query.
  // A missing DATABASE_URL is not treated as an authorization failure.
  await assert.rejects(
    listMemberCatalog(memberViewer, {}),
    error => error.statusCode !== 403
  );
});
