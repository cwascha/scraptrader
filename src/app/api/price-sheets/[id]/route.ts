import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { decryptContact } from "@/lib/encryption";
import { enforceBodyLimit, JSON_BODY_LIMIT } from "@/lib/body-limit";

const MAX_ITEMS = 300;
const MAX_NAME = 120;
const MAX_CATEGORY = 60;
const MAX_NOTE = 60;
const MAX_TITLE = 120;
const MAX_HEADER_NOTE = 200;

// GET — full sheet for the editor: items in order, plus the send log with
// contact names decrypted (dealer-side data, never exposed publicly).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const sheet = await prisma.priceSheet.findFirst({
    where: { id, userId: user.id },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      recipients: {
        orderBy: { createdAt: "asc" },
        include: {
          contact: true,
          response: { include: { lines: true } },
          messages: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });

  if (!sheet) {
    return NextResponse.json(
      { error: "Price sheet not found" },
      { status: 404 }
    );
  }

  // Item lookup so each response line can show the grade name and the
  // price the supplier was quoting against.
  const itemById = new Map(sheet.items.map((i) => [i.id, i]));

  return NextResponse.json({
    ...sheet,
    recipients: sheet.recipients.map((r) => {
      // Degrade per row rather than 500ing the page, same as every other
      // decrypt site (AES-GCM throws on a bad key/tampered value).
      let name = "(unreadable contact)";
      if (r.contact) {
        try {
          name = decryptContact(r.contact, user.encryptionKey).name;
        } catch {
          /* keep the placeholder */
        }
      } else {
        name = "(deleted contact)";
      }
      return {
        id: r.id,
        channel: r.channel,
        status: r.status,
        sentAt: r.sentAt,
        viewedAt: r.viewedAt,
        accessToken: r.accessToken,
        contactName: name,
        // Unread = supplier messages newer than the read marker, exactly
        // as on deals.
        unreadCount: r.messages.filter(
          (m) =>
            m.senderType === "buyer" &&
            m.createdAt.getTime() >
              (r.ownerLastReadAt ? r.ownerLastReadAt.getTime() : 0)
        ).length,
        messages: r.messages.map((m) => ({
          id: m.id,
          senderType: m.senderType,
          senderName: m.senderName,
          content: m.content,
          createdAt: m.createdAt,
        })),
        response: r.response
          ? {
              id: r.response.id,
              status: r.response.status,
              buyerNote: r.response.buyerNote,
              dealerNote: r.response.dealerNote,
              submittedAt: r.response.submittedAt,
              respondedAt: r.response.respondedAt,
              agreedTotal: r.response.agreedTotal,
              lines: r.response.lines.map((l) => {
                const item = itemById.get(l.itemId);
                return {
                  id: l.id,
                  itemName: item?.name ?? "(removed line)",
                  sheetPrice: item?.price ?? null,
                  unit: item?.unit ?? "lb",
                  weight: l.weight,
                  weightUnit: l.weightUnit,
                  buyerPrice: l.buyerPrice,
                  dealerPrice: l.dealerPrice,
                };
              }),
            }
          : null,
      };
    }),
  });
}

// PATCH — edit a DRAFT sheet. Items are replaced wholesale (the editor
// sends the full list; at ~50 rows this beats diffing).
//
// Published sheets are LOCKED: that's what makes a sheet a snapshot. A
// buyer holding the link must never see prices change underneath them.
export async function PATCH(
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
  const sheet = await prisma.priceSheet.findFirst({
    where: { id, userId: user.id },
    select: { id: true, status: true },
  });

  if (!sheet) {
    return NextResponse.json(
      { error: "Price sheet not found" },
      { status: 404 }
    );
  }

  // SERVER-SIDE lock. The UI hides the editor on published sheets, but a
  // direct PATCH (or a stale tab) would otherwise rewrite prices that
  // buyers already received.
  if (sheet.status === "published") {
    return NextResponse.json(
      {
        error:
          "This sheet is published and locked. Duplicate it to send new prices.",
      },
      { status: 400 }
    );
  }

  let body: {
    title?: unknown;
    headerNote?: unknown;
    effectiveDate?: unknown;
    expiresAt?: unknown;
    items?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const data: {
    title?: string;
    headerNote?: string | null;
    effectiveDate?: Date;
    expiresAt?: Date | null;
  } = {};

  if (typeof body.title === "string") {
    const t = body.title.trim().slice(0, MAX_TITLE);
    if (!t) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    data.title = t;
  }

  if (typeof body.headerNote === "string") {
    data.headerNote = body.headerNote.trim().slice(0, MAX_HEADER_NOTE) || null;
  } else if (body.headerNote === null) {
    data.headerNote = null;
  }

  if (typeof body.effectiveDate === "string") {
    const d = new Date(body.effectiveDate);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json(
        { error: "Invalid effective date" },
        { status: 400 }
      );
    }
    data.effectiveDate = d;
  }

  // Optional cut-off. Empty string / null clears it (no expiry).
  if (typeof body.expiresAt === "string" && body.expiresAt.trim() !== "") {
    const d = new Date(body.expiresAt);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json(
        { error: "Invalid expiry date" },
        { status: 400 }
      );
    }
    data.expiresAt = d;
  } else if (body.expiresAt === null || body.expiresAt === "") {
    data.expiresAt = null;
  }

  // Items: validate and normalize before touching the DB, so a bad row
  // can't leave the sheet half-written.
  let items: {
    category: string;
    name: string;
    price: number | null;
    priceNote: string | null;
    unit: string;
    sortOrder: number;
  }[] | null = null;

  if (Array.isArray(body.items)) {
    if (body.items.length > MAX_ITEMS) {
      return NextResponse.json(
        { error: `A sheet can hold at most ${MAX_ITEMS} lines` },
        { status: 400 }
      );
    }

    items = [];
    for (const [idx, raw] of body.items.entries()) {
      if (typeof raw !== "object" || raw === null) continue;
      const r = raw as Record<string, unknown>;

      const name = typeof r.name === "string" ? r.name.trim().slice(0, MAX_NAME) : "";
      if (!name) continue; // silently drop blank rows the editor left behind

      const category =
        typeof r.category === "string"
          ? r.category.trim().slice(0, MAX_CATEGORY)
          : "";

      // price and priceNote are mutually exclusive; a usable number wins.
      const rawPrice =
        typeof r.price === "number"
          ? r.price
          : typeof r.price === "string" && r.price.trim() !== ""
            ? Number.parseFloat(r.price)
            : NaN;
      const hasPrice = Number.isFinite(rawPrice) && rawPrice >= 0;

      items.push({
        category: category || "Uncategorized",
        name,
        price: hasPrice ? rawPrice : null,
        priceNote: hasPrice
          ? null
          : typeof r.priceNote === "string"
            ? r.priceNote.trim().slice(0, MAX_NOTE) || null
            : null,
        unit: typeof r.unit === "string" && r.unit.trim() ? r.unit.trim().slice(0, 12) : "lb",
        sortOrder: idx,
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.priceSheet.update({ where: { id }, data });
    }
    if (items) {
      await tx.priceSheetItem.deleteMany({ where: { sheetId: id } });
      if (items.length > 0) {
        await tx.priceSheetItem.createMany({
          data: items.map((i) => ({ ...i, sheetId: id })),
        });
      }
    }
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  // deleteMany doubles as the ownership check — a non-owner matches zero
  // rows rather than deleting someone else's sheet.
  const result = await prisma.priceSheet.deleteMany({
    where: { id, userId: user.id },
  });

  if (result.count === 0) {
    return NextResponse.json(
      { error: "Price sheet not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}
