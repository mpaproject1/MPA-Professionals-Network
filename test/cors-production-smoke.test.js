import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = String(process.env.CORS_SMOKE_BASE_URL || "").replace(/\/+$/, "");
const allowedOrigin = String(
  process.env.CORS_SMOKE_ORIGIN || "https://portal.muslimprofession.org"
).trim();
const enabled = Boolean(baseUrl);
const smokeOptions = {
  skip: enabled ? false : "Set CORS_SMOKE_BASE_URL to run deployed API CORS smoke tests."
};

test("deployed API health response allows the configured portal origin", smokeOptions, async () => {
  const response = await fetch(`${baseUrl}/healthz`, {
    headers: { Origin: allowedOrigin }
  });

  assert.equal(response.status, 200, "health endpoint should return HTTP 200");
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    allowedOrigin,
    "allowed portal origin must be present on normal responses"
  );
  assert.match(
    response.headers.get("vary") || "",
    /(^|,\s*)origin(\s*,|$)/i,
    "normal responses must vary by Origin"
  );
});

test("deployed API answers browser preflight with the allowed portal origin", smokeOptions, async () => {
  const response = await fetch(`${baseUrl}/api/v1/membership/products`, {
    method: "OPTIONS",
    headers: {
      Origin: allowedOrigin,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "content-type"
    }
  });

  assert.equal(response.status, 204, "preflight should return HTTP 204");
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    allowedOrigin,
    "preflight must include the allowed portal origin"
  );
  assert.match(
    response.headers.get("access-control-allow-methods") || "",
    /\bGET\b/i,
    "preflight must allow GET"
  );
  assert.match(
    response.headers.get("access-control-allow-headers") || "",
    /\bcontent-type\b/i,
    "preflight must allow Content-Type"
  );
});

test("deployed API does not allow an untrusted origin", smokeOptions, async () => {
  const untrustedOrigin = "https://cors-untrusted.invalid";
  const response = await fetch(`${baseUrl}/healthz`, {
    headers: { Origin: untrustedOrigin }
  });

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    null,
    "untrusted origins must not receive Access-Control-Allow-Origin"
  );
});
