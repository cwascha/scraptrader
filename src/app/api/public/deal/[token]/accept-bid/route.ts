import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { finalizeAcceptedBid } from "@/lib/accept-bid";
import { enforceBodyLimit, JSON_BODY_LIMIT } from "@/lib/body-limit";

// Buyer accepts the OWNER's counter-bid. Body: { messageId }.
// Only the LATEST bid in this conversation is acceptable.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const tooLarge = enforceBodyLimit(req, JSON_BODY_LIMIT);
  if (tooLarge) return tooLarge;

  const ipLimit = rateLimit(`accept-ip:${clientIp(req)}`, 10, 60_000);
  const tokenLimit = rateLimit(`accept:${token}`, 5, 60_000);
  if (!ipLimit.ok || !tokenLimit.ok) {
    const retry = Math.max(
      ipLimit.retryAfterSeconds,
      tokenLimit.retryAfterSeconds
    );
    return NextResponse.json(
      { error: `Too many attempts — wait ${retry}s and try again` },
      { status: 429, headers: { "Retry-After": String(retry) } }
    );
  }

  const recipient = await prisma.dealRecipient.findUnique({
    where: { accessToken: token },
    include: {
      contact: true,
      deal: { include: { user: true } },
    },
  });

  if (!recipient) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
  const messageId = typeof body.messageId === "string" ? body.messageId : "";

  const message = await prisma.message.findFirst({
    where: { id: messageId, dealRecipientId: recipient.id },
  });

  if (!message) {
    return NextResponse.json({ error: "Bid not found" }, { status: 404 });
  }

  if (
    message.type !== "bid" ||
    message.bidAmount === null ||
    !message.bidUnit
  ) {
    return NextResponse.json(
      { error: "That message is not a bid" },
      { status: 400 }
    );
  }

  if (message.senderType !== "owner") {
    return NextResponse.json(
      { error: "You can only accept the seller's bid, not your own" },
      { status: 400 }
    );
  }

  const deal = recipient.deal;
  if (deal.status === "closed") {
    return NextResponse.json(
      { error: "This deal is already closed" },
      { status: 409 }
    );
  }

  // Latest-bid check — a newer bid supersedes older ones.
  const latestBid = await prisma.message.findFirst({
    where: { dealRecipientId: recipient.id, type: "bid" },
    orderBy: { createdAt: "desc" },
  });
  if (!latestBid || latestBid.id !== message.id) {
    return NextResponse.json(
      { error: "A newer bid exists in this conversation — accept that one" },
      { status: 409 }
    );
  }

  const result = await finalizeAcceptedBid({
    deal: { id: deal.id, title: deal.title, weightUnit: deal.weightUnit },
    dealer: {
      name: deal.user.name,
      companyName: deal.user.companyName,
      email: deal.user.email,
      encryptionKey: deal.user.encryptionKey,
      themeBrand: deal.user.themeBrand,
      logoUrl: deal.user.logoUrl,
    },
    winningRecipient: {
      id: recipient.id,
      accessToken: recipient.accessToken,
      contact: recipient.contact,
    },
    bid: { bidAmount: message.bidAmount, bidUnit: message.bidUnit },
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: "This deal is already closed" },
      { status: 409 }
    );
  }

  // Buyer-facing response — no dealer-side details (email status is the
  // dealer's business).
  return NextResponse.json({
    accepted: true,
    priceText: result.priceText,
  });
}
