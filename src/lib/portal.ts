import { randomUUID } from "crypto";
import { prisma } from "./db";

// Get-or-create a contact's portal token.
//
// CALLER MUST HAVE VERIFIED OWNERSHIP — this takes a contact id that the
// caller has already scoped by userId (see the publish route and
// /api/contacts/portal-link). It does no authorization of its own.
//
// Atomic: the guarded updateMany (`portalToken: null` in the WHERE) means
// two concurrent callers can't each mint a token — the second write matches
// zero rows, and both then read back the single winning value.
export async function ensurePortalToken(
  contactId: string
): Promise<string | null> {
  const existing = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { portalToken: true },
  });
  if (!existing) return null;
  if (existing.portalToken) return existing.portalToken;

  await prisma.contact.updateMany({
    where: { id: contactId, portalToken: null },
    data: { portalToken: randomUUID() },
  });

  const fresh = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { portalToken: true },
  });
  return fresh?.portalToken ?? null;
}

// Rotate: mint a fresh token, orphaning the old one immediately. This is
// the response to a suspected leak (forwarded mail, compromised inbox) —
// the buyer keeps portal access, but only via the new link, which the
// dealer must re-send.
//
// SCOPE, be precise about it: this invalidates the PORTAL link only. A
// per-deal link (`/deal/{accessToken}`) the buyer already holds keeps
// working — those are separate credentials on DealRecipient. Since deal
// emails now carry only the portal link, rotating does cut off access
// granted by a leaked email; it does not cut off a deal page the buyer
// already opened and bookmarked. Full per-deal revocation is a separate
// feature (rotate every DealRecipient.accessToken for the contact).
export async function rotatePortalToken(
  contactId: string
): Promise<string | null> {
  const token = randomUUID();
  const result = await prisma.contact.updateMany({
    where: { id: contactId },
    data: { portalToken: token },
  });
  return result.count > 0 ? token : null;
}

// Revoke: drop the token entirely. `/portal/{old}` 404s immediately and
// the buyer has no portal at all until a new token is minted — which
// happens automatically on the next publish, or on an explicit copy-link
// request. Same per-deal caveat as rotate.
export async function revokePortalToken(contactId: string): Promise<boolean> {
  const result = await prisma.contact.updateMany({
    where: { id: contactId },
    data: { portalToken: null },
  });
  return result.count > 0;
}
