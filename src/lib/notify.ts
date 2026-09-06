// Tier-3 notifications: email the DEALER a DIGEST of conversations that
// have gone unhandled.
//
// Mechanism: a single in-process sweeper (setInterval, 60s) rather than
// per-message timers — it survives bursts, dedupes naturally, and there's
// no cron infra on a dev box or a single droplet. Started lazily via
// ensureNudgeSweeper() from routes that fire around unread activity (deal
// messages POST, price-sheet offer + messages POSTs, unread-count GET).
// Single-process only — same constraint as rate-limit.ts; NOT
// serverless-safe, which matches the droplet deployment plan.
//
// ONE EMAIL PER DEALER, NOT PER CONVERSATION. This is the important
// property. The earlier design emailed each thread separately, so ten
// unread conversations meant ten near-identical emails. Two problems with
// that: every dealer shares ONE Google Workspace sending account, whose
// daily quota is finite and mostly spent on publish emails; and a mailbox
// full of "you have unread messages" trains the reader to ignore them. A
// single digest is cheaper and carries more weight.
//
// Schedule:
//   - a conversation QUALIFIES once its oldest unread is ≥ 15 minutes old
//     (Tiers 1 and 2 — tab title and desktop toast — cover live attention,
//     so email doesn't need a hair trigger)
//   - a digest SENDS if anything qualifies and the dealer hasn't had one
//     in the last 6 hours
//   - so: fast on the first thing that needs you, quiet on repeats.
//     Ceiling of 4 emails per dealer per day, versus the old unbounded
//     one-per-conversation.
//
// "When was this dealer last digested" is derived as the max lastNudgeAt
// across their recipients — no extra column, and it self-heals if rows
// are edited by hand.

import { prisma } from "./db";
import { decryptContact } from "./encryption";
import {
  isEmailConfigured,
  sendNudgeDigestEmail,
  type NudgeDigestItem,
} from "./mailer";

const QUALIFY_AGE_MS = 15 * 60_000; // unread age before a thread counts
const DIGEST_INTERVAL_MS = 6 * 60 * 60_000; // min gap between digests
const SWEEP_INTERVAL_MS = 60_000;

// Survive Next.js dev-mode HMR without stacking intervals (same pattern
// as the Prisma client singleton).
const globalForNudge = globalThis as unknown as {
  nudgeSweeper?: ReturnType<typeof setInterval>;
  nudgeSweeping?: boolean;
};

export function ensureNudgeSweeper(): void {
  if (globalForNudge.nudgeSweeper) return;
  globalForNudge.nudgeSweeper = setInterval(() => {
    void sweep();
  }, SWEEP_INTERVAL_MS);
}

interface PendingUser {
  email: string;
  name: string;
  encryptionKey: string;
  items: NudgeDigestItem[];
  // Recipient rows to stamp when the digest goes out.
  dealRecipientIds: string[];
  sheetRecipientIds: string[];
  // Latest nudge stamp across ALL this dealer's threads = when they were
  // last digested.
  lastDigestMs: number;
}

