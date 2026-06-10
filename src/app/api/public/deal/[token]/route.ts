import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const recipient = await prisma.dealRecipient.findUnique({
    where: { accessToken: token },
    include: {
      deal: {
        include: {
          images: { orderBy: { sortOrder: "asc" } },
          user: { select: { name: true, companyName: true } },
        },
      },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!recipient) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  if (!recipient.viewedAt) {
    await prisma.dealRecipient.update({
      where: { id: recipient.id },
      data: { viewedAt: new Date(), status: "viewed" },
    });
  }

  return NextResponse.json({
    deal: {
      title: recipient.deal.title,
      metalType: recipient.deal.metalType,
      description: recipient.deal.description,
      quantity: recipient.deal.quantity,
      unit: recipient.deal.unit,
      askingPrice: recipient.deal.askingPrice,
      priceUnit: recipient.deal.priceUnit,
      location: recipient.deal.location,
      images: recipient.deal.images,
      company: recipient.deal.user.companyName,
      seller: recipient.deal.user.name,
      createdAt: recipient.deal.createdAt,
    },
    messages: recipient.messages,
    recipientId: recipient.id,
  });
}
