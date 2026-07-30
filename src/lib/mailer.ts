// Email sending via SMTP — configured for Google Workspace (smtp.gmail.com
// + App Password), but any SMTP server works. Sending is OPTIONAL: when the
// env vars are absent the app falls back to manual link sharing, so dev
// works without credentials.
//
// From/Reply-To strategy: mail authenticates (and is addressed) as the
// platform account, but the FROM DISPLAY NAME is the dealer's, and REPLY-TO
// is the dealer's own email — so recipients see the dealer's name and
// replies go straight to the dealer's inbox. The From *address* cannot be
// the dealer's own domain: Gmail rewrites unauthorized From addresses, and
// the recipient's DMARC checks would junk cross-domain spoofing anyway.
// (Per-dealer verified sending domains = future transactional-provider work.)
//
// Exception: sendUnreadNudgeEmail goes TO the dealer FROM the platform —
// it's ScrapTrader talking to its user, so it's ScrapTrader-branded.
//
// Required env:
//   SMTP_USER  — full Workspace address, e.g. deals@thescraptrader.com
//   SMTP_PASS  — Google App Password (requires 2-Step Verification)
// Optional env:
//   SMTP_HOST  — default smtp.gmail.com
//   SMTP_PORT  — default 587 (STARTTLS); 465 switches to implicit TLS
//   SMTP_FROM  — sending address if different from SMTP_USER; a plain
//                address or "Name <addr>" (the address part is extracted —
//                the display name comes from the dealer per-message)

import nodemailer, { Transporter } from "nodemailer";

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    const port = Number.parseInt(process.env.SMTP_PORT || "587", 10);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

// The address we're allowed to send as. SMTP_FROM may be "Name <addr>" —
// only the address part is used; display names are built per-dealer.
function fromAddress(): string {
  const raw = process.env.SMTP_FROM || process.env.SMTP_USER || "";
  const match = raw.match(/<([^>]+)>/);
  return match ? match[1] : raw;
}

// All user-controlled strings (names, titles, notes) are escaped before
// being placed in HTML — deal titles must not be able to inject markup
// into a recipient's mail client.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeBrand(brandColor: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : "#2d5f8a";
}

function headerHtml(
  logoUrl: string | null,
  companyName: string,
  brand: string
): string {
  return logoUrl
    ? `<img src="${logoUrl}" alt="${companyName}" style="max-height:40px;max-width:220px;" />`
    : `<span style="font-size:20px;font-weight:bold;color:${brand};">${companyName}</span>`;
}

