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
  contactName: string;
  unreadCount: number;
  lastMessage: LastMessage | null;
}

interface Deal {
  id: string;
  title: string;
  status: string;
  recipients: Recipient[];
}

// One inbox row = one conversation. Two kinds share the list: a deal
// thread (deal × contact × channel) and a price-sheet negotiation
// (sheet × supplier × channel). They're merged rather than split across
// tabs because both are inbound work, and the nav badge counts both — a
// badge that leads to a page missing half its rows is worse than no badge.
interface Thread {
  kind: "deal" | "sheet";
  // Where the row links, and what it's about.
  href: string;
  parentTitle: string;
  key: string;
  contactName: string;
  unreadCount: number;
  lastMessage: LastMessage;
  // Deal: closed. Sheet: the negotiation's current state.
  chip: string | null;
  // Ball in the dealer's court. Unread covers most of it, but a
  // price-sheet offer you've READ and not answered still needs you —
  // that's the case an unread-only rule misses.
  needsYou: boolean;
}

interface SheetThread {
  sheetId: string;
  sheetTitle: string;
  recipientId: string;
  contactName: string;
  unreadCount: number;
  lastMessage: { senderType: string; content: string; createdAt: string };
  responseStatus: string | null;
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

function ThreadRow({ t }: { t: Thread }) {
  const p = preview(t.lastMessage);
  const hasUnread = t.unreadCount > 0;
  return (
    <Link
      href={t.href}
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
              · {t.parentTitle}
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
            {/* Which subsystem this row belongs to. Without it, a supplier
                offer and a buyer bid look identical in a merged list. */}
            {t.kind === "sheet" && (
              <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] rounded bg-slate-100 text-slate-600">
                price sheet
              </span>
            )}
            {t.chip && (
              <span
                className={`px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] rounded ${
                  t.chip === "needs reply"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-blue-100 text-blue-700"
                }`}
              >
                {t.chip}
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
}

function ThreadSection({
  title,
  threads,
}: {
  title: string;
  threads: Thread[];
}) {
  if (threads.length === 0) return null;
  return (
    <section className="mb-8 last:mb-0">
      <h2 className="text-[11px] uppercase tracking-[0.1em] font-semibold text-slate-500 mb-3">
        {title}
        <span className="ml-2 text-slate-400 font-normal">
          {threads.length}
        </span>
      </h2>
      <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100">
        {threads.map((t) => (
          <ThreadRow key={t.key} t={t} />
        ))}
      </div>
    </section>
  );
}

export default function ConversationsPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const pollBusy = useRef(false);

  async function load() {
    // Both sources in parallel; a failure in either shouldn't blank the
    // other half of the inbox.
    const [deals, sheets] = await Promise.all([
      fetchJson<Deal[]>("/api/deals").catch(() => [] as Deal[]),
      fetchJson<SheetThread[]>("/api/price-sheets/threads").catch(
        () => [] as SheetThread[]
      ),
    ]);

    const dealRows: Thread[] = (Array.isArray(deals) ? deals : []).flatMap(
      (d) =>
        d.recipients
          .filter((r) => r.lastMessage !== null)
          .map((r) => ({
            kind: "deal" as const,
            href: `/dashboard/deals/${d.id}?conversation=${r.id}`,
            parentTitle: d.title,
            key: `deal:${r.id}`,
            contactName: r.contactName,
            unreadCount: r.unreadCount,
            lastMessage: r.lastMessage as LastMessage,
            chip: d.status === "closed" ? "closed" : null,
            // Deals have no structural "pending decision" state — a bid
            // sits in the thread like any message — so unread is the
            // signal. Treating "last message was theirs" as needing a
            // reply would flag every "thanks".
            needsYou: r.unreadCount > 0,
          }))
    );

    const sheetRows: Thread[] = (Array.isArray(sheets) ? sheets : []).map(
      (s) => ({
        kind: "sheet" as const,
        href: `/dashboard/prices/${s.sheetId}?thread=${s.recipientId}`,
        parentTitle: s.sheetTitle,
        key: `sheet:${s.recipientId}`,
        contactName: s.contactName,
        unreadCount: s.unreadCount,
        lastMessage: {
          senderType: s.lastMessage.senderType,
          type: "message",
          content: s.lastMessage.content,
          bidAmount: null,
          bidUnit: null,
          createdAt: s.lastMessage.createdAt,
        },
        // "submitted" means the supplier has moved and the yard hasn't —
        // the state worth surfacing in a list you scan for work to do.
        chip:
          s.responseStatus === "submitted"
            ? "needs reply"
            : s.responseStatus === "accepted" ||
                s.responseStatus === "declined"
              ? s.responseStatus
              : null,
        // "submitted" is a pending decision, not just an unread message:
        // it stays in Needs you until the yard counters, accepts, or
        // declines — even after the thread has been opened.
        needsYou: s.unreadCount > 0 || s.responseStatus === "submitted",
      })
    );

    setThreads(
      [...dealRows, ...sheetRows].sort(
        (a, b) =>
          new Date(b.lastMessage.createdAt).getTime() -
          new Date(a.lastMessage.createdAt).getTime()
      )
    );
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
  const needsYou = threads.filter((t) => t.needsYou);
  const rest = threads.filter((t) => !t.needsYou);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">
          Conversations
        </h1>
        {needsYou.length > 0 && (
          <span className="data text-sm text-brand font-semibold">
            {needsYou.length} need{needsYou.length === 1 ? "s" : ""} you
            {unreadTotal > 0 && (
              <span className="text-slate-400 font-normal">
                {" "}
                · {unreadTotal} unread
              </span>
            )}
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
            Replies to published deals and offers on your price sheets both
            collect here.
          </p>
        </div>
      ) : (
        <>
          {/* Work queue first. "Needs you" = unread, or a supplier offer
              still awaiting your counter/accept/decline. Recency alone
              would let a six-figure offer sink below a chatty thread
              you've already read. */}
          <ThreadSection title="Needs you" threads={needsYou} />

          {needsYou.length === 0 && (
            <div className="mb-8 p-4 bg-white rounded-lg border border-slate-200 text-sm text-slate-600">
              You&apos;re all caught up — nothing is waiting on you.
            </div>
          )}

          <ThreadSection title="Everything else" threads={rest} />
        </>
      )}
    </div>
  );
}
