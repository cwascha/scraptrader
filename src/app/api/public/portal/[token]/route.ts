import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// PUBLIC buyer portal: a contact-level token opens a hub listing every
// deal the dealer has sent this buyer, each linking to its existing
// per-deal page. Authorization is token possession + rate limit. Wider
// blast radius than a deal link — and since deal pages now link BACK
// here, any deal link reaches this in one click. Rotate/revoke on the
// Contacts page is the control.
//
// Whitelisted projection rules carried over from the deal endpoint:
// no contact name (dealer-only data), no addresses, no accepted price
// (that's disclosed only inside the winning conversation) — just deal
// facts, a thumbnail, bidding state, and the per-deal link token.
//
// `outcome` (open | won | lost) is NOT a new disclosure: on close,
// finalizeAcceptedBid() already writes "Bid accepted — $X" into the
// winner's thread and "Bidding on this deal is closed" into every other
// one, so any buyer can already tell which side they landed on from
// their own conversation. The price and the winner's identity stay out.

// A buyer's standing on a deal. won/lost only mean anything once closed.
type Outcome = "open" | "won" | "lost";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const limited = rateLimit(`portal-view:${clientIp(req)}`, 20, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      {
        error: `Too many requests — try again in ${limited.retryAfterSeconds}s`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSeconds) },
      }
    );
  }

  const { token } = await params;

  const contact = await prisma.contact.findUnique({
    where: { portalToken: token },
    include: {
      user: {
        select: {
          name: true,
          companyName: true,
          logoUrl: true,
          themeBrand: true,
          themeBrandDark: true,
          themeAccent: true,
          themeMode: true,
        },
      },
      dealRecipients: {
        include: {
          deal: {
            include: {
              images: { orderBy: { sortOrder: "asc" }, take: 1 },
            },
          },
          _count: { select: { messages: true } },
        },
      },
    },
  });

  if (!contact) {
    return NextResponse.json({ error: "Portal not found" }, { status: 404 });
  }

  // Group by DEAL. A deal published to the same buyer on multiple
  // channels has several recipients (= several chat threads).
  type Rec = (typeof contact.dealRecipients)[number];
  const byDeal = new Map<string, Rec[]>();
  for (const r of contact.dealRecipients) {
    const list = byDeal.get(r.dealId);
    if (list) list.push(r);
    else byDeal.set(r.dealId, [r]);
  }

  // Most messages wins; tie broken by oldest recipient. Lands the buyer
  // in the conversation that's actually in use.
  const mostActive = (recs: Rec[]) =>
    recs.reduce((best, r) =>
      r._count.messages > best._count.messages ||
      (r._count.messages === best._count.messages &&
        new Date(r.createdAt) < new Date(best.createdAt))
        ? r
        : best
    );

  const entries = Array.from(byDeal.values()).map((recs) => {
    const deal = recs[0].deal;
    const closed = deal.status === "closed";

    // Did THIS buyer win? The accepted bid can sit in any of their
    // threads, not necessarily the busiest one.
    const winning = deal.acceptedRecipientId
      ? (recs.find((r) => r.id === deal.acceptedRecipientId) ?? null)
      : null;

    // Link to the winning thread when they won — that's where the
    // acceptance and the agreed price live. Otherwise, the busiest.
    const link = winning ?? mostActive(recs);

    const outcome: Outcome = !closed ? "open" : winning ? "won" : "lost";

    return {
      // Sort key only — stripped from the response below. Closed deals
      // order by when they concluded, open ones by when they arrived.
      _sortAt: new Date(
        closed ? (deal.acceptedAt ?? deal.createdAt) : deal.createdAt
      ).getTime(),
      title: deal.title,
      numLoads: deal.numLoads,
      weightPerLoad: deal.weightPerLoad,
      weightUnit: deal.weightUnit,
      createdAt: deal.createdAt,
      biddingClosed: closed,
      outcome,
      image: deal.images[0]?.url ?? null,
      messages: link._count.messages,
      dealToken: link.accessToken,
    };
  });

  // Open first (newest first), then won, then lost — newest first within
  // each group. Live deals are the ones a buyer needs to act on.
  const GROUP_ORDER: Record<Outcome, number> = { open: 0, won: 1, lost: 2 };
  entries.sort(
    (a, b) =>
      GROUP_ORDER[a.outcome] - GROUP_ORDER[b.outcome] ||
      b._sortAt - a._sortAt
  );

  const deals = entries.map(({ _sortAt, ...deal }) => {
    void _sortAt;
    return deal;
  });

  return NextResponse.json({
    company: contact.user.companyName,
    seller: contact.user.name,
    branding: {
      logoUrl: contact.user.logoUrl,
      brand: contact.user.themeBrand,
      brandDark: contact.user.themeBrandDark,
      accent: contact.user.themeAccent,
      mode: contact.user.themeMode,
    },
    deals,
  });
}
