import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { detectImageType } from "@/lib/image-validation";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";
import { enforceBodyLimit, IMAGE_BODY_LIMIT, JSON_BODY_LIMIT } from "@/lib/body-limit";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per image (input; output is far smaller)
const MAX_IMAGES_PER_DEAL = 10;

// Uploads are RE-ENCODED, not stored as received:
//   - .rotate() applies EXIF orientation first (phone photos rely on it)
//   - resized to fit 1600×1600 (never enlarged) — plenty for deal photos
//   - JPEG q80 (mozjpeg) — typically ~10× smaller than phone originals
//   - metadata is NOT carried over, which strips EXIF including GPS
//     coordinates. This is a privacy control, not just disk hygiene: a
//     "city + state only" deal must not leak the yard's exact location
//     inside the photo file.
// Everything becomes .jpg (scrap photos don't need transparency; animated
// GIFs collapse to their first frame).
async function processImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer, { failOn: "error" })
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tooLarge = enforceBodyLimit(req, IMAGE_BODY_LIMIT);
  if (tooLarge) return tooLarge;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const deal = await prisma.deal.findFirst({
    where: { id, userId: user.id },
  });

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  const formData = await req.formData();
  const files = formData.getAll("images") as File[];

  if (files.length === 0) {
    return NextResponse.json({ error: "No images provided" }, { status: 400 });
  }

  const existingCount = await prisma.dealImage.count({
    where: { dealId: id },
  });
  if (existingCount + files.length > MAX_IMAGES_PER_DEAL) {
    return NextResponse.json(
      {
        error: `A deal can have at most ${MAX_IMAGES_PER_DEAL} photos (this deal already has ${existingCount}).`,
      },
      { status: 400 }
    );
  }

  // Validate AND process the entire batch before writing anything, so one
  // bad file can't leave a half-saved upload behind. Magic-byte detection
  // stays as the first gate (fast reject of SVG/non-images); sharp is the
  // second (it must actually decode the pixels to re-encode them).
  const problems: string[] = [];
  const validated: { buffer: Buffer; originalName: string }[] = [];

  for (const file of files) {
    const name = file.name || "unnamed file";
    if (file.size > MAX_FILE_SIZE) {
      problems.push(`${name}: larger than 10 MB`);
      continue;
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const detected = detectImageType(buffer);
    if (!detected) {
      problems.push(`${name}: not a supported image (JPEG, PNG, WebP, or GIF)`);
      continue;
    }
    try {
      const processed = await processImage(buffer);
      validated.push({
        buffer: processed,
        originalName: name.slice(0, 200),
      });
    } catch {
      problems.push(`${name}: could not be processed as an image`);
    }
  }

  if (problems.length > 0) {
    return NextResponse.json(
      { error: `Upload rejected — ${problems.join("; ")}` },
      { status: 400 }
    );
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", id);
  await mkdir(uploadDir, { recursive: true });

  const images = [];
  for (let i = 0; i < validated.length; i++) {
    const { buffer, originalName } = validated[i];
    const filename = `${uuidv4()}.jpg`;
    const filepath = path.join(uploadDir, filename);

    await writeFile(filepath, buffer);

    const image = await prisma.dealImage.create({
      data: {
        dealId: id,
        url: `/uploads/${id}/${filename}`,
        filename: originalName,
        sortOrder: existingCount + i,
      },
    });
    images.push(image);
  }

  return NextResponse.json(images);
}

export async function DELETE(
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

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  // ⚠ Must be a non-empty string. Prisma drops `undefined` filters, so
  // `findFirst({ where: { id: undefined, deal: {…} } })` would return the
  // deal's FIRST image — and the line below would delete it. A malformed
  // request would silently destroy the wrong photo instead of 404ing.
  const imageId = typeof body.imageId === "string" ? body.imageId.trim() : "";
  if (!imageId) {
    return NextResponse.json(
      { error: "Image id is required" },
      { status: 400 }
    );
  }

  const image = await prisma.dealImage.findFirst({
    where: {
      id: imageId,
      deal: { id, userId: user.id },
    },
  });

  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  await prisma.dealImage.delete({ where: { id: image.id } });

  // Remove the file from disk too; ignore failure (the DB row is the
  // source of truth and is already gone).
  try {
    await unlink(path.join(process.cwd(), "public", image.url));
  } catch {
    // File already missing — nothing to do.
  }

  return NextResponse.json({ success: true });
}
