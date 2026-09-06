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
      // Needed client-side to sort a sheet into Active vs Inactive —
      // expiry is a timestamp comparison, not a status value.
      expiresAt: true,
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
//   duplicateOf  copy that exact sheet's items whatever its status (the
//                "branch off an older one" path)
//   otherwise    seed from the most recent PUBLISHED sheet, falling back
//                to any sheet, then to the starter template
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

  const withItems = { items: { orderBy: { sortOrder: "asc" as const } } };
  const newestFirst = [
    { effectiveDate: "desc" as const },
    { createdAt: "desc" as const },
  ];

  let source = null;

  if (duplicateOf) {
    // Explicit target: copy that sheet regardless of status.
    source = await prisma.priceSheet.findFirst({
      where: { id: duplicateOf, userId: user.id },
      include: withItems,
    });
    if (!source) {
      return NextResponse.json(
        { error: "Price sheet not found" },
        { status: 404 }
      );
    }
  } else {
    // Prefer the most recent PUBLISHED sheet. A published sheet is a
    // known-good state; a draft is by definition unfinished, so seeding
    // from an abandoned half-edited one would propagate blanked lines
    // into every sheet after it.
    source = await prisma.priceSheet.findFirst({
      where: { userId: user.id, status: "published" },
      orderBy: newestFirst,
      include: withItems,
    });

    // Nothing published yet — a dealer still working on their first sheet
    // should still inherit their own line items rather than the template.
    if (!source) {
      source = await prisma.priceSheet.findFirst({
        where: { userId: user.id },
        orderBy: newestFirst,
        include: withItems,
      });
    }
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
      // Neither the COMEX basis nor the header note is carried forward:
      // a copied index reading is wrong the moment it's copied, and
      // leaving it blank forces a deliberate re-entry (which is what the
      // staleness check compares against).
      comexBasis: null,
      headerNote: null,
      effectiveDate: new Date(),
      status: "draft",
      items: { create: items },
    },
    select: { id: true },
  });

  return NextResponse.json({ id: sheet.id });
}
