import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseIncomingMessage } from "@/lib/bids";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { decryptContact } from "@/lib/encryption";
import { ensureNudgeSweeper } from "@/lib/notify";
import { enforceBodyLimit, JSON_BODY_LIMIT } from "@/lib/body-limit";

function tooMany(retryAfterSeconds: number, what: string) {
  return NextResponse.json(
    { error: `Too many ${what} — wait ${retryAfterSeconds}s and try again` },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    }
  );
}

// Buyer sends a chat message or a bid.
// Body: { content } for messages; { type: "bid", bidAmount, bidUnit } for bids.
// The sender's name is NEVER taken from the client: the access token was
// generated for a specific contact, so the STORED name is that contact's
// decrypted name ("Buyer" if the contact has since been deleted). That name
// is for the DEALER's side only — public reads rewrite it to "You" (see GET)
// so buyers never learn how the dealer filed them.
// Bids are REJECTED once the deal is closed (accepted bid); messages
// remain open for logistics/questions.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // Buyer activity is what creates unread state — make sure the Tier-3
  // email-nudge sweeper is running (no-op after the first call).
  ensureNudgeSweeper();

  const { token } = await params;

  const tooLarge = enforceBodyLimit(req, JSON_BODY_LIMIT);
  if (tooLarge) return tooLarge;

  // Anonymous link-holders can post here, so cap both per conversation
  // (10/min per token — no human chats faster) and per IP (30/min across
  // all conversations, in case one actor holds many links).
  const ipLimit = rateLimit(`msg-post-ip:${clientIp(req)}`, 30, 60_000);
  if (!ipLimit.ok) return tooMany(ipLimit.retryAfterSeconds, "messages");
  const tokenLimit = rateLimit(`msg-post:${token}`, 10, 60_000);
  if (!tokenLimit.ok) return tooMany(tokenLimit.retryAfterSeconds, "messages");

  const recipient = await prisma.dealRecipient.findUnique({
    where: { accessToken: token },
    include: {
      contact: true,
      deal: {
        select: { status: true, user: { select: { encryptionKey: true } } },
      },
    },
  });

  if (!recipient) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  let senderName = "Buyer";
  if (recipient.contact) {
    try {
      senderName = decryptContact(
        recipient.contact,
        recipient.deal.user.encryptionKey
      ).name;
    } catch {
      // Undecryptable contact — keep the generic fallback.
    }
  }

  let parsedBody;
  try {
    parsedBody = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const parsed = parseIncomingMessage(parsedBody);
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
      senderType: "buyer",
      senderName: senderName.slice(0, 100),
      type: parsed.type,
      content: parsed.content,
      bidAmount: parsed.bidAmount,
      bidUnit: parsed.bidUnit,
    },
  });

  // Don't echo the stored contact name back to the buyer, and don't echo
  // internal FKs either.
  return NextResponse.json({
    id: message.id,
    senderType: message.senderType,
    senderName: "You",
    type: message.type,
    content: message.content,
    bidAmount: message.bidAmount,
    bidUnit: message.bidUnit,
    createdAt: message.createdAt,
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Our own client polls at 12/min; 60/min leaves generous headroom for
  // refreshes and multiple tabs while stopping hammering.
  const limited = rateLimit(`msg-read:${token}`, 60, 60_000);
  if (!limited.ok) return tooMany(limited.retryAfterSeconds, "requests");

  const recipient = await prisma.dealRecipient.findUnique({
    where: { accessToken: token },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      deal: { select: { status: true } },
    },
  });

  if (!recipient) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  // PRIVACY: the stored senderName on buyer messages is the dealer's
  // contact name — rewrite to "You" so it never reaches the buyer.
  // biddingClosed rides along so the polling client can hide the bid
  // composer as soon as the deal closes.
  //
  // Whitelisted projection, not a spread: Message gained
  // `priceSheetRecipientId` when it went polymorphic, and internal FKs
  // have no business in a buyer-facing payload.
  return NextResponse.json({
    biddingClosed: recipient.deal.status === "closed",
    messages: recipient.messages.map((m) => ({
      id: m.id,
      senderType: m.senderType,
      senderName: m.senderType === "buyer" ? "You" : m.senderName,
      type: m.type,
      content: m.content,
      bidAmount: m.bidAmount,
      bidUnit: m.bidUnit,
      createdAt: m.createdAt,
    })),
  });
}
