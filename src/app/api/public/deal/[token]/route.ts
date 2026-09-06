import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // Brute-force defense-in-depth: tokens are unguessable UUIDs, but cap
  // lookup attempts per IP anyway. Legit buyers load this once per visit.
  const limited = rateLimit(`deal-view:${clientIp(req)}`, 20, 60_000);
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

  const recipient = await prisma.dealRecipient.findUnique({
    where: { accessToken: token },
    include: {
      deal: {
        include: {
          images: { orderBy: { sortOrder: "asc" } },
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
        },
      },
      messages: { orderBy: { createdAt: "asc" } },
      contact: { select: { portalToken: true } },
    },
  });

  if (!recipient) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  if (!recipient.viewedAt) {
    await prisma.dealRecipient.update({
      where: { id: recipient.id },
      data: { viewedAt: new Date(), status: "viewed" },
    });
  }

  const d = recipient.deal;

  // Whitelisted projection — never spread the deal object here, so new
  // internal columns don't leak to buyers by default. Full pickup/port
  // addresses stay hidden; buyers see CITY + STATE per shipping type only.
  //
  // PRIVACY: how the dealer stored the contact (the contact name) is the
  // DEALER's data and is never exposed to the buyer — buyer-sent messages
  // have their senderName rewritten to "You" at read time.
  return NextResponse.json({
    deal: {
      title: d.title,
      material: d.material,
      packaging: d.packaging.split(",").filter(Boolean),
      numLoads: d.numLoads,
      weightPerLoad: d.weightPerLoad,
      weightUnit: d.weightUnit,
      shippingTypes: d.shippingTypes.split(",").filter(Boolean),
      pickupCityState:
        d.pickupCity && d.pickupState
          ? `${d.pickupCity}, ${d.pickupState}`
          : null,
      portCityState:
        d.portCity && d.portState ? `${d.portCity}, ${d.portState}` : null,
      notes: d.notes,
      askingPrice: d.askingPrice,
      priceUnit: d.priceUnit,
      location: d.location,
      // Buyer-facing projection: only id + url. The raw DealImage rows carry
      // the dealer's original upload filename (can leak yard names/locations)
      // and internal ids, which must not cross to the buyer.
      images: d.images.map((img) => ({ id: img.id, url: img.url })),
      company: d.user.companyName,
      seller: d.user.name,
      createdAt: d.createdAt,
      biddingClosed: d.status === "closed",
    },
    branding: {
      logoUrl: d.user.logoUrl,
      brand: d.user.themeBrand,
      brandDark: d.user.themeBrandDark,
      accent: d.user.themeAccent,
      mode: d.user.themeMode,
    },
    messages: recipient.messages.map((m) => ({
      ...m,
      senderName: m.senderType === "buyer" ? "You" : m.senderName,
    })),
    recipientId: recipient.id,
    // Powers the "All deals" link back to the buyer's portal.
    //
    // ⚠ CONSEQUENCE: this makes any per-deal link a portal credential one
    // click away — whoever holds a single deal link can reach that buyer's
    // entire history with this dealer. Same blast radius as emailing the
    // portal link directly (which is what this replaced), and the same
    // mitigation applies: rotate/revoke on the Contacts page (gap #16).
    // Null when the contact was deleted.
    portalToken: recipient.contact?.portalToken ?? null,
  });
}
