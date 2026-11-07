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
test("compact public primary navigation and organization workspace privacy remain enforced", () => {
  assert.match(shell, /\["\/about","About",Info\]/);
  assert.match(shell, /\["\/jobs","Job Portal",BriefcaseBusiness\]/);
  assert.match(shell, /\["\/serve-community","Serve-Community",Search\]/);
  assert.match(shell, /\["\/members","My-Workspace",LayoutDashboard\]/);
  assert.match(shell, /\["\/learning","My-Learning",GraduationCap\]/);
  assert.doesNotMatch(shell, /\["\/","Home",/);
  assert.doesNotMatch(shell, /\["\/network","Network",/);
  assert.match(shell, /const primaryHrefs=token\?\["\/jobs","\/network-plus","\/serve-community","\/members","\/mentorship"\]:\["\/about","\/jobs","\/serve-community"\]/);
  assert.match(shell, /const desktopPrimary=visibleNav\.filter\(\(\[href\]\)=>primaryHrefs\.includes\(href\)\)/);
  assert.match(shell, /const mobilePrimaryHrefs=token\?\["\/jobs","\/members","\/network-plus","\/mentorship"\]:\["\/about","\/jobs","\/serve-community","\/login"\]/);
  assert.doesNotMatch(shell, /\/organizations\/directory/);
  assert.match(shell, /if\(token&&hasOrganizations\)[\s\S]*mobileMore\.push\(orgLink\)/);
});

test("direct visits to the public organization directory redirect to Services", () => {
  assert.match(directoryPage, /import \{ redirect \} from "next\/navigation"/);
  assert.match(directoryPage, /redirect\("\/services"\)/);
});

test("membership management is separated from the member self-service page", () => {
  assert.match(membershipPage, /\{!adminWorkspace&&token&&<section className="membership-status-hero/);
  assert.match(membershipPage, /\{adminWorkspace&&token&&\(roles\.includes/);
  assert.match(membershipPage, /\{adminWorkspace&&token&&\(roles\.some/);
  assert.match(adminMembershipPage, /Membership application review and activation are available only to authorized/);
  assert.match(adminMembershipPage, /return <MembershipAdminWorkspace \/>/);
  assert.match(adminMembershipPage, /membership\.review/);
  assert.doesNotMatch(adminMembershipPage, /MembershipWorkspace adminWorkspace/);
  assert.match(adminMembershipPage, /\/admin\/membership\/payment-methods/);
});
