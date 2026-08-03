import type { MetadataRoute } from "next";
import { getCurrentUser } from "@/lib/auth";

// Web app manifest, generated per DEALER so an installed app carries the
// yard's own icon and colours.
//
// ⚠ SCOPED TO /dashboard ON PURPOSE. Buyer and supplier pages
// (/deal, /portal, /prices) are one-off tokenized links — nobody installs
// a price sheet, and treating them as app pages would invite a service
// worker to cache PRICES, which is exactly the stale-quote failure the
// snapshot locking and expiry exist to prevent.
//
// NOTE ON CREDENTIALS: browsers fetch the manifest WITHOUT cookies unless
// the link tag sets crossorigin="use-credentials" (see app/layout.tsx).
// Without that, getCurrentUser() returns null here and every dealer gets
// the ScrapTrader defaults — silently. If custom icons stop appearing,
// check that attribute first.
//
// NOTE ON CACHING: iOS captures the icon at INSTALL time. Changing the
// app icon later won't update an already-installed home screen shortcut
// until it's removed and re-added. Worth telling dealers rather than
// treating it as a bug.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let name = "ScrapTrader";
  let icon: string | null = null;
  let themeColor = "#2d5f8a";

  try {
    const user = await getCurrentUser();
    if (user) {
      name = user.companyName || name;
      icon = user.appIconUrl;
      themeColor = user.themeBrand || themeColor;
    }
  } catch {
    // Manifest requests can arrive without a usable session — fall back
    // to platform defaults rather than failing the request.
  }

  const icons: MetadataRoute.Manifest["icons"] = icon
    ? [
        // "any maskable" so Android can apply its own mask instead of
        // shrinking the artwork into a white tile.
        { src: icon, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: icon, sizes: "512x512", type: "image/png", purpose: "any" },
        { src: icon, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ]
    : [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ];

  return {
    name: `${name} — ScrapTrader`,
    short_name: name,
    description: "Private CRM and negotiating platform for scrap metal trading",
    // start_url and scope keep the installed app inside the dealer's
    // dashboard; a tokenized buyer link opens in the normal browser.
    start_url: "/dashboard",
    scope: "/dashboard",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: themeColor,
    icons,
  };
}
