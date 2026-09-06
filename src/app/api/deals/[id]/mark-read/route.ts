import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { enforceBodyLimit, JSON_BODY_LIMIT } from "@/lib/body-limit";

// Mark one conversation read (owner side). Body: { recipientId }.
// Called when the owner expands a conversation and whenever new messages
// arrive while it's open. Sets ownerLastReadAt = now.
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

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const recipientId =
    typeof body.recipientId === "string" ? body.recipientId : "";

  const result = await prisma.dealRecipient.updateMany({
    where: { id: recipientId, deal: { id, userId: user.id } },
    data: { ownerLastReadAt: new Date() },
  });

  if (result.count === 0) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}
