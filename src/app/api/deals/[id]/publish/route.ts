import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { decryptContact } from "@/lib/encryption";
import { isEmailConfigured, sendDealEmail } from "@/lib/mailer";
import {
  isSmsConfigured,
  isWhatsAppConfigured,
  sendDealSms,
  sendDealWhatsApp,
} from "@/lib/sms";
import { materialLabel } from "@/lib/materials";
import { ensurePortalToken } from "@/lib/portal";
import { formatWeight } from "@/lib/deal-fields";
import { v4 as uuidv4 } from "uuid";

// Status semantics:
//   pending — link created, nothing dispatched (channel unconfigured, no
//             usable address/number, or the send failed)
//   sent    — a message was actually dispatched on that channel
//   viewed  — buyer opened the link
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { contactIds, channels } = await req.json();

  // De-dupe incoming ids (group + individual selections can overlap).
  const uniqueContactIds: string[] = Array.isArray(contactIds)
    ? [...new Set(contactIds.filter((x: unknown): x is string => typeof x === "string"))]
    : [];

  if (uniqueContactIds.length === 0) {
    return NextResponse.json(
      { error: "Select at least one contact" },
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
  // Each channel sends for real only when its credentials are present;
  // otherwise it degrades to link-sharing. Twilio approves SMS and
  // WhatsApp separately, so they're detected independently.
  const enabled: Record<string, boolean> = {
    email: isEmailConfigured(),
    sms: isSmsConfigured(),
    whatsapp: isWhatsAppConfigured(),
  };

  // Shared email content pieces for this deal.
  const materialText = materialLabel(deal.material);
  const quantityText = `${deal.numLoads} load${deal.numLoads === 1 ? "" : "s"} × ${formatWeight(deal.weightPerLoad)} ${deal.weightUnit}`;
  const priceText =
    deal.askingPrice !== null
      ? `$${deal.askingPrice.toFixed(2)} ${deal.priceUnit}`
      : null;
  const logoAbsUrl = user.logoUrl ? `${baseUrl}${user.logoUrl}` : null;
  const brandColor = user.themeBrand || "#2d5f8a";

  // Explicitly typed and explicitly projected. Spreading the whole
  // DealRecipient row here would (a) leave TS inferring an evolving any[]
  // that breaks once it's read inside a callback below, and (b) ship
  // internal columns to the client by default — the same whitelist rule
  // the public routes follow.
  const recipients: {
    id: string;
    contactName: string;
    channel: string;
    status: string;
    dealLink: string;
    sent: boolean;
    sendError?: string;
  }[] = [];
  let skipped = 0;
  let sentCount = 0;
  let failedCount = 0;
  let unreadable = 0;

  for (const contact of contacts) {
    // One undecryptable contact must not abort the whole publish. AES-GCM
    // throws on a tampered or wrong-key value (the old unauthenticated CBC
    // quietly returned ""), so skip just this recipient and report it in
    // the summary — every other decrypt site degrades the same way.
    let decrypted: ReturnType<typeof decryptContact>;
    try {
      decrypted = decryptContact(contact, user.encryptionKey);
    } catch {
      unreadable++;
      continue;
    }

    // Mint the buyer's portal token if they don't have one yet. We don't
    // SEND it — the per-deal link below is what goes out, since the email
    // is about one specific deal and should open it. But the deal page
    // offers an "All deals" link back to the portal, which needs the token
    // to exist. `contacts` was fetched with all scalar fields, so an
    // existing token costs no extra query.
    if (!contact.portalToken) await ensurePortalToken(contact.id);

    const selectedChannels = channels || ["email"];

    for (const channel of selectedChannels) {
      let hasChannel = false;
      if (channel === "email" && decrypted.email) hasChannel = true;
      if (channel === "sms" && decrypted.phone) hasChannel = true;
      if (channel === "whatsapp" && decrypted.whatsapp) hasChannel = true;

      if (!hasChannel) continue;

      if (alreadySent.has(`${contact.id}:${channel}`)) {
        skipped++;
        continue;
      }

      const accessToken = uuidv4();
      let recipient = await prisma.dealRecipient.create({
        data: {
          dealId: id,
          contactId: contact.id,
          accessToken,
          channel,
          status: "pending",
        },
      });
      alreadySent.add(`${contact.id}:${channel}`);

      const dealLink = `${baseUrl}/deal/${accessToken}`;
      let sent = false;
      let sendError: string | undefined;

      // Dispatch on whichever channel this recipient is for, when that
      // channel is configured. A send failure NEVER fails the publish —
      // the recipient and link still exist, and the summary tells the
      // dealer which ones to share by hand.
      const canSend =
        enabled[channel] &&
        ((channel === "email" && decrypted.email) ||
          (channel === "sms" && decrypted.phone) ||
          (channel === "whatsapp" && decrypted.whatsapp));

      if (canSend) {
        try {
          if (channel === "email") {
            await sendDealEmail({
              to: decrypted.email!,
              contactName: decrypted.name,
              sellerName: user.name,
              companyName: user.companyName,
              // Replies go to the dealer's own inbox, not the platform address.
              replyTo: user.email,
              dealTitle: deal.title,
              materialText,
              quantityText,
              priceText,
              dealLink,
              brandColor,
              logoUrl: logoAbsUrl,
            });
          } else {
            const text = {
              to: (channel === "sms" ? decrypted.phone : decrypted.whatsapp)!,
              sellerName: user.name,
              companyName: user.companyName,
              dealTitle: deal.title,
              dealLink,
            };
            if (channel === "sms") await sendDealSms(text);
            else await sendDealWhatsApp(text);
          }

          recipient = await prisma.dealRecipient.update({
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

      recipients.push({
        id: recipient.id,
        contactName: decrypted.name,
        channel: recipient.channel,
        status: recipient.status,
        dealLink,
        sent,
        sendError,
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

  const parts = [`Deal published to ${recipients.length} recipient(s).`];
  if (sentCount > 0) {
    parts.push(`${sentCount} message(s) sent automatically.`);
  }
  if (failedCount > 0) {
    parts.push(
      `${failedCount} failed to send — share those links manually.`
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
    sent: sentCount,
    failed: failedCount,
    message: parts.join(" "),
  });
}
