// Shared deal field definitions and helpers.
// Pure data/functions only — safe to import from both server routes and
// client components. The server is authoritative: routes validate against
// these lists, and buildDealTitle runs server-side at create/update.
//
// Material options live in src/lib/materials.ts (generated from the official
// ISRI nonferrous categories spreadsheet).

export const PACKAGING_OPTIONS = ["Bales", "Boxes", "Loose", "Palletized"];

export const SHIPPING_TYPES = ["Domestic", "Export"];

export const WEIGHT_UNITS = ["lbs", "tons", "metric tons", "kg"];

export const PRICE_UNITS = [
  "per lb",
  "per ton",
  "per metric ton",
  "per kg",
  "total",
];

// Adjective forms used in auto-generated titles ("Bales" -> "Baled Copper").
const PACKAGING_ADJECTIVES: Record<string, string> = {
  Bales: "Baled",
  Boxes: "Boxed",
  Loose: "Loose",
  Palletized: "Palletized",
};

export function formatWeight(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// Title format (chosen 2026-07-15): "Copper • 4 loads × 42,000 lbs • Baled"
// Multiple packaging types join with "/": "Baled/Palletized".
// Material is stored as an ISRI code ("Barley") or main category name —
// codes are the trade's shorthand, so titles stay compact.
export function buildDealTitle(deal: {
  material: string;
  numLoads: number;
  weightPerLoad: number;
  weightUnit: string;
  packaging: string[];
}): string {
  const loads = `${deal.numLoads} load${deal.numLoads === 1 ? "" : "s"}`;
  const weight = `${formatWeight(deal.weightPerLoad)} ${deal.weightUnit}`;
  const packaging = deal.packaging
    .map((p) => PACKAGING_ADJECTIVES[p] || p)
    .join("/");
  return `${deal.material} • ${loads} × ${weight}${
    packaging ? ` • ${packaging}` : ""
  }`;
}
