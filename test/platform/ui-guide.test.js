import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("screen tour uses accessible non-blocking controls and stable semantic targets",async()=>{
 const guide=await readFile(new URL("../../web/components/guide.tsx",import.meta.url),"utf8");
 const css=await readFile(new URL("../../web/app/globals.css",import.meta.url),"utf8");
 const botCss=await readFile(new URL("../../web/components/support-bot.module.css",import.meta.url),"utf8");
 const bot=await readFile(new URL("../../web/components/support-bot.tsx",import.meta.url),"utf8");
 assert.match(guide,/usePathname\(\)/);
 assert.match(guide,/data-guide-target/);
 assert.match(guide,/Step \{index\+1\} of \{steps\.length\}/);
 for(const control of ["Back","Skip","Finish","Close tour"])assert.ok(guide.includes(control),control+" control must remain available");
 assert.match(guide,/event\.key==="Escape"/);
 assert.match(guide,/aria-modal="false"/);
 assert.match(guide,/That control is not visible in this layout/);
 assert.doesNotMatch(guide,/guide-dim|aria-modal="true"/);
 assert.match(css,/\.guide-overlay\{position:fixed;inset:0;z-index:100;pointer-events:none\}/);
 assert.match(css,/\.guide-card\{position:fixed;z-index:102;/);
 assert.match(css,/\.guide-help\{position:fixed;left:22px;right:auto;/);
 assert.match(botCss,/\.root\{position:fixed;right:24px;bottom:24px;z-index:80;/);
 assert.match(css,/\.guide-help\{position:fixed;left:22px;right:auto;bottom:22px;z-index:85;/);
 assert.match(bot,/setGuideActive\(true\)/);
 assert.match(bot,/mpa:guide-closed/);
 assert.match(guide,/mpa:guide-closed/);
});

test("current workspace and membership screens expose every curated tour target and restart action",async()=>{
 const members=await readFile(new URL("../../web/app/members/page.tsx",import.meta.url),"utf8");
 const membership=await readFile(new URL("../../web/app/membership/workspace.tsx",import.meta.url),"utf8");
 const payment=await readFile(new URL("../../web/app/membership/payment/page.tsx",import.meta.url),"utf8");
 const shell=await readFile(new URL("../../web/components/shell.tsx",import.meta.url),"utf8");
 const guide=await readFile(new URL("../../web/components/guide.tsx",import.meta.url),"utf8");
 for(const target of ["workspace-overview","workspace-progress","workspace-shortcuts","workspace-help"])assert.ok(members.includes('data-guide-target="'+target+'"'),target);
 assert.match(members,/Show me around/);
 assert.ok(membership.includes('data-guide-target="membership-overview"'));
 assert.ok(membership.includes('data-guide-target="membership-application"'));
 assert.match(membership,/Membership guide/);
 for(const target of ["payment-overview","payment-application","payment-submit"])assert.ok(payment.includes('data-guide-target="'+target+'"'),target);
 assert.match(payment,/Payment guide/);
 for(const target of ["brand-home","main-navigation"])assert.ok(shell.includes('data-guide-target="'+target+'"'),target);
 assert.ok(guide.includes('data-guide-target="help-control"'));
});

test("migration disables stale route tours and seeds only audited current route guides",async()=>{
 const migration=await readFile(new URL("../../db/migrations/20261030160000_workstream_4_contextual_screen_tours.sql",import.meta.url),"utf8");
 const service=await readFile(new URL("../../src/platform/experience.js",import.meta.url),"utf8");
 const server=await readFile(new URL("../../server.js",import.meta.url),"utf8");
 const admin=await readFile(new URL("../../web/app/admin/experience/page.tsx",import.meta.url),"utf8");
 assert.match(migration,/set active=false/);
 for(const route of ["'\*'","'/members'","'/membership'","'/membership/payment'"])assert.ok(migration.includes(route),route);
 for(const target of ["brand-home","main-navigation","help-control","workspace-overview","workspace-progress","workspace-shortcuts","workspace-help","membership-overview","membership-application","payment-overview","payment-application","payment-submit"])assert.ok(migration.includes(target),target);
 assert.match(migration,/on conflict\(guide_key\) do update/);
 assert.match(service,/GUIDE_RETIRED/);
 assert.match(service,/CURRENT_GUIDE_KEYS\.has\(current\.guide_key\)/);
 assert.match(service,/where active=true order by sort_order,title/);
 assert.match(service,/listAdminGuides/);
 assert.ok(server.includes('p==="api/v1/admin/experience/guides"'));
 assert.match(admin,/currentGuideKeys\.has\(guide\.guide_key\)/);
 assert.ok(admin.includes('/api/v1/admin/experience/guides'));
});
