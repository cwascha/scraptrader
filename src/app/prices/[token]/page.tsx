"use client";

import { useEffect, useState, use } from "react";
import { Logo } from "@/components/Logo";
import { fetchJson } from "@/lib/fetch-json";
import {
  OFFER_WEIGHT_UNITS,
  formatUsd,
  formatUnitPrice,
  formatComexBasis,
  governingPrice,
  lineValue,
} from "@/lib/price-sheet-defaults";
import { formatMessageTime } from "@/lib/time";

interface SheetItem {
  id: string;
  name: string;
  value: string;
  price: number | null;
  unit: string;
  weight: number | null;
  weightUnit: string;
  buyerPrice: number | null;
  dealerPrice: number | null;
}

interface SheetData {
  sheet: {
    title: string;
    comexBasis: number | null;
    headerNote: string | null;
    effectiveDate: string;
    expiresAt: string | null;
    deactivated: boolean;
    expired: boolean;
    company: string;
    seller: string;
    categories: { name: string; items: SheetItem[] }[];
  };
  response: {
    status: string;
    buyerNote: string | null;
    dealerNote: string | null;
    submittedAt: string;
    respondedAt: string | null;
    agreedTotal: number | null;
  } | null;
  branding: {
    logoUrl: string | null;
    brand: string | null;
    brandDark: string | null;
    accent: string | null;
    mode: string | null;
  };
}

interface ThreadMessage {
  id: string;
  senderType: string;
  senderName: string;
  content: string;
  createdAt: string;
}

const WEIGHT_UNITS = OFFER_WEIGHT_UNITS;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Local edit state per line — strings while typing so a half-entered
// "0." isn't coerced mid-keystroke.
interface Entry {
  weight: string;
  weightUnit: string;
  buyerPrice: string;
}

