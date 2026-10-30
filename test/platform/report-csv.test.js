import assert from "node:assert/strict";
import test from "node:test";
import { makeCsv } from "../../src/platform/reports.js";

test("CSV export preserves Unicode and raw leading zeroes while neutralizing formula-leading text", () => {
  const csv = makeCsv({
    report: { title: "Unicode አማርኛ", scope: "test", definition: "A report", columns: ["Name", "Reference", "Formula"] },
    generatedAt: "2026-10-29T12:00:00.000Z",
    filters: {},
    totals: { rows: 1 },
    rows: [{ Name: "አበበ", Reference: "0012345", Formula: '=HYPERLINK("https://example.test","open")' }],
  });
  const text = csv.toString("utf8");
  assert.ok(text.startsWith("\uFEFF"));
  assert.ok(text.includes("አበበ"));
  assert.ok(text.includes("0012345"));
  assert.ok(text.includes("'=HYPERLINK"));
  assert.ok(text.includes('"Name","Reference","Formula"'));
});


test("CSV formula guard neutralizes control whitespace before formula markers", () => {
  const csv = makeCsv({
    report: { title: "Formula guard", scope: "test", definition: "A report", columns: ["Value"] },
    generatedAt: "2026-10-30T00:00:00.000Z",
    filters: {},
    totals: { rows: 1 },
    rows: [{ Value: "\t=1+1" }],
  });
  assert.ok(csv.toString("utf8").includes("'\t=1+1"));
});
