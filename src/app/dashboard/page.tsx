"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatWeight } from "@/lib/deal-fields";
import { LBS_PER_UNIT, priceWithEquivalent } from "@/lib/bids";
import { formatMessageTime } from "@/lib/time";
import { fetchJson } from "@/lib/fetch-json";
import { IconPlus, IconPackage } from "@/components/icons";

interface Deal {
  id: string;
  title: string;
  material: string;
  numLoads: number;
  weightPerLoad: number;
  weightUnit: string;
  shippingTypes: string;
  askingPrice: number | null;
  priceUnit: string;
  status: string;
  acceptedPrice: number | null;
  acceptedUnit: string | null;
  acceptedAt: string | null;
  createdAt: string;
  images: { id: string; url: string }[];
  recipients: {
    id: string;
    status: string;
    unreadCount?: number;
    _count: { messages: number };
  }[];
}

type SortKey = "newest" | "oldest" | "title" | "weight";

// Total weight normalized to lbs so deals in different units sort fairly
// (20 metric tons must outrank 30,000 lbs).
function totalLbs(d: Deal): number {
  return d.numLoads * d.weightPerLoad * (LBS_PER_UNIT[d.weightUnit] ?? 1);
}

// Sort a section. `dateOf` picks the section's meaningful date: created
// date for Active, closed (accepted) date for Closed.
function sortDeals(
  list: Deal[],
  key: SortKey,
  dateOf: (d: Deal) => string
): Deal[] {
  const arr = [...list];
  switch (key) {
    case "oldest":
      return arr.sort(
        (a, b) => new Date(dateOf(a)).getTime() - new Date(dateOf(b)).getTime()
      );
    case "title":
      return arr.sort((a, b) => a.title.localeCompare(b.title));
    case "weight":
      return arr.sort((a, b) => totalLbs(b) - totalLbs(a));
    case "newest":
    default:
      return arr.sort(
        (a, b) => new Date(dateOf(b)).getTime() - new Date(dateOf(a)).getTime()
      );
  }
}

function SortSelect({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (v: SortKey) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SortKey)}
      className="px-2 py-1 border border-slate-300 rounded-md text-xs bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
    >
      <option value="newest">Newest first</option>
      <option value="oldest">Oldest first</option>
      <option value="title">Title A–Z</option>
      <option value="weight">Heaviest first</option>
    </select>
  );
}

// Status is encoded structurally: a colored rail on the card's left edge,
// plus a stamped chip. Rail + chip always agree.
const statusRail: Record<string, string> = {
  draft: "border-l-slate-300",
  published: "border-l-green-500",
  closed: "border-l-blue-500",
};

const statusChip: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  published: "bg-green-100 text-green-700",
  closed: "bg-blue-100 text-blue-700",
};

