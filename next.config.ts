import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the dev server to be reached through a Cloudflare quick tunnel
  // (cloudflared assigns a random *.trycloudflare.com subdomain per run).
  // Dev-only setting — has no effect on production builds.
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
