import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { enforceBodyLimit, JSON_BODY_LIMIT } from "@/lib/body-limit";
import { decryptContact } from "@/lib/encryption";
import { isEmailConfigured, sendPriceSheetResponseNotice } from "@/lib/mailer";
import { ensureNudgeSweeper } from "@/lib/notify";
import {
  formatPrice,
  formatUsd,
  formatUnitPrice,
  formatWeightWithUnit,
  lineValue,
  roundPrice,
  toLbs,
} from "@/lib/price-sheet-defaults";

const MAX_NOTE = 1000;
const MAX_LINES = 300;
// Sanity ceiling on a single line: 10 million lbs is ~4,500 tons, far past
// any real truckload. Catches fat-fingered zeros before they reach a quote.
const MAX_WEIGHT = 10_000_000;
const MAX_PRICE = 1_000_000;

// The supplier's own copy of a buying price sheet. Authorized by the
// per-recipient accessToken — this page is personal (it holds THEIR
// offer), unlike the deal pages which are also per-recipient but read-only
// on the deal itself.
//
// PRIVACY: the contact's own name is never echoed back. The supplier knows
// who they are; what matters is that nothing identifies OTHER recipients,
// and no other supplier's response is reachable from this token.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const limited = rateLimit(`sheet-view:${clientIp(req)}`, 20, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: `Too many requests — try again in ${limited.retryAfterSeconds}s` },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSeconds) },
      }
    );
  }

  const { token } = await params;

  const recipient = await prisma.priceSheetRecipient.findUnique({
    where: { accessToken: token },
    include: {
      response: { include: { lines: true } },
      sheet: {
        include: {
          items: { orderBy: { sortOrder: "asc" } },
          user: {
            select: {
              name: true,
              companyName: true,
              logoUrl: true,
              themeBrand: true,
              themeBrandDark: true,
              themeAccent: true,
              themeMode: true,
            },
          },
        },
      },
    },
  });

  if (
    !recipient ||
    (recipient.sheet.status !== "published" &&
      recipient.sheet.status !== "deactivated")
  ) {
    return NextResponse.json(
      { error: "Price sheet not found" },
      { status: 404 }
    );
  }

  const deactivated = recipient.sheet.status === "deactivated";

  if (!recipient.viewedAt) {
    await prisma.priceSheetRecipient.update({
      where: { id: recipient.id },
      data: { viewedAt: new Date(), status: "viewed" },
    });
  }

  const sheet = recipient.sheet;
  const byItem = new Map(
    (recipient.response?.lines ?? []).map((l) => [l.itemId, l])
  );

  // Grouped in sheet order. Each item carries the yard's quoted price plus
  // whatever this supplier already entered, so the form is resumable.
  const categories: {
    name: string;
    items: {
      id: string;
      name: string;
      value: string;
      price: number | null;
      unit: string;
      weight: number | null;
      weightUnit: string;
      buyerPrice: number | null;
      dealerPrice: number | null;
    }[];
  }[] = [];

  for (const item of sheet.items) {
    let cat = categories.find((c) => c.name === item.category);
    if (!cat) {
      cat = { name: item.category, items: [] };
      categories.push(cat);
    }
    const line = byItem.get(item.id);
    cat.items.push({
      id: item.id,
      name: item.name,
      value: formatPrice(item.price, item.priceNote, item.unit),
      price: item.price,
      unit: item.unit,
      weight: line?.weight ?? null,
      weightUnit: line?.weightUnit ?? "lbs",
      buyerPrice: line?.buyerPrice ?? null,
      dealerPrice: line?.dealerPrice ?? null,
    });
  }

  return NextResponse.json({
    sheet: {
      title: sheet.title,
      // Withdrawn: the prices are no longer on offer, so they are NOT
      // sent to the client at all. Hiding them in the UI while shipping
      // them in the payload would still let someone quote off numbers the
      // yard has retracted.
      comexBasis: deactivated ? null : sheet.comexBasis,
      headerNote: deactivated ? null : sheet.headerNote,
      effectiveDate: sheet.effectiveDate,
      expiresAt: sheet.expiresAt,
      deactivated,
      // Expired sheets still SHOW their prices — a supplier needs to see
      // what lapsed — but the form goes read-only and POST refuses.
      expired: Boolean(sheet.expiresAt && sheet.expiresAt.getTime() < Date.now()),
      company: sheet.user.companyName,
      seller: sheet.user.name,
      categories: deactivated ? [] : categories,
    },
    response: recipient.response
      ? {
          status: recipient.response.status,
          buyerNote: recipient.response.buyerNote,
          dealerNote: recipient.response.dealerNote,
          submittedAt: recipient.response.submittedAt,
          respondedAt: recipient.response.respondedAt,
          agreedTotal: recipient.response.agreedTotal,
        }
      : null,
    branding: {
      logoUrl: sheet.user.logoUrl,
      brand: sheet.user.themeBrand,
      brandDark: sheet.user.themeBrandDark,
      accent: sheet.user.themeAccent,
      mode: sheet.user.themeMode,
    },
  });
}

