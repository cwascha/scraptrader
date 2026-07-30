import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { enforceBodyLimit, JSON_BODY_LIMIT } from "@/lib/body-limit";
import {
  DEFAULT_GRADES,
  MAX_GRADE_NAME,
  MAX_GRADE_CATEGORY,
  MAX_GRADES_PER_USER,
} from "@/lib/materials";

// Seed a user's grade list from the defaults the first time it's read.
// Lazy rather than at registration so existing accounts get it too, and
// so the defaults can change without a backfill.
//
// createMany + skipDuplicates makes this safe under concurrency: two
// simultaneous reads can't produce two copies, because [userId, name] is
// unique and the second insert silently drops the collisions.
async function ensureSeeded(userId: string): Promise<void> {
  const existing = await prisma.materialGrade.count({ where: { userId } });
  if (existing > 0) return;

  await prisma.materialGrade.createMany({
    data: DEFAULT_GRADES.map((g, idx) => ({
      userId,
      category: g.category,
      name: g.name,
      sortOrder: idx,
    })),
  });
}

// GET — the yard's grades, in sheet order.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureSeeded(user.id);

  const grades = await prisma.materialGrade.findMany({
    where: { userId: user.id },
    orderBy: { sortOrder: "asc" },
    select: { id: true, category: true, name: true },
  });

  return NextResponse.json(grades);
}

// POST — add a grade. Body: { category, name }.
export async function POST(req: NextRequest) {
  const tooLarge = enforceBodyLimit(req, JSON_BODY_LIMIT);
  if (tooLarge) return tooLarge;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { category?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const name =
    typeof body.name === "string" ? body.name.trim().slice(0, MAX_GRADE_NAME) : "";
  const category =
    typeof body.category === "string"
      ? body.category.trim().slice(0, MAX_GRADE_CATEGORY)
      : "";

  if (!name) {
    return NextResponse.json({ error: "Grade name is required" }, { status: 400 });
  }
  if (!category) {
    return NextResponse.json({ error: "Category is required" }, { status: 400 });
  }

  await ensureSeeded(user.id);

  const count = await prisma.materialGrade.count({ where: { userId: user.id } });
  if (count >= MAX_GRADES_PER_USER) {
    return NextResponse.json(
      { error: `You've reached the limit of ${MAX_GRADES_PER_USER} grades` },
      { status: 400 }
    );
  }

  // Append to the end of its category so a new grade lands beside its
  // siblings rather than at the bottom of the whole list.
  const siblings = await prisma.materialGrade.findMany({
    where: { userId: user.id, category },
    orderBy: { sortOrder: "desc" },
    take: 1,
    select: { sortOrder: true },
  });
  const sortOrder =
    siblings.length > 0
      ? siblings[0].sortOrder + 1
      : (await prisma.materialGrade.count({ where: { userId: user.id } })) + 1000;

  try {
    const grade = await prisma.materialGrade.create({
      data: { userId: user.id, category, name, sortOrder },
      select: { id: true, category: true, name: true },
    });
    return NextResponse.json(grade);
  } catch (error) {
    // [userId, name] unique — a duplicate is user error, not a 500.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: `"${name}" is already in your grade list` },
        { status: 400 }
      );
    }
    console.error("Add grade error:", error);
    return NextResponse.json(
      { error: "Couldn't add that grade — please try again" },
      { status: 500 }
    );
  }
}
