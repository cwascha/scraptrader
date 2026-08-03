import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { decryptContact } from "@/lib/encryption";
import { isEmailConfigured } from "@/lib/mailer";
import { isSmsConfigured, isWhatsAppConfigured } from "@/lib/sms";
import { ensurePortalToken } from "@/lib/portal";
import { kickSendQueue } from "@/lib/send-queue";
import { enforceBodyLimit, JSON_BODY_LIMIT } from "@/lib/body-limit";
import { v4 as uuidv4 } from "uuid";

// Publishing CREATES RECIPIENTS AND RETURNS. It no longer sends anything
// inline — messages are queued and drained by lib/send-queue.ts.
//
// Why: publishing to 500 contacts meant 500 sequential SMTP round-trips
// inside one HTTP request, which blows past the reverse proxy's read
// timeout. The connection died mid-send, leaving recipients created, an
// unknown number of emails delivered, and no retry path (gap #43b). The
// dealer saw a failed request and couldn't tell who had been reached.
//
// Status semantics:
//   queued  — will be sent by the background worker
//   sent    — dispatched on that channel
//   failed  — attempts exhausted; share the link by hand
//   pending — nothing to dispatch (channel unconfigured, or no address)
//   viewed  — buyer opened the link
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
  const deal = await prisma.deal.findFirst({
    where: { id, userId: user.id },
  });

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  // SERVER-SIDE closed guard. The UI disables Publish on closed deals, but
  // without this check a direct POST (or a stale tab) would create new
  // recipients AND flip status back to "published" — silently REOPENING
  // bidding on a deal that already has an accepted price. Acceptance is
  // final; the state machine only moves draft -> published -> closed.
  if (deal.status === "closed") {
    return NextResponse.json(
      { error: "This deal is closed — a bid was accepted. Publishing is disabled." },
      { status: 400 }
    );
  }

  let body: { contactIds?: unknown; channels?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  // De-dupe incoming ids (group + individual selections can overlap).
  const uniqueContactIds: string[] = Array.isArray(body.contactIds)
    ? [
        ...new Set(
          body.contactIds.filter((x: unknown): x is string => typeof x === "string")
        ),
      ]
    : [];

  if (uniqueContactIds.length === 0) {
    return NextResponse.json(
      { error: "Select at least one contact" },
      { status: 400 }
    );
  }

  const selectedChannels: string[] = Array.isArray(body.channels)
    ? body.channels.filter(
        (c: unknown): c is string =>
          c === "email" || c === "sms" || c === "whatsapp"
      )
    : ["email"];

  if (selectedChannels.length === 0) {
    return NextResponse.json(
      { error: "Select at least one channel" },
      { status: 400 }
    );
  }

  const contacts = await prisma.contact.findMany({
    where: { id: { in: uniqueContactIds }, userId: user.id },
  });

  // Contact × channel pairs that already have a recipient for this deal are
  // skipped, so republishing never sends the same deal to someone twice.
  const existingRecipients = await prisma.dealRecipient.findMany({
    where: { dealId: id, contactId: { not: null } },
    select: { contactId: true, channel: true },
  });
  const alreadySent = new Set(
    existingRecipients.map((r) => `${r.contactId}:${r.channel}`)
  );

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  // Each channel dispatches only when its credentials are present;
  // otherwise the recipient is created as `pending` and the dealer shares
  // the link by hand. Twilio approves SMS and WhatsApp separately, so
  // they're detected independently.
  const enabled: Record<string, boolean> = {
    email: isEmailConfigured(),
    sms: isSmsConfigured(),
    whatsapp: isWhatsAppConfigured(),
  };

  const recipients: {
    id: string;
    contactName: string;
    channel: string;
    status: string;
    dealLink: string;
  }[] = [];
  let skipped = 0;
  let queuedCount = 0;
  let manualCount = 0;
  let unreadable = 0;

  for (const contact of contacts) {
    // One undecryptable contact must not abort the whole publish. AES-GCM
    // throws on a tampered or wrong-key value, so skip just this recipient
    // and report it — every other decrypt site degrades the same way.
    let decrypted: ReturnType<typeof decryptContact>;
    try {
      decrypted = decryptContact(contact, user.encryptionKey);
    } catch {
      unreadable++;
      continue;
    }

    // Mint the buyer's portal token if they don't have one yet. We don't
    // SEND it — the per-deal link is what goes out — but the deal page
    // offers an "All deals" link back to the portal, which needs it.
    if (!contact.portalToken) await ensurePortalToken(contact.id);

    for (const channel of selectedChannels) {
      const target =
        channel === "email"
          ? decrypted.email
          : channel === "sms"
            ? decrypted.phone
            : decrypted.whatsapp;
      if (!target) continue;

      if (alreadySent.has(`${contact.id}:${channel}`)) {
        skipped++;
        continue;
      }

      // Queue only what can actually be dispatched; everything else is
      // `pending` so the worker doesn't burn retries on a channel that has
      // no credentials configured.
      const willSend = enabled[channel];
      const accessToken = uuidv4();
      const recipient = await prisma.dealRecipient.create({
        data: {
          dealId: id,
          contactId: contact.id,
          accessToken,
          channel,
          status: willSend ? "queued" : "pending",
        },
      });
      alreadySent.add(`${contact.id}:${channel}`);

      if (willSend) queuedCount++;
      else manualCount++;

      recipients.push({
        id: recipient.id,
        contactName: decrypted.name,
        channel: recipient.channel,
        status: recipient.status,
        dealLink: `${baseUrl}/deal/${accessToken}`,
      });
    }
  }

  // Guarded transition: only a non-closed deal can (re)enter "published".
  // The WHERE keeps this atomic even if an acceptance landed between the
  // read above and this write.
  await prisma.deal.updateMany({
    where: { id, status: { not: "closed" } },
    data: { status: "published" },
  });

  // Fire-and-forget: starts draining now rather than waiting for the next
  // sweep. Deliberately NOT awaited — that's the entire point.
  if (queuedCount > 0) kickSendQueue();

  const parts = [`Deal published to ${recipients.length} recipient(s).`];
  if (queuedCount > 0) {
    parts.push(
      `${queuedCount} message(s) sending now — this page updates as they go out.`
    );
  }
  // Name the unconfigured channels explicitly: "nothing sent" is confusing
  // when two of three channels are live.
  const unconfigured = [
    { key: "email", label: "Email (SMTP_USER/SMTP_PASS)" },
    { key: "sms", label: "SMS (TWILIO_SMS_FROM)" },
    { key: "whatsapp", label: "WhatsApp (TWILIO_WHATSAPP_FROM)" },
  ]
    .filter(
      (c) => !enabled[c.key] && recipients.some((r) => r.channel === c.key)
    )
    .map((c) => c.label);
  if (unconfigured.length > 0) {
    parts.push(
      `Not configured for automatic sending: ${unconfigured.join(", ")} — share those links manually.`
    );
  }
  if (skipped > 0) {
    parts.push(
      `${skipped} contact/channel combo(s) skipped — they already received this deal.`
    );
  }
  if (unreadable > 0) {
    parts.push(
      `${unreadable} contact(s) skipped — their stored details couldn't be decrypted.`
    );
  }

  return NextResponse.json({
    success: true,
    recipients,
    skipped,
    unreadable,
    queued: queuedCount,
    manual: manualCount,
    message: parts.join(" "),
  });
}
