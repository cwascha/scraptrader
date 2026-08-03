// Shared deal field definitions and helpers.
// Pure data/functions only — safe to import from both server routes and
// client components. The server is authoritative: routes validate against
// these lists, and buildDealTitle runs server-side at create/update.
//
// Material grades live in src/lib/materials.ts (per-user rows seeded from
// the yard's own vocabulary — the ISRI spec list was removed 2026-07-30).

export const PACKAGING_OPTIONS = ["Bales", "Boxes", "Loose", "Palletized"];

export const SHIPPING_TYPES = ["Domestic", "Export"];

export const WEIGHT_UNITS = ["lbs", "tons", "metric tons", "kg"];

// ⚠ VESTIGIAL — pairs with Deal.askingPrice/priceUnit, which are unused
// (ARCHITECTURE gap #6). Note the NAME COLLISION: price-sheet-defaults.ts
// exports a DIFFERENT `PRICE_UNITS` (["lb","ton","each"]) that IS live.
// Delete this one with the vestigial-column migration.
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
// Material is the yard's own grade name ("Romex", "Clean Auto Rads") or a
// category name — already the trade's shorthand, so titles stay compact.
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
