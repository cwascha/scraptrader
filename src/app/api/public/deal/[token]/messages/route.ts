import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const recipient = await prisma.dealRecipient.findUnique({
    where: { accessToken: token },
  });

  if (!recipient) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const { content, senderName } = await req.json();

  if (!content || !senderName) {
    return NextResponse.json(
      { error: "Content and sender name are required" },
      { status: 400 }
    );
  }

  const message = await prisma.message.create({
    data: {
      dealRecipientId: recipient.id,
      senderType: "buyer",
      senderName,
      content,
    },
  });

  return NextResponse.json(message);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const recipient = await prisma.dealRecipient.findUnique({
    where: { accessToken: token },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!recipient) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  return NextResponse.json(recipient.messages);
}
