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
//
// Exception: platform-to-dealer mail (sendNudgeDigestEmail,
// sendPriceSheetResponseNotice) goes TO the dealer FROM the platform —
// it's ScrapTrader talking to its user, so it's ScrapTrader-branded with
// no dealer identity and no Reply-To games.
//
// Per-dealer verified sending domains were considered and REJECTED (see
// ARCHITECTURE gap #39): scrap yards can't reliably add DNS records, and a
// wrong one fails silently into spam. The plan is one sending subdomain we
// control, with dealer identity carried by the display name and Reply-To
// exactly as below.
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

export interface PriceSheetEmailOptions {
  to: string;
  contactName: string;
  sellerName: string;
  companyName: string;
  replyTo: string;
  sheetTitle: string;
  // Pre-formatted ("Comex $6.35"), like every other price string here —
  // the mailer renders, it doesn't format domain values.
  comexBasisText: string | null;
  headerNote: string | null; // anything else (terms, delivery note)
  effectiveDateText: string; // e.g. "September 2, 2025"
  // Grouped exactly as the sheet is laid out; `value` is already
  // formatted ("$4.09/lb" or "Need Pics").
  categories: { name: string; items: { name: string; value: string }[] }[];
  sheetLink: string;
  brandColor: string;
  logoUrl: string | null;
}

// Buying price sheet — what the yard will PAY. Unlike the deal email,
// this inlines the FULL price table: suppliers compare sheets side by
// side in their inbox and shouldn't have to open a link to do it. The
// link goes to THEIR copy of the sheet, where they enter the tonnage they
// have and counter any price they want more for.
export async function sendPriceSheetEmail(
  opts: PriceSheetEmailOptions
): Promise<void> {
  const brand = sanitizeBrand(opts.brandColor);

  const contactName = escapeHtml(opts.contactName);
  const sellerName = escapeHtml(opts.sellerName);
  const companyName = escapeHtml(opts.companyName);
  const sheetTitle = escapeHtml(opts.sheetTitle);
  const headerNote = opts.headerNote ? escapeHtml(opts.headerNote) : null;
  const basisText = opts.comexBasisText
    ? escapeHtml(opts.comexBasisText)
    : null;
  const effectiveDateText = escapeHtml(opts.effectiveDateText);

  // One block per category: a tinted label row, then name/price pairs.
  const tableHtml = opts.categories
    .map((cat) => {
      const rows = cat.items
        .map(
          (i, idx) =>
            `<tr style="background:${idx % 2 ? "#f8fafc" : "#ffffff"};">
              <td style="padding:6px 12px;color:#1e293b;font-size:13px;">${escapeHtml(i.name)}</td>
              <td style="padding:6px 12px;color:#1e293b;font-size:13px;font-weight:600;text-align:right;white-space:nowrap;">${escapeHtml(i.value)}</td>
            </tr>`
        )
        .join("");
      return `<tr><td colspan="2" style="padding:14px 12px 6px;color:${brand};font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:0.08em;">${escapeHtml(cat.name)}</td></tr>${rows}`;
    })
    .join("");

  const body = `
            <p style="margin:0 0 16px;color:#1e293b;font-size:14px;">Hi ${contactName},</p>
            <p style="margin:0 0 20px;color:#1e293b;font-size:14px;">
              ${sellerName} at ${companyName} sent you an updated buying price sheet.
            </p>
            <h2 style="margin:0 0 4px;color:#1e293b;font-size:18px;">${sheetTitle}</h2>
            <p style="margin:0 0 2px;color:#64748b;font-size:12px;">Effective ${effectiveDateText}</p>
            ${basisText ? `<p style="margin:0 0 2px;color:#1e293b;font-size:13px;font-weight:bold;">${basisText}</p>` : ""}
            ${headerNote ? `<p style="margin:0 0 16px;color:#64748b;font-size:12px;">${headerNote}</p>` : `<div style="height:12px;"></div>`}
            <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
              ${tableHtml}
            </table>
            <table cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:${brand};">
              <a href="${opts.sheetLink}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">
                Tell Us What You Have
              </a>
            </td></tr></table>
            <p style="margin:16px 0 0;color:#64748b;font-size:12px;">
              Enter the weight you have for any of these grades — and name your
              price if you want more than we've quoted. We'll come back to you.
            </p>
            <p style="margin:12px 0 0;color:#94a3b8;font-size:12px;">
              Or copy this link: <a href="${opts.sheetLink}" style="color:${brand};">${opts.sheetLink}</a>
            </p>`;

  const html = shell(headerHtml(opts.logoUrl, companyName, brand), body);

  const text = [
    `Hi ${opts.contactName},`,
    ``,
    `${opts.sellerName} at ${opts.companyName} sent you an updated buying price sheet.`,
    ``,
    opts.sheetTitle,
    `Effective ${opts.effectiveDateText}`,
    ...(opts.comexBasisText ? [opts.comexBasisText] : []),
    ...(opts.headerNote ? [opts.headerNote] : []),
    ``,
    ...opts.categories.flatMap((cat) => [
      cat.name.toUpperCase(),
      ...cat.items.map((i) => `  ${i.name}: ${i.value}`),
      ``,
    ]),
    `Tell us what you have (enter weights, name your price if you want more): ${opts.sheetLink}`,
  ].join("\n");

  await getTransporter().sendMail({
    from: {
      name: `${opts.sellerName} (${opts.companyName})`,
      address: fromAddress(),
    },
    replyTo: opts.replyTo,
    to: opts.to,
    subject: `${opts.companyName}: ${opts.sheetTitle} — ${opts.effectiveDateText}`,
    text,
    html,
  });
}

