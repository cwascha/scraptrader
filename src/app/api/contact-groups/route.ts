import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { enforceBodyLimit, JSON_BODY_LIMIT } from "@/lib/body-limit";

// Groups are returned with their member contact ids so clients (contacts
// page, publish panel) can expand membership without extra requests.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const groups = await prisma.contactGroup.findMany({
    where: { userId: user.id },
    include: { contacts: { select: { id: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    groups.map((g) => ({
      id: g.id,
      name: g.name,
      contactIds: g.contacts.map((c) => c.id),
    }))
  );
}

export async function POST(req: NextRequest) {
  const tooLarge = enforceBodyLimit(req, JSON_BODY_LIMIT);
  if (tooLarge) return tooLarge;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json(
      { error: "Group name is required" },
      { status: 400 }
    );
  }

  const existing = await prisma.contactGroup.findFirst({
    where: { userId: user.id, name },
  });
  if (existing) {
    return NextResponse.json(
      { error: `A group named "${name}" already exists` },
      { status: 400 }
    );
  }

  const group = await prisma.contactGroup.create({
    data: { userId: user.id, name: name.slice(0, 100) },
  });

  return NextResponse.json({ id: group.id, name: group.name, contactIds: [] });
}

export async function DELETE(req: NextRequest) {
  const tooLarge = enforceBodyLimit(req, JSON_BODY_LIMIT);
  if (tooLarge) return tooLarge;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  // ⚠ Prisma treats `undefined` in a WHERE as "no filter" — without this
  // guard, an empty body deletes EVERY group this dealer owns.
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json(
      { error: "Group id is required" },
      { status: 400 }
    );
  }

  // Deleting a group only removes the grouping — member contacts survive.
  const result = await prisma.contactGroup.deleteMany({
    where: { id, userId: user.id },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
