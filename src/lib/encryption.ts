import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { unwrapKey } from "./master-key";

// Per-user symmetric key for contact PII. High-entropy by construction
// (two v4 UUIDs ≈ 244 bits), so it can be used as key material directly.
// STORED WRAPPED under the master key — see master-key.ts and the register
// route, which calls wrapKey() before persisting.
export function generateEncryptionKey(): string {
  return uuidv4() + "-" + uuidv4();
}

// --- AES-256-GCM (authenticated) ----------------------------------------
// Ciphertexts are written as:  "v2:" + base64( iv(12) | tag(16) | ct ).
// The per-user key string is hashed to a 32-byte AES key with SHA-256.
// A password-stretching KDF (scrypt/PBKDF2) is deliberately NOT used: the
// input key is already uniformly random and high-entropy, so a single hash
// is sound and avoids having to store a per-record salt. GCM gives us an
// authentication tag, so tampered ciphertext fails to decrypt instead of
// silently returning garbage (crypto-js's unauthenticated CBC did not).
const GCM_VERSION = "v2";
const IV_LEN = 12;
const TAG_LEN = 16;

function deriveKey(key: string): Buffer {
  return crypto.createHash("sha256").update(key, "utf8").digest();
}

export function encrypt(text: string, key: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(key), iv);
  const ct = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${GCM_VERSION}:${Buffer.concat([iv, tag, ct]).toString("base64")}`;
}

export function decrypt(ciphertext: string, key: string): string {
  if (!ciphertext.startsWith(`${GCM_VERSION}:`)) {
    // Pre-2026-07-26 rows used crypto-js (OpenSSL "Salted__" envelope:
    // EVP_BytesToKey/MD5 → unauthenticated AES-CBC). The compatibility
    // reader was removed after `npm run backfill:keys` rewrote every
    // stored value to v2 and reported zero remaining. If this throws,
    // something restored an old database — recover the reader from git
    // history rather than re-deriving it.
    throw new Error("Unrecognized ciphertext format (expected v2:)");
  }
  const raw = Buffer.from(ciphertext.slice(GCM_VERSION.length + 1), "base64");
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = raw.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(key), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
    "utf8"
  );
}

// The two functions below take the key AS STORED on the user row (wrapped
// under the master key, or plaintext on pre-backfill rows) and unwrap it
// internally. Callers keep passing `user.encryptionKey` and need to know
// nothing about envelope encryption — which is why adding it touched no
// route. The raw `encrypt`/`decrypt` primitives above take an UNWRAPPED
// key; the backfill script is the only other caller.

export function encryptContact(
  contact: {
    name: string;
    company?: string;
    email?: string;
    phone?: string;
    whatsapp?: string;
  },
  storedKey: string
) {
  const key = unwrapKey(storedKey);
  return {
    encryptedName: encrypt(contact.name, key),
    encryptedCompany: contact.company ? encrypt(contact.company, key) : null,
    encryptedEmail: contact.email ? encrypt(contact.email, key) : null,
    encryptedPhone: contact.phone ? encrypt(contact.phone, key) : null,
    encryptedWhatsApp: contact.whatsapp ? encrypt(contact.whatsapp, key) : null,
  };
}

export function decryptContact(
  encrypted: {
    encryptedName: string;
    // Optional so callers that select a narrower shape (e.g. accept-bid,
    // which only needs the name and email) don't have to change.
    encryptedCompany?: string | null;
    encryptedEmail: string | null;
    encryptedPhone: string | null;
    encryptedWhatsApp: string | null;
  },
  storedKey: string
) {
  const key = unwrapKey(storedKey);
  return {
    name: decrypt(encrypted.encryptedName, key),
    company: encrypted.encryptedCompany
      ? decrypt(encrypted.encryptedCompany, key)
      : null,
    email: encrypted.encryptedEmail
      ? decrypt(encrypted.encryptedEmail, key)
      : null,
    phone: encrypted.encryptedPhone
      ? decrypt(encrypted.encryptedPhone, key)
      : null,
    whatsapp: encrypted.encryptedWhatsApp
      ? decrypt(encrypted.encryptedWhatsApp, key)
      : null,
  };
}