// Shared outer shell: branded header, white card, "Powered by" footer.
function shell(headerContent: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="padding:20px 28px;border-bottom:1px solid #e2e8f0;">${headerContent}</td>
        </tr>
        <tr>
          <td style="padding:28px;">${bodyContent}</td>
        </tr>
        <tr>
          <td style="padding:16px 28px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;">
            Powered by ScrapTrader
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export interface DealEmailOptions {
  to: string;
  contactName: string;
  sellerName: string;
  companyName: string;
  replyTo: string; // dealer's own email — where buyer replies land
  dealTitle: string;
  materialText: string;
  quantityText: string;
  priceText: string | null;
  dealLink: string;
  brandColor: string; // hex — dealer theme or default
  logoUrl: string | null; // absolute URL or null
}

export async function sendDealEmail(opts: DealEmailOptions): Promise<void> {
  const brand = sanitizeBrand(opts.brandColor);

  const contactName = escapeHtml(opts.contactName);
  const sellerName = escapeHtml(opts.sellerName);
  const companyName = escapeHtml(opts.companyName);
  const dealTitle = escapeHtml(opts.dealTitle);
  const materialText = escapeHtml(opts.materialText);
  const quantityText = escapeHtml(opts.quantityText);
  const priceText = opts.priceText ? escapeHtml(opts.priceText) : null;

  const factRow = (label: string, value: string) =>
    `<tr>
      <td style="padding:6px 12px;color:#64748b;font-size:13px;">${label}</td>
      <td style="padding:6px 12px;color:#1e293b;font-size:13px;font-weight:600;">${value}</td>
    </tr>`;

  const body = `
            <p style="margin:0 0 16px;color:#1e293b;font-size:14px;">Hi ${contactName},</p>
            <p style="margin:0 0 20px;color:#1e293b;font-size:14px;">
              ${sellerName} at ${companyName} sent you a deal:
            </p>
            <h2 style="margin:0 0 16px;color:#1e293b;font-size:18px;">${dealTitle}</h2>
            <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;width:100%;margin-bottom:24px;">
              ${factRow("Material", materialText)}
              ${factRow("Quantity", quantityText)}
              ${priceText ? factRow("Asking Price", priceText) : ""}
            </table>
            <table cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:${brand};">
              <a href="${opts.dealLink}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">
                View Deal &amp; Chat
              </a>
            </td></tr></table>
            <p style="margin:20px 0 0;color:#94a3b8;font-size:12px;">
              Or copy this link: <a href="${opts.dealLink}" style="color:${brand};">${opts.dealLink}</a>
            </p>`;

  const html = shell(headerHtml(opts.logoUrl, companyName, brand), body);

  const text = [
    `Hi ${opts.contactName},`,
    ``,
    `${opts.sellerName} at ${opts.companyName} sent you a deal:`,
    ``,
    opts.dealTitle,
    `Material: ${opts.materialText}`,
    `Quantity: ${opts.quantityText}`,
    ...(opts.priceText ? [`Asking Price: ${opts.priceText}`] : []),
    ``,
    `View the deal and chat: ${opts.dealLink}`,
  ].join("\n");

  await getTransporter().sendMail({
    // Dealer's name as the visible sender; platform address underneath
    // (nodemailer handles quoting/encoding of the display name).
    from: {
      name: `${opts.sellerName} (${opts.companyName})`,
      address: fromAddress(),
    },
    replyTo: opts.replyTo,
    to: opts.to,
    subject: `${opts.companyName}: ${opts.dealTitle}`,
    text,
    html,
  });
}

export interface BidAcceptedEmailOptions {
  to: string;
  contactName: string;
  sellerName: string;
  companyName: string;
  replyTo: string;
  dealTitle: string;
  priceText: string; // e.g. "$2.5000/kg (≈ $1.1340/lb)"
  dealLink: string;
  brandColor: string;
  logoUrl: string | null;
}

// Sent to the winning buyer when their bid is accepted. Same dealer-identity
// From/Reply-To strategy as deal emails.
export async function sendBidAcceptedEmail(
  opts: BidAcceptedEmailOptions
): Promise<void> {
  const brand = sanitizeBrand(opts.brandColor);

  const contactName = escapeHtml(opts.contactName);
  const sellerName = escapeHtml(opts.sellerName);
  const companyName = escapeHtml(opts.companyName);
  const dealTitle = escapeHtml(opts.dealTitle);
  const priceText = escapeHtml(opts.priceText);

  const body = `
            <p style="margin:0 0 16px;color:#1e293b;font-size:14px;">Hi ${contactName},</p>
            <p style="margin:0 0 16px;color:#1e293b;font-size:14px;">
              Congratulations — your bid was accepted!
            </p>
            <h2 style="margin:0 0 12px;color:#1e293b;font-size:18px;">${dealTitle}</h2>
            <table cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;width:100%;margin-bottom:20px;">
              <tr>
                <td style="padding:12px;color:#64748b;font-size:13px;">Accepted Price</td>
                <td style="padding:12px;color:#1e293b;font-size:15px;font-weight:bold;">${priceText}</td>
              </tr>
            </table>
            <p style="margin:0 0 24px;color:#1e293b;font-size:14px;">
              ${sellerName} at ${companyName} will send an invoice separately.
              Use the deal chat for any questions about logistics or paperwork.
            </p>
            <table cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:${brand};">
              <a href="${opts.dealLink}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">
                Open Deal Chat
              </a>
            </td></tr></table>`;

  const html = shell(headerHtml(opts.logoUrl, companyName, brand), body);

  const text = [
    `Hi ${opts.contactName},`,
    ``,
    `Congratulations — your bid was accepted!`,
    ``,
    opts.dealTitle,
    `Accepted Price: ${opts.priceText}`,
    ``,
    `${opts.sellerName} at ${opts.companyName} will send an invoice separately.`,
    `Questions about logistics or paperwork: ${opts.dealLink}`,
  ].join("\n");

  await getTransporter().sendMail({
    from: {
      name: `${opts.sellerName} (${opts.companyName})`,
      address: fromAddress(),
    },
    replyTo: opts.replyTo,
    to: opts.to,
    subject: `${opts.companyName}: Bid accepted — ${opts.dealTitle}`,
    text,
    html,
  });
}

export interface UnreadNudgeEmailOptions {
  to: string; // the DEALER's email
  dealerName: string;
  contactName: string; // decrypted buyer name (dealer-side data — this email goes to the dealer)
  dealTitle: string;
  count: number; // unread messages in this conversation
  conversationUrl: string; // deep link: /dashboard/deals/{id}?conversation={rid}
}

// Tier-3 nudge: sent TO the dealer when a conversation has unread buyer
// messages older than the nudge threshold (see lib/notify.ts). This is
// platform-to-user mail, so it's ScrapTrader-branded — no dealer identity,
// no Reply-To games.
export async function sendUnreadNudgeEmail(
  opts: UnreadNudgeEmailOptions
): Promise<void> {
  const brand = sanitizeBrand("#2d5f8a"); // ScrapTrader default
  const dealerName = escapeHtml(opts.dealerName);
  const contactName = escapeHtml(opts.contactName);
  const dealTitle = escapeHtml(opts.dealTitle);
  const plural = opts.count === 1 ? "message" : "messages";

  const body = `
            <p style="margin:0 0 16px;color:#1e293b;font-size:14px;">Hi ${dealerName},</p>
            <p style="margin:0 0 16px;color:#1e293b;font-size:14px;">
              <strong>${contactName}</strong> sent ${opts.count} ${plural} on
              <strong>${dealTitle}</strong> that ${opts.count === 1 ? "has" : "have"} been waiting for a reply.
            </p>
            <table cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:${brand};">
              <a href="${opts.conversationUrl}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">
                Open Conversation
              </a>
            </td></tr></table>
            <p style="margin:20px 0 0;color:#94a3b8;font-size:12px;">
              You're getting this because the conversation has been unread for over 5 minutes.
              You won't be emailed about it again until new messages arrive after you've read it.
            </p>`;

  const html = shell(headerHtml(null, "ScrapTrader", brand), body);

  const text = [
    `Hi ${opts.dealerName},`,
    ``,
    `${opts.contactName} sent ${opts.count} ${plural} on "${opts.dealTitle}" that ${opts.count === 1 ? "is" : "are"} waiting for a reply.`,
    ``,
    `Open the conversation: ${opts.conversationUrl}`,
  ].join("\n");

  await getTransporter().sendMail({
    from: {
      name: "ScrapTrader",
      address: fromAddress(),
    },
    to: opts.to,
    subject: `New ${plural} from ${opts.contactName} — ${opts.dealTitle}`,
    text,
    html,
  });
}
