import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [rotation,packageText]=await Promise.all([
  readFile(new URL("../../scripts/rotate-network-plus-contact-key.js",import.meta.url),"utf8"),
  readFile(new URL("../../package.json",import.meta.url),"utf8")
]);

test("Network-Plus contact key rotation is explicit, transactional and context authenticated",()=>{
  assert.match(rotation,/NETWORK_PLUS_CONTACT_ENCRYPTION_OLD_KEY/);
  assert.match(rotation,/NETWORK_PLUS_CONTACT_ENCRYPTION_NEW_KEY/);
  assert.match(rotation,/NETWORK_PLUS_CONTACT_KEY_ROTATION_CONFIRM/);
  assert.match(rotation,/lock table network_plus_request_contact_consent in access exclusive mode/);
  assert.match(rotation,/cipher\.setAAD\(Buffer\.from\(context/);
  assert.match(rotation,/decipher\.setAAD\(Buffer\.from\(context/);
  assert.match(rotation,/const legacy = parts\.length === 3/);
  assert.match(rotation,/if \(!legacy\) decipher\.setAAD/);
  assert.match(rotation,/await client\.query\("rollback"\)/);
  assert.match(rotation,/NETWORK_PLUS_CONTACT_KEY_ROTATION_ALLOW_PRODUCTION/);
  assert.match(rotation,/No plaintext values were logged/);
  assert.match(packageText,/"network-plus:rotate-contact-key": "node scripts\/rotate-network-plus-contact-key\.js"/);
});
