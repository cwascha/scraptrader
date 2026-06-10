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
      recipients: {
        include: {
          contact: true,
          messages: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  return NextResponse.json(deal.recipients);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { recipientId, content } = await req.json();

  const recipient = await prisma.dealRecipient.findFirst({
    where: {
      id: recipientId,
      deal: { id, userId: user.id },
    },
  });

  if (!recipient) {
    return NextResponse.json(
      { error: "Recipient not found" },
      { status: 404 }
    );
  }

  const message = await prisma.message.create({
    data: {
      dealRecipientId: recipientId,
      senderType: "owner",
      senderName: user.name,
      content,
    },
  });

  return NextResponse.json(message);
}
