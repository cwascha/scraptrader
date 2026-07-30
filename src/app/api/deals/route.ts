import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { decryptContact } from "@/lib/encryption";
import {
  PACKAGING_OPTIONS,
  SHIPPING_TYPES,
  WEIGHT_UNITS,
  buildDealTitle,
} from "@/lib/deal-fields";
import { isValidMaterial } from "@/lib/materials-server";
import { parseAddressSnapshot, AddressSnapshot } from "@/lib/address";

// Deal list with inbox data: each recipient carries the decrypted
// contactName, the latest message (preview), and unreadCount (buyer
// messages newer than ownerLastReadAt).
//
// Tradeoff, on purpose: this pulls every conversation's messages to
// compute unread counts in JS, because Prisma can't filter a _count
// against a per-row column (createdAt > that row's ownerLastReadAt).
// Fine at single-tenant scale; revisit with raw SQL if it ever isn't.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deals = await prisma.deal.findMany({
    where: { userId: user.id },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      recipients: {
        include: {
          contact: true,
          messages: { orderBy: { createdAt: "desc" } },
          _count: { select: { messages: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const shaped = deals.map((deal) => ({
    ...deal,
    recipients: deal.recipients.map((r) => {
      // Strip the encrypted blob AND the raw message array — the client
      // gets a decrypted name, a preview, and a count, nothing more.
      const { contact, messages, ...rest } = r;

      let contactName = "(removed contact)";
      if (contact) {
        try {
          contactName = decryptContact(contact, user.encryptionKey).name;
        } catch {
          contactName = "(unreadable contact)";
        }
      }

      const last = messages[0] ?? null;
      const lastReadMs = r.ownerLastReadAt
        ? new Date(r.ownerLastReadAt).getTime()
        : 0;
      const unreadCount = messages.filter(
        (m) =>
          m.senderType === "buyer" &&
          new Date(m.createdAt).getTime() > lastReadMs
      ).length;

      return {
        ...rest,
        contactName,
        unreadCount,
        lastMessage: last
          ? {
              senderType: last.senderType,
              type: last.type,
              content: last.content,
              bidAmount: last.bidAmount,
              bidUnit: last.bidUnit,
              createdAt: last.createdAt,
            }
          : null,
      };
    }),
  }));

  return NextResponse.json(shaped);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const material =
    typeof body.material === "string" ? body.material.trim() : "";
  const packaging: string[] = Array.isArray(body.packaging)
    ? body.packaging.filter((p: unknown) =>
        PACKAGING_OPTIONS.includes(p as string)
      )
    : [];
  const shippingTypes: string[] = Array.isArray(body.shippingTypes)
    ? body.shippingTypes.filter((s: unknown) =>
        SHIPPING_TYPES.includes(s as string)
      )
    : [];
  const numLoads = Number.parseInt(String(body.numLoads), 10);
  const weightPerLoad = Number.parseFloat(String(body.weightPerLoad));
  const weightUnit = WEIGHT_UNITS.includes(body.weightUnit)
    ? body.weightUnit
    : "lbs";
  const notes =
    typeof body.notes === "string" && body.notes.trim()
      ? body.notes.trim()
      : null;

  const errors: string[] = [];
  if (!material) errors.push("Material is required");
  else if (!(await isValidMaterial(user.id, material)))
    errors.push("Pick a material grade from your list");
  if (packaging.length === 0) errors.push("Select at least one packaging type");
  if (!Number.isInteger(numLoads) || numLoads < 1)
    errors.push("Number of loads must be a whole number of at least 1");
  if (!Number.isFinite(weightPerLoad) || weightPerLoad <= 0)
    errors.push("Weight per load must be greater than 0");
  if (shippingTypes.length === 0)
    errors.push("Select at least one shipping type");

  // Two optional origin-address snapshots: the pickup yard (Domestic only)
  // and the export port/dock (Export only). Each is all-or-nothing.
  let pickup: AddressSnapshot | null = null;
  if (shippingTypes.includes("Domestic")) {
    const parsed = parseAddressSnapshot(
      {
        street: body.pickupStreet,
        city: body.pickupCity,
        state: body.pickupState,
        zip: body.pickupZip,
      },
      "Pickup"
    );
    if (parsed.error) errors.push(parsed.error);
    pickup = parsed.address;
  }

  let port: AddressSnapshot | null = null;
  if (shippingTypes.includes("Export")) {
    const parsed = parseAddressSnapshot(
      {
        street: body.portStreet,
        city: body.portCity,
        state: body.portState,
        zip: body.portZip,
      },
      "Port"
    );
    if (parsed.error) errors.push(parsed.error);
    port = parsed.address;
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(". ") }, { status: 400 });
  }

  const deal = await prisma.deal.create({
    data: {
      userId: user.id,
      title: buildDealTitle({
        material,
        numLoads,
        weightPerLoad,
        weightUnit,
        packaging,
      }),
      material,
      packaging: packaging.join(","),
      numLoads,
      weightPerLoad,
      weightUnit,
      shippingTypes: shippingTypes.join(","),
      notes,
      pickupStreet: pickup?.street ?? null,
      pickupCity: pickup?.city ?? null,
      pickupState: pickup?.state ?? null,
      pickupZip: pickup?.zip ?? null,
      portStreet: port?.street ?? null,
      portCity: port?.city ?? null,
      portState: port?.state ?? null,
      portZip: port?.zip ?? null,
      status: "draft",
    },
    include: { images: true },
  });

  return NextResponse.json(deal);
}
