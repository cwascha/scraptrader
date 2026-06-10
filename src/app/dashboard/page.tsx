"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Deal {
  id: string;
  title: string;
  metalType: string;
  quantity: string;
  unit: string;
  askingPrice: number | null;
  priceUnit: string;
  status: string;
  createdAt: string;
  images: { id: string; url: string }[];
  recipients: { id: string; status: string; _count: { messages: number } }[];
}

export default function DashboardPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/deals")
      .then((r) => r.json())
      .then((data) => {
        setDeals(data);
        setLoading(false);
      });
  }, []);

  const statusColors: Record<string, string> = {
    draft: "bg-slate-100 text-slate-700",
    published: "bg-green-100 text-green-700",
    closed: "bg-blue-100 text-blue-700",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Loading deals...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Your Deals</h1>
        <Link
          href="/dashboard/deals/new"
          className="px-5 py-2.5 bg-brand text-white font-medium rounded-lg hover:bg-brand-dark transition-colors"
        >
          + New Deal
        </Link>
      </div>

      {deals.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="text-4xl mb-4">📦</div>
          <h2 className="text-xl font-semibold text-slate-800 mb-2">
            No deals yet
          </h2>
          <p className="text-slate-600 mb-6">
            Create your first deal to start publishing to your contacts.
          </p>
          <Link
            href="/dashboard/deals/new"
            className="px-6 py-2.5 bg-brand text-white font-medium rounded-lg hover:bg-brand-dark transition-colors"
          >
            Create First Deal
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {deals.map((deal) => {
            const totalMessages = deal.recipients.reduce(
              (sum, r) => sum + r._count.messages,
              0
            );
            const viewedCount = deal.recipients.filter(
              (r) => r.status === "viewed"
            ).length;

            return (
              <Link
                key={deal.id}
                href={`/dashboard/deals/${deal.id}`}
                className="bg-white rounded-xl border border-slate-200 p-5 hover:border-brand/30 hover:shadow-sm transition-all flex gap-5"
              >
                <div className="w-20 h-20 bg-slate-100 rounded-lg flex-shrink-0 overflow-hidden">
                  {deal.images[0] ? (
                    <img
                      src={deal.images[0].url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400 text-2xl">
                      🏗️
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-slate-800 truncate">
                        {deal.title}
                      </h3>
                      <p className="text-sm text-slate-500 mt-0.5">
                        {deal.metalType} &middot; {deal.quantity} {deal.unit}
                        {deal.askingPrice
                          ? ` · $${deal.askingPrice.toFixed(2)} ${deal.priceUnit}`
                          : ""}
                      </p>
                    </div>
                    <span
                      className={`px-2.5 py-1 text-xs font-medium rounded-full ${statusColors[deal.status] || statusColors.draft}`}
                    >
                      {deal.status}
                    </span>
                  </div>
                  <div className="flex gap-4 mt-3 text-xs text-slate-500">
                    <span>{deal.recipients.length} recipients</span>
                    <span>{viewedCount} viewed</span>
                    <span>{totalMessages} messages</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
