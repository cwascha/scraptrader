// Starter template for a yard's first price sheet, transcribed from Ruby
// Recycling's 9/2/25 delivered-prices sheet. Every field is editable —
// this exists so the first sheet isn't 48 rows of typing. After that, the
// normal path is duplicating the previous sheet and updating the numbers.
//
// ⚠ THESE PRICES ARE A LAYOUT, NOT A QUOTE. They come from a 2025-09-02
// sheet written against a COMEX basis of $4.49, and copper has moved a
// long way since. The staleness check below (`checkBasis`) compares a
// sheet's implied basis against the one the DEALER ENTERED — it exists
// specifically so nobody publishes this template unedited.

// Note the two shapes a line can take: a numeric `price`, or a `priceNote`
// for grades that can't be quoted sight-unseen ("Dirty Brass — Need Pics").
// Recovery percentages stay inside the name because that's how yards write
// the grade.

export interface StarterItem {
  category: string;
  name: string;
  price?: number;
  priceNote?: string;
}

export const STARTER_ITEMS: StarterItem[] = [
  { category: "Bare Copper", name: "BB", price: 4.09 },
  { category: "Bare Copper", name: "#1", price: 3.99 },
  { category: "Bare Copper", name: "#2", price: 3.84 },
  { category: "Bare Copper", name: "#3", price: 3.74 },

  { category: "Copper Wire", name: "#1 Heavy (87% basis)", price: 3.21 },
  { category: "Copper Wire", name: "Machine Wire", price: 2.97 },
  { category: "Copper Wire", name: "Romex", price: 2.4 },
  { category: "Copper Wire", name: "Cat 5 Wire", price: 1.65 },
  { category: "Copper Wire", name: "#2 Lite (42%)", price: 1.36 },
  { category: "Copper Wire", name: "PC Wire (32-35%)", price: 0.88 },
  { category: "Copper Wire", name: "Harness (clean)", price: 1.77 },
  { category: "Copper Wire", name: "Harness (w/attachments)", price: 1.65 },
  { category: "Copper Wire", name: "Christmas Lights", price: 0.55 },

  { category: "Misc Cu/Brass", name: "Clean ACR", price: 2.1 },
  { category: "Misc Cu/Brass", name: "Dirty ACR", price: 1.96 },
  { category: "Misc Cu/Brass", name: "ACR Ends", price: 1.18 },
  { category: "Misc Cu/Brass", name: "Clean Auto Rads", price: 2.55 },
  { category: "Misc Cu/Brass", name: "Dirty Auto Rads", price: 1.61 },
  { category: "Misc Cu/Brass", name: "Irony Truck Rads", price: 0.61 },
  { category: "Misc Cu/Brass", name: "Clean Yellow Brass", price: 2.67 },
  { category: "Misc Cu/Brass", name: "Scrap Yard Yellow Brass", price: 2.19 },
  { category: "Misc Cu/Brass", name: "Faucet Brass", price: 1.35 },
  { category: "Misc Cu/Brass", name: "Dirty Brass", priceNote: "Need Pics" },

  { category: "Aluminum", name: "Sheet Alum (5%)", price: 0.76 },
  { category: "Aluminum", name: "Dirty Ext (5%)", price: 0.85 },
  { category: "Aluminum", name: "MLC (no 2/7 or auto clip)", price: 0.87 },
  { category: "Aluminum", name: "Siding", price: 0.85 },
  { category: "Aluminum", name: "Clean Alum Rads", price: 0.69 },
  {
    category: "Aluminum",
    name: "Fe Alum Rads (no hoses/fan motors)",
    price: 0.49,
  },
  { category: "Aluminum", name: "Cast Alum (8%)", price: 0.65 },
  { category: "Aluminum", name: "Dirty Alum Rims", price: 1.03 },
  { category: "Aluminum", name: "Chrome Rims", price: 0.73 },
  { category: "Aluminum", name: "Irony Alum (50%)", price: 0.19 },
  { category: "Aluminum", name: "Alum Wire/ACSR (68%)", price: 0.55 },

  { category: "Small Parts", name: "Mixed Electric Motors", price: 0.41 },
  { category: "Small Parts", name: "Alternators", price: 0.75 },
  { category: "Small Parts", name: "Al Nose Starters", price: 0.63 },
  { category: "Small Parts", name: "Fe Nose Starters", price: 0.54 },
  { category: "Small Parts", name: "AC Compressors", price: 0.44 },
  { category: "Small Parts", name: "Sealed Units", price: 0.34 },
  { category: "Small Parts", name: "Cu Ballasts", price: 0.31 },
  { category: "Small Parts", name: "Electronic Ballasts", price: 0.18 },

  { category: "Lead", name: "Soft Lead", price: 0.68 },
  { category: "Lead", name: "Wheel Weights", price: 0.16 },
  { category: "Lead", name: "Auto Batteries", price: 0.26 },
  { category: "Lead", name: "Steel Case Batteries", price: 0.23 },

  { category: "Stainless", name: "Clean Prepared 304", price: 0.43 },
  { category: "Stainless", name: "Fe 304", price: 0.19 },
];