async function sweep(): Promise<void> {
  if (globalForNudge.nudgeSweeping) return; // overlap guard
  globalForNudge.nudgeSweeping = true;
  try {
    if (!isEmailConfigured()) return;

    const now = Date.now();
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const byUser = new Map<string, PendingUser>();

    function bucket(
      userId: string,
      user: { email: string; name: string; encryptionKey: string }
    ): PendingUser {
      let u = byUser.get(userId);
      if (!u) {
        u = {
          email: user.email,
          name: user.name,
          encryptionKey: user.encryptionKey,
          items: [],
          dealRecipientIds: [],
          sheetRecipientIds: [],
          lastDigestMs: 0,
        };
        byUser.set(userId, u);
      }
      return u;
    }

    // --- Deal threads ---------------------------------------------------
    const dealRecipients = await prisma.dealRecipient.findMany({
      where: { messages: { some: { senderType: "buyer" } } },
      include: {
        contact: true,
        deal: {
          select: {
            id: true,
            title: true,
            userId: true,
            user: {
              select: { email: true, name: true, encryptionKey: true },
            },
          },
        },
        messages: {
          where: { senderType: "buyer" },
          select: { createdAt: true },
        },
      },
    });

    for (const r of dealRecipients) {
      const u = bucket(r.deal.userId, r.deal.user);
      // Every thread contributes to "when was this dealer last digested",
      // including ones not currently due.
      if (r.lastNudgeAt) {
        u.lastDigestMs = Math.max(u.lastDigestMs, r.lastNudgeAt.getTime());
      }

      const lastReadMs = r.ownerLastReadAt ? r.ownerLastReadAt.getTime() : 0;
      const unread = r.messages.filter(
        (m) => m.createdAt.getTime() > lastReadMs
      );
      if (unread.length === 0) continue;

      const oldestMs = Math.min(...unread.map((m) => m.createdAt.getTime()));
      if (now - oldestMs < QUALIFY_AGE_MS) continue;

      let contactName = "A buyer";
      if (r.contact) {
        try {
          contactName = decryptContact(r.contact, u.encryptionKey).name;
        } catch {
          // Undecryptable contact — keep the generic fallback.
        }
      }

      u.items.push({
        kind: "deal",
        contactName,
        parentTitle: r.deal.title,
        count: unread.length,
        url: `${baseUrl}/dashboard/deals/${r.deal.id}?conversation=${r.id}`,
      });
      u.dealRecipientIds.push(r.id);
    }

    // --- Price-sheet threads --------------------------------------------
    // An ignored supplier offer is a load the yard doesn't buy, so it
    // belongs in the same digest on the same rule.
    const sheetRecipients = await prisma.priceSheetRecipient.findMany({
      where: { messages: { some: { senderType: "buyer" } } },
      include: {
        contact: true,
        sheet: {
          select: {
            id: true,
            title: true,
            userId: true,
            user: {
              select: { email: true, name: true, encryptionKey: true },
            },
          },
        },
        messages: {
          where: { senderType: "buyer" },
          select: { createdAt: true },
        },
      },
    });

    for (const r of sheetRecipients) {
      const u = bucket(r.sheet.userId, r.sheet.user);
      if (r.lastNudgeAt) {
        u.lastDigestMs = Math.max(u.lastDigestMs, r.lastNudgeAt.getTime());
      }

      const lastReadMs = r.ownerLastReadAt ? r.ownerLastReadAt.getTime() : 0;
      const unread = r.messages.filter(
        (m) => m.createdAt.getTime() > lastReadMs
      );
      if (unread.length === 0) continue;

      const oldestMs = Math.min(...unread.map((m) => m.createdAt.getTime()));
      if (now - oldestMs < QUALIFY_AGE_MS) continue;

      let contactName = "A supplier";
      if (r.contact) {
        try {
          contactName = decryptContact(r.contact, u.encryptionKey).name;
        } catch {
          // Undecryptable contact — keep the generic fallback.
        }
      }

      u.items.push({
        kind: "price sheet",
        contactName,
        parentTitle: r.sheet.title,
        count: unread.length,
        url: `${baseUrl}/dashboard/prices/${r.sheet.id}?thread=${r.id}`,
      });
      u.sheetRecipientIds.push(r.id);
    }

    // --- One digest per dealer -------------------------------------------
    for (const u of byUser.values()) {
      if (u.items.length === 0) continue;
      if (u.lastDigestMs && now - u.lastDigestMs < DIGEST_INTERVAL_MS) {
        continue; // digested recently; stay quiet
      }

      // Most-waiting first, so the subject line and the top row are the
      // things that have been ignored longest.
      u.items.sort((a, b) => b.count - a.count);

      try {
        await sendNudgeDigestEmail({
          to: u.email,
          dealerName: u.name,
          items: u.items,
          inboxUrl: `${baseUrl}/dashboard/conversations`,
        });
      } catch (err) {
        console.error("[nudge] digest send failed:", err);
        // Fall through to stamping anyway: a broken SMTP setup must not
        // turn into a once-a-minute retry storm. Tradeoff: a transient
        // failure loses that digest (the inbox/badge still show the work).
      }

      const stampedAt = new Date();
      if (u.dealRecipientIds.length > 0) {
        await prisma.dealRecipient.updateMany({
          where: { id: { in: u.dealRecipientIds } },
          data: { lastNudgeAt: stampedAt },
        });
      }
      if (u.sheetRecipientIds.length > 0) {
        await prisma.priceSheetRecipient.updateMany({
          where: { id: { in: u.sheetRecipientIds } },
          data: { lastNudgeAt: stampedAt },
        });
      }
    }
  } catch (err) {
    console.error("[nudge] sweep failed:", err);
  } finally {
    globalForNudge.nudgeSweeping = false;
  }
}
