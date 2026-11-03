import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import pg from "pg";

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;
const oldSecret = process.env.NETWORK_PLUS_CONTACT_ENCRYPTION_OLD_KEY;
const newSecret = process.env.NETWORK_PLUS_CONTACT_ENCRYPTION_NEW_KEY;

function requireSecret(value,label) {
  if (typeof value !== "string" || value.length < 32) {
    throw new Error(`${label} must contain at least 32 characters.`);
  }
  return createHash("sha256").update(value).digest();
}
function contextFor(row) {
  return `network-plus-contact:v1:${row.request_id}:${row.recipient_user_id}:${row.field_code}`;
}
function decrypt(value,key,context) {
  const [version,iv,tag,data] = String(value || "").split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("A stored contact value has an unsupported or invalid encryption envelope.");
  const decipher = createDecipheriv("aes-256-gcm",key,Buffer.from(iv,"base64url"));
  decipher.setAAD(Buffer.from(context,"utf8"));
  decipher.setAuthTag(Buffer.from(tag,"base64url"));
  try {
    return Buffer.concat([decipher.update(Buffer.from(data,"base64url")),decipher.final()]).toString("utf8");
  } catch {
    throw new Error("A stored contact value could not be authenticated with the old key; no rows were changed.");
  }
}
function encrypt(value,key,context) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm",key,iv);
  cipher.setAAD(Buffer.from(context,"utf8"));
  const ciphertext = Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  return ["v1",iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),ciphertext.toString("base64url")].join(".");
}

if (!connectionString) throw new Error("DATABASE_URL is required.");
if (process.env.NETWORK_PLUS_CONTACT_KEY_ROTATION_CONFIRM !== "YES") {
  throw new Error("Set NETWORK_PLUS_CONTACT_KEY_ROTATION_CONFIRM=YES only after placing contact sharing in maintenance mode and backing up the database and old key.");
}
const oldKey = requireSecret(oldSecret,"NETWORK_PLUS_CONTACT_ENCRYPTION_OLD_KEY");
const newKey = requireSecret(newSecret,"NETWORK_PLUS_CONTACT_ENCRYPTION_NEW_KEY");
if (oldSecret === newSecret) throw new Error("The new contact encryption key must differ from the old key.");

const client = new Client({ connectionString, application_name: "mpa-network-plus-contact-key-rotation" });
let transactionOpen = false;
try {
  await client.connect();
  const identity = (await client.query("select current_database() database_name")).rows[0];
  if (/(^|[_-])(prod|production|live)([_-]|$)/i.test(identity.database_name) &&
      process.env.NETWORK_PLUS_CONTACT_KEY_ROTATION_ALLOW_PRODUCTION !== "YES") {
    throw new Error("Production-like database name detected. Set NETWORK_PLUS_CONTACT_KEY_ROTATION_ALLOW_PRODUCTION=YES only with the approved maintenance and recovery plan.");
  }

  await client.query("begin");
  transactionOpen = true;
  await client.query("lock table network_plus_request_contact_consent in access exclusive mode");
  const rows = (await client.query(
    `select request_id,recipient_user_id,field_code,requester_value_ciphertext,recipient_value_ciphertext
       from network_plus_request_contact_consent
      where requester_value_ciphertext is not null or recipient_value_ciphertext is not null
      order by request_id,recipient_user_id,field_code
      for update`
  )).rows;

  let rotatedValues = 0;
  for (const row of rows) {
    const context = contextFor(row);
    const requesterValue = row.requester_value_ciphertext === null
      ? null
      : decrypt(row.requester_value_ciphertext,oldKey,context);
    const recipientValue = row.recipient_value_ciphertext === null
      ? null
      : decrypt(row.recipient_value_ciphertext,oldKey,context);
    const requesterCiphertext = requesterValue === null ? null : encrypt(requesterValue,newKey,context);
    const recipientCiphertext = recipientValue === null ? null : encrypt(recipientValue,newKey,context);

    if (requesterCiphertext !== null && decrypt(requesterCiphertext,newKey,context) !== requesterValue) {
      throw new Error("New-key verification failed for a requester contact value; no rows were committed.");
    }
    if (recipientCiphertext !== null && decrypt(recipientCiphertext,newKey,context) !== recipientValue) {
      throw new Error("New-key verification failed for a recipient contact value; no rows were committed.");
    }

    await client.query(
      `update network_plus_request_contact_consent
          set requester_value_ciphertext=$1,recipient_value_ciphertext=$2,updated_at=now()
        where request_id=$3 and recipient_user_id=$4 and field_code=$5`,
      [requesterCiphertext,recipientCiphertext,row.request_id,row.recipient_user_id,row.field_code]
    );
    rotatedValues += Number(requesterCiphertext !== null) + Number(recipientCiphertext !== null);
  }

  await client.query("commit");
  transactionOpen = false;
  console.log(`PASS: rotated ${rotatedValues} encrypted Network-Plus contact values across ${rows.length} consent records. No plaintext values were logged.`);
} catch (error) {
  if (transactionOpen) {
    try { await client.query("rollback"); } catch {}
    transactionOpen = false;
  }
  console.error("Network-Plus contact key rotation failed; the transaction was rolled back.",error instanceof Error ? error.message : "Unknown error.");
  process.exitCode = 1;
} finally {
  await client.end();
}
