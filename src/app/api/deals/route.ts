import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deals = await prisma.deal.findMany({
    where: { userId: user.id },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      recipients: {
        include: {
          _count: { select: { messages: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(deals);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const deal = await prisma.deal.create({
    data: {
      userId: user.id,
      title: body.title,
      metalType: body.metalType,
      description: body.description,
      quantity: body.quantity,
      unit: body.unit || "lbs",
      askingPrice: body.askingPrice ? parseFloat(body.askingPrice) : null,
      priceUnit: body.priceUnit || "per lb",
      location: body.location || null,
      status: "draft",
    },
    include: { images: true },
  });

  return NextResponse.json(deal);
}
