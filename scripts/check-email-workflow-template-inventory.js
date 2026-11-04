import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const sourceRoot = path.join(root, "src");
const migrationRoot = path.join(root, "db", "migrations");

async function filesUnder(directory, suffix) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await filesUnder(full, suffix));
    else if (entry.isFile() && entry.name.endsWith(suffix)) found.push(full);
  }
  return found;
}

function matchingCall(source, openIndex) {
  let paren = 1, brace = 0, bracket = 0, quote = null, escaped = false;
  for (let i = openIndex + 1; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") { quote = ch; continue; }
    if (ch === "(") paren += 1;
    else if (ch === ")") {
      paren -= 1;
      if (paren === 0) return source.slice(openIndex + 1, i);
    } else if (ch === "{") brace += 1;
    else if (ch === "}") brace -= 1;
    else if (ch === "[") bracket += 1;
    else if (ch === "]") bracket -= 1;
  }
  throw new Error("Unclosed email queue call near source offset " + openIndex);
}

function splitArguments(value) {
  const args = [];
  let start = 0, paren = 0, brace = 0, bracket = 0, quote = null, escaped = false;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") { quote = ch; continue; }
    if (ch === "(") paren += 1;
    else if (ch === ")") paren -= 1;
    else if (ch === "{") brace += 1;
    else if (ch === "}") brace -= 1;
    else if (ch === "[") bracket += 1;
    else if (ch === "]") bracket -= 1;
    else if (ch === "," && paren === 0 && brace === 0 && bracket === 0) {
      args.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  args.push(value.slice(start).trim());
  return args;
}

function lineAt(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function topLevelConditional(value) {
  let quote = null, escaped = false, paren = 0, brace = 0, bracket = 0, question = -1, nested = 0;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "\`") { quote = ch; continue; }
    if (ch === "(") paren += 1;
    else if (ch === ")") paren -= 1;
    else if (ch === "{") brace += 1;
    else if (ch === "}") brace -= 1;
    else if (ch === "[") bracket += 1;
    else if (ch === "]") bracket -= 1;
    else if (paren === 0 && brace === 0 && bracket === 0) {
      if (ch === "?") { if (question < 0) question = i; nested += 1; }
      else if (ch === ":" && question >= 0) {
        nested -= 1;
        if (nested === 0) return [value.slice(0, question), value.slice(question + 1, i), value.slice(i + 1)];
      }
    }
  }
  return null;
}
function resolveLiterals(expression, constants, seen = new Set()) {
  let value = expression.trim();
  while (value.startsWith("(") && value.endsWith(")")) value = value.slice(1, -1).trim();
  const literal = value.match(/^(['"])(.*?)\1$/s);
  if (literal) return [literal[2]];
  const template = value.match(/^\`([^$]*)\`$/s);
  if (template) return [template[1]];
  if (/^[A-Za-z_$][\w$]*$/.test(value)) {
    if (seen.has(value) || !constants.has(value)) return [];
    const next = new Set(seen); next.add(value);
    return resolveLiterals(constants.get(value), constants, next);
  }
  const conditional = topLevelConditional(value);
  if (conditional) return [...new Set([...resolveLiterals(conditional[1], constants, seen), ...resolveLiterals(conditional[2], constants, seen)])];
  return [];
}

const sourceFiles = (await Promise.all([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"].map(suffix => filesUnder(sourceRoot, suffix))))
  .flat()
  .filter(file => !file.endsWith(path.join("platform", "email-operations.js")));
const migrationFiles = await filesUnder(migrationRoot, ".sql");
const migrations = (await Promise.all(migrationFiles.map(file => readFile(file, "utf8")))).join("\n");
const producers = new Map();
const unresolved = [];

for (const file of sourceFiles) {
  const source = await readFile(file, "utf8");
  const constants = new Map();
  for (const match of source.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(['"])([^'"\n]+)\2/g)) {
    constants.set(match[1], match[3]);
  }
  const pattern = /\b(queueWorkflowEmail|queueEmailNotification)\s*\(/g;
  for (const match of source.matchAll(pattern)) {
    const openIndex = match.index + match[0].lastIndexOf("(");
    const args = splitArguments(matchingCall(source, openIndex));
    const templateCodes = resolveLiterals(args[2] || "", constants);
    const location = path.relative(root, file) + ":" + lineAt(source, match.index);
    if (!templateCodes.length) {
      unresolved.push(location + " — third argument is not a statically resolvable template code");
      continue;
    }
    for (const templateCode of templateCodes) {
      if (!producers.has(templateCode)) producers.set(templateCode, []);
      producers.get(templateCode).push(location);
    }
  }
}

const missing = [...producers.keys()].filter(code => !migrations.includes(code));
if (unresolved.length || missing.length) {
  if (unresolved.length) {
    console.error("Email workflow producers with unresolved template codes:");
    for (const item of unresolved) console.error("  - " + item);
  }
  if (missing.length) {
    console.error("Email workflow template codes not present in any migration:");
    for (const code of missing) {
      console.error("  - " + code);
      for (const location of producers.get(code)) console.error("      " + location);
    }
  }
  process.exitCode = 1;
} else {
  console.log("Email workflow template inventory passed.");
  console.log("Producer call sites: " + [...producers.values()].reduce((sum, locations) => sum + locations.length, 0));
  console.log("Distinct producer templates: " + producers.size);
  for (const [code, locations] of [...producers].sort(([a], [b]) => a.localeCompare(b))) {
    console.log("  " + code + " (" + locations.length + " producer(s))");
  }
}
