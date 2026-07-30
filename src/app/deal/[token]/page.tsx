"use client";

import { useEffect, useState, use, useRef } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { formatWeight, WEIGHT_UNITS } from "@/lib/deal-fields";
import {
  convertPricePerUnit,
  formatBid,
  priceWithEquivalent,
  buildBidConfirmText,
} from "@/lib/bids";
import { formatMessageTime } from "@/lib/time";
import { fetchJson } from "@/lib/fetch-json";

interface DealImage {
  id: string;
  url: string;
}

interface Message {
  id: string;
  senderType: string;
  senderName: string;
  type: string;
  content: string;
  bidAmount: number | null;
  bidUnit: string | null;
  createdAt: string;
}

interface MessagesResponse {
  biddingClosed: boolean;
  messages: Message[];
}

interface DealData {
  deal: {
    title: string;
    material: string;
    packaging: string[];
    numLoads: number;
    weightPerLoad: number;
    weightUnit: string;
    shippingTypes: string[];
    pickupCityState: string | null;
    portCityState: string | null;
    notes: string | null;
    askingPrice: number | null;
    priceUnit: string;
    location: string | null;
    images: DealImage[];
    company: string;
    seller: string;
    createdAt: string;
    biddingClosed: boolean;
  };
  branding: {
    logoUrl: string | null;
    brand: string | null;
    brandDark: string | null;
    accent: string | null;
    mode: string | null;
  };
  messages: Message[];
  recipientId: string;
  // Contact-level portal token — null if the contact was deleted.
  portalToken: string | null;
}

// Last bid (any sender) — used for the out-of-band warning and the
// Accept button (a newer bid supersedes older ones).
function lastBidOf(messages: Message[]): Message | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.type === "bid" && m.bidAmount !== null && m.bidUnit) return m;
  }
  return null;
}

