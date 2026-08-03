"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "./Logo";
import { fetchJson } from "@/lib/fetch-json";
import {
  IconDeals,
  IconContacts,
  IconChat,
  IconSettings,
  IconPrices,
  IconSignOut,
} from "./icons";

const navItems = [
  { href: "/dashboard", label: "Deals", Icon: IconDeals },
  { href: "/dashboard/prices", label: "Prices", Icon: IconPrices },
  { href: "/dashboard/contacts", label: "Contacts", Icon: IconContacts },
  { href: "/dashboard/conversations", label: "Conversations", Icon: IconChat },
  { href: "/dashboard/settings", label: "Settings", Icon: IconSettings },
];

export function DashboardNav({
  userName,
  companyName,
  logoUrl,
}: {
  userName: string;
  companyName?: string;
  logoUrl?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const prevUnread = useRef(0);

  // Desktop-notification permission (Tier 2). "unsupported" until we can
  // check on the client — Notification doesn't exist during SSR.
  const [notifPerm, setNotifPerm] = useState<
    NotificationPermission | "unsupported"
  >("unsupported");
  useEffect(() => {
    if (typeof Notification !== "undefined") {
      setNotifPerm(Notification.permission);
    }
  }, []);

  // Unread badge: refresh on navigation and every 30s. Deliberately NO
  // hidden-tab skip here — background tabs are exactly when notifications
  // matter (browsers throttle hidden-tab timers to ~1/min, which is fine
  // for a count check against a lightweight endpoint).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await fetchJson<{ unread: number }>("/api/unread-count");
        if (cancelled) return;
        const next = data.unread ?? 0;

        // Tier 2: pop a desktop notification when unread INCREASES while
        // the tab is hidden (if it's visible, the badges already show it).
        if (
          next > prevUnread.current &&
          document.hidden &&
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          try {
            const n = new Notification("ScrapTrader", {
              body: `${next} unread message${next === 1 ? "" : "s"} from buyers`,
              tag: "scraptrader-unread", // replaces the previous one instead of stacking
            });
            n.onclick = () => {
              window.focus();
              router.push("/dashboard/conversations");
              n.close();
            };
          } catch {
            // Some platforms disallow page-scoped notifications — fine,
            // the badges still work.
          }
        }

        prevUnread.current = next;
        setUnread(next);
      } catch {
        // Badge is best-effort — keep the last known value.
      }
    }
    load();
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Tier 1: mirror the unread count into the tab title — "(3) ScrapTrader".
  // Base title is derived by stripping any existing "(n) " prefix, so this
  // plays nice with per-page titles and re-applies after navigation.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\)\s*/, "");
    document.title =
      unread > 0 ? `(${unread > 99 ? "99+" : unread}) ${base}` : base;
  }, [unread, pathname]);

  async function enableAlerts() {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setNotifPerm(p);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <nav className="bg-white border-b border-slate-200 px-3 sm:px-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between h-14 gap-2">
        {/* Left: logo + tabs. The tab strip SCROLLS on narrow screens
            rather than pushing into the right-hand cluster — five tabs
            plus a logo plus Sign out doesn't fit a phone, and a flex row
            with nothing allowed to shrink overlaps instead of wrapping. */}
        <div className="flex items-center gap-2 sm:gap-6 h-full min-w-0 flex-1">
          <Link href="/dashboard" className="flex items-center flex-shrink-0">
            {logoUrl ? (
              // Dealer's own logo (white-label branding from Settings)
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={companyName || "Logo"}
                className="h-7 sm:h-8 w-auto max-w-[80px] sm:max-w-[180px] object-contain"
              />
            ) : (
              <Logo />
            )}
          </Link>
          <div className="flex h-full min-w-0 overflow-x-auto scrollbar-none">
            {navItems.map(({ href, label, Icon }) => {
              const isActive =
                href === "/dashboard"
                  ? pathname === "/dashboard" ||
                    pathname.startsWith("/dashboard/deals")
                  : pathname.startsWith(href);
              const showBadge =
                href === "/dashboard/conversations" && unread > 0;
              return (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  aria-label={label}
                  className={`flex items-center gap-2 px-2 sm:px-4 text-sm font-medium border-b-2 -mb-px transition-colors flex-shrink-0 ${
                    isActive
                      ? "text-brand border-brand"
                      : "text-slate-500 border-transparent hover:text-slate-700"
                  }`}
                >
                  <Icon size={16} />
                  <span className="hidden md:inline">{label}</span>
                  {showBadge && (
                    <span className="data inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-white text-[10px] font-bold">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0 pl-2">
          {notifPerm === "default" && (
            <button
              onClick={enableAlerts}
              className="hidden sm:block text-xs text-slate-500 hover:text-brand border border-slate-200 rounded-md px-2.5 py-1 transition-colors"
              title="Get a desktop notification when buyers message you while this tab is in the background"
            >
              Enable alerts
            </button>
          )}
          <div className="hidden lg:block text-right leading-tight">
            <p className="text-sm font-medium text-slate-700">{userName}</p>
            {companyName && (
              <p className="text-[11px] uppercase tracking-[0.08em] text-slate-400">
                {companyName}
              </p>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-slate-500 hover:text-slate-700 whitespace-nowrap"
          >
            <span className="hidden sm:inline">Sign out</span>
            <span className="sm:hidden" aria-hidden="true">
              <IconSignOut size={18} />
            </span>
            <span className="sr-only sm:hidden">Sign out</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
