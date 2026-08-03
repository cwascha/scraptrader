import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { detectImageType } from "@/lib/image-validation";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { enforceBodyLimit, LOGO_BODY_LIMIT } from "@/lib/body-limit";

const MAX_LOGO_SIZE = 5 * 1024 * 1024; // 5 MB — logos should be small
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

async function deleteBrandingFile(url: string | null) {
  if (!url || !url.startsWith("/uploads/branding/")) return;
  try {
    await unlink(path.join(process.cwd(), "public", url));
  } catch {
    // Already gone — fine.
  }
}

// Shared upload path for both branding images. Returns the new public URL,
// or null when no file was supplied (leave the existing one alone).
async function saveBrandingImage(
  file: FormDataEntryValue | null,
  userId: string,
  previousUrl: string | null,
  label: string
): Promise<{ url: string | null } | { error: string }> {
  if (!(file instanceof File) || file.size === 0) return { url: null };

  if (file.size > MAX_LOGO_SIZE) {
    return { error: `${label} must be 5 MB or smaller` };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = detectImageType(buffer);
  if (!detected) {
    return {
      error: `${label} must be a PNG, JPEG, WebP, or GIF (SVG is not supported)`,
    };
  }

  const dir = path.join(process.cwd(), "public", "uploads", "branding", userId);
  await mkdir(dir, { recursive: true });
  const filename = `${uuidv4()}.${detected.ext}`;
  await writeFile(path.join(dir, filename), buffer);

  // Replace, don't accumulate.
  await deleteBrandingFile(previousUrl);
  return { url: `/uploads/branding/${userId}/${filename}` };
}

// Save branding: three theme colors (required together), light/dark mode,
// and an optional logo. Colors are display preferences, so they're stored
// as-is after format validation — contrast guidance happens client-side
// during extraction.
export async function POST(req: NextRequest) {
  const tooLarge = enforceBodyLimit(req, LOGO_BODY_LIMIT);
  if (tooLarge) return tooLarge;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();

  const brand = String(formData.get("brand") ?? "");
  const brandDark = String(formData.get("brandDark") ?? "");
  const accent = String(formData.get("accent") ?? "");
  const mode = String(formData.get("mode") ?? "light");

  if (!HEX_RE.test(brand) || !HEX_RE.test(brandDark) || !HEX_RE.test(accent)) {
    return NextResponse.json(
      { error: "Colors must be 6-digit hex values like #2d5f8a" },
      { status: 400 }
    );
  }

  if (mode !== "light" && mode !== "dark") {
    return NextResponse.json(
      { error: "Mode must be 'light' or 'dark'" },
      { status: 400 }
    );
  }

  let logoUrl = user.logoUrl;
  const logoResult = await saveBrandingImage(
    formData.get("logo"),
    user.id,
    user.logoUrl,
    "Logo"
  );
  if ("error" in logoResult) {
    return NextResponse.json({ error: logoResult.error }, { status: 400 });
  }
  if (logoResult.url) logoUrl = logoResult.url;

  let appIconUrl = user.appIconUrl;
  const iconResult = await saveBrandingImage(
    formData.get("appIcon"),
    user.id,
    user.appIconUrl,
    "App icon"
  );
  if ("error" in iconResult) {
    return NextResponse.json({ error: iconResult.error }, { status: 400 });
  }
  if (iconResult.url) appIconUrl = iconResult.url;

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      logoUrl,
      appIconUrl,
      themeBrand: brand.toLowerCase(),
      themeBrandDark: brandDark.toLowerCase(),
      themeAccent: accent.toLowerCase(),
      themeMode: mode,
    },
  });

  return NextResponse.json({
    logoUrl: updated.logoUrl,
    appIconUrl: updated.appIconUrl,
    themeBrand: updated.themeBrand,
    themeBrandDark: updated.themeBrandDark,
    themeAccent: updated.themeAccent,
    themeMode: updated.themeMode,
  });
}

// Reset branding to the ScrapTrader defaults: clears the palette + mode and
// removes the logo (file included).
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await deleteBrandingFile(user.logoUrl);
  await deleteBrandingFile(user.appIconUrl);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      logoUrl: null,
      appIconUrl: null,
      themeBrand: null,
      themeBrandDark: null,
      themeAccent: null,
      themeMode: null,
    },
  });

  return NextResponse.json({ success: true });
}
