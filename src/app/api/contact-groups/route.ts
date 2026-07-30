import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

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
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
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
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await req.json();

  // Deleting a group only removes the grouping — member contacts survive.
  await prisma.contactGroup.deleteMany({
    where: { id, userId: user.id },
  });

  return NextResponse.json({ success: true });
}
