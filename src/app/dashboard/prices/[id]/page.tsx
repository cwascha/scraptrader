"use client";

import { useEffect, useState, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { fetchJson } from "@/lib/fetch-json";
import {
  PRICE_UNITS,
  formatPrice,
  formatUsd,
  formatUnitPrice,
  governingPrice,
  lineValue,
  weightInPriceUnit,
  checkBasis,
  effectiveComexBasis,
  COMEX_LOOKUP_URL,
  type BasisCheck,
} from "@/lib/price-sheet-defaults";
import { formatMessageTime } from "@/lib/time";
import { IconCopy, IconCheck } from "@/components/icons";
import SendProgress from "@/components/SendProgress";

interface Item {
  id: string;
  category: string;
  name: string;
  price: number | null;
  priceNote: string | null;
  unit: string;
  sortOrder: number;
}

interface ResponseLine {
  id: string;
  itemName: string;
  sheetPrice: number | null;
  unit: string;
  weight: number;
  weightUnit: string;
  buyerPrice: number | null;
  dealerPrice: number | null;
}

interface SheetResponse {
  id: string;
  status: string;
  buyerNote: string | null;
  dealerNote: string | null;
  submittedAt: string;
  respondedAt: string | null;
  agreedTotal: number | null;
  lines: ResponseLine[];
}

interface ThreadMessage {
  id: string;
  senderType: string;
  senderName: string;
  content: string;
  createdAt: string;
}

interface SheetRecipient {
  id: string;
  channel: string;
  status: string;
  sentAt: string | null;
  viewedAt: string | null;
  accessToken: string;
  contactName: string;
  unreadCount: number;
  messages: ThreadMessage[];
  response: SheetResponse | null;
}

interface Sheet {
  id: string;
  title: string;
  comexBasis: number | null;
  headerNote: string | null;
  effectiveDate: string;
  expiresAt: string | null;
  status: string;
  publishedAt: string | null;
  items: Item[];
  recipients: SheetRecipient[];
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

interface PublishResult {
  message?: string;
  queued: number;
  recipients: {
    contactName: string;
    channel: string;
    status: string;
    sheetLink: string;
  }[];
}

// Editable row shape — prices are held as strings while typing so a
// half-entered "0." doesn't get coerced to a number mid-keystroke.
interface Row {
  key: string;
  category: string;
  name: string;
  price: string;
  priceNote: string;
  unit: string;
}

let rowSeq = 0;
const nextKey = () => `row-${rowSeq++}`;

export default function PriceSheetEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  // Deep link from the Conversations inbox: ?thread={recipientId}
  const searchParams = useSearchParams();
  const deepLinkThread = searchParams.get("thread");

  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [title, setTitle] = useState("");
  const [comexBasis, setComexBasis] = useState("");
  const [headerNote, setHeaderNote] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [chatText, setChatText] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Per-line counter prices being typed, keyed by response line id.
  const [counters, setCounters] = useState<Record<string, string>>({});
  // Collapsed categories in the price grid, by name. Default open —
  // collapsing is for focusing on the two categories you're repricing
  // today without scrolling past the other five.
  const [collapsedCats, setCollapsedCats] = useState<string[]>([]);

  function toggleCat(name: string) {
    setCollapsedCats((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }
  const [dealerNote, setDealerNote] = useState("");
  const [acting, setActing] = useState(false);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [showSend, setShowSend] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [channels, setChannels] = useState<string[]>(["email"]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, c, g] = await Promise.all([
          fetchJson<Sheet>(`/api/price-sheets/${id}`),
          fetchJson<Contact[]>("/api/contacts").catch(() => [] as Contact[]),
          fetchJson<Group[]>("/api/contact-groups").catch(() => [] as Group[]),
        ]);
        setSheet(s);
        setTitle(s.title);
        setComexBasis(s.comexBasis !== null ? String(s.comexBasis) : "");
        setHeaderNote(s.headerNote ?? "");
        setEffectiveDate(new Date(s.effectiveDate).toISOString().slice(0, 10));
        setExpiresAt(
          s.expiresAt ? new Date(s.expiresAt).toISOString().slice(0, 10) : ""
        );
        setRows(
          s.items.map((i) => ({
            key: nextKey(),
            category: i.category,
            name: i.name,
            price: i.price !== null ? String(i.price) : "",
            priceNote: i.priceNote ?? "",
            unit: i.unit,
          }))
        );
        setContacts(Array.isArray(c) ? c : []);
        setGroups(Array.isArray(g) ? g : []);
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : "Failed to load this sheet"
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const isPublished = sheet?.status === "published";
  const isDeactivated = sheet?.status === "deactivated";
  // Locked = sent, so the prices are frozen. Deactivated sheets stay
  // locked; withdrawing isn't editing.
  const isLocked = isPublished || isDeactivated;

  const effectiveContactIds = Array.from(
    new Set([
      ...selectedContacts,
      ...groups
        .filter((g) => selectedGroups.includes(g.id))
        .flatMap((g) => g.contactIds),
    ])
  );

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r))
    );
    setSaved(false);
  }

  function addRow(category: string) {
    setRows((prev) => {
      // Insert after the last row of that category so new lines land in
      // the right block rather than at the bottom of the sheet.
      const lastIdx = prev.map((r) => r.category).lastIndexOf(category);
      const row: Row = {
        key: nextKey(),
        category,
        name: "",
        price: "",
        priceNote: "",
        unit: "lb",
      };
      if (lastIdx === -1) return [...prev, row];
      const copy = [...prev];
      copy.splice(lastIdx + 1, 0, row);
      return copy;
    });
    setSaved(false);
  }

  // Returns false on failure so callers can abort. handleSend depends on
  // this: publishing after a failed save would send prices that differ
  // from what's on screen.
  async function handleSave(): Promise<boolean> {
    setSaving(true);
    setError("");
    try {
      await fetchJson(`/api/price-sheets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          comexBasis: comexBasis.trim() === "" ? "" : comexBasis,
          headerNote,
          effectiveDate: new Date(effectiveDate).toISOString(),
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : "",
          items: rows.map((r) => ({
            category: r.category,
            name: r.name,
            price: r.price,
            priceNote: r.priceNote,
            unit: r.unit,
          })),
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSend() {
    if (
      !confirm(
        isPublished
          ? `Send this sheet to ${effectiveContactIds.length} more contact(s)?`
          : `Send this price sheet to ${effectiveContactIds.length} contact(s)?\n\nPublishing LOCKS the prices — buyers keep this link, so it can't change afterward. To send new prices later, duplicate this sheet.`
      )
    )
      return;

    setSending(true);
    setError("");
    try {
      // Save first so what goes out matches what's on screen — and ABORT
      // if that save fails, rather than sending the last-saved prices.
      if (!isPublished) {
        const ok = await handleSave();
        if (!ok) return;
      }
      const data = await fetchJson<PublishResult>(
        `/api/price-sheets/${id}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactIds: effectiveContactIds,
            channels,
          }),
        }
      );
      setResult(data);
      setSheet(await fetchJson<Sheet>(`/api/price-sheets/${id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this price sheet? This cannot be undone.")) return;
    try {
      await fetchJson(`/api/price-sheets/${id}`, { method: "DELETE" });
      router.push("/dashboard/prices");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  async function handleCopy(id: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      window.prompt("Copy the link:", url);
    }
  }

  // Yard's move on a supplier's offer: counter specific lines, or settle it.
  async function handleRespond(
    responseId: string,
    action: "counter" | "accept" | "decline",
    lines?: ResponseLine[]
  ) {
    if (
      action !== "counter" &&
      !confirm(
        action === "accept"
          ? "Accept this offer at the current numbers? This closes the negotiation."
          : "Decline this offer? This closes the negotiation."
      )
    )
      return;

    setActing(true);
    setError("");
    try {
      await fetchJson(`/api/price-sheets/${id}/responses/${responseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          note: dealerNote,
          lines:
            action === "counter"
              ? (lines ?? []).map((l) => ({
                  id: l.id,
                  dealerPrice: counters[l.id] ?? "",
                }))
              : undefined,
        }),
      });
      setDealerNote("");
      setCounters({});
      setSheet(await fetchJson<Sheet>(`/api/price-sheets/${id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to respond");
    } finally {
      setActing(false);
    }
  }

  // Reading a thread clears its unread — same rule as deals.
  async function openAndMarkRead(recipientId: string, unread: number) {
    const next = openThread === recipientId ? null : recipientId;
    setOpenThread(next);
    if (next && unread > 0) {
      try {
        await fetchJson(`/api/price-sheets/${id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipientId, markRead: true }),
        });
        setSheet(await fetchJson<Sheet>(`/api/price-sheets/${id}`));
      } catch {
        // Best-effort; the next load re-syncs.
      }
    }
  }

  async function sendChat(recipientId: string) {
    if (!chatText.trim()) return;
    setError("");
    try {
      await fetchJson(`/api/price-sheets/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId, content: chatText }),
      });
      setChatText("");
      setSheet(await fetchJson<Sheet>(`/api/price-sheets/${id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    }
  }

  // Honor the inbox deep link once the sheet has loaded: open that thread
  // and clear its unread, the same contract the deal page's
  // ?conversation= link has.
  useEffect(() => {
    if (!sheet || !deepLinkThread) return;
    const target = sheet.recipients.find((r) => r.id === deepLinkThread);
    if (!target || openThread === deepLinkThread) return;
    void openAndMarkRead(deepLinkThread, target.unreadCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, deepLinkThread]);

  async function handleToggleActive() {
    const deactivating = !isDeactivated;
    if (
      !confirm(
        deactivating
          ? "Deactivate this price sheet?\n\nSuppliers following their link will see \"these prices are no longer valid\" instead of your prices, and can't submit new offers. Conversations already under way stay open."
          : "Reactivate this price sheet?\n\nYour prices become visible again and suppliers can submit offers against them."
      )
    )
      return;

    setError("");
    try {
      await fetchJson(`/api/price-sheets/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !deactivating }),
      });
      setSheet(await fetchJson<Sheet>(`/api/price-sheets/${id}`));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to change the status"
      );
    }
  }

  async function handleDuplicate() {
    try {
      const { id: newId } = await fetchJson<{ id: string }>(
        "/api/price-sheets",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ duplicateOf: id }),
        }
      );
      router.push(`/dashboard/prices/${newId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to duplicate");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Loading price sheet...</div>
      </div>
    );
  }

  if (loadError || !sheet) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
        <h2 className="text-xl font-semibold text-slate-800 mb-2">
          Couldn&apos;t load this price sheet
        </h2>
        <p className="text-slate-600 mb-6">{loadError || "Not found."}</p>
        <Link
          href="/dashboard/prices"
          className="px-6 py-2.5 bg-brand text-white font-medium rounded-lg hover:bg-brand-dark transition-colors"
        >
          Back to Buying Prices
        </Link>
      </div>
    );
  }

  // Categories in sheet order, each with its rows.
  const categories: string[] = [];
  for (const r of rows) {
    if (!categories.includes(r.category)) categories.push(r.category);
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Link
          href="/dashboard/prices"
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          &larr; Buying Prices
        </Link>
        <span className="text-slate-300">/</span>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">
          {title || "Price Sheet"}
        </h1>
        <span
          className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] rounded ${
            isDeactivated
              ? "bg-slate-200 text-slate-700"
              : isPublished
                ? "bg-green-100 text-green-700"
                : "bg-slate-100 text-slate-700"
          }`}
        >
          {sheet.status}
        </span>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Header fields */}
          {/* A published sheet is READ-ONLY FOREVER, so it renders as a
              document rather than a form full of disabled inputs. Disabled
              inputs imply "editable later", and their greyed styling is
              near-illegible under the dark-mode slate remap (gap #11). */}
          {isLocked ? (
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.1em] font-semibold text-slate-500">
                    Effective
                  </dt>
                  <dd className="data text-slate-800 mt-0.5">
                    {new Date(sheet.effectiveDate).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.1em] font-semibold text-slate-500">
                    Expires
                  </dt>
                  <dd className="data text-slate-800 mt-0.5">
                    {sheet.expiresAt
                      ? new Date(sheet.expiresAt).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })
                      : "\u2014"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.1em] font-semibold text-slate-500">
                    COMEX copper
                  </dt>
                  <dd className="data text-slate-800 mt-0.5">
                    {sheet.comexBasis !== null
                      ? `${formatUnitPrice(sheet.comexBasis)}/lb`
                      : "\u2014"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.1em] font-semibold text-slate-500">
                    Note
                  </dt>
                  <dd className="text-slate-800 mt-0.5">
                    {sheet.headerNote || "\u2014"}
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Title
                </label>
                <input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setSaved(false);
                  }}
                  disabled={isPublished}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Effective date
                </label>
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => {
                    setEffectiveDate(e.target.value);
                    setSaved(false);
                  }}
                  disabled={isPublished}
                  className="data w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Expires{" "}
                  <span className="font-normal text-slate-400">
                    &mdash; optional; after this, suppliers can view but not
                    submit
                  </span>
                </label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => {
                    setExpiresAt(e.target.value);
                    setSaved(false);
                  }}
                  disabled={isPublished}
                  className="data w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
              <div className="sm:col-span-2">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <label className="block text-sm font-medium text-slate-700">
                    COMEX copper{" "}
                    <span className="font-normal text-slate-400">
                      &mdash; $/lb this sheet is priced against
                    </span>
                  </label>
                  <a
                    href={COMEX_LOOKUP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-brand hover:text-brand-dark font-medium whitespace-nowrap"
                  >
                    Look up COMEX ↗
                  </a>
                </div>
                <div className="relative w-40">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                    $
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.001"
                    value={comexBasis}
                    onChange={(e) => {
                      setComexBasis(e.target.value);
                      setSaved(false);
                    }}
                    disabled={isPublished}
                    placeholder="6.350"
                    className="data w-full pl-6 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Shown on the sheet, and used to sanity-check your grade
                  prices below.
                </p>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Header note{" "}
                  <span className="font-normal text-slate-400">
                    &mdash; optional; terms or delivery info
                  </span>
                </label>
                <input
                  value={headerNote}
                  onChange={(e) => {
                    setHeaderNote(e.target.value);
                    setSaved(false);
                  }}
                  disabled={isPublished}
                  placeholder="Delivered to our yard"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
              </div>
            </div>
          )}

          {/* Staleness check: compares the grade prices against the basis
              the DEALER STATED, so it needs no market-data feed. Catches
              both directions — a sheet duplicated without repricing, and a
              basis updated without repricing the grades under it. */}
          {!isLocked &&
            (() => {
              const stated = effectiveComexBasis(
                comexBasis.trim() === "" ? null : Number.parseFloat(comexBasis),
                headerNote
              );
              if (stated === null) return null;
              const check: BasisCheck | null = checkBasis(
                rows.map((r) => ({
                  price: r.price ? Number.parseFloat(r.price) : null,
                  unit: r.unit,
                })),
                stated
              );
              if (!check || !check.stale) return null;
              const under = check.drift < 0;
              return (
                <div className="p-3 bg-amber-50 text-amber-900 text-sm rounded-lg">
                  <p className="font-semibold">
                    These prices look {under ? "low" : "high"} for a Comex of{" "}
                    {formatUnitPrice(check.live)}
                  </p>
                  <p className="mt-1 text-xs">
                    Your top per-pound line implies a basis around{" "}
                    <span className="data font-semibold">
                      {formatUnitPrice(check.implied)}
                    </span>{" "}
                    — about{" "}
                    <span className="data font-semibold">
                      {Math.abs(check.drift * 100).toFixed(0)}%
                    </span>{" "}
                    {under ? "below" : "above"} the Comex you entered. Either
                    the grades or the basis needs updating before you send
                    this.
                  </p>
                  <p className="mt-1 text-[11px] opacity-75">
                    Estimated from your highest per-lb grade, assuming bare
                    copper runs ~90% of Comex. Ignore it if your spreads
                    differ.
                  </p>
                </div>
              );
            })()}

          {isLocked && (
            <div
              className={`p-3 text-sm rounded-lg ${
                isDeactivated
                  ? "bg-slate-100 text-slate-700"
                  : "bg-blue-50 text-blue-800"
              }`}
            >
              {isDeactivated ? (
                <>
                  This sheet is <strong>deactivated</strong> &mdash; suppliers
                  following their link see &ldquo;these prices are no longer
                  valid&rdquo; instead of your prices, and can&apos;t submit
                  new offers. Conversations already under way stay open.
                </>
              ) : (
                <>
                  This sheet is published and locked &mdash; suppliers hold
                  this link, so the prices can&apos;t change.{" "}
                  <button
                    onClick={handleDuplicate}
                    className="font-semibold underline"
                  >
                    Duplicate it
                  </button>{" "}
                  to send new prices.
                </>
              )}
            </div>
          )}

          {/* Price rows, grouped by category */}
          {categories.map((cat) => {
            const isCollapsed = collapsedCats.includes(cat);
            const catRows = rows.filter((r) => r.category === cat);
            return (
            <div
              key={cat}
              className="bg-white rounded-lg border border-slate-200 overflow-hidden"
            >
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => toggleCat(cat)}
                  aria-expanded={!isCollapsed}
                  className="text-slate-400 hover:text-brand text-[10px] flex-shrink-0 w-4"
                  title={isCollapsed ? "Expand" : "Collapse"}
                >
                  {isCollapsed ? "▶" : "▼"}
                </button>
                {isLocked ? (
                  <span className="text-[11px] uppercase tracking-[0.1em] font-semibold text-slate-600 flex-1 min-w-0">
                    {cat}
                  </span>
                ) : (
                  <input
                    value={cat}
                    onChange={(e) => {
                      const next = e.target.value;
                      setRows((prev) =>
                        prev.map((r) =>
                          r.category === cat ? { ...r, category: next } : r
                        )
                      );
                      setSaved(false);
                    }}
                    className="text-[11px] uppercase tracking-[0.1em] font-semibold text-slate-600 bg-transparent border-none focus:outline-none focus:text-brand flex-1 min-w-0"
                  />
                )}
                <span className="data text-[10px] text-slate-400 flex-shrink-0">
                  {catRows.length}
                </span>
                {!isLocked && (
                  <button
                    onClick={() => addRow(cat)}
                    className="text-xs text-brand hover:text-brand-dark font-medium whitespace-nowrap flex-shrink-0"
                  >
                    + Line
                  </button>
                )}
              </div>
              {!isCollapsed && (
              <div className="divide-y divide-slate-100">
                {rows
                  .filter((r) => r.category === cat)
                  .map((r) =>
                    isLocked ? (
                      // Read-only line, rendered through the SAME formatter
                      // the supplier's page and the email use — so what the
                      // dealer reviews is literally what was sent.
                      <div
                        key={r.key}
                        className="px-4 py-2 flex items-baseline justify-between gap-3"
                      >
                        <span className="text-sm text-slate-700">
                          {r.name}
                        </span>
                        <span className="data text-sm font-semibold text-slate-800 whitespace-nowrap">
                          {formatPrice(
                            r.price ? Number.parseFloat(r.price) : null,
                            r.priceNote || null,
                            r.unit
                          )}
                        </span>
                      </div>
                    ) : (
                    <div
                      key={r.key}
                      className="px-4 py-2 flex items-center gap-2"
                    >
                      <input
                        value={r.name}
                        onChange={(e) =>
                          updateRow(r.key, { name: e.target.value })
                        }
                        disabled={isPublished}
                        placeholder="Material name"
                        className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-transparent hover:border-slate-200 focus:border-brand rounded focus:outline-none disabled:bg-transparent"
                      />
                      <div className="relative w-24 flex-shrink-0">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                          $
                        </span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.001"
                          value={r.price}
                          onChange={(e) =>
                            updateRow(r.key, {
                              price: e.target.value,
                              // A number wins over a note — they're
                              // mutually exclusive server-side too.
                              priceNote: e.target.value ? "" : r.priceNote,
                            })
                          }
                          disabled={isPublished}
                          placeholder="0.000"
                          className="data w-full pl-5 pr-1 py-1.5 text-sm text-right border border-slate-200 rounded focus:outline-none focus:border-brand disabled:bg-slate-50"
                        />
                      </div>
                      <select
                        value={r.unit}
                        onChange={(e) =>
                          updateRow(r.key, { unit: e.target.value })
                        }
                        disabled={isPublished}
                        className="w-20 flex-shrink-0 px-1 py-1.5 text-sm border border-slate-200 rounded bg-white focus:outline-none focus:border-brand disabled:bg-slate-50"
                      >
                        {PRICE_UNITS.map((u) => (
                          <option key={u} value={u}>
                            /{u}
                          </option>
                        ))}
                      </select>
                      {!r.price && (
                        <input
                          value={r.priceNote}
                          onChange={(e) =>
                            updateRow(r.key, { priceNote: e.target.value })
                          }
                          disabled={isPublished}
                          placeholder="or: Need Pics"
                          className="w-28 flex-shrink-0 px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:border-brand disabled:bg-slate-50"
                        />
                      )}
                      <button
                        onClick={() => {
                          setRows((prev) =>
                            prev.filter((x) => x.key !== r.key)
                          );
                          setSaved(false);
                        }}
                        className="text-red-400 hover:text-red-600 text-sm px-1 flex-shrink-0"
                        title="Remove line"
                      >
                        &times;
                      </button>
                    </div>
                    )
                  )}
              </div>
              )}
            </div>
            );
          })}

          {!isLocked && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const name = window.prompt("New category name:");
                  if (!name?.trim()) return;
                  setRows((prev) => [
                    ...prev,
                    {
                      key: nextKey(),
                      category: name.trim(),
                      name: "",
                      price: "",
                      priceNote: "",
                      unit: "lb",
                    },
                  ]);
                  setSaved(false);
                }}
                className="text-sm text-brand hover:text-brand-dark font-medium"
              >
                + Category
              </button>
              <span className="text-slate-300">|</span>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : saved ? "\u2713 Saved" : "Save draft"}
              </button>
              <button
                onClick={handleDelete}
                className="btn-danger text-sm ml-auto"
              >
                Delete
              </button>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Sheet status — withdrawing live prices is a real action, so it
              gets a real control rather than a link buried in a paragraph. */}
          {isLocked && (
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="text-sm font-semibold text-slate-800 mb-1">
                {isDeactivated ? "Deactivated" : "Live"}
              </h3>
              <p className="text-xs text-slate-500 mb-3">
                {isDeactivated
                  ? "Suppliers see a \u201cno longer valid\u201d notice instead of your prices."
                  : "Suppliers can view these prices and submit offers."}
              </p>
              {isDeactivated ? (
                <button
                  onClick={handleToggleActive}
                  className="w-full py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dark transition-colors"
                >
                  Reactivate sheet
                </button>
              ) : (
                <button
                  onClick={handleToggleActive}
                  className="btn-danger w-full justify-center py-2 text-sm"
                >
                  Deactivate sheet
                </button>
              )}
            </div>
          )}

          {/* Sending is withdrawn along with the prices — a deactivated
              sheet shouldn't reach anyone new. */}
          {!isDeactivated && (
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              {isPublished ? "Send to more contacts" : "Send Price Sheet"}
            </h2>

            {result ? (
              <div>
                <div className="p-3 bg-green-50 text-green-700 text-sm rounded-lg mb-4">
                  {result.message || "Price sheet sent."}
                </div>

                {/* Live send progress. Publishing is asynchronous, so this
                    is where a failure actually surfaces — nowhere else
                    reports it. Refreshes the sheet once draining ends so
                    the Sent To list shows final statuses. */}
                <div className="mb-4">
                  <SendProgress
                    endpoint={`/api/price-sheets/${id}/send-status`}
                    onSettled={() => {
                      void (async () => {
                        try {
                          setSheet(
                            await fetchJson<Sheet>(`/api/price-sheets/${id}`)
                          );
                        } catch {
                          // Non-fatal — the page still shows progress.
                        }
                      })();
                    }}
                  />
                </div>

                <div className="space-y-2 mb-4">
                  {result.recipients.map((r, i) => (
                    <div key={i} className="p-2 bg-slate-50 rounded text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-800">
                          {r.contactName}
                        </span>
                        <span className="text-xs text-slate-400 flex-shrink-0">
                          {r.channel}
                        </span>
                      </div>
                      {/* Only manual recipients need their link copied —
                          the rest are being emailed. */}
                      {r.status !== "queued" && (
                        <input
                          readOnly
                          value={r.sheetLink}
                          onClick={(e) =>
                            (e.target as HTMLInputElement).select()
                          }
                          className="data w-full mt-1 px-2 py-1 bg-white border border-slate-200 rounded text-[11px]"
                        />
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    setResult(null);
                    setShowSend(false);
                    setSelectedContacts([]);
                    setSelectedGroups([]);
                  }}
                  className="w-full text-sm text-brand font-medium"
                >
                  Done
                </button>
              </div>
            ) : showSend ? (
              <div>
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
                            onChange={(e) =>
                              setSelectedGroups(
                                e.target.checked
                                  ? [...selectedGroups, g.id]
                                  : selectedGroups.filter((x) => x !== g.id)
                              )
                            }
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
                    {groups.length > 0 ? "Individual Contacts" : "Contacts"}
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
                            onChange={(e) =>
                              setSelectedContacts(
                                e.target.checked
                                  ? [...selectedContacts, c.id]
                                  : selectedContacts.filter((x) => x !== c.id)
                              )
                            }
                            className="rounded border-slate-300"
                          />
                          <div className="text-sm min-w-0">
                            <p className="font-medium text-slate-700 truncate">
                              {c.name}
                            </p>
                            <p className="text-xs text-slate-400 truncate">
                              {[c.email, c.phone, c.whatsapp]
                                .filter(Boolean)
                                .join(" \u00b7 ")}
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
                          checked={channels.includes(ch)}
                          onChange={(e) =>
                            setChannels(
                              e.target.checked
                                ? [...channels, ch]
                                : channels.filter((x) => x !== ch)
                            )
                          }
                          className="rounded border-slate-300"
                        />
                        <span className="text-sm text-slate-700 capitalize">
                          {ch === "sms" ? "SMS / Text" : ch}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    Email includes the full price table. SMS and WhatsApp send
                    the link only.
                  </p>
                </div>

                <p className="text-xs text-slate-500 mb-3">
                  {effectiveContactIds.length} unique contact
                  {effectiveContactIds.length === 1 ? "" : "s"} selected
                </p>

                <div className="flex gap-2">
                  <button
                    onClick={handleSend}
                    disabled={
                      sending ||
                      effectiveContactIds.length === 0 ||
                      channels.length === 0
                    }
                    className="flex-1 py-2.5 bg-brand text-white font-medium rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50 text-sm"
                  >
                    {sending ? "Sending..." : "Send"}
                  </button>
                  <button
                    onClick={() => setShowSend(false)}
                    className="px-4 py-2.5 text-slate-600 rounded-lg hover:bg-slate-100 transition-colors text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm text-slate-600 mb-4">
                  {isPublished
                    ? "Already sent — you can still send this same sheet to more contacts."
                    : "Sending publishes the sheet and locks the prices."}
                </p>
                <button
                  onClick={() => setShowSend(true)}
                  className="w-full py-2.5 bg-accent text-brand-dark font-bold rounded-lg hover:bg-[#d49730] transition-colors"
                >
                  Choose Contacts
                </button>
              </div>
            )}
          </div>
          )}

          {/* Offers — supplier replies awaiting the yard's move */}
          {sheet.recipients.some((r) => r.response) && (
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">
                Offers Received
              </h3>
              <div className="space-y-4">
                {sheet.recipients
                  .filter((r) => r.response)
                  .map((r) => {
                    const resp = r.response!;
                    const open =
                      resp.status === "submitted" ||
                      resp.status === "countered";
                    return (
                      <div
                        key={r.id}
                        className="border border-slate-200 rounded-lg p-3"
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="font-medium text-slate-800 text-sm truncate">
                            {r.contactName}
                          </span>
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-[0.08em] px-2 py-0.5 rounded flex-shrink-0 ${
                              resp.status === "accepted"
                                ? "bg-green-100 text-green-700"
                                : resp.status === "declined"
                                  ? "bg-slate-100 text-slate-600"
                                  : resp.status === "countered"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {resp.status}
                          </span>
                        </div>

                        <div className="space-y-1.5 mb-2">
                          {resp.lines.map((l) => {
                            const price = governingPrice(
                              l.sheetPrice,
                              l.buyerPrice,
                              l.dealerPrice
                            );
                            const qty = weightInPriceUnit(
                              l.weight,
                              l.weightUnit,
                              l.unit
                            );
                            const value = lineValue(
                              l.weight,
                              l.weightUnit,
                              price,
                              l.unit
                            );
                            // Show the weight in the unit the PRICE is
                            // quoted in — "40 tons" next to "$3.99/lb"
                            // makes the reader do a 2,000× in their head.
                            const needsConversion =
                              qty !== null &&
                              l.weightUnit !== `${l.unit}s` &&
                              l.weightUnit !== l.unit;
                            return (
                              <div key={l.id} className="text-xs">
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="text-slate-700 truncate">
                                    {l.itemName}
                                  </span>
                                  <span className="data text-slate-800 font-medium whitespace-nowrap">
                                    {qty !== null
                                      ? `${qty.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${l.unit}`
                                      : `${l.weight.toLocaleString("en-US")} ${l.weightUnit}`}
                                  </span>
                                </div>
                                {needsConversion && (
                                  <p className="data text-[10px] text-slate-400">
                                    entered as{" "}
                                    {l.weight.toLocaleString("en-US")}{" "}
                                    {l.weightUnit}
                                  </p>
                                )}
                                <div className="flex items-baseline justify-between gap-2 text-[11px]">
                                  <span className="text-slate-400">
                                    sheet{" "}
                                    {l.sheetPrice !== null
                                      ? formatUnitPrice(l.sheetPrice)
                                      : "\u2014"}
                                  </span>
                                  <span
                                    className={`data ${l.buyerPrice !== null ? "text-amber-700 font-semibold" : "text-slate-400"}`}
                                  >
                                    {l.buyerPrice !== null
                                      ? `asks ${formatUnitPrice(l.buyerPrice)}`
                                      : "accepts quoted"}
                                  </span>
                                </div>
                                {value !== null && (
                                  <p className="data text-[11px] text-slate-600 text-right font-semibold">
                                    = {formatUsd(value)}
                                  </p>
                                )}
                                {open && (
                                  <div className="relative w-28 mt-1">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                                      $
                                    </span>
                                    <input
                                      type="number"
                                      inputMode="decimal"
                                      min={0}
                                      step="0.001"
                                      value={
                                        counters[l.id] ??
                                        (l.dealerPrice !== null
                                          ? String(l.dealerPrice)
                                          : "")
                                      }
                                      onChange={(e) =>
                                        setCounters((p) => ({
                                          ...p,
                                          [l.id]: e.target.value,
                                        }))
                                      }
                                      placeholder="counter"
                                      className="data w-full pl-5 pr-1 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-brand"
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Offer total, valued at whichever price governs
                            each line. Only shown when every line could be
                            valued — a partial sum labelled "total" is
                            worse than none. */}
                        {(() => {
                          const values = resp.lines.map((l) =>
                            lineValue(
                              l.weight,
                              l.weightUnit,
                              governingPrice(
                                l.sheetPrice,
                                l.buyerPrice,
                                l.dealerPrice
                              ),
                              l.unit
                            )
                          );
                          const allValued = values.every((v) => v !== null);
                          const sum = values.reduce<number>(
                            (a, v) => a + (v ?? 0),
                            0
                          );
                          const shown = resp.agreedTotal ?? (allValued ? sum : null);
                          return shown !== null ? (
                            <div className="flex items-baseline justify-between border-t border-slate-100 pt-1.5 mb-2">
                              <span className="text-[11px] text-slate-500">
                                {resp.agreedTotal !== null
                                  ? "Agreed total"
                                  : "Offer total"}
                              </span>
                              <span className="data text-sm font-bold text-slate-800">
                                {formatUsd(shown)}
                              </span>
                            </div>
                          ) : (
                            <p className="text-[10px] text-slate-400 mb-2">
                              No total — some lines are priced per each.
                            </p>
                          );
                        })()}

                        {resp.buyerNote && (
                          <p className="text-xs text-slate-600 bg-slate-50 rounded p-2 mb-2">
                            &ldquo;{resp.buyerNote}&rdquo;
                          </p>
                        )}

                        {open ? (
                          <>
                            <input
                              value={dealerNote}
                              onChange={(e) => setDealerNote(e.target.value)}
                              placeholder="Note back to them (optional)"
                              className="w-full px-2 py-1.5 mb-2 text-xs border border-slate-200 rounded focus:outline-none focus:border-brand"
                            />
                            <div className="flex gap-1.5">
                              <button
                                onClick={() =>
                                  handleRespond(resp.id, "counter", resp.lines)
                                }
                                disabled={acting}
                                className="flex-1 py-1.5 bg-accent text-brand-dark text-xs font-bold rounded hover:opacity-90 disabled:opacity-50"
                              >
                                Counter
                              </button>
                              <button
                                onClick={() => handleRespond(resp.id, "accept")}
                                disabled={acting}
                                className="flex-1 py-1.5 bg-brand text-white text-xs font-medium rounded hover:bg-brand-dark disabled:opacity-50"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => handleRespond(resp.id, "decline")}
                                disabled={acting}
                                className="btn-danger px-2 py-1.5 text-xs"
                              >
                                Decline
                              </button>
                            </div>
                          </>
                        ) : (
                          resp.dealerNote && (
                            <p className="text-xs text-slate-500">
                              You said: {resp.dealerNote}
                            </p>
                          )
                        )}

                        {/* Free-text thread — everything the numbers
                            can't carry. */}
                        <button
                          onClick={() => openAndMarkRead(r.id, r.unreadCount)}
                          className="mt-2 w-full flex items-center justify-between text-[11px] text-slate-500 hover:text-brand"
                        >
                          <span>
                            Messages ({r.messages.length})
                            {r.unreadCount > 0 && (
                              <span className="data ml-1.5 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-brand text-white text-[9px] font-bold">
                                {r.unreadCount}
                              </span>
                            )}
                          </span>
                          <span>{openThread === r.id ? "▲" : "▼"}</span>
                        </button>

                        {openThread === r.id && (
                          <div className="mt-2 border-t border-slate-100 pt-2">
                            <div className="space-y-1.5 max-h-48 overflow-y-auto mb-2">
                              {r.messages.length === 0 ? (
                                <p className="text-[11px] text-slate-400 text-center py-2">
                                  No messages yet.
                                </p>
                              ) : (
                                r.messages.map((m) => (
                                  <div
                                    key={m.id}
                                    className={`flex ${m.senderType === "owner" ? "justify-end" : "justify-start"}`}
                                  >
                                    <div
                                      className={`max-w-[85%] px-2 py-1.5 rounded text-[11px] whitespace-pre-wrap ${
                                        m.senderType === "owner"
                                          ? "bg-brand text-white"
                                          : "bg-slate-100 text-slate-800"
                                      }`}
                                    >
                                      <p className="font-medium opacity-70 mb-0.5">
                                        {m.senderName}
                                      </p>
                                      {m.content}
                                      <p className="data text-[9px] opacity-60 mt-0.5 text-right">
                                        {formatMessageTime(m.createdAt)}
                                      </p>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                            <div className="flex gap-1.5">
                              <input
                                value={chatText}
                                onChange={(e) => setChatText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") sendChat(r.id);
                                }}
                                placeholder="Message them..."
                                className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:border-brand"
                              />
                              <button
                                onClick={() => sendChat(r.id)}
                                className="px-3 py-1.5 bg-brand text-white text-xs font-medium rounded hover:bg-brand-dark"
                              >
                                Send
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Send log — each recipient has their OWN link */}
          {sheet.recipients.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">
                Sent To ({sheet.recipients.length})
              </h3>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {sheet.recipients.map((r) => {
                  const url =
                    typeof window !== "undefined"
                      ? `${window.location.origin}/prices/${r.accessToken}`
                      : "";
                  return (
                    <div key={r.id} className="text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-700 truncate">
                          {r.contactName}
                        </span>
                        <span className="text-xs text-slate-400 flex-shrink-0">
                          {r.channel}
                          {r.response
                            ? " \u00b7 replied"
                            : r.viewedAt
                              ? " \u00b7 viewed"
                              : r.status === "sent"
                                ? " \u00b7 sent"
                                : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <code className="data flex-1 min-w-0 truncate bg-slate-100 px-1.5 py-1 rounded text-[10px]">
                          {url}
                        </code>
                        <button
                          onClick={() => handleCopy(r.id, url)}
                          className={`flex-shrink-0 ${
                            copiedId === r.id
                              ? "text-green-600"
                              : "text-brand hover:text-brand-dark"
                          }`}
                          title="Copy this recipient's link"
                        >
                          {copiedId === r.id ? (
                            <IconCheck size={13} />
                          ) : (
                            <IconCopy size={13} />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Live preview of one formatted line, so the operator can see
              how "Need Pics" style entries will render. */}
          {!isPublished && rows.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-6">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">
                Preview
              </h3>
              <p className="text-xs text-slate-500 mb-2">
                First line renders as:
              </p>
              <p className="data text-sm font-semibold text-slate-800">
                {rows[0].name || "(unnamed)"} &mdash;{" "}
                {formatPrice(
                  rows[0].price ? Number.parseFloat(rows[0].price) : null,
                  rows[0].priceNote || null,
                  rows[0].unit
                )}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