export interface PriceSheetResponseNoticeOptions {
  to: string; // the DEALER's email
  dealerName: string;
  contactName: string; // decrypted supplier name (dealer-side data)
  sheetTitle: string;
  totalWeightText: string; // e.g. "64,000 lbs across 3 grades"
  hasCounters: boolean; // did they ask above sheet price on any line?
  responseUrl: string; // /dashboard/prices/{id}
}

// Platform-to-dealer notice that a supplier answered a price sheet.
// ScrapTrader-branded, like the unread nudge — this is the app telling
// its user something happened, not the dealer talking to a buyer.
export async function sendPriceSheetResponseNotice(
  opts: PriceSheetResponseNoticeOptions
): Promise<void> {
  const brand = sanitizeBrand("#2d5f8a");
  const dealerName = escapeHtml(opts.dealerName);
  const contactName = escapeHtml(opts.contactName);
  const sheetTitle = escapeHtml(opts.sheetTitle);
  const totalWeightText = escapeHtml(opts.totalWeightText);

  const body = `
            <p style="margin:0 0 16px;color:#1e293b;font-size:14px;">Hi ${dealerName},</p>
            <p style="margin:0 0 16px;color:#1e293b;font-size:14px;">
              <strong>${contactName}</strong> replied to <strong>${sheetTitle}</strong>
              with material to sell: ${totalWeightText}.
            </p>
            ${
              opts.hasCounters
                ? `<p style="margin:0 0 16px;color:#b45309;font-size:14px;">They're asking above your sheet price on at least one grade.</p>`
                : `<p style="margin:0 0 16px;color:#15803d;font-size:14px;">They accepted your sheet prices as quoted.</p>`
            }
            <table cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:${brand};">
              <a href="${opts.responseUrl}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">
                Review Their Offer
              </a>
            </td></tr></table>`;

  const html = shell(headerHtml(null, "ScrapTrader", brand), body);

  const text = [
    `Hi ${opts.dealerName},`,
    ``,
    `${opts.contactName} replied to "${opts.sheetTitle}" with material to sell: ${opts.totalWeightText}.`,
    opts.hasCounters
      ? `They're asking above your sheet price on at least one grade.`
      : `They accepted your sheet prices as quoted.`,
    ``,
    `Review their offer: ${opts.responseUrl}`,
  ].join("\n");

  await getTransporter().sendMail({
    from: { name: "ScrapTrader", address: fromAddress() },
    to: opts.to,
    subject: `${opts.contactName} replied to ${opts.sheetTitle}`,
    text,
    html,
  });
}

