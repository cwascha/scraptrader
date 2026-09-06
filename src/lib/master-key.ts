import crypto from "node:crypto";

// Envelope encryption for per-account data keys.
//
// Contact PII is encrypted under a per-user data key (`User.encryptionKey`).
// That key used to sit in the database in plaintext right beside the
// ciphertext it protected, so a stolen `dev.db` — or a dump of the Turso
// database — was enough to read every contact in every account.
//
// Now the data key is stored WRAPPED under a master key that lives in the
// environment, never in the database. Reading contacts requires BOTH the
// database and the host environment. This is the realistic ceiling for
// this product: the server must decrypt contacts unattended (publish
// emails, the Tier-3 nudge sweeper), so a key derived from the dealer's
// password is not an option.
//
// DELIBERATELY STRICTER THAN `NEXTAUTH_SECRET`, which keeps a dev
// fallback. The failure modes aren't comparable: a changed JWT secret
// logs everyone out, while a changed or missing master key makes contact
// PII PERMANENTLY UNRECOVERABLE. So there is no fallback value — a
// missing variable fails loudly rather than silently wrapping data under
// a default that production won't have.

if (
  process.env.NODE_ENV === "production" &&
  !process.env.ENCRYPTION_MASTER_KEY
) {
  throw new Error(
    "ENCRYPTION_MASTER_KEY must be set in production — refusing to start without it."
  );
}

const WRAP_VERSION = "w1";
const IV_LEN = 12;
const TAG_LEN = 16;

let cachedMaster: Buffer | null = null;

function masterKey(): Buffer {
  if (cachedMaster) return cachedMaster;
  const raw = process.env.ENCRYPTION_MASTER_KEY?.trim();
  if (!raw || raw.length < 32) {
    throw new Error(
      "ENCRYPTION_MASTER_KEY is missing or too short (need 32+ chars). " +
        "Generate one into .env with:\n" +
        `  node -e "console.log('ENCRYPTION_MASTER_KEY=\\"' + require('crypto').randomBytes(32).toString('base64') + '\\"')" | Add-Content .env\n` +
        "WARNING: once account keys are wrapped, changing this value makes contact data unrecoverable. Back it up."
    );
  }
  // SHA-256 to a fixed 32 bytes so any sufficiently long secret works as
  // input. No stretching KDF: this is a machine-generated secret, not a
  // human password.
  cachedMaster = crypto.createHash("sha256").update(raw, "utf8").digest();
  return cachedMaster;
}

export function isWrapped(stored: string): boolean {
  return stored.startsWith(`${WRAP_VERSION}:`);
}

// "w1:" + base64( iv(12) | tag(16) | ciphertext ) — same shape as the
// contact-field format, authenticated with AES-256-GCM.
export function wrapKey(plainKey: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const ct = Buffer.concat([cipher.update(plainKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${WRAP_VERSION}:${Buffer.concat([iv, tag, ct]).toString("base64")}`;
}

export function unwrapKey(stored: string): string {
  if (!isWrapped(stored)) {
    // Pre-envelope row: the data key is still plaintext. Returned as-is so
    // the app keeps working before and during the backfill. Delete this
    // branch once no unwrapped keys remain (`npm run backfill:keys`).
    return stored;
  }
  const raw = Buffer.from(stored.slice(WRAP_VERSION.length + 1), "base64");
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = raw.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey(), iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
      "utf8"
    );
  } catch {
    // GCM auth failure here means the master key doesn't match the one
    // these rows were wrapped with. Say so plainly — the generic "bad
    // decrypt" would send someone hunting in the wrong place.
    throw new Error(
      "Could not unwrap an account encryption key: ENCRYPTION_MASTER_KEY does not match the value these rows were wrapped with."
    );
  }
}
