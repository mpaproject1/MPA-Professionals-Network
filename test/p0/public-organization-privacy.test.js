import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const serverSource = await readFile(new URL("../../server.js", import.meta.url), "utf8");
const directoryPage = await readFile(
  new URL("../../web/app/organizations/directory/page.tsx", import.meta.url),
  "utf8",
);

test("public organization listing and profile API routes are not registered", () => {
  assert.doesNotMatch(serverSource, /p==="api\/v1\/public\/organizations"/);
  assert.doesNotMatch(
    serverSource,
    /p\.startsWith\("api\/v1\/public\/organizations\/"\)/,
  );
  assert.doesNotMatch(
    serverSource,
    /p==="api\/v1\/public\/opportunity-sharing-organizations"/,
  );
});

test("direct visits to the public organization directory redirect to Services", () => {
  assert.match(directoryPage, /import \{ redirect \} from "next\/navigation"/);
  assert.match(directoryPage, /redirect\("\/services"\)/);
});
