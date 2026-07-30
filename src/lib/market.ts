// Live COMEX copper reference for price sheets.
//
// Optional, like SMTP and Twilio: without COMMODITY_API_KEY the feature
// simply isn't offered, and the dealer types the basis by hand as before.
//
// ⚠ LICENSING, read before widening this. CME requires an Information
// License Agreement for real-time, delayed AND end-of-day data, and using
// their data to power an application is separately licensed as
// "non-display" use. We deliberately do NOT present the fetched number as
// an official quote: it PREFILLS a free-text field the dealer edits and
// publishes as their own stated reference — which is exactly what they
// were already doing by hand. Keep it that way. If this ever becomes an
// automatic, unreviewed figure stamped on outgoing sheets, get the
// licensing reviewed first.
//
// Provider: API Ninjas commodity price endpoint (free tier is ~15-minute
// delayed, which is plenty — a daily buying sheet is not a trading
// screen). Swapping providers means changing fetchFromProvider() only.

const ENDPOINT = "https://api.api-ninjas.com/v1/commodityprice?name=copper";
const CACHE_TTL_MS = 5 * 60_000;
const TIMEOUT_MS = 8_000;

// Plausible band for COMEX copper in USD/lb. Anything outside is treated
// as a bad read and rejected — a wrong basis printed on a price sheet is
// worse than no basis at all.
const MIN_USD_PER_LB = 0.5;
const MAX_USD_PER_LB = 20;

export interface CopperQuote {
  usdPerLb: number;
  fetchedAt: number;
  source: string;
}

// Single-process cache, same constraint as rate-limit.ts. Stops a dealer
// clicking the button repeatedly from burning API quota.
const globalForMarket = globalThis as unknown as {
  copperQuote?: CopperQuote;
};

export function isMarketDataConfigured(): boolean {
  return Boolean(process.env.COMMODITY_API_KEY?.trim());
}

// Providers disagree on convention: COMEX quotes copper in CENTS per
// pound (449.00), while most APIs normalize to dollars (4.49). Accept
// either, but only when the result lands in a plausible band.
function normalizeToUsdPerLb(raw: number): number | null {
  if (!Number.isFinite(raw) || raw <= 0) return null;
  if (raw >= MIN_USD_PER_LB && raw <= MAX_USD_PER_LB) return raw;
  const asDollars = raw / 100;
  if (asDollars >= MIN_USD_PER_LB && asDollars <= MAX_USD_PER_LB) {
    return asDollars;
  }
  return null;
}

async function fetchFromProvider(): Promise<CopperQuote | null> {
  const key = process.env.COMMODITY_API_KEY?.trim();
  if (!key) return null;

  const res = await fetch(ENDPOINT, {
    headers: { "X-Api-Key": key },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Market data provider returned ${res.status}`);

  const json = (await res.json()) as { price?: unknown; exchange?: unknown };
  const usdPerLb =
    typeof json.price === "number" ? normalizeToUsdPerLb(json.price) : null;
  if (usdPerLb === null) {
    throw new Error("Market data provider returned an implausible price");
  }

  return {
    usdPerLb,
    fetchedAt: Date.now(),
    source: typeof json.exchange === "string" ? json.exchange : "COMEX",
  };
}

export async function getCopperQuote(): Promise<CopperQuote | null> {
  if (!isMarketDataConfigured()) return null;

  const cached = globalForMarket.copperQuote;
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached;

  const fresh = await fetchFromProvider();
  if (fresh) globalForMarket.copperQuote = fresh;
  return fresh;
}
