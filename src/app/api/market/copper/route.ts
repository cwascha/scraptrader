import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { isMarketDataConfigured, getCopperQuote } from "@/lib/market";

// Current COMEX copper reference, for prefilling a price sheet's basis
// note and for the staleness check in the editor.
//
// AUTHENTICATED on purpose: this spends a third-party API quota, so it is
// not a public endpoint. Rate limited per user on top of the 5-minute
// server-side cache.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isMarketDataConfigured()) {
    // Not an error — the feature is optional and the UI hides itself.
    return NextResponse.json({ configured: false, quote: null });
  }

  const limited = rateLimit(`copper:${user.id}`, 20, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: `Too many requests — try again in ${limited.retryAfterSeconds}s` },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSeconds) },
      }
    );
  }

  try {
    const quote = await getCopperQuote();
    return NextResponse.json({ configured: true, quote });
  } catch (err) {
    // Surface a usable message: the dealer can always type the basis by
    // hand, so a provider outage is an inconvenience, not a blocker.
    return NextResponse.json(
      {
        configured: true,
        quote: null,
        error:
          err instanceof Error
            ? err.message
            : "Couldn't reach the market data provider",
      },
      { status: 502 }
    );
  }
}