export interface PriceSheetOutcomeEmailOptions {
  to: string; // the SUPPLIER's email
  contactName: string;
  sellerName: string;
  companyName: string;
  replyTo: string;
  sheetTitle: string;
  outcome: "countered" | "accepted" | "declined";
  dealerNote: string | null;
  // Pre-formatted so the email can't disagree with the pages.
  lines: { name: string; detail: string }[];
  totalText: string | null;
  sheetLink: string;
  brandColor: string; // hex — dealer theme or default
  logoUrl: string | null; // absolute URL or null
}

// Tells the SUPPLIER the yard moved. Without this the negotiation is
// one-way: they'd only discover a counter by revisiting their link on a
// hunch, so counters go unanswered and offers die silently. Dealer
// identity on the From, dealer BRANDING in the body — this is the yard
// talking to their supplier, so it must look like the price sheet that
// started the conversation, not like the platform.
export async function sendPriceSheetOutcomeEmail(
  opts: PriceSheetOutcomeEmailOptions
): Promise<void> {
  const brand = sanitizeBrand(opts.brandColor);
  const contactName = escapeHtml(opts.contactName);
  const sellerName = escapeHtml(opts.sellerName);
  const companyName = escapeHtml(opts.companyName);
  const sheetTitle = escapeHtml(opts.sheetTitle);
  const dealerNote = opts.dealerNote ? escapeHtml(opts.dealerNote) : null;

  const headline =
    opts.outcome === "accepted"
      ? `${companyName} accepted your offer`
      : opts.outcome === "declined"
        ? `${companyName} passed on your offer`
        : `${companyName} countered your offer`;

  const cta =
    opts.outcome === "countered" ? "Review &amp; Respond" : "View Details";

  const rows = opts.lines
    .map(
      (l, idx) =>
        `<tr style="background:${idx % 2 ? "#f8fafc" : "#ffffff"};">
          <td style="padding:6px 12px;color:#1e293b;font-size:13px;">${escapeHtml(l.name)}</td>
          <td style="padding:6px 12px;color:#1e293b;font-size:13px;font-weight:600;text-align:right;white-space:nowrap;">${escapeHtml(l.detail)}</td>
        </tr>`
    )
    .join("");

  const body = `
            <p style="margin:0 0 16px;color:#1e293b;font-size:14px;">Hi ${contactName},</p>
            <h2 style="margin:0 0 4px;color:#1e293b;font-size:18px;">${headline}</h2>
            <p style="margin:0 0 16px;color:#64748b;font-size:12px;">${sheetTitle}</p>
            ${dealerNote ? `<p style="margin:0 0 16px;padding:10px 12px;background:#f8fafc;border-radius:8px;color:#1e293b;font-size:14px;">“${dealerNote}”</p>` : ""}
            <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:16px;">
              ${rows}
            </table>
            ${
              opts.totalText
                ? `<p style="margin:0 0 20px;color:#1e293b;font-size:15px;font-weight:bold;">Total: ${escapeHtml(opts.totalText)}</p>`
                : ""
            }
            <table cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:${brand};">
              <a href="${opts.sheetLink}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">
                ${cta}
              </a>
            </td></tr></table>
            ${
              opts.outcome === "countered"
                ? `<p style="margin:16px 0 0;color:#64748b;font-size:12px;">Adjust your numbers and send again, or leave them as they are to take the counter.</p>`
                : ""
            }`;

  const html = shell(headerHtml(opts.logoUrl, companyName, brand), body);

  const text = [
    `Hi ${opts.contactName},`,
    ``,
    opts.outcome === "accepted"
      ? `${opts.companyName} accepted your offer.`
      : opts.outcome === "declined"
        ? `${opts.companyName} passed on your offer.`
        : `${opts.companyName} countered your offer.`,
    opts.sheetTitle,
    ...(opts.dealerNote ? [``, `"${opts.dealerNote}"`] : []),
    ``,
    ...opts.lines.map((l) => `  ${l.name}: ${l.detail}`),
    ...(opts.totalText ? [``, `Total: ${opts.totalText}`] : []),
    ``,
    opts.outcome === "countered"
      ? `Review and respond: ${opts.sheetLink}`
      : `View details: ${opts.sheetLink}`,
  ].join("\n");

  await getTransporter().sendMail({
    from: {
      name: `${opts.sellerName} (${opts.companyName})`,
      address: fromAddress(),
    },
    replyTo: opts.replyTo,
    to: opts.to,
    subject: `${opts.companyName}: ${
      opts.outcome === "accepted"
        ? "offer accepted"
        : opts.outcome === "declined"
          ? "offer declined"
          : "counter-offer"
    } — ${opts.sheetTitle}`,
    text,
    html,
  });
}

