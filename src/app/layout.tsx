import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ScrapTrader - Private CRM for Scrap Metal Trading",
  description:
    "The private CRM and negotiating platform for scrap metal trading",
};

// Declared explicitly rather than relying on the framework default. This
// app is used on phones in a yard, and `viewport-fit=cover` matters for
// notched devices. Zoom is deliberately NOT disabled — people need to
// pinch into price tables.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* use-credentials is REQUIRED for the per-dealer manifest: without
            it the browser fetches /manifest.webmanifest with no cookies,
            getCurrentUser() returns null, and every yard silently gets the
            default ScrapTrader icon. */}
        <link
          rel="manifest"
          href="/manifest.webmanifest"
          crossOrigin="use-credentials"
        />
        {/* iOS ignores the manifest's display mode and reads these. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="default"
        />
      </head>
      {/* overflow-x-clip stops one wide element (a long table, an
          oversized control) from making the WHOLE page scroll sideways —
          which is what detaches a full-width header from the viewport and
          makes it look torn. Individual scroll containers still work. */}
      <body className="min-h-full flex flex-col overflow-x-clip">
        {children}
      </body>
    </html>
  );
}
