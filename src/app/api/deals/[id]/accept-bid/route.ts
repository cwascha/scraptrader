import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { finalizeAcceptedBid } from "@/lib/accept-bid";

// Owner accepts a BUYER's bid. Body: { messageId }.
// Only the LATEST bid in that conversation is acceptable — a newer bid
// supersedes older ones (counter-offer extinguishes the prior offer).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const messageId = typeof body.messageId === "string" ? body.messageId : "";

  const message = await prisma.message.findFirst({
    where: {
      id: messageId,
      dealRecipient: { deal: { id, userId: user.id } },
    },
    include: {
      dealRecipient: {
        include: { contact: true, deal: true },
      },
    },
  });

  if (!message) {
    return NextResponse.json({ error: "Bid not found" }, { status: 404 });
  }

  // `Message` can now belong to a price-sheet thread instead of a deal, so
  // the relation is nullable. The WHERE above already excludes those, but
  // narrow explicitly rather than asserting — if the query ever loosens,
  // this refuses a price-sheet message id instead of dereferencing null.
  if (!message.dealRecipient) {
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

  if (message.senderType !== "buyer") {
    return NextResponse.json(
      { error: "You can only accept the buyer's bid, not your own" },
      { status: 400 }
    );
  }

  const deal = message.dealRecipient.deal;
  if (deal.status === "closed") {
    return NextResponse.json(
      { error: "This deal is already closed" },
      { status: 409 }
    );
  }

  // Server-side latest-bid check — the client view may be stale (a newer
  // bid can arrive between render and click). Keyed off the relation's id
  // (proven non-null above) rather than the nullable column, so this can
  // never widen into "every message with a null dealRecipientId".
  const latestBid = await prisma.message.findFirst({
    where: { dealRecipientId: message.dealRecipient.id, type: "bid" },
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
      name: user.name,
      companyName: user.companyName,
      email: user.email,
      encryptionKey: user.encryptionKey,
      themeBrand: user.themeBrand,
      logoUrl: user.logoUrl,
    },
    winningRecipient: {
      id: message.dealRecipient.id,
      accessToken: message.dealRecipient.accessToken,
      contact: message.dealRecipient.contact,
    },
    bid: { bidAmount: message.bidAmount, bidUnit: message.bidUnit },
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: "This deal is already closed" },
      { status: 409 }
    );
  }

  return NextResponse.json({
    accepted: true,
    priceText: result.priceText,
    emailSent: result.emailSent,
    emailError: result.emailError,
  });
}
