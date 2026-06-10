import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { encryptContact, decryptContact } from "@/lib/encryption";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contacts = await prisma.contact.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  const decrypted = contacts.map((c) => ({
    id: c.id,
    ...decryptContact(c, user.encryptionKey),
    tags: c.tags,
    createdAt: c.createdAt,
  }));

  return NextResponse.json(decrypted);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  if (!body.name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const encrypted = encryptContact(
    {
      name: body.name,
      email: body.email,
      phone: body.phone,
      whatsapp: body.whatsapp,
    },
    user.encryptionKey
  );

  const contact = await prisma.contact.create({
    data: {
      userId: user.id,
      ...encrypted,
      tags: body.tags || "",
    },
  });

  return NextResponse.json({
    id: contact.id,
    name: body.name,
    email: body.email,
    phone: body.phone,
    whatsapp: body.whatsapp,
    tags: body.tags || "",
  });
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await req.json();
  await prisma.contact.deleteMany({ where: { id, userId: user.id } });

  return NextResponse.json({ success: true });
}
