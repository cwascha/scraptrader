import { NextResponse } from "next/server";

// Reject obviously-oversized request bodies BEFORE they're buffered into
// memory by req.json()/req.formData(). Next's App Router does not apply the
// old pages-router 1 MB body cap, so without this a single large POST is
// read fully into RAM before any length validation runs.
//
// Content-Length is client-controllable (it can be omitted, or lied about
// on a chunked/streamed upload), so this is a cheap first gate, NOT a hard
// guarantee — the real backstop is `client_max_body_size` at the reverse
// proxy (see ARCHITECTURE deployment notes). It reliably stops the common
// case: an honest-but-huge upload aimed at exhausting memory.

// JSON API payloads here are tiny (a chat message caps at 4000 chars).
export const JSON_BODY_LIMIT = 64 * 1024; // 64 KB
// A logo is capped at 5 MB; allow for multipart overhead.
export const LOGO_BODY_LIMIT = 6 * 1024 * 1024; // 6 MB
// Up to 10 images × 10 MB per deal-photo upload, plus multipart overhead.
export const IMAGE_BODY_LIMIT = 110 * 1024 * 1024; // 110 MB

export function enforceBodyLimit(
  req: Request,
  maxBytes: number
): NextResponse | null {
  const header = req.headers.get("content-length");
  if (header) {
    const len = Number.parseInt(header, 10);
    if (Number.isFinite(len) && len > maxBytes) {
      return NextResponse.json(
        { error: "Request body too large" },
        { status: 413 }
      );
    }
  }
  return null;
}
