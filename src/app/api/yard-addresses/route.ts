import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { US_STATE_CODES } from "@/lib/us-states";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const addresses = await prisma.yardAddress.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(addresses);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const street = typeof body.street === "string" ? body.street.trim() : "";
  const city = typeof body.city === "string" ? body.city.trim() : "";
  const state =
    typeof body.state === "string" ? body.state.trim().toUpperCase() : "";
  const zip = typeof body.zip === "string" ? body.zip.trim() : "";

  const errors: string[] = [];
  if (!name) errors.push("Name is required");
  if (!street) errors.push("Street is required");
  if (!city) errors.push("City is required");
  if (!state) errors.push("State is required");
  else if (!US_STATE_CODES.includes(state))
    errors.push("State must be a valid US state code (e.g. MI)");
  if (!zip) errors.push("Zip is required");

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(". ") }, { status: 400 });
  }

  const address = await prisma.yardAddress.create({
    data: {
      userId: user.id,
      name: name.slice(0, 100),
      street: street.slice(0, 200),
      city: city.slice(0, 100),
      state,
      zip: zip.slice(0, 20),
    },
  });

  return NextResponse.json(address);
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await req.json();

  await prisma.yardAddress.deleteMany({
    where: { id, userId: user.id },
  });

  return NextResponse.json({ success: true });
}
