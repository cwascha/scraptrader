"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Deal {
  id: string;
  title: string;
  metalType: string;
  recipients: {
    id: string;
    channel: string;
    status: string;
    accessToken: string;
    _count: { messages: number };
  }[];
}

export default function ConversationsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/deals")
      .then((r) => r.json())
      .then((data) => {
        setDeals(
          data.filter(
            (d: Deal) =>
              d.recipients.some((r) => r._count.messages > 0)
          )
        );
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Loading conversations...</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6">Conversations</h1>

      {deals.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="text-4xl mb-4">💬</div>
          <h2 className="text-xl font-semibold text-slate-800 mb-2">
            No conversations yet
          </h2>
          <p className="text-slate-600">
            Conversations will appear here once buyers respond to your deals.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {deals.map((deal) => (
            <Link
              key={deal.id}
              href={`/dashboard/deals/${deal.id}`}
              className="block bg-white rounded-xl border border-slate-200 p-5 hover:border-brand/30 hover:shadow-sm transition-all"
            >
              <h3 className="font-semibold text-slate-800">{deal.title}</h3>
              <p className="text-sm text-slate-500 mt-1">{deal.metalType}</p>
              <div className="flex gap-4 mt-3">
                {deal.recipients
                  .filter((r) => r._count.messages > 0)
                  .map((r) => (
                    <span
                      key={r.id}
                      className="text-xs bg-brand/10 text-brand px-2.5 py-1 rounded-full"
                    >
                      {r.channel} &middot; {r._count.messages} messages
                    </span>
                  ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
