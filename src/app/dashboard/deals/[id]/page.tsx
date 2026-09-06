"use client";

import { useEffect, useState, use, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { WEIGHT_UNITS, formatWeight } from "@/lib/deal-fields";
import { materialLabel } from "@/lib/materials";
import {
  convertPricePerUnit,
  formatBid,
  priceWithEquivalent,
  buildBidConfirmText,
} from "@/lib/bids";
import { formatMessageTime } from "@/lib/time";
import { fetchJson } from "@/lib/fetch-json";
import { IconCopy, IconCheck } from "@/components/icons";
import SendProgress from "@/components/SendProgress";

interface DealImage {
  id: string;
  url: string;
  filename: string;
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

interface Recipient {
  id: string;
  accessToken: string;
  channel: string;
  status: string;
  sentAt: string | null;
  viewedAt: string | null;
  ownerLastReadAt: string | null;
  contactName: string;
  messages: Message[];
  _count: { messages: number };
}

interface Deal {
  id: string;
  title: string;
  material: string;
  packaging: string;
  numLoads: number;
  weightPerLoad: number;
  weightUnit: string;
  shippingTypes: string;
  notes: string | null;
  pickupStreet: string | null;
  pickupCity: string | null;
  pickupState: string | null;
  pickupZip: string | null;
  portStreet: string | null;
  portCity: string | null;
  portState: string | null;
  portZip: string | null;
  askingPrice: number | null;
  priceUnit: string;
  location: string | null;
  status: string;
  acceptedPrice: number | null;
  acceptedUnit: string | null;
  acceptedRecipientId: string | null;
  acceptedAt: string | null;
  createdAt: string;
  images: DealImage[];
  recipients: Recipient[];
}

interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
}

interface Group {
  id: string;
  name: string;
  contactIds: string[];
}

interface PublishRecipientResult {
  contactName: string;
  dealLink: string;
  channel: string;
  status: string;
}

interface PublishResponse {
  recipients: PublishRecipientResult[];
  message?: string;
}

// A buyer bid, normalized to the deal's working unit for comparison.
interface ReceivedBid {
  contactName: string;
  bidAmount: number;
  bidUnit: string;
  inDealUnit: number;
  createdAt: string;
}

// Last bid (any sender) in a message list — used for the out-of-band
// warning and for the Accept button (a newer bid supersedes older ones).
function lastBidOf(messages: Message[]): Message | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.type === "bid" && m.bidAmount !== null && m.bidUnit) return m;
  }
  return null;
}

// Unread = buyer messages newer than the owner's read marker.
function unreadOf(r: Recipient): number {
  const lastReadMs = r.ownerLastReadAt
    ? new Date(r.ownerLastReadAt).getTime()
    : 0;
  return r.messages.filter(
    (m) =>
      m.senderType === "buyer" && new Date(m.createdAt).getTime() > lastReadMs
  ).length;
}

