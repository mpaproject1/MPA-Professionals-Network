import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig, parseAllowedOrigins, resolveAllowedOrigin } from "../src/platform/config.js";

const portalOrigin = "https://portal.muslimprofession.org";

test("allowed origins support multiple browser origins for local development", () => {
  const configured = "http://localhost:3001, http://127.0.0.1:3001";
  const allowed = parseAllowedOrigins(configured);

  assert.deepEqual(allowed, ["http://localhost:3001", "http://127.0.0.1:3001"]);
  assert.equal(resolveAllowedOrigin("http://localhost:3001", configured), "http://localhost:3001");
  assert.equal(resolveAllowedOrigin("https://example.com", configured), null);
  assert.equal(resolveAllowedOrigin("https://example.com", ""), null);
});

test("production portal origin is read from CORS_ORIGIN and allowed exactly", () => {
  const config = loadConfig({ CORS_ORIGIN: portalOrigin });

  assert.equal(config.corsOrigin, portalOrigin);
  assert.equal(resolveAllowedOrigin(portalOrigin, config.corsOrigin), portalOrigin);
});

test("production CORS allow-list rejects an unrelated origin", () => {
  assert.equal(
    resolveAllowedOrigin("https://cors-untrusted.invalid", portalOrigin),
    null
  );
});

test("origin matching tolerates a trailing slash in configuration without widening access", () => {
  assert.equal(resolveAllowedOrigin(portalOrigin, `${portalOrigin}/`), portalOrigin);
  assert.equal(resolveAllowedOrigin("https://portal.muslimprofession.org.attacker.invalid", portalOrigin), null);
});
