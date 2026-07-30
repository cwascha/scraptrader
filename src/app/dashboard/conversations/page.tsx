"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fetchJson } from "@/lib/fetch-json";
import { formatBid } from "@/lib/bids";
import { formatMessageTime } from "@/lib/time";
import { IconChat } from "@/components/icons";

interface LastMessage {
  senderType: string;
  type: string;
  content: string;
  bidAmount: number | null;
  bidUnit: string | null;
  createdAt: string;
}

interface Recipient {
  id: string;
  channel: string;
  status: string;
  contactName: string;
  unreadCount: number;
  lastMessage: LastMessage | null;
  _count: { messages: number };
}

interface Deal {
  id: string;
  title: string;
  status: string;
  recipients: Recipient[];
}

// One inbox row = one conversation (deal × contact × channel).
interface Thread {
  dealId: string;
  dealTitle: string;
  dealClosed: boolean;
  recipientId: string;
  contactName: string;
  channel: string;
  unreadCount: number;
  lastMessage: LastMessage;
}

function preview(m: LastMessage): { text: string; isBid: boolean } {
  const prefix =
    m.senderType === "owner" ? "You: " : m.senderType === "system" ? "" : "";
  if (m.type === "bid" && m.bidAmount !== null && m.bidUnit) {
    return {
      text: `${prefix}BID ${formatBid(m.bidAmount, m.bidUnit)}`,
      isBid: true,
    };
  }
  return { text: `${prefix}${m.content}`, isBid: false };
}

export default function ConversationsPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const pollBusy = useRef(false);

  async function load() {
    const data = await fetchJson<Deal[]>("/api/deals");
    const rows: Thread[] = (Array.isArray(data) ? data : [])
      .flatMap((d) =>
        d.recipients
          .filter((r) => r.lastMessage !== null)
          .map((r) => ({
            dealId: d.id,
            dealTitle: d.title,
            dealClosed: d.status === "closed",
            recipientId: r.id,
            contactName: r.contactName,
            channel: r.channel,
            unreadCount: r.unreadCount,
            lastMessage: r.lastMessage as LastMessage,
          }))
      )
      .sort(
        (a, b) =>
          new Date(b.lastMessage.createdAt).getTime() -
          new Date(a.lastMessage.createdAt).getTime()
      );
    setThreads(rows);
  }

  useEffect(() => {
    (async () => {
      try {
        await load();
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : "Failed to load conversations"
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Keep the inbox current: refresh every 15s while the tab is visible.
  useEffect(() => {
    const interval = setInterval(async () => {
      if (document.hidden || pollBusy.current) return;
      pollBusy.current = true;
      try {
        await load();
      } catch {
        // Keep current data.
      } finally {
        pollBusy.current = false;
      }
    }, 15_000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Loading conversations...</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
        <h2 className="text-xl font-semibold text-slate-800 mb-2">
          Couldn&apos;t load conversations
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

  const unreadTotal = threads.reduce((s, t) => s + t.unreadCount, 0);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">
          Conversations
        </h1>
        {unreadTotal > 0 && (
          <span className="data text-sm text-brand font-semibold">
            {unreadTotal} unread
          </span>
        )}
      </div>

      {threads.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-10">
          <div className="text-slate-400 mb-3">
            <IconChat size={24} />
          </div>
          <h2 className="text-lg font-semibold text-slate-800 mb-1">
            No conversations yet
          </h2>
          <p className="text-slate-600">
            When buyers reply to a published deal, the threads collect here.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
          {threads.map((t) => {
            const p = preview(t.lastMessage);
            const hasUnread = t.unreadCount > 0;
            return (
              <Link
                key={t.recipientId}
                href={`/dashboard/deals/${t.dealId}?conversation=${t.recipientId}`}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors"
              >
                {/* Unread marker column — keeps rows aligned */}
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    hasUnread ? "bg-brand" : "bg-transparent"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-4">
                    <p
                      className={`truncate ${
                        hasUnread
                          ? "font-semibold text-slate-800"
                          : "font-medium text-slate-700"
                      }`}
                    >
                      {t.contactName}
                      <span className="text-slate-400 font-normal">
                        {" "}
                        · {t.dealTitle}
                      </span>
                    </p>
                    <span className="data text-[11px] text-slate-400 flex-shrink-0">
                      {formatMessageTime(t.lastMessage.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 mt-0.5">
                    <p
                      className={`text-sm truncate ${
                        p.isBid
                          ? "data font-medium text-slate-700"
                          : hasUnread
                            ? "text-slate-700"
                            : "text-slate-500"
                      }`}
                    >
                      {p.text}
                    </p>
                    <span className="flex items-center gap-2 flex-shrink-0">
                      {t.dealClosed && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] rounded bg-blue-100 text-blue-700">
                          closed
                        </span>
                      )}
                      {hasUnread && (
                        <span className="data inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-white text-[10px] font-bold">
                          {t.unreadCount}
                        </span>
                      )}
                    </span>
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
