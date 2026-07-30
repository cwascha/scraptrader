// Client-side logo color extraction — the "theme engine". Runs in the
// browser only (uses canvas). Given an uploaded logo image, it derives a
// three-color palette matching the app's theme tokens:
//   brand      — dominant saturated color, darkened if needed so white
//                text stays readable on it (buttons, chat headers)
//   brandDark  — hover variant: darker than brand, or LIGHTER when brand
//                is already near-black (so hover stays visible)
//   accent     — the most prominent color with a clearly different hue
//
// Grayscale logos (black/white marks) get a NEUTRAL fallback: the dominant
// non-white tone becomes a charcoal/gray brand color, so a black logo
// yields a matching monochrome theme instead of nothing. `neutral: true`
// flags that path so the UI can explain it. Returns null only when the
// logo has no usable pixels at all (e.g. pure white on transparent).
//
// Heuristic by nature: the Settings UI shows the result in color pickers so
// the dealer can adjust before saving.

export interface ExtractedTheme {
  brand: string;
  brandDark: string;
  accent: string | null;
  neutral: boolean; // true = grayscale fallback produced this palette
}

function rgbToHex(r: number, g: number, b: number): string {
  const to2 = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

// WCAG relative luminance (0 = black, 1 = white).
function relativeLuminance(r: number, g: number, b: number): number {
  const chan = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function luminanceOfHex(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return relativeLuminance(r, g, b);
}

function rgbToHsl(
  r: number,
  g: number,
  b: number
): { h: number; s: number; l: number } {
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return { h, s, l };
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 360 - d);
}

export function darkenHex(hex: string, factor: number): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * factor, g * factor, b * factor);
}

export function lightenHex(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(
    r + (255 - r) * amount,
    g + (255 - g) * amount,
    b + (255 - b) * amount
  );
}

// Darken until white text is comfortably readable (luminance cap).
function clampForWhiteText(hex: string): string {
  let { r, g, b } = hexToRgb(hex);
  for (let i = 0; i < 10 && relativeLuminance(r, g, b) > 0.4; i++) {
    r *= 0.88;
    g *= 0.88;
    b *= 0.88;
  }
  return rgbToHex(r, g, b);
}

// Hover variant: darker for normal colors; lighter for near-black brands
// (darkening near-black is an invisible hover state).
function deriveBrandDark(brand: string): string {
  return luminanceOfHex(brand) < 0.06
    ? lightenHex(brand, 0.18)
    : darkenHex(brand, 0.65);
}

export async function extractThemeFromImage(
  file: File
): Promise<ExtractedTheme | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null; // not decodable in this browser
  }

  const SIZE = 64;
  const canvas = document.createElement("canvas");
  const scale = Math.min(SIZE / bitmap.width, SIZE / bitmap.height, 1);
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    return null;
  }

  // Pass 1 — COLOR buckets (4 bits per channel): opaque, saturated,
  // not near-white/near-black.
  // Pass 2 (collected simultaneously) — NEUTRAL buckets: opaque and not
  // near-white, saturation ignored. Used only if pass 1 finds nothing.
  const colorBuckets = new Map<
    number,
    { count: number; r: number; g: number; b: number }
  >();
  const neutralBuckets = new Map<
    number,
    { count: number; r: number; g: number; b: number }
  >();

  const bucketAdd = (
    map: Map<number, { count: number; r: number; g: number; b: number }>,
    r: number,
    g: number,
    b: number
  ) => {
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = map.get(key);
    if (bucket) {
      bucket.count++;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
    } else {
      map.set(key, { count: 1, r, g, b });
    }
  };

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2],
      a = data[i + 3];
    if (a < 128) continue;
    const { s, l } = rgbToHsl(r, g, b);

    if (l <= 0.9) {
      bucketAdd(neutralBuckets, r, g, b);
    }
    if (s < 0.15 || l < 0.08 || l > 0.92) continue;
    bucketAdd(colorBuckets, r, g, b);
  }

  const rank = (
    map: Map<number, { count: number; r: number; g: number; b: number }>
  ) =>
    Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .map((bk) => {
        const r = bk.r / bk.count;
        const g = bk.g / bk.count;
        const b = bk.b / bk.count;
        return { r, g, b, count: bk.count, hsl: rgbToHsl(r, g, b) };
      });

  // --- Color path ---
  if (colorBuckets.size > 0) {
    const ranked = rank(colorBuckets);
    const primary = ranked[0];
    const totalCount = ranked.reduce((sum, e) => sum + e.count, 0);

    // Accent: the most prominent color whose hue clearly differs from the
    // primary. Must be non-trivial in the image (≥ 2% of colored pixels).
    const accentEntry = ranked.find(
      (e) =>
        hueDistance(e.hsl.h, primary.hsl.h) >= 60 &&
        e.hsl.s >= 0.25 &&
        e.count >= totalCount * 0.02
    );

    const brand = clampForWhiteText(rgbToHex(primary.r, primary.g, primary.b));
    return {
      brand,
      brandDark: deriveBrandDark(brand),
      accent: accentEntry
        ? rgbToHex(accentEntry.r, accentEntry.g, accentEntry.b)
        : null,
      neutral: false,
    };
  }

  // --- Neutral (grayscale) fallback ---
  if (neutralBuckets.size === 0) return null; // e.g. all-white logo

  const rankedNeutral = rank(neutralBuckets);
  const dominant = rankedNeutral[0];
  let brand = clampForWhiteText(rgbToHex(dominant.r, dominant.g, dominant.b));

  // Pure black is a legal brand color but harsh; lift it slightly so
  // buttons read as rich charcoal and borders stay visible.
  if (luminanceOfHex(brand) < 0.006) {
    brand = lightenHex(brand, 0.1);
  }

  return {
    brand,
    brandDark: deriveBrandDark(brand),
    accent: null, // keep the current/default accent — pops nicely on neutrals
    neutral: true,
  };
}
