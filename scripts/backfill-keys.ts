/**
 * One-off maintenance, safe to re-run.
 *
 *   npm run backfill:keys -- --dry   # report only, writes nothing
 *   npm run backfill:keys            # apply
 *
 * Does two independent things:
 *
 *  1. WRAPS each account's data key under ENCRYPTION_MASTER_KEY. This is
 *     the actual envelope-encryption migration. Note it does NOT re-key
 *     anything: the per-user data key keeps its value, so every existing
 *     contact ciphertext stays valid as-is.
 *
 *  2. REWRITES any legacy (crypto-js / "Salted__") contact field into the
 *     current v2 AES-GCM format, under the same key. Unrelated to
 *     envelope encryption — it just retires the legacy read path so the
 *     compatibility branch in encryption.ts can be deleted.
 *
 * Stop the dev server first on Windows; it holds dev.db open.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { wrapKey, unwrapKey, isWrapped } from "../src/lib/master-key";
import { encrypt, decrypt } from "../src/lib/encryption";

const DRY = process.argv.includes("--dry");
const V2 = "v2:";

const adapter = new PrismaLibSql({
  url:
    process.env.TURSO_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "file:./dev.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const prisma = new PrismaClient({ adapter });

const FIELDS = [
  "encryptedName",
  "encryptedEmail",
  "encryptedPhone",
  "encryptedWhatsApp",
] as const;

async function main() {
  // Fail before touching anything if the master key is missing or weak.
  wrapKey("probe");

  console.log(DRY ? "DRY RUN — no writes\n" : "Applying changes\n");

  const users = await prisma.user.findMany({
    select: { id: true, email: true, encryptionKey: true },
  });

  let keysWrapped = 0;
  let keysAlready = 0;
  let contactsRewritten = 0;
  let fieldsRewritten = 0;
  let contactsFailed = 0;

  for (const user of users) {
    // Unwrap first if already wrapped (idempotent re-run), otherwise the
    // stored value IS the plaintext key.
    const plainKey = isWrapped(user.encryptionKey)
      ? unwrapKey(user.encryptionKey)
      : user.encryptionKey;

    if (isWrapped(user.encryptionKey)) {
      keysAlready++;
    } else {
      if (!DRY) {
        await prisma.user.update({
          where: { id: user.id },
          data: { encryptionKey: wrapKey(plainKey) },
        });
      }
      keysWrapped++;
      console.log(`  key wrapped: ${user.email}`);
    }

    const contacts = await prisma.contact.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        encryptedName: true,
        encryptedEmail: true,
        encryptedPhone: true,
        encryptedWhatsApp: true,
      },
    });

    for (const c of contacts) {
      const patch: {
        encryptedName?: string;
        encryptedEmail?: string;
        encryptedPhone?: string;
        encryptedWhatsApp?: string;
      } = {};

      try {
        for (const f of FIELDS) {
          const value = c[f];
          if (!value || value.startsWith(V2)) continue;
          // decrypt() auto-detects the legacy format; encrypt() always
          // writes v2. Same key on both sides.
          patch[f] = encrypt(decrypt(value, plainKey), plainKey);
          fieldsRewritten++;
        }
      } catch {
        // Leave undecryptable rows exactly as they are — never write a
        // guess over data we couldn't read.
        contactsFailed++;
        console.warn(`  ! contact ${c.id}: could not decrypt, left untouched`);
        continue;
      }

      if (Object.keys(patch).length > 0) {
        contactsRewritten++;
        if (!DRY) {
          await prisma.contact.update({ where: { id: c.id }, data: patch });
        }
      }
    }
  }

  console.log(
    [
      "",
      `Accounts:          ${users.length}`,
      `  keys wrapped:    ${keysWrapped}`,
      `  already wrapped: ${keysAlready}`,
      `Contacts rewritten to v2: ${contactsRewritten} (${fieldsRewritten} fields)`,
      contactsFailed > 0 ? `Contacts FAILED:   ${contactsFailed}` : null,
      "",
      DRY ? "Dry run — nothing was written." : "Done.",
    ]
      .filter((l) => l !== null)
      .join("\n")
  );
}

main()
  .catch((err) => {
    console.error("\nBackfill aborted:\n");
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
