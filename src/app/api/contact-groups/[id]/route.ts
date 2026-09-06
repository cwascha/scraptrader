import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { enforceBodyLimit, JSON_BODY_LIMIT } from "@/lib/body-limit";

// PUT: update a group. `contactIds` (if provided) REPLACES the membership
// with the given list; `name` (if provided) renames the group. Contact ids
// not owned by the user are silently dropped.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tooLarge = enforceBodyLimit(req, JSON_BODY_LIMIT);
  if (tooLarge) return tooLarge;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const group = await prisma.contactGroup.findFirst({
    where: { id, userId: user.id },
  });

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
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

  let name = group.name;
  if (body.name !== undefined) {
    const trimmed = typeof body.name === "string" ? body.name.trim() : "";
    if (!trimmed) {
      return NextResponse.json(
        { error: "Group name cannot be empty" },
        { status: 400 }
      );
    }
    if (trimmed !== group.name) {
      const dup = await prisma.contactGroup.findFirst({
        where: { userId: user.id, name: trimmed, NOT: { id: group.id } },
      });
      if (dup) {
        return NextResponse.json(
          { error: `A group named "${trimmed}" already exists` },
          { status: 400 }
        );
      }
    }
    name = trimmed.slice(0, 100);
  }

  let membershipUpdate = {};
  if (body.contactIds !== undefined) {
    const ids: string[] = Array.isArray(body.contactIds)
      ? body.contactIds.filter((x: unknown): x is string => typeof x === "string")
      : [];
    const owned = await prisma.contact.findMany({
      where: { id: { in: ids }, userId: user.id },
      select: { id: true },
    });
    membershipUpdate = { contacts: { set: owned } };
  }

  const updated = await prisma.contactGroup.update({
    where: { id: group.id },
    data: { name, ...membershipUpdate },
    include: { contacts: { select: { id: true } } },
  });

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    contactIds: updated.contacts.map((c) => c.id),
  });
}