// Submit or revise the supplier's offer. Upserts one response per
// recipient — there's always a single current position per side, so
// revising replaces rather than stacking.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const tooLarge = enforceBodyLimit(req, JSON_BODY_LIMIT);
  if (tooLarge) return tooLarge;

  // An offer creates unread work for the yard, so this is exactly the
  // moment the nudge sweeper must be running. Without this, a server that
  // restarted and has seen only price-sheet traffic would never chase an
  // ignored offer — backwards, since the nudge exists for when nobody's
  // watching the dashboard.
  ensureNudgeSweeper();

  const { token } = await params;

  const ipLimit = rateLimit(`sheet-respond:${clientIp(req)}`, 10, 60_000);
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
      response: true,
      contact: true,
      sheet: {
        include: {
          items: { select: { id: true, name: true, price: true, unit: true } },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              encryptionKey: true,
            },
          },
        },
      },
    },
  });

  // Deactivated sheets are FOUND here (not 404) so the supplier gets the
  // real reason below rather than a dead link.
  if (
    !recipient ||
    (recipient.sheet.status !== "published" &&
      recipient.sheet.status !== "deactivated")
  ) {
    return NextResponse.json(
      { error: "Price sheet not found" },
      { status: 404 }
    );
  }

  // Withdrawn prices can't be quoted against. The thread stays open (see
  // the messages route) so an in-flight negotiation isn't stranded — but
  // no new offer can be pinned to numbers the yard has retracted.
  if (recipient.sheet.status === "deactivated") {
    return NextResponse.json(
      {
        error:
          "These prices are no longer valid. Contact the yard for current pricing.",
      },
      { status: 400 }
    );
  }

  // Terminal states are final — the yard already accepted or passed, and
  // reopening from the link would silently reverse a decision.
  if (
    recipient.response?.status === "accepted" ||
    recipient.response?.status === "declined"
  ) {
    return NextResponse.json(
      { error: "This offer is closed. Contact the yard directly to reopen it." },
      { status: 400 }
    );
  }

  // Expired sheets stay VIEWABLE (GET still serves them) but can't be
  // answered — a locked snapshot with no cut-off is how a yard ends up
  // honouring three-week-old copper.
  if (
    recipient.sheet.expiresAt &&
    recipient.sheet.expiresAt.getTime() < Date.now()
  ) {
    return NextResponse.json(
      {
        error:
          "These prices have expired. Contact the yard for a current sheet.",
      },
      { status: 400 }
    );
  }

  let body: { lines?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const validItemIds = new Set(recipient.sheet.items.map((i) => i.id));
  const rawLines = Array.isArray(body.lines) ? body.lines.slice(0, MAX_LINES) : [];

  const lines: {
    itemId: string;
    weight: number;
    weightUnit: string;
    buyerPrice: number | null;
  }[] = [];

  for (const raw of rawLines) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;

    // Only items on THIS sheet — never trust a client-supplied id.
    const itemId = typeof r.itemId === "string" ? r.itemId : "";
    if (!validItemIds.has(itemId)) continue;

    const weight =
      typeof r.weight === "number"
        ? r.weight
        : typeof r.weight === "string"
          ? Number.parseFloat(r.weight)
          : NaN;
    // A line with no weight isn't an offer — the supplier just left it
    // blank. Drop it rather than storing zeros.
    if (!Number.isFinite(weight) || weight <= 0) continue;
    if (weight > MAX_WEIGHT) {
      return NextResponse.json(
        { error: "That weight looks too large — please check it" },
        { status: 400 }
      );
    }

    const rawPrice =
      typeof r.buyerPrice === "number"
        ? r.buyerPrice
        : typeof r.buyerPrice === "string" && r.buyerPrice.trim() !== ""
          ? Number.parseFloat(r.buyerPrice)
          : NaN;
    const hasPrice = Number.isFinite(rawPrice) && rawPrice > 0;
    if (hasPrice && rawPrice > MAX_PRICE) {
      return NextResponse.json(
        { error: "That price looks too large — please check it" },
        { status: 400 }
      );
    }

    lines.push({
      itemId,
      weight,
      weightUnit:
        r.weightUnit === "tons" || r.weightUnit === "kg"
          ? (r.weightUnit as string)
          : "lbs",
      // Stored at display precision so the printed price × weight always
      // equals the printed total.
      buyerPrice: hasPrice ? roundPrice(rawPrice) : null,
    });
  }

  if (lines.length === 0) {
    return NextResponse.json(
      { error: "Enter a weight for at least one material" },
      { status: 400 }
    );
  }

  const note =
    typeof body.note === "string" ? body.note.trim().slice(0, MAX_NOTE) : "";

  // The supplier's name is server-derived from the token's contact — never
  // client-supplied — same anti-spoofing rule as deal chat.
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

  // Human-readable summary of the offer, written to the thread so it lands
  // in the dealer's inbox and drives unread counting like any message.
  const itemById = new Map(recipient.sheet.items.map((i) => [i.id, i]));
  let total = 0;
  let allValued = true;
  const summaryLines = lines.map((l) => {
    const item = itemById.get(l.itemId);
    const unit = item?.unit ?? "lb";
    const price = l.buyerPrice ?? item?.price ?? null;
    const value = lineValue(l.weight, l.weightUnit, price, unit);
    if (value === null) allValued = false;
    else total += value;
    return `${item?.name ?? "line"}: ${formatWeightWithUnit(l.weight, l.weightUnit)}${
      price !== null ? ` @ ${formatUnitPrice(price)}/${unit}` : ""
    }${l.buyerPrice !== null ? " (their ask)" : ""}`;
  });
  const totalText = allValued && lines.length > 0 ? formatUsd(total) : null;
  const offerSummary = [
    `Offer: ${lines.length} grade${lines.length === 1 ? "" : "s"}${totalText ? ` — ${totalText}` : ""}`,
    ...summaryLines.map((s) => `• ${s}`),
    ...(note ? [note] : []),
  ].join("\n");

  // Replace lines wholesale — the form always posts the supplier's full
  // current position, so diffing would only add ways to disagree.
  await prisma.$transaction(async (tx) => {
    const response = await tx.priceSheetResponse.upsert({
      where: { recipientId: recipient.id },
      create: {
        recipientId: recipient.id,
        status: "submitted",
        buyerNote: note || null,
      },
      update: {
        // A revision puts the ball back in the yard's court.
        status: "submitted",
        buyerNote: note || null,
        submittedAt: new Date(),
      },
    });
    await tx.priceSheetResponseLine.deleteMany({
      where: { responseId: response.id },
    });
    await tx.priceSheetResponseLine.createMany({
      data: lines.map((l) => ({ ...l, responseId: response.id })),
    });
    await tx.priceSheetRecipient.update({
      where: { id: recipient.id },
      data: { status: "responded" },
    });

    // senderType "buyer" so it counts as unread for the dealer exactly
    // like a deal message — no special-casing anywhere downstream.
    await tx.message.create({
      data: {
        priceSheetRecipientId: recipient.id,
        senderType: "buyer",
        senderName: supplierName,
        type: "message",
        content: offerSummary,
      },
    });
  });

  // Notify the yard. Best-effort: a mail failure must never lose an offer
  // the supplier just submitted.
  if (isEmailConfigured() && recipient.contact) {
    try {
      const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
      const totalLbs = lines.reduce(
        (sum, l) => sum + (toLbs(l.weight, l.weightUnit) ?? 0),
        0
      );
      await sendPriceSheetResponseNotice({
        to: recipient.sheet.user.email,
        dealerName: recipient.sheet.user.name,
        contactName: supplierName,
        sheetTitle: recipient.sheet.title,
        totalWeightText: `${Math.round(totalLbs).toLocaleString("en-US")} lbs across ${lines.length} grade${lines.length === 1 ? "" : "s"}`,
        hasCounters: lines.some((l) => l.buyerPrice !== null),
        responseUrl: `${baseUrl}/dashboard/prices/${recipient.sheetId}`,
      });
    } catch {
      // Swallowed on purpose — the offer is already stored.
    }
  }

  return NextResponse.json({ success: true });
}