// Units a line can be quoted in. Yards quote almost everything per pound;
// the others exist for the occasional ton- or each-priced line.
export const PRICE_UNITS = ["lb", "ton", "each"] as const;

// Display helper shared by the dashboard, the public page, and email.
//
// THREE decimals: scrap grades are quoted in mils ("$0.885/lb"), and a
// fixed width keeps the column aligned under `.data`'s tabular figures —
// $4.090 and $0.885 line up, $4.09 and $0.885 don't.
export const PRICE_DECIMALS = 3;

export function formatPrice(
  price: number | null,
  priceNote: string | null,
  unit: string
): string {
  if (price !== null && Number.isFinite(price)) {
    return `$${price.toFixed(PRICE_DECIMALS)}/${unit}`;
  }
  return priceNote?.trim() || "—";
}

// --- Weight normalization -------------------------------------------
// A supplier may enter tons against a line the yard quoted in $/lb. Left
// unconverted, the dealer sees "40 tons" beside "$3.99" and has to do a
// 2,000× in their head on a screen where being wrong is a five-figure
// error. Everything below converts to the LINE'S OWN basis before any
// number is shown or summed.

// Anchors match lib/bids.ts LBS_PER_UNIT exactly (1 lb = 0.45359237 kg).
// They're separate tables because the two subsystems accept different unit
// keys — bids allow "metric tons", supplier offers don't — but the shared
// values MUST agree, or the same tonnage converts differently on a deal
// than on a price sheet.
const LBS_PER: Record<string, number> = {
  lbs: 1,
  lb: 1,
  tons: 2000,
  ton: 2000,
  kg: 2.2046226218,
};

export const OFFER_WEIGHT_UNITS = ["lbs", "tons", "kg"] as const;

export function toLbs(weight: number, weightUnit: string): number | null {
  const factor = LBS_PER[weightUnit];
  return factor === undefined ? null : weight * factor;
}

// Weight expressed in the unit the price is quoted in. Returns null for
// "each" — a count basis can't be derived from a weight, so callers must
// show those lines without a computed value rather than guessing.
export function weightInPriceUnit(
  weight: number,
  weightUnit: string,
  priceUnit: string
): number | null {
  const lbs = toLbs(weight, weightUnit);
  if (lbs === null) return null;
  if (priceUnit === "lb") return lbs;
  if (priceUnit === "ton") return lbs / 2000;
  return null; // "each" or anything unrecognized
}

// What a line is worth: weight converted to the price's basis × price.
// Null when the bases can't be reconciled, which callers must surface
// rather than silently drop from a total.
export function lineValue(
  weight: number,
  weightUnit: string,
  price: number | null,
  priceUnit: string
): number | null {
  if (price === null || !Number.isFinite(price)) return null;
  const qty = weightInPriceUnit(weight, weightUnit, priceUnit);
  return qty === null ? null : qty * price;
}

// Dollar TOTALS stay at two decimals — they're money, not a per-pound
// quote, and mils on a five-figure sum are noise.
export function formatUsd(n: number): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatWeightWithUnit(weight: number, unit: string): string {
  return `${weight.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${unit}`;
}

// The price that currently governs a line: the yard's counter beats the
// supplier's ask, which beats the sheet's quoted price.
export function governingPrice(
  sheetPrice: number | null,
  buyerPrice: number | null,
  dealerPrice: number | null
): number | null {
  if (dealerPrice !== null && Number.isFinite(dealerPrice)) return dealerPrice;
  if (buyerPrice !== null && Number.isFinite(buyerPrice)) return buyerPrice;
  return sheetPrice;
}