export default function PublicDealPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [data, setData] = useState<DealData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [message, setMessage] = useState("");
  const [composerMode, setComposerMode] = useState<"message" | "bid">(
    "message"
  );
  const [bidAmount, setBidAmount] = useState("");
  const [bidUnit, setBidUnit] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessageCount = useRef(0);
  const pollBusy = useRef(false);

  function applyMessages(res: MessagesResponse) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            deal: { ...prev.deal, biddingClosed: res.biddingClosed },
            messages: Array.isArray(res.messages)
              ? res.messages
              : prev.messages,
          }
        : prev
    );
  }

  useEffect(() => {
    (async () => {
      try {
        setData(await fetchJson<DealData>(`/api/public/deal/${token}`));
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  // Near-real-time chat: poll for new messages every 5s while visible.
  // The poll also carries biddingClosed, so the bid composer disappears
  // live when the deal closes.
  useEffect(() => {
    const interval = setInterval(async () => {
      if (document.hidden || pollBusy.current) return;
      pollBusy.current = true;
      try {
        const res = await fetchJson<MessagesResponse>(
          `/api/public/deal/${token}/messages`
        );
        applyMessages(res);
      } catch {
        // Transient failure (network blip, rate limit) — next tick retries.
      } finally {
        pollBusy.current = false;
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [token]);

  // Auto-scroll only when NEW messages arrive — not on every poll, which
  // would yank the scroll position while someone is reading history.
  useEffect(() => {
    const count = data?.messages.length ?? 0;
    if (count > prevMessageCount.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessageCount.current = count;
  }, [data?.messages]);

  async function refreshMessages() {
    try {
      const res = await fetchJson<MessagesResponse>(
        `/api/public/deal/${token}/messages`
      );
      applyMessages(res);
    } catch {
      // Keep current messages.
    }
  }

  // The buyer's identity comes from the link itself (it was generated for
  // a specific contact) — no name entry, no client-supplied name.
  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    setSendError("");

    try {
      if (composerMode === "bid") {
        const amount = Number.parseFloat(bidAmount);
        if (!Number.isFinite(amount) || amount <= 0) return;
        const unit = bidUnit || data.deal.weightUnit;

        // Fat-finger guard: confirm with the deal-unit equivalent, plus an
        // out-of-band warning vs the previous bid in this conversation.
        const prev = lastBidOf(data.messages);
        const confirmText = buildBidConfirmText(
          amount,
          unit,
          data.deal.weightUnit,
          prev
            ? {
                amount: prev.bidAmount as number,
                unit: prev.bidUnit as string,
              }
            : null
        );
        if (!confirm(confirmText)) return;

        setSending(true);
        await fetchJson(`/api/public/deal/${token}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "bid",
            bidAmount: amount,
            bidUnit: unit,
          }),
        });
        setBidAmount("");
      } else {
        if (!message.trim()) return;
        setSending(true);
        await fetchJson(`/api/public/deal/${token}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: message }),
        });
        setMessage("");
      }
      await refreshMessages();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  async function handleAcceptBid(msg: Message) {
    if (!data || msg.bidAmount === null || !msg.bidUnit) return;
    const priceText = priceWithEquivalent(
      msg.bidAmount,
      msg.bidUnit,
      data.deal.weightUnit
    );
    if (
      !confirm(
        `Accept this bid of ${priceText}?\n\nThis finalizes the deal at this price.`
      )
    )
      return;

    setSendError("");
    try {
      await fetchJson(`/api/public/deal/${token}/accept-bid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: msg.id }),
      });
      // Full refetch: picks up biddingClosed + the acceptance system message.
      const fresh = await fetchJson<DealData>(`/api/public/deal/${token}`);
      setData(fresh);
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : "Failed to accept the bid"
      );
      await refreshMessages();
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-500">Loading deal...</div>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Logo className="justify-center mb-6" />
          <h1 className="text-2xl font-bold text-slate-800 mb-2">
            Deal Not Found
          </h1>
          <p className="text-slate-600">
            This deal link may have expired or is invalid.
          </p>
        </div>
      </div>
    );
  }

  const { deal, branding, messages, portalToken } = data;
  const totalWeight = deal.numLoads * deal.weightPerLoad;
  const effectiveBidUnit = bidUnit || deal.weightUnit;
  const lastBid = lastBidOf(messages);

  // City/state (never the full address) per shipping type.
  const shippingLocation: Record<string, string | null> = {
    Domestic: deal.pickupCityState,
    Export: deal.portCityState,
  };

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
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoUrl}
              alt={deal.company}
              className="h-9 w-auto max-w-[200px] object-contain"
            />
          ) : (
            <Logo />
          )}
          <span className="text-sm text-slate-500">
            Offer from {deal.company}
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {portalToken && (
          <Link
            href={`/portal/${portalToken}`}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand transition-colors mb-4"
          >
            <span aria-hidden="true">&larr;</span>
            All deals from {deal.company}
          </Link>
        )}
        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-6">
            {/* Deal info */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h1 className="text-2xl font-bold text-slate-800 mb-1">
                {deal.title}
              </h1>
              <p className="text-brand font-medium">{deal.company}</p>

              {deal.images.length > 0 && (
                <div className="mt-4">
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {deal.images.map((img) => (
                      <img
                        key={img.id}
                        src={img.url}
                        alt=""
                        className="w-40 h-40 object-cover rounded-lg border border-slate-200 flex-shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => setSelectedImage(img.url)}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 mt-6 text-sm">
                <div className="bg-slate-50 p-3 rounded-lg">
                  <span className="text-slate-500">Material</span>
                  <p className="font-semibold text-slate-800">
                    {deal.material}
                  </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <span className="text-slate-500">Quantity</span>
                  <p className="font-semibold text-slate-800">
                    {deal.numLoads} load{deal.numLoads === 1 ? "" : "s"} ×{" "}
                    {formatWeight(deal.weightPerLoad)} {deal.weightUnit}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {formatWeight(totalWeight)} {deal.weightUnit} total
                  </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <span className="text-slate-500">Packaging</span>
                  <p className="font-semibold text-slate-800">
                    {deal.packaging.join(", ") || "—"}
                  </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <span className="text-slate-500">Shipping</span>
                  {deal.shippingTypes.length === 0 ? (
                    <p className="font-semibold text-slate-800">—</p>
                  ) : (
                    deal.shippingTypes.map((t) => (
                      <p key={t} className="font-semibold text-slate-800">
                        {t}
                        {shippingLocation[t] && (
                          <span className="text-slate-500 font-normal">
                            {" "}
                            — {shippingLocation[t]}
                          </span>
                        )}
                      </p>
                    ))
                  )}
                </div>
                {deal.askingPrice !== null && (
                  <div className="bg-slate-50 p-3 rounded-lg">
                    <span className="text-slate-500">Asking Price</span>
                    <p className="font-semibold text-slate-800">
                      ${deal.askingPrice.toFixed(2)} {deal.priceUnit}
                    </p>
                  </div>
                )}
                {deal.location && (
                  <div className="bg-slate-50 p-3 rounded-lg">
                    <span className="text-slate-500">Location</span>
                    <p className="font-semibold text-slate-800">
                      {deal.location}
                    </p>
                  </div>
                )}
              </div>

              {deal.notes && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-slate-500 mb-2">
                    Notes
                  </h3>
                  <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {deal.notes}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Chat panel */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden sticky top-6">
              <div className="bg-brand text-white px-4 py-3">
                <h2 className="font-semibold">Chat with {deal.seller}</h2>
                <p className="text-xs text-white/80">
                  {deal.biddingClosed
                    ? "Bidding is closed — messaging is still open"
                    : "Ask questions, place bids, or confirm details"}
                </p>
              </div>

              <div className="h-80 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <div className="text-center text-slate-400 text-sm py-8">
                    <p>Start a conversation about this deal.</p>
                    <p className="mt-1 text-xs">
                      Ask about material condition, place a bid, or discuss
                      shipping.
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    if (msg.senderType === "system") {
                      return (
                        <div key={msg.id} className="text-center">
                          <span className="inline-block px-3 py-1.5 bg-slate-100 text-slate-500 text-xs rounded-full">
                            {msg.content} · {formatMessageTime(msg.createdAt)}
                          </span>
                        </div>
                      );
                    }

                    const isOwn = msg.senderType === "buyer";
                    const isBid =
                      msg.type === "bid" &&
                      msg.bidAmount !== null &&
                      msg.bidUnit;
                    const converted =
                      isBid && msg.bidUnit !== deal.weightUnit
                        ? convertPricePerUnit(
                            msg.bidAmount as number,
                            msg.bidUnit as string,
                            deal.weightUnit
                          )
                        : null;
                    const canAccept =
                      isBid &&
                      !deal.biddingClosed &&
                      lastBid !== null &&
                      msg.id === lastBid.id &&
                      msg.senderType === "owner";
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                            isOwn
                              ? "bg-brand text-white"
                              : "bg-slate-100 text-slate-800"
                          } ${isBid ? "ring-2 ring-accent" : ""}`}
                        >
                          <p className="font-medium text-xs opacity-70 mb-0.5">
                            {isOwn ? "You" : msg.senderName}
                            {isBid ? " · BID" : ""}
                          </p>
                          {isBid ? (
                            <>
                              <p className="font-bold text-base">
                                {formatBid(
                                  msg.bidAmount as number,
                                  msg.bidUnit as string
                                )}
                              </p>
                              {converted !== null && (
                                <p className="text-xs opacity-80 mt-0.5">
                                  ≈ {formatBid(converted, deal.weightUnit)}
                                </p>
                              )}
                              {canAccept && (
                                <button
                                  type="button"
                                  onClick={() => handleAcceptBid(msg)}
                                  className="mt-2 w-full px-3 py-1.5 bg-accent text-brand-dark text-xs font-bold rounded-lg hover:opacity-90 transition-opacity"
                                >
                                  ✓ Accept Bid
                                </button>
                              )}
                            </>
                          ) : (
                            <p>{msg.content}</p>
                          )}
                          <p className="text-[10px] opacity-60 mt-1 text-right">
                            {formatMessageTime(msg.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <form
                onSubmit={handleSend}
                className="border-t border-slate-200 p-4 space-y-2"
              >
                {sendError && (
                  <div className="p-2 bg-red-50 text-red-700 text-xs rounded-lg">
                    {sendError}
                  </div>
                )}

                {deal.biddingClosed ? (
                  <p className="text-xs text-slate-400">
                    Bidding closed — messaging is still open.
                  </p>
                ) : (
                  <div className="flex gap-1">
                    {(["message", "bid"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setComposerMode(m)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          composerMode === m
                            ? "bg-brand text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {m === "message" ? "Message" : "$ Bid"}
                      </button>
                    ))}
                  </div>
                )}

                {deal.biddingClosed || composerMode === "message" ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
                      required
                    />
                    <button
                      type="submit"
                      disabled={sending}
                      className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark transition-colors disabled:opacity-50"
                    >
                      Send
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                        $
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="0.0001"
                        value={bidAmount}
                        onChange={(e) => setBidAmount(e.target.value)}
                        placeholder="2.50"
                        className="w-full pl-6 pr-2 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
                        required
                      />
                    </div>
                    <select
                      value={effectiveBidUnit}
                      onChange={(e) => setBidUnit(e.target.value)}
                      className="px-2 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
                    >
                      {WEIGHT_UNITS.map((u) => (
                        <option key={u} value={u}>
                          per {u}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      disabled={sending}
                      className="px-4 py-2 bg-accent text-brand-dark rounded-lg text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      Bid
                    </button>
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      </main>

      {/* Image lightbox */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8"
          onClick={() => setSelectedImage(null)}
        >
          <img
            src={selectedImage}
            alt=""
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      )}

      <footer className="bg-white border-t border-slate-200 py-4 mt-12">
        <div className="max-w-4xl mx-auto px-6 text-center text-xs text-slate-400">
          Powered by ScrapTrader &mdash; The private CRM for scrap metal trading
        </div>
      </footer>
    </div>
  );
}
