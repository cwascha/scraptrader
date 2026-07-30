import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { enforceBodyLimit, JSON_BODY_LIMIT } from "@/lib/body-limit";
import { STARTER_ITEMS } from "@/lib/price-sheet-defaults";

// GET — list this dealer's sheets, newest effective date first.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sheets = await prisma.priceSheet.findMany({
    where: { userId: user.id },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      headerNote: true,
      effectiveDate: true,
      status: true,
      publishedAt: true,
      createdAt: true,
      _count: { select: { items: true, recipients: true } },
      // Enough to show "2 offers waiting" without loading every line.
      recipients: {
        where: { response: { isNot: null } },
        select: { response: { select: { status: true } } },
      },
    },
  });

  return NextResponse.json(
    sheets.map(({ recipients, ...s }) => ({
      ...s,
      responseCount: recipients.length,
      // "Needs you" = they've moved and you haven't.
      awaitingYou: recipients.filter(
        (r) => r.response?.status === "submitted"
      ).length,
    }))
  );
}

// POST — create a draft. Body: { duplicateOf?: string }.
//   duplicateOf  copy that sheet's items (the normal path — prices move
//                daily and nobody retypes 48 rows)
//   otherwise    seed from the dealer's most recent sheet, or from the
//                starter template if this is their first
export async function POST(req: NextRequest) {
  const tooLarge = enforceBodyLimit(req, JSON_BODY_LIMIT);
  if (tooLarge) return tooLarge;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { duplicateOf?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine — means "new sheet, seed it for me".
  }

  const duplicateOf =
    typeof body.duplicateOf === "string" ? body.duplicateOf : null;

  const source = await prisma.priceSheet.findFirst({
    where: duplicateOf
      ? { id: duplicateOf, userId: user.id }
      : { userId: user.id },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });

  if (duplicateOf && !source) {
    return NextResponse.json(
      { error: "Price sheet not found" },
      { status: 404 }
    );
  }

  const items = source
    ? source.items.map((i, idx) => ({
        category: i.category,
        name: i.name,
        price: i.price,
        priceNote: i.priceNote,
        unit: i.unit,
        sortOrder: idx,
      }))
    : STARTER_ITEMS.map((i, idx) => ({
        category: i.category,
        name: i.name,
        price: i.price ?? null,
        priceNote: i.priceNote ?? null,
        unit: "lb",
        sortOrder: idx,
      }));

  const sheet = await prisma.priceSheet.create({
    data: {
      userId: user.id,
      title: source?.title ?? "Delivered Prices",
      // The header note carries a market index ("Comex $4.49") that is
      // stale the moment it's copied — deliberately NOT carried forward.
      headerNote: null,
      effectiveDate: new Date(),
      status: "draft",
      items: { create: items },
    },
    select: { id: true },
  });

  return NextResponse.json({ id: sheet.id });
}