export interface NudgeDigestItem {
  kind: "deal" | "price sheet";
  contactName: string;
  parentTitle: string;
  count: number;
  url: string;
}

export interface NudgeDigestOptions {
  to: string;
  dealerName: string;
  items: NudgeDigestItem[];
  inboxUrl: string;
}

// ONE digest per dealer per sweep, listing everything waiting on them.
//
// Replaces a per-conversation email. Ten unread threads used to mean ten
// near-identical emails, which is both a volume problem (a shared
// Workspace sending quota across all dealers) and an attention problem —
// the tenth "you have unread messages" is noise, and noise gets filtered.
// One email that says "3 things need you" is a to-do list.
export async function sendNudgeDigestEmail(
  opts: NudgeDigestOptions
): Promise<void> {
  const brand = sanitizeBrand("#2d5f8a");
  const dealerName = escapeHtml(opts.dealerName);
  const n = opts.items.length;
  const totalMessages = opts.items.reduce((s, i) => s + i.count, 0);

  const rows = opts.items
    .map(
      (i, idx) => `
        <tr style="background:${idx % 2 ? "#f8fafc" : "#ffffff"};">
          <td style="padding:10px 12px;">
            <a href="${i.url}" style="color:${brand};font-size:14px;font-weight:bold;text-decoration:none;">${escapeHtml(i.contactName)}</a>
            <div style="color:#64748b;font-size:12px;margin-top:2px;">
              ${escapeHtml(i.parentTitle)} · ${escapeHtml(i.kind)}
            </div>
          </td>
          <td style="padding:10px 12px;color:#1e293b;font-size:13px;font-weight:bold;text-align:right;white-space:nowrap;">
            ${i.count} new
          </td>
        </tr>`
    )
    .join("");

  const body = `
            <p style="margin:0 0 16px;color:#1e293b;font-size:14px;">Hi ${dealerName},</p>
            <p style="margin:0 0 20px;color:#1e293b;font-size:14px;">
              <strong>${n} conversation${n === 1 ? "" : "s"}</strong> ${n === 1 ? "is" : "are"} waiting on you.
            </p>
            <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
              ${rows}
            </table>
            <table cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:${brand};">
              <a href="${opts.inboxUrl}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">
                Open Your Inbox
              </a>
            </td></tr></table>
            <p style="margin:20px 0 0;color:#94a3b8;font-size:12px;">
              You'll only get one of these at a time, and not again for a few
              hours — open a conversation to clear it.
            </p>`;

  const html = shell(headerHtml(null, "ScrapTrader", brand), body);

  const text = [
    `Hi ${opts.dealerName},`,
    ``,
    `${n} conversation${n === 1 ? "" : "s"} ${n === 1 ? "is" : "are"} waiting on you:`,
    ``,
    ...opts.items.map(
      (i) =>
        `  ${i.contactName} — ${i.parentTitle} (${i.kind}) — ${i.count} new\n    ${i.url}`
    ),
    ``,
    `Inbox: ${opts.inboxUrl}`,
  ].join("\n");

  await getTransporter().sendMail({
    from: { name: "ScrapTrader", address: fromAddress() },
    to: opts.to,
    subject:
      n === 1
        ? `${opts.items[0].contactName} is waiting on you`
        : `${n} conversations need you (${totalMessages} new messages)`,
    text,
    html,
  });
}
