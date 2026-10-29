import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("signed-out navigation exposes only the intended public destinations", () => {
  const shell = read("web/components/shell.tsx");
  assert.match(shell, /if\(!token\)return \["\/about","\/jobs","\/serve-community"\]\.includes\(href\)/);
  assert.match(shell, /\["\/about","About",Info\]/);
});

test("workspace and learning destinations are signed-in navigation items, not public links", () => {
  const shell = read("web/components/shell.tsx");
  assert.match(shell, /\["\/members","My-Workspace",LayoutDashboard\]/);
  assert.match(shell, /\["\/learning","My-Learning",GraduationCap\]/);
  assert.match(shell, /if\(!token\)return \["\/about","\/jobs","\/serve-community"\]\.includes\(href\)/);
  assert.match(shell, /href==="\/profile"&&\(accountRoles===null\|\|!hasProfessionalIdentity\(accountRoles\)\)/);
  assert.match(shell, /aria-label="Mobile navigation"/);
  assert.match(shell, /aria-current=\{pathname===href\?"page":undefined\}/);
  assert.match(shell, /event\.key==="Escape"\)setMobileMoreOpen\(false\)/);
});

test("home is a portal landing page with the original hero, live login, and pathway slider only", () => {
  const home = read("web/app/page.tsx");
  assert.match(home, /<section className=\{styles\.hero\}/);
  assert.match(home, /<LandingLoginForm \/>/);
  assert.match(home, /<PortalPathwaysSlider \/>/);
  assert.match(home, /href="#pathways-slider"/);
  assert.doesNotMatch(home, /LiveNetworkFeeds|platform-update-title|live-network-heading|portal-pillars-heading|journeysHeadingId|dispatchHeadingId/);
});

test("landing sign-in uses the real authentication API and safe local return paths", () => {
  const login = read("web/components/landing-login-form.tsx");
  assert.match(login, /"\/api\/v1\/auth\/login"/);
  assert.match(login, /setToken\(result\.token\)/);
  assert.match(login, /requested\?\.startsWith\("\/"\)&&!requested\.startsWith\("\/\/"\)/);
  assert.match(login, /EMAIL_VERIFICATION_REQUIRED/);
  assert.match(login, /autoComplete="current-password"/);
});

test("pathway slider exposes public routes and accessible manual controls", () => {
  const slider = read("web/components/portal-pathways-slider.tsx");
  assert.match(slider, /href: "\/jobs"/);
  assert.match(slider, /href: "\/serve-community"/);
  assert.match(slider, /href: "\/mentorship"/);
  assert.match(slider, /aria-roledescription="carousel"/);
  assert.match(slider, /aria-label="Previous pathway"/);
  assert.match(slider, /aria-label="Next pathway"/);
  assert.match(slider, /aria-pressed=\{active === index\}/);
});

test("learning preview clearly marks planned areas as coming soon without claiming credentials", () => {
  const learning = read("web/app/learning/page.tsx");
  assert.match(learning, /if \(hydrated && !token\) router\.replace\("\/login\?next=%2Flearning"\)/);
  assert.match(learning, /Resources/);
  assert.match(learning, /Courses/);
  assert.match(learning, /Certifications/);
  assert.match(learning, /Coming soon/);
  assert.match(learning, /No learning activity, CPD credit or certification is created by this preview/);
});

test("About page uses the local replaceable illustration and only supported core pathways", () => {
  const about = read("web/app/about/page.tsx");
  assert.match(about, /src="\/illustrations\/mpa-network-placeholder\.svg"/);
  assert.match(about, /alt="Abstract illustration of people and professional pathways/);
  for (const path of ["/jobs", "/serve-community", "/mentorship", "/membership"]) assert.ok(about.includes(path), `Missing pathway ${path}`);
  assert.doesNotMatch(about, /testimonial|\b[0-9,]+ members\b|https?:\/\//i);
  const asset = read("web/public/illustrations/mpa-network-placeholder.svg");
  assert.match(asset, /<title/);
  assert.match(asset, /<desc/);
});

test("home hero animation respects reduced-motion preferences", () => {
  const styles = read("web/app/landing-redesign.module.css");
  assert.match(styles, /@keyframes heroMeshDrift/);
  assert.match(styles, /@keyframes heroLightFloat/);
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)\{\.heroMesh,\.heroGlowOne,\.heroGlowTwo\{animation:none!important/);
});
