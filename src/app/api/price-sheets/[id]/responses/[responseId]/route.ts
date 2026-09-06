import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { decryptContact } from "@/lib/encryption";
import { enforceBodyLimit, JSON_BODY_LIMIT } from "@/lib/body-limit";
import { isEmailConfigured, sendPriceSheetOutcomeEmail } from "@/lib/mailer";
import {
  isSmsConfigured,
  isWhatsAppConfigured,
  sendOutcomeSms,
  sendOutcomeWhatsApp,
} from "@/lib/sms";
import {
  governingPrice,
  lineValue,
  formatUsd,
  formatUnitPrice,
  formatWeightWithUnit,
  roundPrice,
  weightInPriceUnit,
} from "@/lib/price-sheet-defaults";

const MAX_NOTE = 1000;
const MAX_PRICE = 1_000_000;

// The yard's move on a supplier's offer.
//
//   action: "counter"   set dealerPrice on one or more lines -> "countered"
//   action: "accept"    take their current numbers            -> "accepted"
//   action: "decline"   pass                                   -> "declined"
//
// accepted/declined are terminal on both sides: the public route refuses
// further revisions once either is set, so a decision can't be silently
// reversed from a link that's still sitting in someone's inbox.
//
// Every action (a) writes an owner Message on the recipient thread, so the
// negotiation reads as a conversation and shows up in the inbox, and
// (b) NOTIFIES THE SUPPLIER on the channel they were reached on. Without
// (b) the loop is one-way and counters die unanswered.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; responseId: string }> }
) {
  const tooLarge = enforceBodyLimit(req, JSON_BODY_LIMIT);
  if (tooLarge) return tooLarge;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, responseId } = await params;

  // Ownership runs through the sheet: response -> recipient -> sheet -> user.
  const response = await prisma.priceSheetResponse.findFirst({
    where: {
      id: responseId,
      recipient: { sheetId: id, sheet: { userId: user.id } },
    },
    include: {
      lines: true,
      recipient: {
        include: {
          contact: true,
          sheet: { include: { items: true } },
        },
      },
    },
  });

  if (!response) {
    return NextResponse.json({ error: "Response not found" }, { status: 404 });
  }

  if (response.status === "accepted" || response.status === "declined") {
    return NextResponse.json(
      { error: "This offer is already closed." },
      { status: 400 }
    );
  }

  let body: { action?: unknown; note?: unknown; lines?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const action = body.action;
  if (action !== "counter" && action !== "accept" && action !== "decline") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const note =
    typeof body.note === "string" ? body.note.trim().slice(0, MAX_NOTE) : "";

  const itemById = new Map(
    response.recipient.sheet.items.map((i) => [i.id, i])
  );

  // Counter prices to apply, keyed by line id (only used for "counter").
  const counters = new Map<string, number | null>();
  if (action === "counter") {
    const validLineIds = new Set(response.lines.map((l) => l.id));
    if (Array.isArray(body.lines)) {
      for (const raw of body.lines) {
        if (typeof raw !== "object" || raw === null) continue;
        const r = raw as Record<string, unknown>;
        const lineId = typeof r.id === "string" ? r.id : "";
        if (!validLineIds.has(lineId)) continue;

        const rawPrice =
          typeof r.dealerPrice === "number"
            ? r.dealerPrice
            : typeof r.dealerPrice === "string" && r.dealerPrice.trim() !== ""
              ? Number.parseFloat(r.dealerPrice)
              : NaN;
        const hasPrice = Number.isFinite(rawPrice) && rawPrice > 0;
        if (hasPrice && rawPrice > MAX_PRICE) {
          return NextResponse.json(
            { error: "That price looks too large — please check it" },
            { status: 400 }
          );
        }
        // Clearing a counter (empty field) withdraws to the sheet price.
        // Rounded to display precision so the counter the supplier reads
        // is exactly the counter the totals are computed from.
        counters.set(lineId, hasPrice ? roundPrice(rawPrice) : null);
      }
    }

    if (counters.size === 0) {
      return NextResponse.json(
        { error: "Set a counter price on at least one line" },
        { status: 400 }
      );
    }
  }

  // Resolve every line to its final numbers so the message, the email, and
  // the stored total all describe the same thing.
  const resolved = response.lines.map((l) => {
    const item = itemById.get(l.itemId);
    const unit = item?.unit ?? "lb";
    const dealerPrice = counters.has(l.id)
      ? counters.get(l.id)!
      : l.dealerPrice;
    const price = governingPrice(item?.price ?? null, l.buyerPrice, dealerPrice);
    const qty = weightInPriceUnit(l.weight, l.weightUnit, unit);
    return {
      id: l.id,
      name: item?.name ?? "(removed line)",
      unit,
      weight: l.weight,
      weightUnit: l.weightUnit,
      price,
      dealerPrice,
      qty,
      value: lineValue(l.weight, l.weightUnit, price, unit),
    };
  });

  const computable = resolved.filter((l) => l.value !== null);
  const total = computable.reduce((sum, l) => sum + (l.value ?? 0), 0);
  const allComputable = computable.length === resolved.length;
  // Only claim a total when every line could be valued — a partial sum
  // presented as "the total" is worse than no total.
  const totalText = allComputable && computable.length > 0 ? formatUsd(total) : null;

  const nextStatus =
    action === "counter"
      ? "countered"
      : action === "accept"
        ? "accepted"
        : "declined";

  // Owner-side message summarizing the move, so the thread reads as a
  // conversation and the inbox has something to show.
  const summary =
    action === "counter"
      ? `Countered: ${resolved
          .filter((l) => l.dealerPrice !== null)
          .map(
            (l) =>
              `${l.name} ${formatUnitPrice(l.dealerPrice as number)}/${l.unit}`
          )
          .join(", ")}`
      : action === "accept"
        ? `Accepted the offer${totalText ? ` — ${totalText}` : ""}.`
        : "Declined the offer.";

  await prisma.$transaction(async (tx) => {
    if (action === "counter") {
      for (const [lineId, dealerPrice] of counters) {
        await tx.priceSheetResponseLine.update({
          where: { id: lineId },
          data: { dealerPrice },
        });
      }
    }

    await tx.priceSheetResponse.update({
      where: { id: responseId },
      data: {
        status: nextStatus,
        dealerNote: note || null,
        respondedAt: new Date(),
        // Freeze the agreed total at acceptance only.
        ...(action === "accept" && totalText !== null
          ? { agreedTotal: total }
          : {}),
      },
    });

    await tx.message.create({
      data: {
        priceSheetRecipientId: response.recipientId,
        senderType: "owner",
        senderName: user.name,
        type: "message",
        content: note ? `${summary}\n${note}` : summary,
      },
    });
  });

  // --- Notify the supplier (best-effort; never fails the action) -------
  const recipient = response.recipient;
  if (recipient.contact) {
    try {
      const decrypted = decryptContact(recipient.contact, user.encryptionKey);
      const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
      const sheetLink = `${baseUrl}/prices/${recipient.accessToken}`;
      const channel = recipient.channel;
      // Same branding the price sheet itself went out with — a supplier
      // shouldn't get a branded sheet and then an unbranded counter.
      const logoAbsUrl = user.logoUrl ? `${baseUrl}${user.logoUrl}` : null;
      const brandColor = user.themeBrand || "#2d5f8a";

      const emailLines = resolved.map((l) => ({
        name: l.name,
        detail:
          l.price !== null
            ? `${formatWeightWithUnit(l.weight, l.weightUnit)} @ ${formatUnitPrice(l.price)}/${l.unit}${
                l.value !== null ? ` = ${formatUsd(l.value)}` : ""
              }`
            : formatWeightWithUnit(l.weight, l.weightUnit),
      }));

      if (channel === "email" && decrypted.email && isEmailConfigured()) {
        await sendPriceSheetOutcomeEmail({
          to: decrypted.email,
          contactName: decrypted.name,
          sellerName: user.name,
          companyName: user.companyName,
          replyTo: user.email,
          sheetTitle: recipient.sheet.title,
          outcome: nextStatus as "countered" | "accepted" | "declined",
          dealerNote: note || null,
          lines: emailLines,
          totalText,
          sheetLink,
          brandColor,
          logoUrl: logoAbsUrl,
        });
      } else if (channel === "sms" && decrypted.phone && isSmsConfigured()) {
        await sendOutcomeSms({
          to: decrypted.phone,
          companyName: user.companyName,
          sheetTitle: recipient.sheet.title,
          outcome: nextStatus as "countered" | "accepted" | "declined",
          sheetLink,
        });
      } else if (
        channel === "whatsapp" &&
        decrypted.whatsapp &&
        isWhatsAppConfigured()
      ) {
        await sendOutcomeWhatsApp({
          to: decrypted.whatsapp,
          companyName: user.companyName,
          sheetTitle: recipient.sheet.title,
          outcome: nextStatus as "countered" | "accepted" | "declined",
          sheetLink,
        });
      }
    } catch {
      // Swallowed on purpose — the decision is already recorded. The
      // supplier can still see it on their link.
    }
  }

  return NextResponse.json({ success: true, status: nextStatus });
}
