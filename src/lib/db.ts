import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

// Dev-HMR singleton: Next.js re-evaluates this module on every hot reload,
// so both the client AND its adapter must only be constructed when no
// cached instance exists. (Previously the adapter was built at top level
// on every reload — orphaning a libsql connection wrapper each time even
// though the cached client kept its original. Dev-only slow leak.)
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaLibSql({
    url:
      process.env.TURSO_DATABASE_URL ||
      process.env.DATABASE_URL ||
      "file:./dev.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
