import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { encryptContact, decryptContact } from "@/lib/encryption";
import { enforceBodyLimit, JSON_BODY_LIMIT } from "@/lib/body-limit";

const NAME_MAX = 200;
const CONTACT_FIELD_MAX = 320;

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// PUT — edit a contact. Any omitted field keeps its current value.
//
// Encrypted fields can't be diffed, so the flow is: decrypt what's stored,
// merge the incoming changes, re-encrypt the whole set. That also means
// every save produces fresh ciphertext (new IV per field), which is
// correct for GCM and gives nothing away.
//
// Editing does NOT touch the portal token or any existing deal/price-sheet
// recipients — the contact keeps its identity and its history. That's the
// whole point of having an edit path rather than delete-and-recreate.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tooLarge = enforceBodyLimit(req, JSON_BODY_LIMIT);
  if (tooLarge) return tooLarge;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.contact.findFirst({
    where: { id, userId: user.id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  let body: {
    name?: unknown;
    company?: unknown;
    email?: unknown;
    phone?: unknown;
    whatsapp?: unknown;
    groupIds?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  // Current values, for fields the client didn't send. If the row can't be
  // decrypted (wrong key / tampered ciphertext) we fall back to blanks
  // rather than failing — editing is exactly how a dealer would REPAIR an
  // unreadable contact, so this path has to stay open.
  let current = {
    name: "",
    company: null as string | null,
    email: null as string | null,
    phone: null as string | null,
    whatsapp: null as string | null,
  };
  let wasUnreadable = false;
  try {
    current = decryptContact(existing, user.encryptionKey);
  } catch {
    wasUnreadable = true;
  }

  const merged = {
    name: body.name !== undefined ? clean(body.name, NAME_MAX) : current.name,
    company:
      body.company !== undefined
        ? clean(body.company, CONTACT_FIELD_MAX)
        : (current.company ?? ""),
    email:
      body.email !== undefined
        ? clean(body.email, CONTACT_FIELD_MAX)
        : (current.email ?? ""),
    phone:
      body.phone !== undefined
        ? clean(body.phone, CONTACT_FIELD_MAX)
        : (current.phone ?? ""),
    whatsapp:
      body.whatsapp !== undefined
        ? clean(body.whatsapp, CONTACT_FIELD_MAX)
        : (current.whatsapp ?? ""),
  };

  if (!merged.name) {
    return NextResponse.json(
      {
        error: wasUnreadable
          ? "This contact couldn't be decrypted — re-enter the name to repair it."
          : "Name is required",
      },
      { status: 400 }
    );
  }

  const encrypted = encryptContact(
    {
      name: merged.name,
      company: merged.company || undefined,
      email: merged.email || undefined,
      phone: merged.phone || undefined,
      whatsapp: merged.whatsapp || undefined,
    },
    user.encryptionKey
  );

  // Group membership is replaced wholesale when provided; ids the user
  // doesn't own are silently dropped (same rule as create).
  let groupUpdate = {};
  if (body.groupIds !== undefined) {
    const ids = Array.isArray(body.groupIds)
      ? body.groupIds.filter((x: unknown): x is string => typeof x === "string")
      : [];
    const owned = await prisma.contactGroup.findMany({
      where: { id: { in: ids }, userId: user.id },
      select: { id: true },
    });
    groupUpdate = { groups: { set: owned } };
  }

  const updated = await prisma.contact.update({
    where: { id: existing.id },
    data: { ...encrypted, ...groupUpdate },
    include: { groups: { select: { id: true, name: true } } },
  });

  // Echo the CLEANED values so the client shows what was actually stored.
  return NextResponse.json({
    id: updated.id,
    name: merged.name,
    company: merged.company || null,
    email: merged.email || null,
    phone: merged.phone || null,
    whatsapp: merged.whatsapp || null,
    hasPortalToken: Boolean(updated.portalToken),
    groups: updated.groups,
  });
}
