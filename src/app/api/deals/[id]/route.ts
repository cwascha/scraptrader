import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const deal = await prisma.deal.findFirst({
    where: { id, userId: user.id },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      recipients: {
        include: {
          contact: true,
          messages: { orderBy: { createdAt: "asc" } },
          _count: { select: { messages: true } },
        },
      },
    },
  });

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  return NextResponse.json(deal);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const deal = await prisma.deal.updateMany({
    where: { id, userId: user.id },
    data: {
      title: body.title,
      metalType: body.metalType,
      description: body.description,
      quantity: body.quantity,
      unit: body.unit,
      askingPrice: body.askingPrice ? parseFloat(body.askingPrice) : null,
      priceUnit: body.priceUnit,
      location: body.location || null,
    },
  });

  if (deal.count === 0) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const updated = await prisma.deal.findUnique({
    where: { id },
    include: { images: true },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await prisma.deal.deleteMany({ where: { id, userId: user.id } });

  return NextResponse.json({ success: true });
}
