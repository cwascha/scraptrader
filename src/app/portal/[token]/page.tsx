"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { IconPackage } from "@/components/icons";
import { formatWeight } from "@/lib/deal-fields";
import { formatMessageTime } from "@/lib/time";
import { fetchJson } from "@/lib/fetch-json";

interface PortalDeal {
  title: string;
  numLoads: number;
  weightPerLoad: number;
  weightUnit: string;
  createdAt: string;
  biddingClosed: boolean;
  outcome: "open" | "won" | "lost";
  image: string | null;
  messages: number;
  dealToken: string;
}

interface PortalData {
  company: string;
  seller: string;
  branding: {
    logoUrl: string | null;
    brand: string | null;
    brandDark: string | null;
    accent: string | null;
    mode: string | null;
  };
  deals: PortalDeal[];
}

const BADGE: Record<PortalDeal["outcome"], { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-green-100 text-green-700" },
  won: { label: "✓ You won", cls: "bg-blue-100 text-blue-700" },
  lost: { label: "Closed", cls: "bg-slate-100 text-slate-600" },
};

function DealCard({ d }: { d: PortalDeal }) {
  const totalWeight = d.numLoads * d.weightPerLoad;
  const badge = BADGE[d.outcome];
  return (
    // min-w-0 on the grid item so long titles truncate instead of forcing
    // the page wider than a phone viewport.
    <Link
      href={`/deal/${d.dealToken}`}
      className="min-w-0 bg-white rounded-xl border border-slate-200 p-4 sm:p-5 hover:border-brand/30 hover:shadow-sm transition-all flex gap-4 sm:gap-5"
    >
      <div className="w-16 h-16 sm:w-20 sm:h-20 bg-slate-100 rounded-lg flex-shrink-0 overflow-hidden">
        {d.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.image} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400">
            <IconPackage size={24} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-800 truncate">{d.title}</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              {formatWeight(totalWeight)} {d.weightUnit} total · sent{" "}
              {formatMessageTime(d.createdAt)}
            </p>
          </div>
          <span
            className={`px-2.5 py-1 text-xs font-medium rounded-full flex-shrink-0 ${badge.cls}`}
          >
            {badge.label}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          {d.messages} message{d.messages === 1 ? "" : "s"}
        </p>
      </div>
    </Link>
  );
}

function DealSection({
  title,
  note,
  deals,
}: {
  title: string;
  note?: string;
  deals: PortalDeal[];
}) {
  if (deals.length === 0) return null;
  return (
    <section className="mb-8 last:mb-0">
      <h2 className="text-[11px] uppercase tracking-[0.1em] font-semibold text-slate-500 mb-1">
        {title}
        <span className="ml-2 text-slate-400 font-normal">{deals.length}</span>
      </h2>
      {note && <p className="text-xs text-slate-400 mb-3">{note}</p>}
      <div className={`grid gap-4${note ? "" : " mt-3"}`}>
        {deals.map((d) => (
          <DealCard key={d.dealToken} d={d} />
        ))}
      </div>
    </section>
  );
}

export default function PortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setData(await fetchJson<PortalData>(`/api/public/portal/${token}`));
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Logo className="justify-center mb-6" />
          <h1 className="text-2xl font-bold text-slate-800 mb-2">
            Portal Not Found
          </h1>
          <p className="text-slate-600">
            This link may have expired or is invalid.
          </p>
        </div>
      </div>
    );
  }

  const { company, branding, deals } = data;

  // Seller's white-label theme — same mechanism as the deal page.
  const themeStyle = branding.brand
    ? ({
        "--brand-primary": branding.brand,
        "--brand-dark": branding.brandDark ?? branding.brand,
        "--brand-secondary": branding.accent ?? "#e8a838",
      } as React.CSSProperties)
    : undefined;

  const darkClass = branding.mode === "dark" ? " theme-dark" : "";

  return (
    <div className={`min-h-screen bg-slate-50${darkClass}`} style={themeStyle}>
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoUrl}
              alt={company}
              className="h-8 sm:h-9 w-auto max-w-[150px] sm:max-w-[200px] object-contain"
            />
          ) : (
            <Logo />
          )}
          <span className="text-sm text-slate-500 truncate">{company}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">
          Your Deals from {company}
        </h1>
        <p className="text-sm text-slate-500 mb-6">
          Open a deal to view details, chat, and bid.
        </p>

        {deals.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <p className="text-slate-600">
              No deals yet — new deals from {company} will appear here.
            </p>
          </div>
        ) : (
          <>
            <DealSection
              title="Open"
              note="Accepting bids — newest first."
              deals={deals.filter((d) => d.outcome === "open")}
            />
            <DealSection
              title="Won"
              note="Your bid was accepted. Open the deal for the agreed price and next steps."
              deals={deals.filter((d) => d.outcome === "won")}
            />
            <DealSection
              title="Closed"
              note="Awarded to another buyer. Messaging stays open."
              deals={deals.filter((d) => d.outcome === "lost")}
            />
          </>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-4 mt-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center text-xs text-slate-400">
          Powered by ScrapTrader &mdash; The private CRM for scrap metal trading
        </div>
      </footer>
    </div>
  );
}
