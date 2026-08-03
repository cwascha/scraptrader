import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the dev server to be reached through a Cloudflare quick tunnel
  // (cloudflared assigns a random *.trycloudflare.com subdomain per run).
  // Dev-only setting — has no effect on production builds.
  allowedDevOrigins: ["*.trycloudflare.com"],

  // Security response headers. Applied here rather than at nginx so they
  // hold in dev, through a tunnel, and on any host — a header that only
  // exists in one deployment path is a header you can't rely on.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Clickjacking: nothing in this app is meant to be framed, and a
          // framed /dashboard could be used to trick a logged-in dealer
          // into clicking Delete or Accept.
          { key: "X-Frame-Options", value: "DENY" },

          // ⚠ THE IMPORTANT ONE HERE. Buyer and supplier pages carry a
          // CREDENTIAL IN THE URL (/deal/{token}, /portal/{token},
          // /prices/{token}). Without a referrer policy, any outbound link
          // from those pages leaks the full path — i.e. the token — in the
          // Referer header to a third party. Nothing links out today, but
          // the day someone adds "view our terms" to a buyer page, that
          // would silently hand the deal link to another origin.
          // strict-origin-when-cross-origin sends only the ORIGIN
          // off-site, never the path.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

          // Uploaded logos are stored as received (only deal photos are
          // re-encoded), so a file that sniffs as HTML must never be
          // treated as HTML. This also satisfies the /uploads/* half of
          // gap #22 without depending on the reverse proxy.
          { key: "X-Content-Type-Options", value: "nosniff" },

          // Nothing here uses these; deny them so an injected iframe or
          // script can't either.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
