import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { decryptContact } from "@/lib/encryption";
import { isEmailConfigured, sendPriceSheetEmail } from "@/lib/mailer";
import {
  isSmsConfigured,
  isWhatsAppConfigured,
  sendPriceSheetSms,
  sendPriceSheetWhatsApp,
} from "@/lib/sms";
import { enforceBodyLimit, JSON_BODY_LIMIT } from "@/lib/body-limit";
import { formatPrice } from "@/lib/price-sheet-defaults";
import { v4 as uuidv4 } from "uuid";

// Publishing a price sheet LOCKS it (draft -> published) and sends the
// shared public link to the selected contacts. Re-publishing an already
// published sheet is allowed — it reaches new contacts without changing
// the prices anyone already received.
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
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });

  if (!sheet) {
    return NextResponse.json(
      { error: "Price sheet not found" },
      { status: 404 }
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

  const effectiveDateText = new Date(sheet.effectiveDate).toLocaleDateString(
    "en-US",
    { year: "numeric", month: "long", day: "numeric" }
  );

  // Group items for the email table, preserving sheet order for both the
  // categories and the lines inside them.
  const categories: { name: string; items: { name: string; value: string }[] }[] =
    [];
  for (const item of sheet.items) {
    let cat = categories.find((c) => c.name === item.category);
    if (!cat) {
      cat = { name: item.category, items: [] };
      categories.push(cat);
    }
    cat.items.push({
      name: item.name,
      value: formatPrice(item.price, item.priceNote, item.unit),
    });
  }

  const logoAbsUrl = user.logoUrl ? `${baseUrl}${user.logoUrl}` : null;
  const brandColor = user.themeBrand || "#2d5f8a";

  // Explicitly typed: this array is read inside a .filter() callback
  // below, where an evolving any[] can't be resolved.
  const results: {
    contactName: string;
    channel: string;
    sheetLink: string;
    sent: boolean;
    sendError?: string;
  }[] = [];
  let sentCount = 0;
  let failedCount = 0;
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
      let recipient = await prisma.priceSheetRecipient.create({
        data: {
          sheetId: id,
          contactId: contact.id,
          accessToken,
          channel,
          status: "pending",
        },
      });
      alreadySent.add(`${contact.id}:${channel}`);

      const sheetLink = `${baseUrl}/prices/${accessToken}`;
      let sent = false;
      let sendError: string | undefined;

      if (enabled[channel]) {
        try {
          if (channel === "email") {
            await sendPriceSheetEmail({
              to: target,
              contactName: decrypted.name,
              sellerName: user.name,
              companyName: user.companyName,
              replyTo: user.email,
              sheetTitle: sheet.title,
              headerNote: sheet.headerNote,
              effectiveDateText,
              categories,
              sheetLink,
              brandColor,
              logoUrl: logoAbsUrl,
            });
          } else {
            const text = {
              to: target,
              sellerName: user.name,
              companyName: user.companyName,
              sheetTitle: sheet.title,
              effectiveDateText,
              sheetLink,
            };
            if (channel === "sms") await sendPriceSheetSms(text);
            else await sendPriceSheetWhatsApp(text);
          }

          recipient = await prisma.priceSheetRecipient.update({
            where: { id: recipient.id },
            data: { status: "sent", sentAt: new Date() },
          });
          sent = true;
          sentCount++;
        } catch (err) {
          sendError = err instanceof Error ? err.message : "Send failed";
          failedCount++;
        }
      }

      results.push({
        contactName: decrypted.name,
        channel,
        sheetLink,
        sent,
        sendError,
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

  const parts = [`Price sheet sent to ${results.length} recipient(s).`];
  if (sentCount > 0) parts.push(`${sentCount} message(s) sent automatically.`);
  if (failedCount > 0) {
    parts.push(`${failedCount} failed to send — share the link manually.`);
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
    sent: sentCount,
    failed: failedCount,
    skipped,
    unreadable,
    message: parts.join(" "),
  });
}
