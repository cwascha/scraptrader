import { prisma } from "./db";

// SERVER-ONLY companion to lib/materials.ts.
//
// Kept separate on purpose: materials.ts is imported by MaterialSelect on
// the client, so it must stay free of Prisma. Anything needing the DB
// lives here.

// A material is valid if it's one of THIS user's grade names, or one of
// their category names (a mixed load posted at category level).
//
// Checked against the DB rather than a static list, because the grade
// vocabulary is now per-yard and extensible — one yard's "Romex" list is
// not another's.
export async function isValidMaterial(
  userId: string,
  value: string
): Promise<boolean> {
  const match = await prisma.materialGrade.findFirst({
    where: { userId, OR: [{ name: value }, { category: value }] },
    select: { id: true },
  });
  return match !== null;
}
