import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const webRoot = path.join(repositoryRoot, "web");

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(fullPath));
    else if (/\.(?:tsx?|jsx?)$/.test(entry.name)) files.push(fullPath);
  }
  return files;
}

test("web source has no direct navigation to the legacy /contact route", async () => {
  const files = await sourceFiles(webRoot);
  const violations = [];
  const directContactNavigation = /(?:\bhref\s*=\s*\{?\s*["']\/contact["']|\b(?:router\.)?(?:push|replace)\s*\(\s*["']\/contact["']|\b(?:window\.)?location(?:\.href)?\s*=\s*["']\/contact["']|\b(?:window\.)?location\.assign\(\s*["']\/contact["'])/g;
  for (const file of files) {
    if (file === path.join(webRoot, "app/contact/page.tsx")) continue;
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(directContactNavigation)) {
      violations.push(path.relative(repositoryRoot, file) + ": " + match[0]);
    }
  }
  assert.deepEqual(violations, [], "Use openSupport()/SupportAction; /contact is a compatibility redirect only.");
});

test("the single global support assistant and shared event contract remain intact", async () => {
  const [shell, bot, helper] = await Promise.all([
    readFile(path.join(webRoot, "components/shell.tsx"), "utf8"),
    readFile(path.join(webRoot, "components/support-bot.tsx"), "utf8"),
    readFile(path.join(webRoot, "lib/support.ts"), "utf8")
  ]);
  assert.equal((shell.match(/<SupportBot\s*\/>/g) || []).length, 1);
  assert.match(helper, /mpa:open-support-contact/);
  assert.match(bot, /addEventListener\("mpa:open-support-contact"/);
  assert.match(bot, /questionInputRef\.current\?\.focus\(\)/);
});

test("shared empty states are rendered only for successful empty results", async () => {
  const [saved, verification, tracking] = await Promise.all([
    readFile(path.join(webRoot, "app/saved/page.tsx"), "utf8"),
    readFile(path.join(webRoot, "app/verification/page.tsx"), "utf8"),
    readFile(path.join(webRoot, "app/track/page.tsx"), "utf8")
  ]);
  assert.match(saved, /items\.length===0&&!error/);
  assert.match(saved, /<EmptyState/);
  assert.match(verification, /!loading&&!error&&cases\.length===0/);
  assert.match(verification, /<EmptyState/);
  assert.match(tracking, /!loading\s*&&\s*!error\s*&&\s*data\?\.items\.length\s*===\s*0/);
  assert.match(tracking, /<EmptyState/);
});

test("workspace operation loading uses the branded mark and route loaders share the component", async () => {
  const [operationStatus, brandedLoader, loaderCss] = await Promise.all([
    readFile(path.join(webRoot, "components/operation-status.tsx"), "utf8"),
    readFile(path.join(webRoot, "components/branded-loader.tsx"), "utf8"),
    readFile(path.join(webRoot, "components/branded-loader.module.css"), "utf8")
  ]);
  assert.match(operationStatus, /<BrandedLoader[^>]*markOnly/);
  assert.match(loaderCss, /prefers-reduced-motion/);
  assert.match(brandedLoader, /markOnly/);
  for (const route of ["jobs", "mentorship", "serve-community", "organizations", "membership", "admin", "notifications", "verification", "track", "members", "profile", "dashboard", "services", "recruitment", "network", "organizations/directory"]) {
    const loader = await readFile(path.join(webRoot, "app", route, "loading.tsx"), "utf8");
    assert.match(loader, /BrandedLoader/);
  }
});
