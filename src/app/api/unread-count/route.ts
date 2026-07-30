import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureNudgeSweeper } from "@/lib/notify";

// Total unread buyer messages across all of the user's conversations —
// powers the nav badge. Lightweight select: read markers + buyer message
// timestamps only (same JS-side count as the deals list; Prisma can't
// compare a filtered count against a per-row column).
export async function GET() {
  // Dealer presence also warms the Tier-3 nudge sweeper (no-op after the
  // first call) — covers the server-restarted-while-unread-exists case.
  ensureNudgeSweeper();

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const recipients = await prisma.dealRecipient.findMany({
    where: { deal: { userId: user.id } },
    select: {
      ownerLastReadAt: true,
      messages: {
        where: { senderType: "buyer" },
        select: { createdAt: true },
      },
    },
  });

  let unread = 0;
  for (const r of recipients) {
    const lastReadMs = r.ownerLastReadAt
      ? new Date(r.ownerLastReadAt).getTime()
      : 0;
    unread += r.messages.filter(
      (m) => new Date(m.createdAt).getTime() > lastReadMs
    ).length;
  }

  return NextResponse.json({ unread });
}
