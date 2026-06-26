import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "crypto";

/**
 * Symmetric encryption for mail-account passwords at rest (AES-256-GCM).
 *
 * The key is derived from MAIL_SECRET, falling back to NEXTAUTH_SECRET so this
 * works out of the box on a single-user deploy. Set a dedicated MAIL_SECRET if
 * you ever rotate NEXTAUTH_SECRET, otherwise stored passwords become unreadable.
 */
function key(): Buffer {
  const secret = process.env.MAIL_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("MAIL_SECRET / NEXTAUTH_SECRET is required to encrypt mail passwords");
  }
  // Static salt is fine here: the secret is high-entropy and per-deploy.
  return scryptSync(secret, "dreamdash-mail-v1", 32);
}

/** Encrypt a UTF-8 string → "v1:<base64(iv|tag|ciphertext)>". */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${Buffer.concat([iv, tag, ct]).toString("base64")}`;
}

/** Decrypt a value produced by encryptSecret. Throws if tampered/invalid. */
export function decryptSecret(stored: string): string {
  if (!stored.startsWith("v1:")) {
    throw new Error("Unrecognized encrypted secret format");
  }
  const raw = Buffer.from(stored.slice(3), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
