import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const serverSource = await readFile(new URL("../../server.js", import.meta.url), "utf8");
const publicOpportunitySource = await readFile(new URL("../../src/platform/public-opportunity.js", import.meta.url), "utf8");
const directoryPage = await readFile(
  new URL("../../web/app/organizations/directory/page.tsx", import.meta.url),
  "utf8",
);
const membershipPage = await readFile(new URL("../../web/app/membership/workspace.tsx", import.meta.url), "utf8");
const adminMembershipPage = await readFile(new URL("../../web/app/admin/membership/page.tsx", import.meta.url), "utf8");
const shell = await readFile(new URL("../../web/components/shell.tsx", import.meta.url), "utf8");

test("public organization directory is private and named sharing uses bounded search", () => {
  assert.doesNotMatch(serverSource, /p==="api\/v1\/public\/organizations"/);
  assert.doesNotMatch(
    serverSource,
    /p\.startsWith\("api\/v1\/public\/organizations\/"\)/,
  );
  assert.match(
    serverSource,
    /p==="api\/v1\/public\/opportunity-sharing-organizations"[\s\S]*?const searchTerm=query\(req.url\)\.get\("q"\)\|\|""[\s\S]*?searchPublicSharingOrganizations\(searchTerm\)/,
  );
  assert.match(publicOpportunitySource, /export async function searchPublicSharingOrganizations\(searchTerm\)/);
  assert.match(publicOpportunitySource, /if\(term\.length<3\) throw error\(400,[^;]*SEARCH_TERM_REQUIRED/);
  assert.match(publicOpportunitySource, /verification_status='verified' and public_visible=true and \(display_name ilike \$1 or legal_name ilike \$1\)[\s\S]*limit 10/);
});
test("Services is primary and organization workspace links require a signed-in organization account", () => {
  assert.match(shell, /\["\/services","Services",BriefcaseBusiness\]/);
  assert.match(shell, /\["\/serve-community","Serve-Community",Search\]/);
  assert.doesNotMatch(shell, /\["\/","Home",/);
  assert.doesNotMatch(shell, /\["\/network","Network",/);
  assert.match(shell, /const desktopPrimary=visibleNav\.filter\(\(\[href\]\)=>\["\\/serve-community","\\/jobs"\]\.includes\(href\)\)/);
  assert.match(shell, /const mobilePrimary=visibleNav\.filter\(\(\[href\]\)=>\["\\/serve-community","\\/jobs"\]\.includes\(href\)\)/);
  assert.doesNotMatch(shell, /\/organizations\/directory/);
  assert.match(shell, /if\(token&&hasOrganizations\)[\s\S]*mobileMore\.push\(orgLink\)/);
});

test("direct visits to the public organization directory redirect to Services", () => {
  assert.match(directoryPage, /import \{ redirect \} from "next\/navigation"/);
  assert.match(directoryPage, /redirect\("\/services"\)/);
});

test("membership management is separated from the member self-service page", () => {
  assert.match(membershipPage, /\{!adminWorkspace&&token&&<Card>/);
  assert.match(membershipPage, /\{adminWorkspace&&token&&\(roles\.includes/);
  assert.match(membershipPage, /\{adminWorkspace&&token&&\(roles\.some/);
  assert.match(adminMembershipPage, /Membership administration is available only to authorized/);
  assert.match(adminMembershipPage, /return <MembershipWorkspace adminWorkspace \/>/);
});
