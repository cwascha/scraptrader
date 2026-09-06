"use client";

import { useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";

interface SendStatus {
  queued: number;
  sent: number;
  failed: number;
  manual: number;
  total: number;
  done: boolean;
  failures: { contactName: string; channel: string; error: string }[];
}

// Live progress for a publish, shared by the deal and price-sheet panels.
//
// Publishing is asynchronous now (lib/send-queue.ts): the route returns as
// soon as recipients exist, and messages go out in the background. Without
// this the dealer would be told "sending now" and then shown nothing —
// worse than the old blocking behaviour, which at least ended in an
// answer. A failed send in particular has to surface HERE, because there
// is no other place it appears.
export default function SendProgress({
  endpoint,
  onSettled,
}: {
  // "/api/deals/{id}/send-status" or "/api/price-sheets/{id}/send-status"
  endpoint: string;
  onSettled?: () => void;
}) {
  const [status, setStatus] = useState<SendStatus | null>(null);
  const [error, setError] = useState("");
  const settledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const s = await fetchJson<SendStatus>(endpoint);
        if (cancelled) return;
        setStatus(s);
        setError("");

        if (!s.done) {
          // 2s while draining. The worker paces itself at ~8/sec, so this
          // is frequent enough to feel live without hammering the box.
          timer = setTimeout(poll, 2000);
        } else if (!settledRef.current) {
          settledRef.current = true;
          onSettled?.();
        }
      } catch (err) {
        if (cancelled) return;
        // Don't abandon the poll on a blip — a dropped request shouldn't
        // leave the dealer staring at a frozen counter.
        setError(err instanceof Error ? err.message : "Couldn't check status");
        timer = setTimeout(poll, 5000);
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  if (!status) {
    return (
      <p className="text-xs text-slate-500">Checking send status&hellip;</p>
    );
  }

  const sending = status.queued > 0;
  // Manual recipients were never going to be dispatched, so they don't
  // belong in the denominator of a sending progress bar.
  const dispatchTotal = status.sent + status.failed + status.queued;
  const settled = status.sent + status.failed;
  const pct =
    dispatchTotal > 0 ? Math.round((settled / dispatchTotal) * 100) : 100;

  return (
    <div>
      {sending && (
        <>
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-sm font-medium text-slate-700">
              Sending&hellip;
            </span>
            <span className="data text-xs text-slate-500">
              {settled} of {dispatchTotal}
            </span>
          </div>
          <div
            className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full bg-brand transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5">
            You can leave this page &mdash; sending continues in the
            background.
          </p>
        </>
      )}

      {!sending && dispatchTotal > 0 && (
        <p className="text-sm text-slate-700">
          <span className="data font-semibold">{status.sent}</span> of{" "}
          <span className="data font-semibold">{dispatchTotal}</span> sent
          {status.failed > 0 && (
            <span className="text-red-600">
              {" "}
              &middot; {status.failed} failed
            </span>
          )}
        </p>
      )}

      {status.manual > 0 && (
        <p className="text-xs text-slate-500 mt-1">
          {status.manual} to share manually &mdash; copy their links below.
        </p>
      )}

      {/* Failures are the whole reason this component exists. Name and
          reason, so the dealer knows WHO to chase and why. */}
      {status.failures.length > 0 && (
        <div className="mt-3 p-2.5 bg-red-50 border border-red-100 rounded-lg">
          <p className="text-xs font-semibold text-red-800 mb-1.5">
            Couldn&apos;t send to {status.failures.length}:
          </p>
          <ul className="space-y-1">
            {status.failures.map((f, i) => (
              <li key={i} className="text-xs text-red-700">
                <span className="font-medium">{f.contactName}</span>
                <span className="text-red-400"> ({f.channel})</span> &mdash;{" "}
                {f.error}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-red-600 mt-1.5">
            Their links still work &mdash; share them by hand.
          </p>
        </div>
      )}

      {error && (
        <p className="text-[11px] text-slate-400 mt-1">
          {error} &mdash; retrying.
        </p>
      )}
    </div>
  );
}
