import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { decryptContact } from "@/lib/encryption";
import { parseIncomingMessage } from "@/lib/bids";
import { enforceBodyLimit, JSON_BODY_LIMIT } from "@/lib/body-limit";

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

  // Same shaping as /api/deals/[id]: decrypted name only, never the
  // encrypted blob.
  return NextResponse.json(
    deal.recipients.map((r) => {
      const { contact, ...rest } = r;
      let contactName = "(removed contact)";
      if (contact) {
        try {
          contactName = decryptContact(contact, user.encryptionKey).name;
        } catch {
          contactName = "(unreadable contact)";
        }
      }
      return { ...rest, contactName };
    })
  );
}

// Owner sends a chat message or a bid (counter-offer) to one recipient.
// Body: { recipientId, content } for messages;
//       { recipientId, type: "bid", bidAmount, bidUnit } for bids.
// Bids are REJECTED once the deal is closed (accepted bid); messages
// remain open for logistics/questions.
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

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  // Type-check before it reaches Prisma: a non-string id makes the query
  // throw a 500 instead of returning the 404 this route means.
  const recipientId =
    typeof body.recipientId === "string" ? body.recipientId : "";

  const recipient = await prisma.dealRecipient.findFirst({
    where: {
      id: recipientId,
      deal: { id, userId: user.id },
    },
    include: { deal: { select: { status: true } } },
  });

  if (!recipient) {
    return NextResponse.json(
      { error: "Recipient not found" },
      { status: 404 }
    );
  }

  const parsed = parseIncomingMessage(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  if (parsed.type === "bid" && recipient.deal.status === "closed") {
    return NextResponse.json(
      { error: "Bidding on this deal is closed — messaging is still open" },
      { status: 400 }
    );
  }

  const message = await prisma.message.create({
    data: {
      dealRecipientId: recipient.id,
      senderType: "owner",
      senderName: user.name,
      type: parsed.type,
      content: parsed.content,
      bidAmount: parsed.bidAmount,
      bidUnit: parsed.bidUnit,
    },
  });

  return NextResponse.json(message);
}
