/**
 * Set a dealer's company name.
 *
 *   npm run set:company -- "Ruby Recycling"
 *   npm run set:company -- "Ruby Recycling" ross@thescraptrader.com
 *
 * `User.companyName` is the DEALER's trading name. It appears on every
 * buyer-facing surface — deal pages, the buyer portal, price sheets, and
 * the From display name on outgoing email ("Ross (Ruby Recycling)").
 *
 * It is NOT the platform name. "ScrapTrader" in the logo, the landing
 * page, and the "Powered by" footer is hard-coded branding, not data —
 * see the note printed at the end.
 *
 * With no email argument this requires exactly one account, so it can't
 * silently rename the wrong yard on a multi-tenant database.
 *
 * Stop the dev server first on Windows; it holds dev.db open.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const [, , rawName, rawEmail] = process.argv;

const adapter = new PrismaLibSql({
  url:
    process.env.TURSO_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "file:./dev.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const name = rawName?.trim();
  if (!name) {
    throw new Error(
      'Usage: npm run set:company -- "New Company Name" [email]'
    );
  }

  const users = await prisma.user.findMany({
    select: { id: true, email: true, companyName: true },
    orderBy: { createdAt: "asc" },
  });

  if (users.length === 0) throw new Error("No accounts in this database.");

  let target = users[0];
  if (rawEmail) {
    const match = users.find(
      (u) => u.email.toLowerCase() === rawEmail.trim().toLowerCase()
    );
    if (!match) throw new Error(`No account with email ${rawEmail}`);
    target = match;
  } else if (users.length > 1) {
    throw new Error(
      `This database has ${users.length} accounts — pass an email to say which:\n` +
        users.map((u) => `  ${u.email}  (${u.companyName})`).join("\n")
    );
  }

  if (target.companyName === name) {
    console.log(`${target.email} is already "${name}" — nothing to do.`);
    return;
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { companyName: name },
  });

  console.log(
    [
      `Updated ${target.email}`,
      `  was: ${target.companyName}`,
      `  now: ${name}`,
      "",
      "This changes buyer-facing surfaces (deal pages, portal, price sheets,",
      "email From name). The ScrapTrader logo, landing page, and \"Powered by\"",
      "footer are hard-coded platform branding, not database values.",
    ].join("\n")
  );
}

main()
  .catch((err) => {
    console.error("\nFailed:\n");
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
