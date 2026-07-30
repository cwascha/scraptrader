import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { enforceBodyLimit, JSON_BODY_LIMIT } from "@/lib/body-limit";

const MAX_MESSAGE_LENGTH = 4000;

// Dealer side of a price-sheet thread.
//   POST { recipientId, content }        send a message
//   POST { recipientId, markRead: true } clear unread on that thread
//
// Both live here rather than in a separate mark-read route because the
// dealer's price-sheet UI is one panel — it reads and replies in the same
// place, unlike deals where the inbox and the deal page are separate.
export async function POST(
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

  let body: { recipientId?: unknown; content?: unknown; markRead?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const recipientId =
    typeof body.recipientId === "string" ? body.recipientId : "";

  // Ownership through the sheet — a recipient id alone proves nothing.
  const recipient = await prisma.priceSheetRecipient.findFirst({
    where: { id: recipientId, sheetId: id, sheet: { userId: user.id } },
    select: { id: true },
  });

  if (!recipient) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (body.markRead === true) {
    await prisma.priceSheetRecipient.update({
      where: { id: recipient.id },
      data: { ownerLastReadAt: new Date() },
    });
    return NextResponse.json({ success: true });
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  }
  if (content.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Messages are limited to ${MAX_MESSAGE_LENGTH} characters` },
      { status: 400 }
    );
  }

  await prisma.message.create({
    data: {
      priceSheetRecipientId: recipient.id,
      senderType: "owner",
      senderName: user.name,
      type: "message",
      content,
    },
  });

  return NextResponse.json({ success: true });
}
