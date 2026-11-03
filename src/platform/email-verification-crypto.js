import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Derive a purpose-specific key from a stable server secret. Keep this secret stable
// across deployments; changing it requires an explicit re-encryption migration.
function key() {
  const secret = String(process.env.EMAIL_VERIFICATION_ENCRYPTION_KEY || process.env.JWT_SECRET || "").trim();
  if (secret.length < 32) throw Object.assign(new Error("A stable EMAIL_VERIFICATION_ENCRYPTION_KEY or 32-character JWT_SECRET is required to persist verification delivery safely."), { code: "EMAIL_VERIFICATION_ENCRYPTION_KEY_REQUIRED", statusCode: 503 });
  return createHash("sha256").update("mpa/email-verification-delivery/v1\0").update(secret).digest();
}

export function encryptVerificationToken(token) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(String(token), "utf8"), cipher.final()]);
  return { encryptedToken: encrypted.toString("base64url"), encryptionIv: iv.toString("base64url"), encryptionTag: cipher.getAuthTag().toString("base64url") };
}

export function decryptVerificationToken(record) {
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(record.encryption_iv, "base64url"));
  decipher.setAuthTag(Buffer.from(record.encryption_tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(record.encrypted_token, "base64url")), decipher.final()]).toString("utf8");
}
