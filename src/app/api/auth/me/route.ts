import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { WEIGHT_UNITS } from "@/lib/deal-fields";
import { enforceBodyLimit, JSON_BODY_LIMIT } from "@/lib/body-limit";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    companyName: user.companyName,
    preferredWeightUnit: user.preferredWeightUnit,
    logoUrl: user.logoUrl,
    appIconUrl: user.appIconUrl,
    themeBrand: user.themeBrand,
    themeBrandDark: user.themeBrandDark,
    themeAccent: user.themeAccent,
    themeMode: user.themeMode,
  });
}

// Update the current user's settings. Only whitelisted fields are accepted.
// (Branding — logo + theme colors + mode — is handled by /api/branding,
// which needs multipart form data.)
export async function PATCH(req: NextRequest) {
  const tooLarge = enforceBodyLimit(req, JSON_BODY_LIMIT);
  if (tooLarge) return tooLarge;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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

  if (body.preferredWeightUnit === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  if (!WEIGHT_UNITS.includes(body.preferredWeightUnit)) {
    return NextResponse.json(
      { error: `Invalid unit. Choose one of: ${WEIGHT_UNITS.join(", ")}` },
      { status: 400 }
    );
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { preferredWeightUnit: body.preferredWeightUnit },
  });

  return NextResponse.json({
    id: updated.id,
    email: updated.email,
    name: updated.name,
    companyName: updated.companyName,
    preferredWeightUnit: updated.preferredWeightUnit,
    logoUrl: updated.logoUrl,
    themeBrand: updated.themeBrand,
    themeBrandDark: updated.themeBrandDark,
    themeAccent: updated.themeAccent,
    themeMode: updated.themeMode,
  });
}