// Renders a text message, a bid bubble, or a centered system notice.
// Bids show the amount as entered plus the equivalent in the deal's
// working unit when different. `onAccept` (when provided) renders an
// Accept button inside the bid bubble.
function MessageBubble({
  msg,
  ownSenderType,
  dealUnit,
  onAccept,
}: {
  msg: Message;
  ownSenderType: "owner" | "buyer";
  dealUnit: string;
  onAccept?: () => void;
}) {
  if (msg.senderType === "system") {
    return (
      <div className="text-center">
        <span className="inline-block px-3 py-1.5 bg-slate-100 text-slate-500 text-xs rounded-full">
          {msg.content} · {formatMessageTime(msg.createdAt)}
        </span>
      </div>
    );
  }

  const isOwn = msg.senderType === ownSenderType;
  const isBid = msg.type === "bid" && msg.bidAmount !== null && msg.bidUnit;
  const converted =
    isBid && msg.bidUnit !== dealUnit
      ? convertPricePerUnit(msg.bidAmount as number, msg.bidUnit as string, dealUnit)
      : null;

  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
          isOwn ? "bg-brand text-white" : "bg-slate-100 text-slate-800"
        } ${isBid ? "ring-2 ring-accent" : ""}`}
      >
        <p className="font-medium text-xs opacity-70 mb-0.5">
          {msg.senderName}
          {isBid ? " · BID" : ""}
        </p>
        {isBid ? (
          <>
            <p className="data font-bold text-base">
              {formatBid(msg.bidAmount as number, msg.bidUnit as string)}
            </p>
            {converted !== null && (
              <p className="data text-xs opacity-80 mt-0.5">
                ≈ {formatBid(converted, dealUnit)}
              </p>
            )}
            {onAccept && (
              <button
                type="button"
                onClick={onAccept}
                className="mt-2 w-full px-3 py-1.5 bg-accent text-brand-dark text-xs font-bold rounded-lg hover:opacity-90 transition-opacity"
              >
                ✓ Accept Bid
              </button>
            )}
          </>
        ) : (
          <p>{msg.content}</p>
        )}
        <p className="data text-[10px] opacity-60 mt-1 text-right">
          {formatMessageTime(msg.createdAt)}
        </p>
      </div>
    </div>
  );
}

export default function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showPublish, setShowPublish] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>(["email"]);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [publishResult, setPublishResult] = useState<PublishResponse | null>(
    null
  );
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [chatError, setChatError] = useState("");
  const [acceptNotice, setAcceptNotice] = useState("");
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Reply composer: plain message or bid (counter-offer).
  const [composerMode, setComposerMode] = useState<"message" | "bid">(
    "message"
  );
  const [bidAmount, setBidAmount] = useState("");
  const [bidUnit, setBidUnit] = useState("");

  const pollBusy = useRef(false);
  const markingRead = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const [dealData, contactData, groupData] = await Promise.all([
          fetchJson<Deal>(`/api/deals/${id}`),
          fetchJson<Contact[]>("/api/contacts").catch(() => [] as Contact[]),
          fetchJson<Group[]>("/api/contact-groups").catch(
            () => [] as Group[]
          ),
        ]);
        setDeal(dealData);
        setContacts(Array.isArray(contactData) ? contactData : []);
        setGroups(Array.isArray(groupData) ? groupData : []);

        // Which conversation opens first: ?conversation= deep link (from
        // the inbox) wins; otherwise the most recently active thread.
        const wanted = new URLSearchParams(window.location.search).get(
          "conversation"
        );
        if (wanted && dealData.recipients.some((r) => r.id === wanted)) {
          setActiveConversation(wanted);
        } else {
          const withMsgs = dealData.recipients.filter(
            (r) => r.messages.length > 0
          );
          if (withMsgs.length > 0) {
            const latest = withMsgs.reduce((a, b) =>
              new Date(a.messages[a.messages.length - 1].createdAt) >
              new Date(b.messages[b.messages.length - 1].createdAt)
                ? a
                : b
            );
            setActiveConversation(latest.id);
          }
        }
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : "Failed to load this deal"
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Near-real-time conversations: poll every 5s while the tab is visible.
  useEffect(() => {
    const interval = setInterval(async () => {
      if (document.hidden || pollBusy.current) return;
      pollBusy.current = true;
      try {
        setDeal(await fetchJson<Deal>(`/api/deals/${id}`));
      } catch {
        // Transient failure — keep the current data; next tick retries.
      } finally {
        pollBusy.current = false;
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [id]);

  // Reading is what marks read: whenever the open conversation has unread
  // buyer messages (on expand OR when new ones arrive while open), push
  // the read marker. Optimistic local update; if the POST fails, the next
  // poll restores the unread state and this effect retries.
  useEffect(() => {
    if (!deal || !activeConversation || markingRead.current) return;
    const r = deal.recipients.find((x) => x.id === activeConversation);
    if (!r || unreadOf(r) === 0) return;

    markingRead.current = true;
    const now = new Date().toISOString();
    setDeal((prev) =>
      prev
        ? {
            ...prev,
            recipients: prev.recipients.map((x) =>
              x.id === r.id ? { ...x, ownerLastReadAt: now } : x
            ),
          }
        : prev
    );
    fetchJson(`/api/deals/${id}/mark-read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientId: r.id }),
    })
      .catch(() => {})
      .finally(() => {
        markingRead.current = false;
      });
  }, [deal, activeConversation, id]);

  const effectiveContactIds = Array.from(
    new Set([
      ...selectedContacts,
      ...groups
        .filter((g) => selectedGroups.includes(g.id))
        .flatMap((g) => g.contactIds),
    ])
  );

  async function refetchDeal() {
    try {
      setDeal(await fetchJson<Deal>(`/api/deals/${id}`));
    } catch {
      // Keep current data.
    }
  }

  async function handleCopyLink(r: Recipient) {
    const url = `${window.location.origin}/deal/${r.accessToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(r.id);
      setTimeout(() => setCopiedLink(null), 2000);
    } catch {
      window.prompt("Copy the deal link:", url);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    setPublishError("");
    try {
      const data = await fetchJson<PublishResponse>(
        `/api/deals/${id}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactIds: effectiveContactIds,
            channels: selectedChannels,
          }),
        }
      );
      setPublishResult(data);
      await refetchDeal();
    } catch (err) {
      setPublishError(
        err instanceof Error ? err.message : "Failed to publish"
      );
    } finally {
      setPublishing(false);
    }
  }

  async function handleReply(recipientId: string) {
    if (!replyText.trim()) return;
    setChatError("");
    try {
      await fetchJson(`/api/deals/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId, content: replyText }),
      });
      setReplyText("");
      await refetchDeal();
    } catch (err) {
      setChatError(
        err instanceof Error ? err.message : "Failed to send message"
      );
    }
  }

  async function handleSendBid(recipientId: string) {
    const amount = Number.parseFloat(bidAmount);
    if (!Number.isFinite(amount) || amount <= 0 || !deal) return;
    const unit = bidUnit || deal.weightUnit;

    // Fat-finger guard: confirm with the deal-unit equivalent, plus an
    // out-of-band warning vs the previous bid in this conversation.
    const recipient = deal.recipients.find((r) => r.id === recipientId);
    const prev = recipient ? lastBidOf(recipient.messages) : null;
    const confirmText = buildBidConfirmText(
      amount,
      unit,
      deal.weightUnit,
      prev ? { amount: prev.bidAmount as number, unit: prev.bidUnit as string } : null
    );
    if (!confirm(confirmText)) return;

    setChatError("");
    try {
      await fetchJson(`/api/deals/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientId,
          type: "bid",
          bidAmount: amount,
          bidUnit: unit,
        }),
      });
      setBidAmount("");
      await refetchDeal();
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Failed to send bid");
    }
  }

  async function handleAcceptBid(msg: Message) {
    if (!deal || msg.bidAmount === null || !msg.bidUnit) return;
    const priceText = priceWithEquivalent(
      msg.bidAmount,
      msg.bidUnit,
      deal.weightUnit
    );
    if (
      !confirm(
        `Accept this bid of ${priceText}?\n\nThis closes bidding on this deal — all other conversations will be notified. Messaging stays open.`
      )
    )
      return;

    setChatError("");
    setAcceptNotice("");
    try {
      const result = await fetchJson<{
        accepted: boolean;
        priceText: string;
        emailSent: boolean;
        emailError?: string;
      }>(`/api/deals/${id}/accept-bid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: msg.id }),
      });
      setAcceptNotice(
        result.emailSent
          ? `Bid accepted at ${result.priceText} — congrats email sent to the buyer.`
          : `Bid accepted at ${result.priceText}. Email not sent: ${result.emailError ?? "unknown reason"}`
      );
      await refetchDeal();
    } catch (err) {
      setChatError(
        err instanceof Error ? err.message : "Failed to accept the bid"
      );
      await refetchDeal(); // e.g. a newer bid arrived — refresh the view
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this deal? This cannot be undone.")) return;
    try {
      await fetchJson(`/api/deals/${id}`, { method: "DELETE" });
      router.push("/dashboard");
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Failed to delete the deal"
      );
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Loading deal...</div>
      </div>
    );
  }

  if (loadError || !deal) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
        <h2 className="text-xl font-semibold text-slate-800 mb-2">
          Couldn&apos;t load this deal
        </h2>
        <p className="text-slate-600 mb-6">
          {loadError || "Deal not found."}
        </p>
        <Link
          href="/dashboard"
          className="px-6 py-2.5 bg-brand text-white font-medium rounded-lg hover:bg-brand-dark transition-colors"
        >
          Back to Deals
        </Link>
      </div>
    );
  }

  const packagingList = deal.packaging.split(",").filter(Boolean);
  const shippingList = deal.shippingTypes.split(",").filter(Boolean);
  const totalWeight = deal.numLoads * deal.weightPerLoad;
  const effectiveBidUnit = bidUnit || deal.weightUnit;
  const isClosed = deal.status === "closed";

  // ---- Received-bid stats (buyer bids only, across ALL conversations) ----
  const receivedBids: ReceivedBid[] = deal.recipients.flatMap((r) =>
    r.messages
      .filter(
        (m) =>
          m.type === "bid" &&
          m.senderType === "buyer" &&
          m.bidAmount !== null &&
          m.bidUnit
      )
      .map((m) => ({
        contactName: r.contactName,
        bidAmount: m.bidAmount as number,
        bidUnit: m.bidUnit as string,
        inDealUnit:
          convertPricePerUnit(
            m.bidAmount as number,
            m.bidUnit as string,
            deal.weightUnit
          ) ?? 0,
        createdAt: m.createdAt,
      }))
  );
  const highestBid = receivedBids.reduce<ReceivedBid | null>(
    (best, b) => (best === null || b.inDealUnit > best.inDealUnit ? b : best),
    null
  );

  const acceptedRecipient = deal.acceptedRecipientId
    ? deal.recipients.find((r) => r.id === deal.acceptedRecipientId)
    : null;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/dashboard"
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          &larr; Deals
        </Link>
        <span className="text-slate-300">/</span>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">
          {deal.title}
        </h1>
        <span
          className={`ml-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] rounded ${
            deal.status === "published"
              ? "bg-green-100 text-green-700"
              : deal.status === "closed"
                ? "bg-blue-100 text-blue-700"
                : "bg-slate-100 text-slate-700"
          }`}
        >
          {deal.status}
        </span>
      </div>

      {acceptNotice && (
        <div className="mb-6 p-3 bg-green-50 text-green-700 text-sm rounded-lg">
          {acceptNotice}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Deal details card */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800">
                Deal Details
              </h2>
              <button
                onClick={handleDelete}
                className="btn-danger text-sm"
              >
                Delete
              </button>
            </div>

            {deal.images.length > 0 && (
              <div className="flex gap-3 mb-4 overflow-x-auto pb-2">
                {deal.images.map((img) => (
                  <img
                    key={img.id}
                    src={img.url}
                    alt=""
                    className="w-32 h-32 object-cover rounded-lg border border-slate-200 flex-shrink-0"
                  />
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500">Material</span>
                <p className="font-medium text-slate-800">
                  {materialLabel(deal.material)}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Packaging</span>
                <p className="font-medium text-slate-800">
                  {packagingList.join(", ") || "—"}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Loads</span>
                <p className="data font-medium text-slate-800">
                  {deal.numLoads} × {formatWeight(deal.weightPerLoad)}{" "}
                  {deal.weightUnit}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Total Weight</span>
                <p className="data font-medium text-slate-800">
                  {formatWeight(totalWeight)} {deal.weightUnit}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Shipping</span>
                <p className="font-medium text-slate-800">
                  {shippingList.join(" & ") || "—"}
                </p>
              </div>
              {deal.pickupStreet && (
                <div>
                  <span className="text-slate-500">Pickup Address (Yard)</span>
                  <p className="font-medium text-slate-800">
                    {deal.pickupStreet}, {deal.pickupCity}, {deal.pickupState}{" "}
                    {deal.pickupZip}
                  </p>
                </div>
              )}
              {deal.portStreet && (
                <div>
                  <span className="text-slate-500">Port Address (Export)</span>
                  <p className="font-medium text-slate-800">
                    {deal.portStreet}, {deal.portCity}, {deal.portState}{" "}
                    {deal.portZip}
                  </p>
                </div>
              )}
              {deal.location && (
                <div>
                  <span className="text-slate-500">Location</span>
                  <p className="font-medium text-slate-800">{deal.location}</p>
                </div>
              )}
            </div>
            {deal.notes && (
              <div className="mt-4">
                <span className="text-sm text-slate-500">Notes</span>
                <p className="text-slate-700 mt-1 whitespace-pre-wrap">
                  {deal.notes}
                </p>
              </div>
            )}
          </div>

          {/* Conversations */}
          {deal.recipients.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">
                Conversations ({deal.recipients.length})
              </h2>
              <div className="space-y-3">
                {deal.recipients.map((r) => {
                  const lastBid = lastBidOf(r.messages);
                  const unread = unreadOf(r);
                  return (
                    <div
                      key={r.id}
                      className="border border-slate-200 rounded-lg"
                    >
                      <button
                        onClick={() =>
                          setActiveConversation(
                            activeConversation === r.id ? null : r.id
                          )
                        }
                        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
                      >
                        <div>
                          <span className="font-medium text-slate-800">
                            {r.contactName}
                            {unread > 0 && (
                              <span className="data ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-white text-[10px] font-bold align-middle">
                                {unread}
                              </span>
                            )}
                            {isClosed &&
                              deal.acceptedRecipientId === r.id && (
                                <span className="ml-2 text-xs font-bold text-green-600">
                                  ✓ WINNER
                                </span>
                              )}
                          </span>
                          <div className="flex gap-3 text-xs text-slate-500 mt-0.5">
                            <span>via {r.channel}</span>
                            <span>
                              Status:{" "}
                              <span
                                className={
                                  r.status === "viewed"
                                    ? "text-green-600"
                                    : "text-slate-600"
                                }
                              >
                                {r.status}
                              </span>
                            </span>
                            <span className="data">
                              {r._count.messages} messages
                            </span>
                          </div>
                        </div>
                        <span className="text-slate-400">
                          {activeConversation === r.id ? "▲" : "▼"}
                        </span>
                      </button>

                      {activeConversation === r.id && (
                        <div className="border-t border-slate-200 p-4">
                          <div className="mb-3 p-2 bg-slate-50 rounded text-xs text-slate-500 flex items-center gap-2">
                            <span className="flex-shrink-0">Deal link:</span>
                            <code className="data bg-slate-200 px-1 rounded truncate flex-1 min-w-0">
                              {window.location.origin}/deal/{r.accessToken}
                            </code>
                            <button
                              type="button"
                              onClick={() => handleCopyLink(r)}
                              className={`flex items-center gap-1 flex-shrink-0 font-medium ${
                                copiedLink === r.id
                                  ? "text-green-600"
                                  : "text-brand hover:text-brand-dark"
                              }`}
                            >
                              {copiedLink === r.id ? (
                                <>
                                  <IconCheck size={13} /> Copied
                                </>
                              ) : (
                                <>
                                  <IconCopy size={13} /> Copy
                                </>
                              )}
                            </button>
                          </div>

                          <div className="space-y-3 max-h-80 overflow-y-auto mb-4">
                            {r.messages.length === 0 ? (
                              <p className="text-sm text-slate-500 text-center py-4">
                                No messages yet
                              </p>
                            ) : (
                              r.messages.map((msg) => (
                                <MessageBubble
                                  key={msg.id}
                                  msg={msg}
                                  ownSenderType="owner"
                                  dealUnit={deal.weightUnit}
                                  onAccept={
                                    !isClosed &&
                                    lastBid !== null &&
                                    msg.id === lastBid.id &&
                                    msg.senderType === "buyer"
                                      ? () => handleAcceptBid(msg)
                                      : undefined
                                  }
                                />
                              ))
                            )}
                          </div>

                          {chatError && (
                            <div className="mb-2 p-2 bg-red-50 text-red-700 text-xs rounded-lg">
                              {chatError}
                            </div>
                          )}

                          {/* Composer: message, or message-or-bid pre-close */}
                          {isClosed ? (
                            <p className="text-xs text-slate-400 mb-2">
                              Bidding closed — messaging is still open.
                            </p>
                          ) : (
                            <div className="flex gap-1 mb-2">
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

                          {isClosed || composerMode === "message" ? (
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleReply(r.id);
                                }}
                                placeholder="Type a reply..."
                                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
                              />
                              <button
                                onClick={() => handleReply(r.id)}
                                className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark transition-colors"
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
                                  onChange={(e) =>
                                    setBidAmount(e.target.value)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter")
                                      handleSendBid(r.id);
                                  }}
                                  placeholder="2.50"
                                  className="data w-full pl-6 pr-2 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
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
                                onClick={() => handleSendBid(r.id)}
                                className="px-4 py-2 bg-accent text-brand-dark rounded-lg text-sm font-bold hover:opacity-90 transition-opacity"
                              >
                                Bid
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Publish */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              Publish Deal
            </h2>

            {isClosed && !publishResult ? (
              <p className="text-sm text-slate-500">
                This deal is closed — a bid was accepted. Publishing is
                disabled.
              </p>
            ) : publishResult ? (
              <div>
                <div className="p-3 bg-green-50 text-green-700 text-sm rounded-lg mb-4">
                  {publishResult.message || "Deal published successfully!"}
                </div>

                {/* Live send progress. Publishing is asynchronous now, so
                    this is the only place a failed send surfaces — without
                    it the dealer is told "sending" and never learns what
                    happened. Refreshes the deal when draining finishes so
                    recipient statuses are current. */}
                <div className="mb-4">
                  <SendProgress
                    endpoint={`/api/deals/${id}/send-status`}
                    onSettled={() => {
                      void refetchDeal();
                    }}
                  />
                </div>

                <div className="space-y-3">
                  {publishResult.recipients.map((r, i) => (
                    <div
                      key={i}
                      className="p-3 bg-slate-50 rounded-lg text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-slate-800">
                          {r.contactName}
                        </p>
                        <span className="text-xs text-slate-400 flex-shrink-0">
                          {r.channel}
                        </span>
                      </div>
                      {/* Queued recipients are being emailed — only the
                          manual ones need a link to copy. */}
                      {r.status !== "queued" && (
                        <div className="mt-2">
                          <p className="text-xs text-slate-400 mb-1">
                            Share this link:
                          </p>
                          <input
                            readOnly
                            value={r.dealLink}
                            className="data w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs"
                            onClick={(e) =>
                              (e.target as HTMLInputElement).select()
                            }
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    setPublishResult(null);
                    setShowPublish(false);
                    setSelectedContacts([]);
                    setSelectedGroups([]);
                  }}
                  className="mt-4 w-full text-sm text-brand font-medium"
                >
                  Done
                </button>
              </div>
            ) : showPublish ? (
              <div>
                {publishError && (
                  <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg mb-4">
                    {publishError}
                  </div>
                )}

                {groups.length > 0 && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Groups
                    </label>
                    <div className="space-y-1">
                      {groups.map((g) => (
                        <label
                          key={g.id}
                          className="flex items-center gap-2 p-2 rounded hover:bg-slate-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedGroups.includes(g.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedGroups([...selectedGroups, g.id]);
                              } else {
                                setSelectedGroups(
                                  selectedGroups.filter((id) => id !== g.id)
                                );
                              }
                            }}
                            className="rounded border-slate-300"
                          />
                          <span className="text-sm text-slate-700">
                            {g.name}
                            <span className="text-slate-400 ml-1">
                              ({g.contactIds.length})
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {groups.length > 0 ? "Individual Contacts" : "Select Contacts"}
                  </label>
                  {contacts.length === 0 ? (
                    <div className="text-sm text-slate-500 p-3 bg-slate-50 rounded-lg">
                      No contacts yet.{" "}
                      <Link
                        href="/dashboard/contacts"
                        className="text-brand font-medium"
                      >
                        Add contacts
                      </Link>{" "}
                      first.
                    </div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {contacts.map((c) => (
                        <label
                          key={c.id}
                          className="flex items-center gap-2 p-2 rounded hover:bg-slate-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedContacts.includes(c.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedContacts([
                                  ...selectedContacts,
                                  c.id,
                                ]);
                              } else {
                                setSelectedContacts(
                                  selectedContacts.filter((id) => id !== c.id)
                                );
                              }
                            }}
                            className="rounded border-slate-300"
                          />
                          <div className="text-sm">
                            <p className="font-medium text-slate-700">
                              {c.name}
                            </p>
                            <p className="text-xs text-slate-400">
                              {[c.email, c.phone, c.whatsapp]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Channels
                  </label>
                  <div className="space-y-1">
                    {["email", "sms", "whatsapp"].map((ch) => (
                      <label
                        key={ch}
                        className="flex items-center gap-2 p-2 rounded hover:bg-slate-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedChannels.includes(ch)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedChannels([...selectedChannels, ch]);
                            } else {
                              setSelectedChannels(
                                selectedChannels.filter((c) => c !== ch)
                              );
                            }
                          }}
                          className="rounded border-slate-300"
                        />
                        <span className="text-sm text-slate-700 capitalize">
                          {ch === "sms" ? "SMS / Text" : ch}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    Each channel sends automatically once it&apos;s
                    configured; anything not configured yet just gives you a
                    link to share yourself.
                  </p>
                </div>

                <p className="text-xs text-slate-500 mb-3">
                  {effectiveContactIds.length} unique contact
                  {effectiveContactIds.length === 1 ? "" : "s"} selected
                  {selectedGroups.length > 0 && selectedContacts.length > 0
                    ? " (overlaps removed)"
                    : ""}
                </p>

                <div className="flex gap-2">
                  <button
                    onClick={handlePublish}
                    disabled={publishing || effectiveContactIds.length === 0}
                    className="flex-1 py-2.5 bg-brand text-white font-medium rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50 text-sm"
                  >
                    {publishing ? "Publishing..." : "Publish"}
                  </button>
                  <button
                    onClick={() => setShowPublish(false)}
                    className="px-4 py-2.5 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm text-slate-600 mb-4">
                  Send this deal to your contacts. They&apos;ll receive a link
                  to view details and start a conversation.
                </p>
                <button
                  onClick={() => setShowPublish(true)}
                  className="w-full py-2.5 bg-accent text-brand-dark font-bold rounded-lg hover:bg-[#d49730] transition-colors"
                >
                  Publish to Contacts
                </button>
              </div>
            )}
          </div>

          {/* Pricing — bid intelligence; accepted state once closed */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">
              Pricing
            </h3>

            <div className="space-y-3 text-sm">
              {isClosed && deal.acceptedPrice !== null && deal.acceptedUnit ? (
                <div className="p-3 bg-green-50 rounded-lg ring-1 ring-green-300">
                  <span className="text-xs font-medium text-green-700">
                    ✓ Accepted
                  </span>
                  <p className="data font-bold text-lg text-slate-800">
                    {priceWithEquivalent(
                      deal.acceptedPrice,
                      deal.acceptedUnit,
                      deal.weightUnit
                    )}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {acceptedRecipient ? (
                      <>
                        with{" "}
                        <span className="font-medium text-slate-700">
                          {acceptedRecipient.contactName}
                        </span>
                      </>
                    ) : (
                      "winner unknown"
                    )}
                    {deal.acceptedAt
                      ? ` · ${formatMessageTime(deal.acceptedAt)}`
                      : ""}
                  </p>
                </div>
              ) : highestBid ? (
                <div className="p-3 bg-slate-50 rounded-lg ring-1 ring-accent/60">
                  <span className="text-xs text-slate-500">Highest Bid</span>
                  <p className="data font-bold text-lg text-slate-800">
                    {formatBid(highestBid.inDealUnit, deal.weightUnit)}
                  </p>
                  {highestBid.bidUnit !== deal.weightUnit && (
                    <p className="data text-xs text-slate-500">
                      bid as{" "}
                      {formatBid(highestBid.bidAmount, highestBid.bidUnit)}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">
                    by{" "}
                    <span className="font-medium text-slate-700">
                      {highestBid.contactName}
                    </span>{" "}
                    · {formatMessageTime(highestBid.createdAt)}
                  </p>
                </div>
              ) : (
                <div className="flex justify-between">
                  <span className="text-slate-500">Highest Bid</span>
                  <span className="text-slate-400">No bids yet</span>
                </div>
              )}

              <div className="flex justify-between">
                <span className="text-slate-500">Total Bids Received</span>
                <span className="data font-medium">{receivedBids.length}</span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">
              Stats
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Recipients</span>
                <span className="data font-medium">
                  {deal.recipients.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Viewed</span>
                <span className="data font-medium">
                  {deal.recipients.filter((r) => r.viewedAt).length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Messages</span>
                <span className="data font-medium">
                  {deal.recipients.reduce(
                    (sum, r) => sum + r._count.messages,
                    0
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