export default function PriceSheetOfferPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [data, setData] = useState<SheetData | null>(null);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [justSent, setJustSent] = useState(false);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [chatSending, setChatSending] = useState(false);
  // Once an offer exists, the sheet collapses to just the grades they
  // actually offered — 48 rows of empty inputs buries the handful that
  // matter. Expandable, because "I forgot the brass" is a normal revision.
  const [showAllGrades, setShowAllGrades] = useState(false);
  // Collapsed categories, by name. Default OPEN: a supplier arriving cold
  // needs to see what's on offer. Collapsing is for getting the six
  // categories you don't deal in out of the way.
  const [collapsedCats, setCollapsedCats] = useState<string[]>([]);

  function toggleCat(name: string) {
    setCollapsedCats((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }

  async function loadMessages() {
    try {
      const d = await fetchJson<{ messages: ThreadMessage[] }>(
        `/api/public/prices/${token}/messages`
      );
      setMessages(Array.isArray(d.messages) ? d.messages : []);
    } catch {
      // Keep what we have.
    }
  }

  async function sendChat() {
    if (!chatText.trim()) return;
    setChatSending(true);
    setError("");
    try {
      await fetchJson(`/api/public/prices/${token}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: chatText }),
      });
      setChatText("");
      await loadMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setChatSending(false);
    }
  }

  async function load() {
    const d = await fetchJson<SheetData>(`/api/public/prices/${token}`);
    setData(d);
    setNote(d.response?.buyerNote ?? "");
    const next: Record<string, Entry> = {};
    for (const cat of d.sheet.categories) {
      for (const item of cat.items) {
        next[item.id] = {
          weight: item.weight !== null ? String(item.weight) : "",
          weightUnit: item.weightUnit,
          buyerPrice: item.buyerPrice !== null ? String(item.buyerPrice) : "",
        };
      }
    }
    setEntries(next);
  }

  useEffect(() => {
    (async () => {
      try {
        await load();
        await loadMessages();
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Poll the thread so a counter or reply shows up without a refresh.
  useEffect(() => {
    const t = setInterval(() => {
      if (!document.hidden) void loadMessages();
    }, 10_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function update(itemId: string, patch: Partial<Entry>) {
    setEntries((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));
    setJustSent(false);
  }

  async function handleSubmit() {
    setError("");
    const lines = Object.entries(entries)
      .filter(([, e]) => e.weight.trim() !== "" && Number(e.weight) > 0)
      .map(([itemId, e]) => ({
        itemId,
        weight: e.weight,
        weightUnit: e.weightUnit,
        buyerPrice: e.buyerPrice,
      }));

    if (lines.length === 0) {
      setError("Enter a weight for at least one material.");
      return;
    }

    setSubmitting(true);
    try {
      await fetchJson(`/api/public/prices/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines, note }),
      });
      await load();
      setJustSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-500">Loading price sheet...</div>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Logo className="justify-center mb-6" />
          <h1 className="text-2xl font-bold text-slate-800 mb-2">
            Price Sheet Not Found
          </h1>
          <p className="text-slate-600">
            This link may have expired or is invalid.
          </p>
        </div>
      </div>
    );
  }

  const { sheet, response, branding } = data;
  const deactivated = sheet.deactivated;
  const expired = sheet.expired;
  const closed =
    response?.status === "accepted" ||
    response?.status === "declined" ||
    expired ||
    deactivated;
  const countered = response?.status === "countered";

  const themeStyle = branding.brand
    ? ({
        "--brand-primary": branding.brand,
        "--brand-dark": branding.brandDark ?? branding.brand,
        "--brand-secondary": branding.accent ?? "#e8a838",
      } as React.CSSProperties)
    : undefined;
  const darkClass = branding.mode === "dark" ? " theme-dark" : "";

  // Running total valued at whichever price governs each line (their ask
  // beats the yard's counter beats the quoted price). Every line whose
  // basis can be reconciled counts — ton- and kg-entered weights convert
  // to the quoted unit rather than being silently dropped.
  let estimate = 0;
  let valued = 0;
  let unvalued = 0;
  for (const cat of sheet.categories) {
    for (const item of cat.items) {
      const e = entries[item.id];
      const w = e ? Number.parseFloat(e.weight) : NaN;
      if (!Number.isFinite(w) || w <= 0) continue;
      const asked = e.buyerPrice ? Number.parseFloat(e.buyerPrice) : NaN;
      const price = Number.isFinite(asked)
        ? asked
        : governingPrice(item.price, null, item.dealerPrice);
      const v = lineValue(w, e.weightUnit, price, item.unit);
      if (v === null) unvalued++;
      else {
        estimate += v;
        valued++;
      }
    }
  }
  const hasEstimate = valued > 0;

  // A grade counts as "offered" if the SERVER has a weight for it, or the
  // supplier has typed one since. Checking the server value too means
  // clearing a field mid-edit doesn't make the row vanish underneath the
  // cursor.
  const isOffered = (item: SheetItem) =>
    item.weight !== null || (entries[item.id]?.weight ?? "").trim() !== "";

  const totalGrades = sheet.categories.reduce(
    (n, c) => n + c.items.length,
    0
  );
  const offeredGrades = sheet.categories.reduce(
    (n, c) => n + c.items.filter(isOffered).length,
    0
  );

  // Collapse only once they've actually submitted — before that they need
  // the full list to choose from.
  const collapsed = response !== null && !showAllGrades;
  const visibleCategories = collapsed
    ? sheet.categories
        .map((c) => ({ ...c, items: c.items.filter(isOffered) }))
        .filter((c) => c.items.length > 0)
    : sheet.categories;

  return (
    <div className={`min-h-screen bg-slate-50${darkClass}`} style={themeStyle}>
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoUrl}
              alt={sheet.company}
              className="h-9 w-auto max-w-[200px] object-contain"
            />
          ) : (
            <Logo />
          )}
          <span className="text-sm text-slate-500">{sheet.company}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">{sheet.title}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {sheet.company} &middot; effective {formatDate(sheet.effectiveDate)}
          </p>
          {(sheet.comexBasis !== null || sheet.headerNote) && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {sheet.comexBasis !== null && (
                <span className="data inline-block px-2.5 py-1 bg-white border border-slate-200 rounded-md text-sm font-semibold text-slate-800">
                  {formatComexBasis(sheet.comexBasis)}
                </span>
              )}
              {sheet.headerNote && (
                <span className="inline-block px-2.5 py-1 bg-white border border-slate-200 rounded-md text-sm text-slate-600">
                  {sheet.headerNote}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Status banners */}
        {deactivated && (
          <div className="mb-6 p-5 bg-white border border-slate-200 rounded-xl">
            <p className="text-lg font-semibold text-slate-800">
              These prices are no longer valid
            </p>
            <p className="text-slate-600 mt-1">
              Please contact {sheet.seller} @ {sheet.company} for updated
              prices.
            </p>
            <p className="text-xs text-slate-400 mt-2">
              Any conversation you already have with them is still open
              below.
            </p>
          </div>
        )}

        {expired && !deactivated && (
          <div className="mb-6 p-4 bg-slate-100 text-slate-700 rounded-xl text-sm">
            <p className="font-semibold">These prices have expired</p>
            <p className="mt-1 text-xs opacity-80">
              {sheet.expiresAt
                ? `This sheet lapsed on ${formatDate(sheet.expiresAt)}. `
                : ""}
              You can still see what was quoted, but new offers aren&apos;t
              accepted. Contact {sheet.seller} for a current sheet.
            </p>
          </div>
        )}

        {closed && !expired && !deactivated && (
          <div
            className={`mb-6 p-4 rounded-xl text-sm ${
              response?.status === "accepted"
                ? "bg-green-50 text-green-800"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            <p className="font-semibold">
              {response?.status === "accepted"
                ? "✓ Your offer was accepted"
                : "This offer was declined"}
            </p>
            {response?.dealerNote && (
              <p className="mt-1">{response.dealerNote}</p>
            )}
            {response?.agreedTotal !== null &&
              response?.agreedTotal !== undefined && (
                <p className="data mt-1 font-bold">
                  Agreed total: {formatUsd(response.agreedTotal)}
                </p>
              )}
            <p className="mt-1 text-xs opacity-80">
              Contact {sheet.seller} at {sheet.company} to arrange next steps.
            </p>
          </div>
        )}

        {countered && (
          <div className="mb-6 p-4 bg-amber-50 text-amber-900 rounded-xl text-sm">
            <p className="font-semibold">
              {sheet.company} countered your offer
            </p>
            {response?.dealerNote && (
              <p className="mt-1">{response.dealerNote}</p>
            )}
            <p className="mt-1 text-xs opacity-80">
              Their counter is shown against each grade below. Adjust and send
              again, or leave as-is to accept.
            </p>
          </div>
        )}

        {justSent && !closed && (
          <div className="mb-6 p-4 bg-green-50 text-green-800 rounded-xl text-sm">
            <p className="font-semibold">Sent to {sheet.company}</p>
            <p className="mt-1 text-xs opacity-80">
              They&apos;ll review and come back to you. You can revise and
              resend from this page any time until it&apos;s settled.
            </p>
          </div>
        )}

        {!response && !closed && (
          <div className="mb-6 p-4 bg-white border border-slate-200 rounded-xl text-sm text-slate-600">
            Enter the weight you have for any grade below. Leave the price
            blank to take {sheet.company}&apos;s quoted price, or name your own
            if you want more.
          </div>
        )}

        {/* Prices and the offer form are withheld entirely when the sheet
            is withdrawn — there is nothing here to quote against. */}
        {!deactivated && (
          <>
        {/* Toggle between "what I offered" and the full sheet. Only
            meaningful once something is hidden. */}
        {response !== null && totalGrades > offeredGrades && (
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <p className="text-sm text-slate-500">
              {collapsed
                ? `Showing the ${offeredGrades} grade${offeredGrades === 1 ? "" : "s"} you offered`
                : `Showing all ${totalGrades} grades`}
            </p>
            {!closed && (
              <button
                type="button"
                onClick={() => setShowAllGrades((v) => !v)}
                className="text-sm text-brand hover:text-brand-dark font-medium whitespace-nowrap"
              >
                {collapsed ? "Add another grade" : "Show only mine"}
              </button>
            )}
          </div>
        )}

        <div className="space-y-6">
          {visibleCategories.map((cat) => {
            const isCollapsed = collapsedCats.includes(cat.name);
            // How many grades in this category the supplier has filled in
            // — shown on the header so a collapsed category still tells
            // you whether your numbers are in there.
            const filled = cat.items.filter(
              (i) => (entries[i.id]?.weight ?? "").trim() !== ""
            ).length;
            return (
            <section
              key={cat.name}
              className="bg-white rounded-xl border border-slate-200 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggleCat(cat.name)}
                aria-expanded={!isCollapsed}
                className="w-full px-4 py-2.5 flex items-center gap-2 bg-brand text-white text-left hover:opacity-95 transition-opacity"
              >
                <span className="text-[10px] w-3 flex-shrink-0" aria-hidden="true">
                  {isCollapsed ? "▶" : "▼"}
                </span>
                <span className="text-[11px] uppercase tracking-[0.1em] font-semibold flex-1 min-w-0">
                  {cat.name}
                </span>
                <span className="flex items-center gap-2 flex-shrink-0">
                  {filled > 0 && (
                    <span className="data text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/25">
                      {filled}
                    </span>
                  )}
                  <span className="data text-[10px] opacity-75">
                    {cat.items.length}
                  </span>
                </span>
              </button>
              {!isCollapsed && (
              <div className="divide-y divide-slate-100">
                {cat.items.map((item) => {
                  const e = entries[item.id] ?? {
                    weight: "",
                    weightUnit: "lbs",
                    buyerPrice: "",
                  };
                  const active = e.weight.trim() !== "";
                  return (
                    <div
                      key={item.id}
                      // Active = they've entered a weight. Marked with the
                      // accent rail from the design language plus the
                      // REMAPPED bg-amber-50. Do not use an
                      // opacity-modified variant here (bg-amber-50/40):
                      // that's a different class, has no .theme-dark rule,
                      // and washes out to grey on a dark card.
                      className={`px-4 py-3 border-l-[3px] ${
                        active
                          ? "bg-amber-50 border-l-accent"
                          : "border-l-transparent"
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-3 mb-2">
                        <span className="text-sm font-medium text-slate-800">
                          {item.name}
                        </span>
                        <span className="data text-sm font-semibold text-slate-700 whitespace-nowrap">
                          {item.value}
                        </span>
                      </div>

                      {item.dealerPrice !== null && (
                        <p className="data text-xs text-amber-700 mb-2">
                          {sheet.company} counters at{" "}
                          {formatUnitPrice(item.dealerPrice)}/{item.unit}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="any"
                          value={e.weight}
                          onChange={(ev) =>
                            update(item.id, { weight: ev.target.value })
                          }
                          disabled={closed}
                          placeholder="Weight you have"
                          className="data w-36 px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand disabled:bg-slate-50"
                        />
                        <select
                          value={e.weightUnit}
                          onChange={(ev) =>
                            update(item.id, { weightUnit: ev.target.value })
                          }
                          disabled={closed}
                          className="px-2 py-1.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-brand disabled:bg-slate-50"
                        >
                          {WEIGHT_UNITS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                        <div className="relative w-32">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                            $
                          </span>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.001"
                            value={e.buyerPrice}
                            onChange={(ev) =>
                              update(item.id, { buyerPrice: ev.target.value })
                            }
                            disabled={closed}
                            placeholder="your price"
                            className="data w-full pl-5 pr-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand disabled:bg-slate-50"
                          />
                        </div>
                        <span className="text-xs text-slate-400">
                          /{item.unit} &mdash; blank = accept quoted
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              )}
            </section>
            );
          })}
        </div>

        {/* Submit panel */}
        <div className="mt-6 bg-white rounded-xl border border-slate-200 p-5 sticky bottom-4 shadow-sm">
          {hasEstimate && (
            <div className="mb-3 pb-3 border-b border-slate-100">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-slate-500">
                  Estimated total
                </span>
                <span className="data text-lg font-bold text-slate-800">
                  {formatUsd(estimate)}
                </span>
              </div>
              {unvalued > 0 && (
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Excludes {unvalued} line{unvalued === 1 ? "" : "s"} priced
                  per each.
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="mb-3 p-2 bg-red-50 text-red-700 text-sm rounded-lg">
              {error}
            </div>
          )}

          {!closed && (
            <>
              <textarea
                value={note}
                onChange={(ev) => {
                  setNote(ev.target.value);
                  setJustSent(false);
                }}
                rows={2}
                maxLength={1000}
                placeholder="Anything they should know — condition, when you can deliver, etc."
                className="w-full px-3 py-2 mb-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
              />
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full py-3 bg-accent text-brand-dark font-bold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {submitting
                  ? "Sending..."
                  : response
                    ? "Send Updated Offer"
                    : "Send to " + sheet.company}
              </button>
            </>
          )}
        </div>
          </>
        )}

        {/* Message thread — for everything the numbers can't carry.
            Stays open even after the offer is settled so logistics can be
            sorted out. */}
        <div className="mt-6 bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">
            Messages with {sheet.company}
          </h2>
          <div className="space-y-2 max-h-72 overflow-y-auto mb-3">
            {messages.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3">
                No messages yet. Ask a question about grading, pickup, or
                timing.
              </p>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.senderType === "buyer" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                      m.senderType === "buyer"
                        ? "bg-brand text-white"
                        : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    <p className="font-medium text-xs opacity-70 mb-0.5">
                      {m.senderName}
                    </p>
                    {m.content}
                    <p className="data text-[10px] opacity-60 mt-1 text-right">
                      {formatMessageTime(m.createdAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <input
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendChat();
              }}
              placeholder="Type a message..."
              className="flex-1 min-w-0 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
            />
            <button
              onClick={sendChat}
              disabled={chatSending}
              className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark transition-colors disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </main>

      <footer className="bg-white border-t border-slate-200 py-4 mt-12">
        <div className="max-w-3xl mx-auto px-6 text-center text-xs text-slate-400">
          Powered by ScrapTrader &mdash; The private CRM for scrap metal trading
        </div>
      </footer>
    </div>
  );
}
