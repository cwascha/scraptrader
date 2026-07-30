import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  ensurePortalToken,
  rotatePortalToken,
  revokePortalToken,
} from "@/lib/portal";
import { enforceBodyLimit, JSON_BODY_LIMIT } from "@/lib/body-limit";

// The portal link is CONTACT-level (channel-independent) and is the link
// the dealer shares everywhere — publishing a deal mints it and emails it
// (see the publish route). This endpoint manages that token's lifecycle:
//
//   POST   get-or-create  — used by the Contacts page "Portal link" copy
//   PUT    rotate         — leaked link? mint a fresh one, old dies now
//   DELETE revoke         — no portal at all until one is minted again
//
// Rotate/revoke invalidate the PORTAL link only; per-deal `accessToken`
// links the buyer already holds keep working (see lib/portal.ts).

type Resolved =
  | { ok: true; contactId: string }
  | { ok: false; response: NextResponse };

// Shared guard: authenticate, parse defensively, and confirm the contact
// belongs to THIS user before any token lifecycle helper runs (the helpers
// do no authorization of their own).
async function resolveOwnedContact(req: NextRequest): Promise<Resolved> {
  const tooLarge = enforceBodyLimit(req, JSON_BODY_LIMIT);
  if (tooLarge) return { ok: false, response: tooLarge };

  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  let body: { contactId?: unknown };
  try {
    body = await req.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      ),
    };
  }

  const contactId = typeof body.contactId === "string" ? body.contactId : "";

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, userId: user.id },
    select: { id: true },
  });

  if (!contact) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Contact not found" },
        { status: 404 }
      ),
    };
  }

  return { ok: true, contactId: contact.id };
}

export async function POST(req: NextRequest) {
  const resolved = await resolveOwnedContact(req);
  if (!resolved.ok) return resolved.response;

  const portalToken = await ensurePortalToken(resolved.contactId);
  return NextResponse.json({ portalToken });
}

export async function PUT(req: NextRequest) {
  const resolved = await resolveOwnedContact(req);
  if (!resolved.ok) return resolved.response;

  const portalToken = await rotatePortalToken(resolved.contactId);
  if (!portalToken) {
    return NextResponse.json(
      { error: "Could not rotate the portal link — try again" },
      { status: 500 }
    );
  }
  return NextResponse.json({ portalToken });
}

export async function DELETE(req: NextRequest) {
  const resolved = await resolveOwnedContact(req);
  if (!resolved.ok) return resolved.response;

  await revokePortalToken(resolved.contactId);
  return NextResponse.json({ success: true, portalToken: null });
}
