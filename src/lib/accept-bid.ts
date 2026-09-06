// Shared bid-acceptance logic — used by BOTH the owner endpoint
// (/api/deals/[id]/accept-bid) and the buyer endpoint
// (/api/public/deal/[token]/accept-bid). By accepting the latest bid from
// the other party, the deal closes at that price.
//
// Sequence:
//   1. ATOMIC CLAIM: updateMany with `status != "closed"` in the WHERE —
//      if owner and buyer accept simultaneously, exactly one wins; the
//      other gets alreadyClosed.
//   2. System message in the winning conversation recording the price.
//   3. System message in every OTHER conversation: bidding closed,
//      messaging still open (the message routes also ENFORCE the bid
//      block server-side — the notice is informational, not the guard).
//   4. Congrats email to the winning buyer (invoice sent separately) —
//      best-effort: requires SMTP configured + contact with an email;
//      failure never un-accepts the bid.

import { prisma } from "./db";
import { decryptContact } from "./encryption";
import { priceWithEquivalent } from "./bids";
import { isEmailConfigured, sendBidAcceptedEmail } from "./mailer";

export interface AcceptBidResult {
  ok: boolean;
  alreadyClosed?: boolean;
  emailSent: boolean;
  emailError?: string;
  priceText: string;
}

export async function finalizeAcceptedBid(opts: {
  deal: { id: string; title: string; weightUnit: string };
  dealer: {
    name: string;
    companyName: string;
    email: string;
    encryptionKey: string;
    themeBrand: string | null;
    logoUrl: string | null;
  };
  winningRecipient: {
    id: string;
    accessToken: string;
    contact: {
      encryptedName: string;
      encryptedEmail: string | null;
      encryptedPhone: string | null;
      encryptedWhatsApp: string | null;
    } | null;
  };
  bid: { bidAmount: number; bidUnit: string };
}): Promise<AcceptBidResult> {
  const { deal, dealer, winningRecipient, bid } = opts;

  const priceText = priceWithEquivalent(
    bid.bidAmount,
    bid.bidUnit,
    deal.weightUnit
  );

  // 1. Atomic claim — only one acceptance can flip the deal to closed.
  const claimed = await prisma.deal.updateMany({
    where: { id: deal.id, status: { not: "closed" } },
    data: {
      status: "closed",
      acceptedPrice: bid.bidAmount,
      acceptedUnit: bid.bidUnit,
      acceptedRecipientId: winningRecipient.id,
      acceptedAt: new Date(),
    },
  });

  if (claimed.count === 0) {
    return {
      ok: false,
      alreadyClosed: true,
      emailSent: false,
      priceText,
    };
  }

  // 2. Record the acceptance in the winning conversation.
  await prisma.message.create({
    data: {
      dealRecipientId: winningRecipient.id,
      senderType: "system",
      senderName: "System",
      type: "message",
      content: `Bid accepted — ${priceText}. Deal closed at this price.`,
    },
  });

  // 3. Notify every other conversation.
  const others = await prisma.dealRecipient.findMany({
    where: { dealId: deal.id, id: { not: winningRecipient.id } },
    select: { id: true },
  });
  if (others.length > 0) {
    await prisma.message.createMany({
      data: others.map((r) => ({
        dealRecipientId: r.id,
        senderType: "system",
        senderName: "System",
        type: "message",
        content:
          "Bidding on this deal is closed. Messaging remains open for questions.",
      })),
    });
  }

  // 4. Congrats email to the winner — best-effort.
  let emailSent = false;
  let emailError: string | undefined;

  if (!isEmailConfigured()) {
    emailError = "Email not configured — tell the buyer directly.";
  } else if (!winningRecipient.contact) {
    emailError = "Contact was removed — no email on file.";
  } else {
    try {
      const decrypted = decryptContact(
        winningRecipient.contact,
        dealer.encryptionKey
      );
      if (!decrypted.email) {
        emailError = "Contact has no email address — tell the buyer directly.";
      } else {
        const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
        const logoUrl = dealer.logoUrl
          ? `${baseUrl}${dealer.logoUrl}`
          : null;
        await sendBidAcceptedEmail({
          to: decrypted.email,
          contactName: decrypted.name,
          sellerName: dealer.name,
          companyName: dealer.companyName,
          replyTo: dealer.email,
          dealTitle: deal.title,
          priceText,
          dealLink: `${baseUrl}/deal/${winningRecipient.accessToken}`,
          brandColor: dealer.themeBrand || "#2d5f8a",
          logoUrl,
        });
        emailSent = true;
      }
    } catch (err) {
      emailError =
        err instanceof Error ? err.message : "Failed to send email";
    }
  }

  return { ok: true, emailSent, emailError, priceText };
}
