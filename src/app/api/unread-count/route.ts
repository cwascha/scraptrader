import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ensureNudgeSweeper } from "@/lib/notify";
import { ensureSendWorker } from "@/lib/send-queue";

// Total unread buyer messages across all of the user's conversations —
// powers the nav badge. Lightweight select: read markers + buyer message
// timestamps only (same JS-side count as the deals list; Prisma can't
// compare a filtered count against a per-row column).
export async function GET() {
  // Dealer presence also warms the Tier-3 nudge sweeper (no-op after the
  // first call) — covers the server-restarted-while-unread-exists case.
  // Warm both background workers. This endpoint is polled by every
  // dashboard page, so it's the reliable place to guarantee they're
  // running — in particular it means a restart mid-publish resumes the
  // send queue as soon as the dealer's browser next polls.
  ensureNudgeSweeper();
  ensureSendWorker();

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [dealRecipients, sheetRecipients] = await Promise.all([
    prisma.dealRecipient.findMany({
      where: { deal: { userId: user.id } },
      select: {
        ownerLastReadAt: true,
        messages: {
          where: { senderType: "buyer" },
          select: { createdAt: true },
        },
      },
    }),
    // Price-sheet negotiations count toward the same badge. A supplier's
    // offer is written to the thread as a buyer message, so the arithmetic
    // is identical and needs no special case.
    prisma.priceSheetRecipient.findMany({
      where: { sheet: { userId: user.id } },
      select: {
        ownerLastReadAt: true,
        messages: {
          where: { senderType: "buyer" },
          select: { createdAt: true },
        },
      },
    }),
  ]);

  let unread = 0;
  for (const r of [...dealRecipients, ...sheetRecipients]) {
    const lastReadMs = r.ownerLastReadAt
      ? new Date(r.ownerLastReadAt).getTime()
      : 0;
    unread += r.messages.filter(
      (m) => new Date(m.createdAt).getTime() > lastReadMs
    ).length;
  }

  return NextResponse.json({ unread });
}
