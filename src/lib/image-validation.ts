// Shared server-side image validation. The detected type decides the stored
// extension — client-supplied filenames and MIME types are never trusted.
// Used by /api/deals/[id]/images (deal photos) and /api/branding (logos).
//
// SVG is deliberately NOT supported: SVGs can contain scripts and are an XSS
// vector when served from our own origin.

export function detectImageType(buffer: Buffer): { ext: string } | null {
  // JPEG: FF D8 FF
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { ext: "jpg" };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { ext: "png" };
  }
  // GIF: "GIF87a" or "GIF89a"
  if (buffer.length >= 6) {
    const head = buffer.subarray(0, 6).toString("ascii");
    if (head === "GIF87a" || head === "GIF89a") {
      return { ext: "gif" };
    }
  }
  // WebP: "RIFF" + 4 size bytes + "WEBP"
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { ext: "webp" };
  }
  return null;
}
