import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { encryptContact, decryptContact } from "@/lib/encryption";
import { enforceBodyLimit, JSON_BODY_LIMIT } from "@/lib/body-limit";

// Field length caps — consistent with the slicing used for group names,
// addresses, etc. Contact fields are AUTHENTICATED input (a dealer can only
// affect their own account), so this is hygiene/consistency, not a security
// boundary — but unbounded encrypted blobs shouldn't accumulate either.
const NAME_MAX = 200;
const CONTACT_FIELD_MAX = 320; // RFC-max email length; phones/handles fit easily

// Normalize one optional field: non-string -> "", trimmed, length-capped.
// Returns null for empty so blank fields stay unencrypted (nullable columns).
function cleanOptional(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim().slice(0, CONTACT_FIELD_MAX);
  return trimmed ? trimmed : null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contacts = await prisma.contact.findMany({
    where: { userId: user.id },
    include: { groups: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  // One corrupt/undecryptable row must not 500 the entire list (the deals
  // routes already degrade this way). This matters more since the move to
  // AES-GCM: authenticated decryption THROWS on a tampered or wrong-key
  // value, where the old unauthenticated CBC quietly yielded "". Fall back
  // to a placeholder so the dealer can still see — and delete — the row.
  const decrypted = contacts.map((c) => {
    let fields: {
      name: string;
      company: string | null;
      email: string | null;
      phone: string | null;
      whatsapp: string | null;
    };
    try {
      fields = decryptContact(c, user.encryptionKey);
    } catch {
      fields = {
        name: "(unreadable contact)",
        company: null,
        email: null,
        phone: null,
        whatsapp: null,
      };
    }
    return {
      id: c.id,
      ...fields,
      groups: c.groups,
      // Boolean only — the list view needs to know whether rotate/revoke
      // apply, not the credential itself (POST portal-link returns that
      // on demand).
      hasPortalToken: Boolean(c.portalToken),
      createdAt: c.createdAt,
    };
  });

  return NextResponse.json(decrypted);
}

export async function POST(req: NextRequest) {
  const tooLarge = enforceBodyLimit(req, JSON_BODY_LIMIT);
  if (tooLarge) return tooLarge;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const name =
    typeof body.name === "string" ? body.name.trim().slice(0, NAME_MAX) : "";
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const email = cleanOptional(body.email);
  const phone = cleanOptional(body.phone);
  const whatsapp = cleanOptional(body.whatsapp);
  const company = cleanOptional(body.company);

  const encrypted = encryptContact(
    {
      name,
      company: company ?? undefined,
      email: email ?? undefined,
      phone: phone ?? undefined,
      whatsapp: whatsapp ?? undefined,
    },
    user.encryptionKey
  );

  // Optional initial group assignment — ids not owned by the user are dropped.
  let groupConnect: { id: string }[] = [];
  if (Array.isArray(body.groupIds) && body.groupIds.length > 0) {
    const ownedIds = body.groupIds.filter(
      (x: unknown): x is string => typeof x === "string"
    );
    if (ownedIds.length > 0) {
      groupConnect = await prisma.contactGroup.findMany({
        where: { id: { in: ownedIds }, userId: user.id },
        select: { id: true },
      });
    }
  }

  const contact = await prisma.contact.create({
    data: {
      userId: user.id,
      ...encrypted,
      groups: { connect: groupConnect },
    },
    include: { groups: { select: { id: true, name: true } } },
  });

  // Echo back the CLEANED values (trimmed/capped), so the client shows what
  // was actually stored rather than the raw submission.
  return NextResponse.json({
    id: contact.id,
    name,
    company,
    email,
    phone,
    whatsapp,
    groups: contact.groups,
  });
}

export async function DELETE(req: NextRequest) {
  const tooLarge = enforceBodyLimit(req, JSON_BODY_LIMIT);
  if (tooLarge) return tooLarge;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  // ⚠ MUST be a non-empty string, and this is not merely hygiene.
  // Prisma treats `undefined` in a WHERE as "no filter", so a request with
  // an empty body would make this
  //     deleteMany({ where: { userId: user.id } })
  // — i.e. DELETE THE DEALER'S ENTIRE ADDRESS BOOK, silently, returning
  // success. Guard the id before it reaches the query.
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json(
      { error: "Contact id is required" },
      { status: 400 }
    );
  }

  const result = await prisma.contact.deleteMany({
    where: { id, userId: user.id },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
