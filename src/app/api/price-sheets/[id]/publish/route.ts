import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { decryptContact } from "@/lib/encryption";
import { isEmailConfigured } from "@/lib/mailer";
import { isSmsConfigured, isWhatsAppConfigured } from "@/lib/sms";
import { kickSendQueue } from "@/lib/send-queue";
import { enforceBodyLimit, JSON_BODY_LIMIT } from "@/lib/body-limit";
import { v4 as uuidv4 } from "uuid";

// Publishing a price sheet LOCKS it (draft -> published) and QUEUES each
// selected contact their own tokenized link. Nothing is sent inline —
// lib/send-queue.ts drains the queue in the background (gap #43b).
//
// Re-publishing an already published sheet is allowed: it reaches new
// contacts without changing the prices anyone already received.
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
  const sheet = await prisma.priceSheet.findFirst({
    where: { id, userId: user.id },
    include: { items: { select: { id: true } } },
  });

  if (!sheet) {
    return NextResponse.json(
      { error: "Price sheet not found" },
      { status: 404 }
    );
  }

  // A withdrawn sheet must not reach anyone new. Reactivate it first.
  if (sheet.status === "deactivated") {
    return NextResponse.json(
      {
        error:
          "This sheet is deactivated — reactivate it before sending to more contacts.",
      },
      { status: 400 }
    );
  }

  if (sheet.items.length === 0) {
    return NextResponse.json(
      { error: "Add at least one priced line before sending" },
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

  const channels: string[] = Array.isArray(body.channels)
    ? body.channels.filter(
        (c: unknown): c is string =>
          c === "email" || c === "sms" || c === "whatsapp"
      )
    : ["email"];

  if (channels.length === 0) {
    return NextResponse.json(
      { error: "Select at least one channel" },
      { status: 400 }
    );
  }

  const contacts = await prisma.contact.findMany({
    where: { id: { in: uniqueContactIds }, userId: user.id },
  });

  // Contact × channel pairs already sent THIS sheet are skipped, so
  // re-publishing to a group never double-sends to existing recipients.
  const existing = await prisma.priceSheetRecipient.findMany({
    where: { sheetId: id, contactId: { not: null } },
    select: { contactId: true, channel: true },
  });
  const alreadySent = new Set(
    existing.map((r) => `${r.contactId}:${r.channel}`)
  );

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const enabled: Record<string, boolean> = {
    email: isEmailConfigured(),
    sms: isSmsConfigured(),
    whatsapp: isWhatsAppConfigured(),
  };

  const results: {
    contactName: string;
    channel: string;
    status: string;
    sheetLink: string;
  }[] = [];
  let queuedCount = 0;
  let manualCount = 0;
  let skipped = 0;
  let unreadable = 0;

  for (const contact of contacts) {
    let decrypted: ReturnType<typeof decryptContact>;
    try {
      decrypted = decryptContact(contact, user.encryptionKey);
    } catch {
      unreadable++;
      continue;
    }

    for (const channel of channels) {
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

      // Per-recipient token: the supplier's reply has to be attributable,
      // and each of them edits their own copy of the response form.
      const accessToken = uuidv4();
      const willSend = enabled[channel];
      const recipient = await prisma.priceSheetRecipient.create({
        data: {
          sheetId: id,
          contactId: contact.id,
          accessToken,
          channel,
          status: willSend ? "queued" : "pending",
        },
      });
      alreadySent.add(`${contact.id}:${channel}`);

      if (willSend) queuedCount++;
      else manualCount++;

      results.push({
        contactName: decrypted.name,
        channel,
        status: recipient.status,
        sheetLink: `${baseUrl}/prices/${accessToken}`,
      });
    }
  }

  // Nothing was created: either every pair was already sent (fine on a
  // republish) or no selected contact had a usable address/number for the
  // chosen channels. Bail BEFORE the lock — otherwise a first publish that
  // reached nobody would still freeze the sheet, and the dealer would have
  // to duplicate it just to fix a missing email address.
  if (results.length === 0) {
    return NextResponse.json(
      {
        error:
          skipped > 0
            ? "Everyone selected has already been sent this sheet."
            : "None of the selected contacts have an address or number for the channels you picked.",
      },
      { status: 400 }
    );
  }

  // Lock the sheet. Guarded so a concurrent publish can't reopen it, and
  // publishedAt is only stamped on the first transition.
  await prisma.priceSheet.updateMany({
    where: { id, status: "draft" },
    data: { status: "published", publishedAt: new Date() },
  });

  if (queuedCount > 0) kickSendQueue();

  const parts = [`Price sheet sent to ${results.length} recipient(s).`];
  if (queuedCount > 0) {
    parts.push(
      `${queuedCount} message(s) sending now — this page updates as they go out.`
    );
  }
  const unconfigured = [
    { key: "email", label: "Email (SMTP_USER/SMTP_PASS)" },
    { key: "sms", label: "SMS (TWILIO_SMS_FROM)" },
    { key: "whatsapp", label: "WhatsApp (TWILIO_WHATSAPP_FROM)" },
  ]
    .filter((c) => !enabled[c.key] && results.some((r) => r.channel === c.key))
    .map((c) => c.label);
  if (unconfigured.length > 0) {
    parts.push(
      `Not configured for automatic sending: ${unconfigured.join(", ")} — share the link manually.`
    );
  }
  if (skipped > 0) {
    parts.push(`${skipped} skipped — already sent this sheet.`);
  }
  if (unreadable > 0) {
    parts.push(
      `${unreadable} contact(s) skipped — their stored details couldn't be decrypted.`
    );
  }

  return NextResponse.json({
    success: true,
    recipients: results,
    queued: queuedCount,
    manual: manualCount,
    skipped,
    unreadable,
    message: parts.join(" "),
  });
}