// --- Staleness check --------------------------------------------------
// A sheet's prices are anchored to whatever COMEX was when they were
// written. Duplicate last month's sheet, or publish the starter template
// unedited, and you're quoting against a basis that has moved.
//
// Rather than tracking provenance, infer the basis from the sheet itself:
// on a scrap buying sheet the highest per-pound line is essentially
// always bare bright copper, which trades at roughly 88-93% of COMEX.
// Divide by that and you recover the basis the sheet was built on. Crude,
// but it catches the case that matters (a sheet written at a very
// different copper price) without any bookkeeping.
//
// This is compared against the basis the DEALER STATED (`comexBasis`),
// not a fetched number — so it works with no market-data feed, and it
// also catches the reverse error: updating the basis line but forgetting
// to reprice the grades under it.
// Internal to the staleness check — not part of this module's API.
const BARE_COPPER_SHARE_OF_COMEX = 0.9;

// Plausible band for a COMEX copper basis in USD/lb. Anything outside is
// a typo, not a quote.
export const MIN_COMEX_BASIS = 0.5;
export const MAX_COMEX_BASIS = 20;

// Where a dealer can look the number up. Linked from the editor so the
// lookup isn't a memory test. We LINK, never scrape — the site is not a
// licensed redistributor and its layout is not a contract.
export const COMEX_LOOKUP_URL = "https://comexlive.org/copper/";

// Pull a dollar figure out of a free-text note ("Comex $4.49", "comex
// 4.49", "Basis: $4.4900"). Covers sheets written BEFORE the dedicated
// `comexBasis` field existed, and anyone who types the basis into the
// note out of habit.
export function parseComexFromNote(note: string | null): number | null {
  if (!note) return null;
  const m = note.match(/\$?\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number.parseFloat(m[1]);
  return Number.isFinite(n) && n >= MIN_COMEX_BASIS && n <= MAX_COMEX_BASIS
    ? n
    : null;
}

// The basis actually in force: the dedicated field wins, falling back to
// whatever was written in the note.
export function effectiveComexBasis(
  comexBasis: number | null,
  headerNote: string | null
): number | null {
  if (
    comexBasis !== null &&
    Number.isFinite(comexBasis) &&
    comexBasis >= MIN_COMEX_BASIS &&
    comexBasis <= MAX_COMEX_BASIS
  ) {
    return comexBasis;
  }
  return parseComexFromNote(headerNote);
}

// Divergence past this triggers a warning. Wide enough not to nag over
// normal spread variation between yards.
const BASIS_WARN_THRESHOLD = 0.15;

function impliedComexBasis(
  items: { price: number | null; unit: string }[]
): number | null {
  const perLb = items
    .filter((i) => i.unit === "lb" && i.price !== null && i.price > 0)
    .map((i) => i.price as number);
  if (perLb.length === 0) return null;
  return Math.max(...perLb) / BARE_COPPER_SHARE_OF_COMEX;
}

export interface BasisCheck {
  implied: number;
  live: number;
  // Signed: negative = sheet is priced below the current market.
  drift: number;
  stale: boolean;
}

export function checkBasis(
  items: { price: number | null; unit: string }[],
  statedComexUsdPerLb: number
): BasisCheck | null {
  const implied = impliedComexBasis(items);
  if (implied === null || statedComexUsdPerLb <= 0) return null;
  const drift = (implied - statedComexUsdPerLb) / statedComexUsdPerLb;
  return {
    implied,
    live: statedComexUsdPerLb,
    drift,
    stale: Math.abs(drift) > BASIS_WARN_THRESHOLD,
  };
}

// "Comex $6.490" — the basis as shown on the sheet, in email, and on the
// supplier's page. One renderer so they can't disagree.
//
// Note the exchange itself quotes copper to FOUR decimals (6.3480). Three
// is used here for consistency with the grade column; bump PRICE_DECIMALS
// if the extra digit ever matters.
export function formatComexBasis(basis: number): string {
  return `Comex $${basis.toFixed(PRICE_DECIMALS)}`;
}

// Per-unit price on its own (no unit suffix, no label) — for inline use
// in summaries, counters, and email line detail.
export function formatUnitPrice(price: number): string {
  return `$${price.toFixed(PRICE_DECIMALS)}`;
}

// Round a per-unit price to the precision we DISPLAY at, before storing.
//
// Without this, a supplier who types 5.9875 gets "$5.988" on screen while
// the total is computed from 5.9875 — so the document can't be checked by
// hand, and 24,000 lbs × the printed price won't equal the printed total.
// On a paper that both sides negotiate against, arithmetic that doesn't
// reconcile costs more trust than the lost hundredth of a cent is worth.
// `step="0.001"` on the inputs is advisory only — this is the guarantee.
export function roundPrice(n: number): number {
  const f = 10 ** PRICE_DECIMALS;
  return Math.round(n * f) / f;
}
