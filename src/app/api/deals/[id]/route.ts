import { NextRequest, NextResponse } from "next/server";
import { rm } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { decryptContact } from "@/lib/encryption";
import {
  PACKAGING_OPTIONS,
  SHIPPING_TYPES,
  WEIGHT_UNITS,
  PRICE_UNITS,
  buildDealTitle,
} from "@/lib/deal-fields";
import { isValidMaterial } from "@/lib/materials-server";
import { parseAddressSnapshot, AddressSnapshot } from "@/lib/address";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const deal = await prisma.deal.findFirst({
    where: { id, userId: user.id },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      recipients: {
        include: {
          contact: true,
          messages: { orderBy: { createdAt: "asc" } },
          _count: { select: { messages: true } },
        },
      },
    },
  });

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  // Decrypt each recipient's contact name server-side and send ONLY the
  // name — the encrypted blob never leaves the server, and the UI gets a
  // human title for each conversation.
  const { recipients, ...dealFields } = deal;
  return NextResponse.json({
    ...dealFields,
    recipients: recipients.map((r) => {
      const { contact, ...rest } = r;
      let contactName = "(removed contact)";
      if (contact) {
        try {
          contactName = decryptContact(contact, user.encryptionKey).name;
        } catch {
          contactName = "(unreadable contact)";
        }
      }
      return { ...rest, contactName };
    }),
  });
}

// Partial update: any omitted field keeps its current value. The merged
// result is re-validated and the title regenerated, so title always matches
// the data no matter which client sent the update.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.deal.findFirst({
    where: { id, userId: user.id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const body = await req.json();

  const material =
    body.material !== undefined
      ? typeof body.material === "string"
        ? body.material.trim()
        : ""
      : existing.material;

  const packaging: string[] =
    body.packaging !== undefined
      ? Array.isArray(body.packaging)
        ? body.packaging.filter((p: unknown) =>
            PACKAGING_OPTIONS.includes(p as string)
          )
        : []
      : existing.packaging.split(",").filter(Boolean);

  const shippingTypes: string[] =
    body.shippingTypes !== undefined
      ? Array.isArray(body.shippingTypes)
        ? body.shippingTypes.filter((s: unknown) =>
            SHIPPING_TYPES.includes(s as string)
          )
        : []
      : existing.shippingTypes.split(",").filter(Boolean);

  const numLoads =
    body.numLoads !== undefined
      ? Number.parseInt(String(body.numLoads), 10)
      : existing.numLoads;

  const weightPerLoad =
    body.weightPerLoad !== undefined
      ? Number.parseFloat(String(body.weightPerLoad))
      : existing.weightPerLoad;

  const weightUnit =
    body.weightUnit !== undefined
      ? WEIGHT_UNITS.includes(body.weightUnit)
        ? body.weightUnit
        : "lbs"
      : existing.weightUnit;

  const notes =
    body.notes !== undefined
      ? typeof body.notes === "string" && body.notes.trim()
        ? body.notes.trim()
        : null
      : existing.notes;

  let askingPrice = existing.askingPrice;
  if (body.askingPrice !== undefined) {
    if (body.askingPrice === null || body.askingPrice === "") {
      askingPrice = null;
    } else {
      askingPrice = Number.parseFloat(String(body.askingPrice));
    }
  }

  const priceUnit =
    body.priceUnit !== undefined
      ? PRICE_UNITS.includes(body.priceUnit)
        ? body.priceUnit
        : existing.priceUnit
      : existing.priceUnit;

  const location =
    body.location !== undefined
      ? typeof body.location === "string" && body.location.trim()
        ? body.location.trim()
        : null
      : existing.location;

  // Merge each address field individually (omitted = keep current), then
  // re-apply the gating + all-or-nothing rules on the merged result.
  const mergeField = (incoming: unknown, current: string | null): string => {
    if (incoming === undefined) return current ?? "";
    return typeof incoming === "string" ? incoming.trim() : "";
  };

  const errors: string[] = [];

  let pickup: AddressSnapshot | null = null;
  if (shippingTypes.includes("Domestic")) {
    const parsed = parseAddressSnapshot(
      {
        street: mergeField(body.pickupStreet, existing.pickupStreet),
        city: mergeField(body.pickupCity, existing.pickupCity),
        state: mergeField(body.pickupState, existing.pickupState),
        zip: mergeField(body.pickupZip, existing.pickupZip),
      },
      "Pickup"
    );
    if (parsed.error) errors.push(parsed.error);
    pickup = parsed.address;
  }
  // If Domestic isn't selected, pickup fields are cleared.

  let port: AddressSnapshot | null = null;
  if (shippingTypes.includes("Export")) {
    const parsed = parseAddressSnapshot(
      {
        street: mergeField(body.portStreet, existing.portStreet),
        city: mergeField(body.portCity, existing.portCity),
        state: mergeField(body.portState, existing.portState),
        zip: mergeField(body.portZip, existing.portZip),
      },
      "Port"
    );
    if (parsed.error) errors.push(parsed.error);
    port = parsed.address;
  }
  // If Export isn't selected, port fields are cleared.

  if (!material) errors.push("Material is required");
  // Only validate when the material is being CHANGED. Deals carry their
  // grade as a snapshot, so one created under a since-retired grade (or
  // under the old ISRI list) stays editable — you can fix its weight
  // without being forced to re-pick a material that no longer exists.
  else if (
    body.material !== undefined &&
    !(await isValidMaterial(user.id, material))
  )
    errors.push("Pick a material grade from your list");
  if (packaging.length === 0) errors.push("Select at least one packaging type");
  if (!Number.isInteger(numLoads) || numLoads < 1)
    errors.push("Number of loads must be a whole number of at least 1");
  if (!Number.isFinite(weightPerLoad) || weightPerLoad <= 0)
    errors.push("Weight per load must be greater than 0");
  if (shippingTypes.length === 0)
    errors.push("Select at least one shipping type");
  if (askingPrice !== null && (!Number.isFinite(askingPrice) || askingPrice <= 0))
    errors.push("Asking price must be greater than 0 (or left empty)");

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(". ") }, { status: 400 });
  }

  const updated = await prisma.deal.update({
    where: { id: existing.id },
    data: {
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
      askingPrice,
      priceUnit,
      location,
    },
    include: { images: true },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const result = await prisma.deal.deleteMany({
    where: { id, userId: user.id },
  });

  // Disk cleanup: the DB cascade removes DealImage ROWS, but the files in
  // public/uploads/{dealId}/ would otherwise be orphaned forever. Only
  // attempted after deleteMany confirmed a real deal owned by this user —
  // which also guarantees `id` is a stored UUID, not a crafted path.
  // Best-effort: a straggler directory is a cosmetic leak, not a failure.
  if (result.count > 0) {
    const uploadDir = path.join(process.cwd(), "public", "uploads", id);
    await rm(uploadDir, { recursive: true, force: true }).catch((err) =>
      console.error("[deal-delete] upload cleanup failed:", err)
    );
  }

  return NextResponse.json({ success: true });
}
