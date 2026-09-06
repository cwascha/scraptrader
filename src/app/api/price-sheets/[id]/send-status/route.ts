import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { decryptContact } from "@/lib/encryption";

// Send progress for a price sheet. Mirror of the deal endpoint — see that
// file for the reasoning. Note "responded" counts as delivered: a supplier
// can't reply to something that never arrived.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const sheet = await prisma.priceSheet.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!sheet) {
    return NextResponse.json(
      { error: "Price sheet not found" },
      { status: 404 }
    );
  }

  const recipients = await prisma.priceSheetRecipient.findMany({
    where: { sheetId: id },
    select: {
      status: true,
      sendError: true,
      channel: true,
      contact: true,
    },
  });

  let queued = 0;
  let sent = 0;
  let failed = 0;
  let manual = 0;
  const failures: { contactName: string; channel: string; error: string }[] =
    [];

  for (const r of recipients) {
    if (r.status === "queued") queued++;
    else if (r.status === "failed") {
      failed++;
      let contactName = "(deleted contact)";
      if (r.contact) {
        try {
          contactName = decryptContact(r.contact, user.encryptionKey).name;
        } catch {
          contactName = "(unreadable contact)";
        }
      }
      failures.push({
        contactName,
        channel: r.channel,
        error: r.sendError ?? "Send failed",
      });
    } else if (
      r.status === "sent" ||
      r.status === "viewed" ||
      r.status === "responded"
    ) {
      sent++;
    } else manual++;
  }

  return NextResponse.json({
    queued,
    sent,
    failed,
    manual,
    total: recipients.length,
    done: queued === 0,
    failures,
  });
}
