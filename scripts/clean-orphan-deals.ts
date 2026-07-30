/**
 * One-off: delete deals whose material is no longer a valid grade.
 *
 *   npm run clean:deals -- --dry   # report only
 *   npm run clean:deals            # delete
 *
 * Context: the ISRI grade list was removed on 2026-07-30 and replaced by
 * the yard's own vocabulary (MaterialGrade rows seeded from the Ruby
 * sheet). Deals created against ISRI codes ("Barley", "Saves") now
 * reference grades that don't exist in any picker.
 *
 * DESTRUCTIVE. Cascades take the deal's recipients, their messages, and
 * its image rows; this script additionally removes the deal's upload
 * directory, which a raw DB delete would orphan on disk.
 *
 * Stop the dev server first on Windows; it holds dev.db open.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { rm } from "node:fs/promises";
import path from "node:path";

const DRY = process.argv.includes("--dry");

const adapter = new PrismaLibSql({
  url:
    process.env.TURSO_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "file:./dev.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log(DRY ? "DRY RUN — no deletions\n" : "Deleting\n");

  const users = await prisma.user.findMany({ select: { id: true, email: true } });

  let checked = 0;
  let doomed = 0;

  for (const user of users) {
    // The user's valid vocabulary: every grade name plus every category.
    const grades = await prisma.materialGrade.findMany({
      where: { userId: user.id },
      select: { name: true, category: true },
    });

    if (grades.length === 0) {
      console.warn(
        `  ! ${user.email}: no grades seeded yet — open the app once, then re-run. Skipping.`
      );
      continue;
    }

    const valid = new Set<string>();
    for (const g of grades) {
      valid.add(g.name);
      valid.add(g.category);
    }

    const deals = await prisma.deal.findMany({
      where: { userId: user.id },
      select: { id: true, title: true, material: true },
    });

    for (const deal of deals) {
      checked++;
      if (valid.has(deal.material)) continue;

      doomed++;
      console.log(`  delete: "${deal.title}"  (material: ${deal.material})`);

      if (!DRY) {
        // Files first: if the DB delete fails we'd rather have an orphan
        // directory than a deal row pointing at images that are gone.
        const dir = path.join(process.cwd(), "public", "uploads", deal.id);
        await rm(dir, { recursive: true, force: true }).catch(() => {});
        await prisma.deal.delete({ where: { id: deal.id } });
      }
    }
  }

  console.log(
    [
      "",
      `Deals checked: ${checked}`,
      `Deals ${DRY ? "that would be deleted" : "deleted"}: ${doomed}`,
      "",
      DRY ? "Dry run — nothing was removed." : "Done.",
    ].join("\n")
  );
}

main()
  .catch((err) => {
    console.error("\nCleanup aborted:\n");
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
