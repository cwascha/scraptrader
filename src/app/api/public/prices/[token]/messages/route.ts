import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { enforceBodyLimit, JSON_BODY_LIMIT } from "@/lib/body-limit";
import { decryptContact } from "@/lib/encryption";
import { ensureNudgeSweeper } from "@/lib/notify";

// Free-text thread on a price-sheet negotiation. The counter loop carries
// the numbers; this carries everything else ("can you do $4.02 if I bring
// three loads?"), which previously had nowhere to go.
//
// Same trust model as deal chat: the supplier's identity comes from the
// TOKEN, never from the request body. Owner names pass through as-is;
// buyer names are rewritten to "You" on read so the supplier never sees
// how the dealer filed them.
const MAX_MESSAGE_LENGTH = 4000;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const limited = rateLimit(`sheet-msgs:${token}`, 60, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: `Too many requests — try again in ${limited.retryAfterSeconds}s` },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSeconds) },
      }
    );
  }

  const recipient = await prisma.priceSheetRecipient.findUnique({
    where: { accessToken: token },
    include: {
      response: { select: { status: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!recipient) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    status: recipient.response?.status ?? null,
    messages: recipient.messages.map((m) => ({
      id: m.id,
      senderType: m.senderType,
      senderName: m.senderType === "buyer" ? "You" : m.senderName,
      content: m.content,
      createdAt: m.createdAt,
    })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const tooLarge = enforceBodyLimit(req, JSON_BODY_LIMIT);
  if (tooLarge) return tooLarge;

  // Supplier messages are unread work too — keep the sweeper warm.
  ensureNudgeSweeper();

  const { token } = await params;

  // Two buckets, same as deal chat: per-token stops one supplier flooding
  // their own thread, per-IP stops a script hitting many tokens.
  const tokenLimit = rateLimit(`sheet-msg-post:${token}`, 10, 60_000);
  if (!tokenLimit.ok) {
    return NextResponse.json(
      { error: `Too many messages — try again in ${tokenLimit.retryAfterSeconds}s` },
      {
        status: 429,
        headers: { "Retry-After": String(tokenLimit.retryAfterSeconds) },
      }
    );
  }
  const ipLimit = rateLimit(`sheet-msg-ip:${clientIp(req)}`, 30, 60_000);
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: `Too many requests — try again in ${ipLimit.retryAfterSeconds}s` },
      {
        status: 429,
        headers: { "Retry-After": String(ipLimit.retryAfterSeconds) },
      }
    );
  }

  const recipient = await prisma.priceSheetRecipient.findUnique({
    where: { accessToken: token },
    include: {
      contact: true,
      sheet: { select: { status: true, user: { select: { encryptionKey: true } } } },
    },
  });

  // Threads survive deactivation on purpose: withdrawing prices must not
  // strand a negotiation that's already under way. Only NEW offers are
  // blocked (see the offer route).
  if (
    !recipient ||
    (recipient.sheet.status !== "published" &&
      recipient.sheet.status !== "deactivated")
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { content?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const content =
    typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  }
  if (content.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Messages are limited to ${MAX_MESSAGE_LENGTH} characters` },
      { status: 400 }
    );
  }

  // Identity from the token, stamped server-side.
  let supplierName = "Supplier";
  if (recipient.contact) {
    try {
      supplierName = decryptContact(
        recipient.contact,
        recipient.sheet.user.encryptionKey
      ).name;
    } catch {
      supplierName = "(unreadable contact)";
    }
  }

  await prisma.message.create({
    data: {
      priceSheetRecipientId: recipient.id,
      senderType: "buyer",
      senderName: supplierName,
      type: "message",
      content,
    },
  });

  return NextResponse.json({ success: true });
}
