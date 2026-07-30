"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchJson } from "@/lib/fetch-json";

interface SheetSummary {
  id: string;
  title: string;
  headerNote: string | null;
  effectiveDate: string;
  status: string;
  publishedAt: string | null;
  responseCount: number;
  awaitingYou: number;
  _count: { items: number; recipients: number };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function PriceSheetsPage() {
  const router = useRouter();
  const [sheets, setSheets] = useState<SheetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const data = await fetchJson<SheetSummary[]>("/api/price-sheets");
      setSheets(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load price sheets"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // New sheets are seeded from the most recent one (or the starter
  // template on the very first) — prices move daily, the line items don't.
  async function handleNew(duplicateOf?: string) {
    setCreating(true);
    setError("");
    try {
      const { id } = await fetchJson<{ id: string }>("/api/price-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(duplicateOf ? { duplicateOf } : {}),
      });
      router.push(`/dashboard/prices/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create a sheet");
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Loading price sheets...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">
            Buying Prices
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            What you&apos;ll pay per material. Suppliers reply with what they
            have and what they want for it.
          </p>
        </div>
        <button
          onClick={() => handleNew()}
          disabled={creating}
          className="px-5 py-2.5 bg-accent text-brand-dark font-bold rounded-lg hover:bg-[#d49730] transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {creating ? "Creating..." : "New Price Sheet"}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      {sheets.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
          <h2 className="text-lg font-semibold text-slate-800 mb-2">
            No price sheets yet
          </h2>
          <p className="text-slate-600 mb-6 max-w-md mx-auto">
            Your first sheet starts pre-filled with a standard grade list so
            you only have to set the numbers. After that, each new sheet
            copies the last one.
          </p>
          <button
            onClick={() => handleNew()}
            disabled={creating}
            className="px-6 py-2.5 bg-brand text-white font-medium rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50"
          >
            Create your first sheet
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sheets.map((s) => (
            <div
              key={s.id}
              className="bg-white rounded-lg border border-slate-200 p-4 flex items-center justify-between gap-4"
            >
              <Link href={`/dashboard/prices/${s.id}`} className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-800">
                    {s.title}
                  </span>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] rounded ${
                      s.status === "published"
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {s.status}
                  </span>
                  {s.headerNote && (
                    <span className="data text-xs text-slate-500">
                      {s.headerNote}
                    </span>
                  )}
                  {s.awaitingYou > 0 && (
                    <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] rounded bg-amber-100 text-amber-800">
                      {s.awaitingYou} awaiting you
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Effective {formatDate(s.effectiveDate)} &middot;{" "}
                  {s._count.items} line{s._count.items === 1 ? "" : "s"}
                  {s.status === "published" && (
                    <>
                      {" "}
                      &middot; sent to {s._count.recipients} &middot;{" "}
                      {s.responseCount} offer
                      {s.responseCount === 1 ? "" : "s"} back
                    </>
                  )}
                </p>
              </Link>
              <button
                onClick={() => handleNew(s.id)}
                disabled={creating}
                className="text-sm text-brand hover:text-brand-dark font-medium whitespace-nowrap disabled:opacity-50"
                title="Start a new sheet from these line items"
              >
                Duplicate
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
