import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { enforceBodyLimit, JSON_BODY_LIMIT } from "@/lib/body-limit";

// Withdraw a published price sheet, or put it back.
//
//   POST { active: false }  published  -> deactivated
//   POST { active: true }   deactivated -> published
//
// Deliberately NOT part of the PATCH route: that one refuses any change
// to a published sheet, because the prices are frozen once suppliers hold
// links. Withdrawing isn't editing — the numbers don't move, they stop
// being on offer — so it needs its own door.
//
// Drafts can't be deactivated: there's nothing to withdraw until it has
// been sent. Delete the draft instead.
export async function POST(
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

  let body: { active?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  if (typeof body.active !== "boolean") {
    return NextResponse.json(
      { error: "Specify active: true or false" },
      { status: 400 }
    );
  }

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

  if (sheet.status === "draft") {
    return NextResponse.json(
      {
        error:
          "This sheet hasn't been sent yet — delete it instead of deactivating.",
      },
      { status: 400 }
    );
  }

  const next = body.active ? "published" : "deactivated";
  if (sheet.status === next) {
    return NextResponse.json({ success: true, status: next });
  }

  await prisma.priceSheet.update({
    where: { id },
    data: { status: next },
  });

  return NextResponse.json({ success: true, status: next });
}