function DealCard({ deal }: { deal: Deal }) {
  const totalMessages = deal.recipients.reduce(
    (sum, r) => sum + r._count.messages,
    0
  );
  const unread = deal.recipients.reduce(
    (sum, r) => sum + (r.unreadCount ?? 0),
    0
  );
  const viewedCount = deal.recipients.filter(
    (r) => r.status === "viewed"
  ).length;
  const totalWeight = deal.numLoads * deal.weightPerLoad;
  const shipping = deal.shippingTypes.split(",").filter(Boolean).join(" & ");
  const isClosed = deal.status === "closed";

  return (
    // min-w-0 matters: grid items default to min-width:auto, which blocks
    // shrinking below content width — without it, long titles force the
    // whole page wider than a phone viewport instead of truncating.
    <Link
      href={`/dashboard/deals/${deal.id}`}
      className={`min-w-0 bg-white rounded-lg border border-slate-200 border-l-[3px] ${
        statusRail[deal.status] ?? statusRail.draft
      } p-4 hover:border-brand/40 hover:shadow-sm transition-all flex gap-4`}
    >
      <div className="w-16 h-16 bg-slate-100 rounded-md flex-shrink-0 overflow-hidden">
        {deal.images[0] ? (
          <img
            src={deal.images[0].url}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400">
            <IconPackage size={22} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-800 truncate">
              {deal.title}
            </h3>
            <p className="data text-[13px] text-slate-500 mt-1">
              {formatWeight(totalWeight)} {deal.weightUnit}
              {shipping ? `  ·  ${shipping}` : ""}
            </p>
            {isClosed && deal.acceptedPrice !== null && deal.acceptedUnit && (
              <p className="data text-[13px] text-green-700 font-medium mt-1">
                ✓ {priceWithEquivalent(
                  deal.acceptedPrice,
                  deal.acceptedUnit,
                  deal.weightUnit
                )}
                {deal.acceptedAt
                  ? `  ·  ${formatMessageTime(deal.acceptedAt)}`
                  : ""}
              </p>
            )}
          </div>
          <span
            className={`flex-shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] rounded ${
              statusChip[deal.status] ?? statusChip.draft
            }`}
          >
            {deal.status}
          </span>
        </div>
        <p className="data text-[11px] text-slate-400 mt-2.5">
          {deal.recipients.length} sent  ·  {viewedCount} viewed  ·{" "}
          {totalMessages} msgs
          {unread > 0 && (
            <span className="text-brand font-bold">  ·  {unread} new</span>
          )}
        </p>
      </div>
    </Link>
  );
}

function SectionHeader({
  label,
  count,
  sort,
  onSort,
  showSort,
}: {
  label: string;
  count: number;
  sort: SortKey;
  onSort: (v: SortKey) => void;
  showSort: boolean;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label} <span className="data text-slate-400 ml-1">{count}</span>
      </h2>
      {showSort && <SortSelect value={sort} onChange={onSort} />}
    </div>
  );
}

export default function DashboardPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sortActive, setSortActive] = useState<SortKey>("newest");
  const [sortClosed, setSortClosed] = useState<SortKey>("newest");

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchJson<Deal[]>("/api/deals");
        setDeals(Array.isArray(data) ? data : []);
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : "Failed to load deals"
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Loading deals...</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
        <h2 className="text-xl font-semibold text-slate-800 mb-2">
          Couldn&apos;t load your deals
        </h2>
        <p className="text-slate-600 mb-6">{loadError}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2.5 bg-brand text-white font-medium rounded-lg hover:bg-brand-dark transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const activeDeals = sortDeals(
    deals.filter((d) => d.status !== "closed"),
    sortActive,
    (d) => d.createdAt
  );
  // Closed sorts by CLOSED date (acceptedAt); createdAt is only a
  // defensive fallback for rows that somehow lack a timestamp.
  const closedDeals = sortDeals(
    deals.filter((d) => d.status === "closed"),
    sortClosed,
    (d) => d.acceptedAt ?? d.createdAt
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">
          Deals
        </h1>
        <Link
          href="/dashboard/deals/new"
          className="flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark transition-colors flex-shrink-0"
        >
          <IconPlus size={16} />
          New Deal
        </Link>
      </div>

      {deals.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-10">
          <h2 className="text-lg font-semibold text-slate-800 mb-1">
            An empty board
          </h2>
          <p className="text-slate-600 mb-5">
            Create a deal, publish it to your buyers, and the bids land here.
          </p>
          <Link
            href="/dashboard/deals/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark transition-colors"
          >
            <IconPlus size={16} />
            Create your first deal
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Active */}
          <section>
            <SectionHeader
              label="Active"
              count={activeDeals.length}
              sort={sortActive}
              onSort={setSortActive}
              showSort={activeDeals.length > 1}
            />
            {activeDeals.length === 0 ? (
              <p className="text-sm text-slate-500 bg-white rounded-lg border border-slate-200 p-4">
                No active deals — every deal has closed.
              </p>
            ) : (
              <div className="grid gap-3">
                {activeDeals.map((deal) => (
                  <DealCard key={deal.id} deal={deal} />
                ))}
              </div>
            )}
          </section>

          {/* Closed — hidden until the first deal closes */}
          {closedDeals.length > 0 && (
            <section>
              <SectionHeader
                label="Closed"
                count={closedDeals.length}
                sort={sortClosed}
                onSort={setSortClosed}
                showSort={closedDeals.length > 1}
              />
              <div className="grid gap-3">
                {closedDeals.map((deal) => (
                  <DealCard key={deal.id} deal={deal} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
