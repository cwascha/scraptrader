// Twilio SMS + WhatsApp sending.
//
// Mirrors lib/mailer.ts deliberately: configuration is detected from the
// environment, and when it's absent the channel silently falls back to
// manual link sharing. There is no feature flag to flip — when Twilio
// approval lands, add the env vars and restart. SMS and WhatsApp are
// detected INDEPENDENTLY, because Twilio approves them separately and one
// often arrives before the other.
//
// No `twilio` SDK dependency on purpose: the Messages endpoint is a single
// form-encoded POST with basic auth, and this project blocks package
// install scripts by default (see allowScripts in package.json). Forty
// lines here beats a transitive dependency tree we can't exercise until
// approval arrives.
//
// ⚠ WHATSAPP 24-HOUR WINDOW: outside an open conversation (i.e. the buyer
// hasn't messaged you in the last 24h), Meta only permits pre-approved
// TEMPLATE messages. A free-form "here's a deal" to a cold contact will be
// REJECTED by Twilio with error 63016 even once your sender is approved.
// Templates are approved separately from the sender. Until a template is
// registered, treat WhatsApp as working only for buyers who messaged you
// recently — see ARCHITECTURE gap #30.

const API_BASE = "https://api.twilio.com/2010-04-01";
const TIMEOUT_MS = 15_000;

function creds(): { sid: string; token: string } | null {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  return sid && token ? { sid, token } : null;
}

function smsFrom(): string | null {
  return process.env.TWILIO_SMS_FROM?.trim() || null;
}

// Tolerate the number being stored with or without Twilio's "whatsapp:"
// prefix — we add it at send time either way.
function whatsAppFrom(): string | null {
  const raw = process.env.TWILIO_WHATSAPP_FROM?.trim();
  if (!raw) return null;
  return raw.replace(/^whatsapp:/i, "");
}

export function isSmsConfigured(): boolean {
  return Boolean(creds() && smsFrom());
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(creds() && whatsAppFrom());
}

// Twilio requires E.164 (+15551234567). Contacts store free-text numbers
// typed by the dealer, so normalize — and REJECT anything we can't convert
// with confidence. Guessing at an ambiguous international number means
// paying to deliver a deal to a stranger.
export function toE164(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\+[1-9]\d{7,14}$/.test(trimmed)) return trimmed;

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`; // US/CA local
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null; // international without "+", extensions, or junk
}

async function send(to: string, from: string, body: string): Promise<void> {
  const c = creds();
  if (!c) throw new Error("Twilio is not configured");

  const auth = Buffer.from(`${c.sid}:${c.token}`).toString("base64");

  const res = await fetch(`${API_BASE}/Accounts/${c.sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    // Twilio returns {code, message, more_info}. Surface its message so the
    // dealer sees "unverified number" or "not a valid WhatsApp sender"
    // instead of a bare 400 they can't act on.
    let detail = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { message?: string; code?: number };
      if (j?.message) {
        detail = j.code ? `${j.message} (Twilio ${j.code})` : j.message;
      }
    } catch {
      // Non-JSON error body — keep the status code.
    }
    throw new Error(detail);
  }
}

export interface DealTextOptions {
  to: string; // free-text number as stored on the contact
  sellerName: string;
  companyName: string;
  dealTitle: string;
  dealLink: string;
}

// Kept short on purpose: SMS bills per 160-character segment, and the link
// alone eats 40-70 of them (more on a dev tunnel URL). No branding block,
// no material/quantity detail — that's what the deal page is for.
function body(o: DealTextOptions): string {
  return `${o.sellerName} at ${o.companyName} sent you a deal: ${o.dealTitle}. View and bid: ${o.dealLink}`;
}

export async function sendDealSms(o: DealTextOptions): Promise<void> {
  const from = smsFrom();
  if (!from) throw new Error("SMS sending is not configured");
  const to = toE164(o.to);
  if (!to) throw new Error(`Not a usable phone number: ${o.to}`);
  await send(to, from, body(o));
}

export async function sendDealWhatsApp(o: DealTextOptions): Promise<void> {
  const from = whatsAppFrom();
  if (!from) throw new Error("WhatsApp sending is not configured");
  const to = toE164(o.to);
  if (!to) throw new Error(`Not a usable WhatsApp number: ${o.to}`);
  await send(`whatsapp:${to}`, `whatsapp:${from}`, body(o));
}
