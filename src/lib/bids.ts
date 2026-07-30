// Bid handling: USD price-per-weight-unit offers exchanged in deal chats.
// Pure module — shared by server routes (validation) and client pages
// (display conversion), so both parties always compute identical numbers.
//
// Bids are STORED AS ENTERED (amount + unit); conversion happens only at
// display time. Never persist a converted value.

import { WEIGHT_UNITS } from "./deal-fields";

// Hard cap on a single chat message. Long enough for any real logistics
// note, short enough that the PUBLIC (token-only) buyer endpoint can't be
// used to fill the DB or inflate the payload every viewer re-polls. Both
// the owner and buyer message routes validate through parseIncomingMessage,
// so this bound covers both.
export const MAX_MESSAGE_LENGTH = 4000;

// Exact-ish conversion anchors (1 lb = 0.45359237 kg exactly).
export const LBS_PER_UNIT: Record<string, number> = {
  lbs: 1,
  tons: 2000, // US short ton
  "metric tons": 2204.6226218,
  kg: 2.2046226218,
};

// $X per `from` unit -> $ per `to` unit. Returns null for unknown units.
export function convertPricePerUnit(
  amount: number,
  from: string,
  to: string
): number | null {
  const f = LBS_PER_UNIT[from];
  const t = LBS_PER_UNIT[to];
  if (!f || !t || !Number.isFinite(amount)) return null;
  return (amount / f) * t;
}

const UNIT_SHORT: Record<string, string> = {
  lbs: "lb",
  tons: "ton",
  "metric tons": "mt",
  kg: "kg",
};

// Small per-lb/per-kg prices need more precision than cents; larger
// per-ton figures read best with standard money formatting.
export function formatMoney(n: number): string {
  if (n < 0.995) return n.toFixed(4);
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// "$2.50/kg", "$1,150.00/ton"
export function formatBid(amount: number, unit: string): string {
  return `$${formatMoney(amount)}/${UNIT_SHORT[unit] ?? unit}`;
}

// "$2.5000/kg (≈ $1.1340/lb)" — or just the base when units match.
export function priceWithEquivalent(
  amount: number,
  unit: string,
  dealUnit: string
): string {
  const base = formatBid(amount, unit);
  if (unit === dealUnit) return base;
  const conv = convertPricePerUnit(amount, unit, dealUnit);
  return conv === null ? base : `${base} (≈ ${formatBid(conv, dealUnit)})`;
}

// Confirmation text for sending a bid: always shows the deal-unit
// equivalent (catches wrong-unit fat-fingers), and adds an out-of-band
// warning when the bid is >= 2x or <= 0.5x the previous bid in the same
// conversation (compared in the deal's unit) — the classic typo is a
// missing or extra digit.
export function buildBidConfirmText(
  amount: number,
  unit: string,
  dealUnit: string,
  prev: { amount: number; unit: string } | null
): string {
  let text = `Send bid: ${priceWithEquivalent(amount, unit, dealUnit)}?`;

  if (prev) {
    const a = convertPricePerUnit(amount, unit, dealUnit);
    const p = convertPricePerUnit(prev.amount, prev.unit, dealUnit);
    if (a !== null && p !== null && p > 0) {
      const ratio = a / p;
      if (ratio >= 2) {
        text += `\n\n⚠ This is ${ratio.toFixed(1)}× the previous bid in this conversation (${formatBid(prev.amount, prev.unit)}). Double-check the amount and unit.`;
      } else if (ratio <= 0.5) {
        text += `\n\n⚠ This is well below the previous bid in this conversation (${formatBid(prev.amount, prev.unit)}) — about ${(ratio * 100).toFixed(0)}% of it. Double-check the amount and unit.`;
      }
    }
  }

  return text;
}

// Server-side validation/normalization for incoming chat messages (owner
// and buyer routes share this). Bids are rounded to 4 decimals — per-lb
// scrap prices can legitimately be sub-cent.
export type ParsedIncoming =
  | {
      ok: true;
      type: "message" | "bid";
      content: string;
      bidAmount: number | null;
      bidUnit: string | null;
    }
  | { ok: false; error: string };

export function parseIncomingMessage(body: {
  type?: unknown;
  content?: unknown;
  bidAmount?: unknown;
  bidUnit?: unknown;
}): ParsedIncoming {
  const type = body.type === "bid" ? "bid" : "message";

  if (type === "bid") {
    const amount = Number.parseFloat(String(body.bidAmount));
    const unit = typeof body.bidUnit === "string" ? body.bidUnit : "";
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
      return { ok: false, error: "Bid amount must be a positive number" };
    }
    if (!WEIGHT_UNITS.includes(unit)) {
      return {
        ok: false,
        error: `Bid unit must be one of: ${WEIGHT_UNITS.join(", ")}`,
      };
    }
    const rounded = Math.round(amount * 10000) / 10000;
    return {
      ok: true,
      type,
      // Formatted fallback so any renderer unaware of bids still shows
      // something meaningful.
      content: `Bid: ${formatBid(rounded, unit)}`,
      bidAmount: rounded,
      bidUnit: unit,
    };
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return { ok: false, error: "Message content is required" };
  }
  // Length bound — protects the public buyer endpoint from oversized
  // payloads (DB fill + re-served on every poll). Checked AFTER trim so
  // trailing whitespace can't pad past the limit.
  if (content.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters)`,
    };
  }
  return { ok: true, type, content, bidAmount: null, bidUnit: null };
}
