import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { decryptContact } from "@/lib/encryption";

// Send progress for a deal. Polled by the publish panel while anything is
// still queued, so the dealer watches a 200-contact publish drain instead
// of staring at a request that used to take minutes and often timed out.
//
// Cheap on purpose: counts plus the failures. A successful send needs no
// detail; a failed one needs a name and a reason.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const deal = await prisma.deal.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const recipients = await prisma.dealRecipient.findMany({
    where: { dealId: id },
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
    }
    // "viewed" implies it was delivered and opened.
    else if (r.status === "sent" || r.status === "viewed") sent++;
    else manual++;
  }

  return NextResponse.json({
    queued,
    sent,
    failed,
    manual,
    total: recipients.length,
    // Lets the client stop polling.
    done: queued === 0,
    failures,
  });
}
