import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { decryptContact } from "@/lib/encryption";

// Price-sheet negotiations shaped as INBOX ROWS, so the Conversations page
// can merge them with deal threads into one list.
//
// Separate from the price-sheet list endpoint on purpose: that one feeds
// the Prices page and shouldn't carry message bodies, and this one is
// polled every 15s by the inbox and shouldn't carry price lines.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const recipients = await prisma.priceSheetRecipient.findMany({
    where: { sheet: { userId: user.id }, messages: { some: {} } },
    include: {
      contact: true,
      sheet: { select: { id: true, title: true } },
      response: { select: { status: true } },
      // Full list, minimal columns: unread is a per-row comparison against
      // ownerLastReadAt, which Prisma can't express as a filtered _count.
      // Same tradeoff the deals endpoint makes (gap #17).
      messages: {
        orderBy: { createdAt: "asc" },
        select: { senderType: true, content: true, createdAt: true },
      },
    },
  });

  const threads = recipients
    .map((r) => {
      const last = r.messages[r.messages.length - 1];
      if (!last) return null;

      const lastReadMs = r.ownerLastReadAt
        ? r.ownerLastReadAt.getTime()
        : 0;
      const unreadCount = r.messages.filter(
        (m) => m.senderType === "buyer" && m.createdAt.getTime() > lastReadMs
      ).length;

      // Degrade per row rather than failing the inbox.
      let contactName = "(deleted contact)";
      if (r.contact) {
        try {
          contactName = decryptContact(r.contact, user.encryptionKey).name;
        } catch {
          contactName = "(unreadable contact)";
        }
      }

      return {
        sheetId: r.sheet.id,
        sheetTitle: r.sheet.title,
        recipientId: r.id,
        contactName,
        unreadCount,
        // Offer summaries are multi-line; the inbox shows one line, so
        // send one line rather than a payload the row will clip anyway.
        lastMessage: {
          senderType: last.senderType,
          content: last.content.split("\n")[0].slice(0, 200),
          createdAt: last.createdAt,
        },
        responseStatus: r.response?.status ?? null,
      };
    })
    .filter((t) => t !== null);

  return NextResponse.json(threads);
}
