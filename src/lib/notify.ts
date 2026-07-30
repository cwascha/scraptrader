// Tier-3 notifications: email the DEALER when a conversation has unread
// buyer messages that have gone unhandled for 5+ minutes.
//
// Mechanism: a single in-process sweeper (setInterval, 60s) rather than
// per-message timers — it survives bursts, dedupes naturally, and there's
// no cron infra on a dev box or a single droplet. The sweeper is started
// lazily via ensureNudgeSweeper() from routes that fire around unread
// activity (buyer message POST; unread-count GET), so it's warm whenever
// it could matter. Single-process only — same constraint as rate-limit.ts;
// NOT serverless-safe, which matches the droplet deployment plan.
//
// Nudge rule (one email per unread batch):
//   - unread = buyer messages with createdAt > ownerLastReadAt
//   - nudge only when the OLDEST unread message is ≥ 5 minutes old
//     (rapid back-and-forth while the dealer is active never emails)
//   - lastNudgeAt >= oldest unread  ⇒  this batch was already nudged;
//     no further email until the dealer reads the conversation (which
//     resets the batch). So: at most one email per conversation per
//     unread streak, no hourly drip.

import { prisma } from "./db";
import { decryptContact } from "./encryption";
import { isEmailConfigured, sendUnreadNudgeEmail } from "./mailer";

const NUDGE_AGE_MS = 5 * 60_000; // unread age before we email
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

async function sweep(): Promise<void> {
  if (globalForNudge.nudgeSweeping) return; // overlap guard
  globalForNudge.nudgeSweeping = true;
  try {
    if (!isEmailConfigured()) return;

    // Only conversations that have ever had buyer traffic. Volume is
    // single-tenant small; unread math happens in JS (Prisma can't
    // compare message timestamps against a per-row read marker).
    const recipients = await prisma.dealRecipient.findMany({
      where: { messages: { some: { senderType: "buyer" } } },
      include: {
        contact: true,
        deal: {
          select: {
            id: true,
            title: true,
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

    const now = Date.now();

    for (const r of recipients) {
      const lastReadMs = r.ownerLastReadAt ? r.ownerLastReadAt.getTime() : 0;
      const unread = r.messages.filter(
        (m) => m.createdAt.getTime() > lastReadMs
      );
      if (unread.length === 0) continue;

      const oldestMs = Math.min(...unread.map((m) => m.createdAt.getTime()));
      if (now - oldestMs < NUDGE_AGE_MS) continue; // not aged yet
      if (r.lastNudgeAt && r.lastNudgeAt.getTime() >= oldestMs) continue; // batch already nudged

      let contactName = "A buyer";
      if (r.contact) {
        try {
          contactName = decryptContact(
            r.contact,
            r.deal.user.encryptionKey
          ).name;
        } catch {
          // Undecryptable contact — keep the generic fallback.
        }
      }

      const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
      try {
        await sendUnreadNudgeEmail({
          to: r.deal.user.email,
          dealerName: r.deal.user.name,
          contactName,
          dealTitle: r.deal.title,
          count: unread.length,
          conversationUrl: `${baseUrl}/dashboard/deals/${r.deal.id}?conversation=${r.id}`,
        });
      } catch (err) {
        console.error("[nudge] email send failed:", err);
        // Fall through to stamping anyway: a broken SMTP setup must not
        // turn into a once-a-minute retry storm. Tradeoff: a transient
        // failure loses that one nudge (the inbox/badge still show it).
      }
      await prisma.dealRecipient.update({
        where: { id: r.id },
        data: { lastNudgeAt: new Date() },
      });
    }

    // --- Price-sheet threads: identical rule, different parent --------
    // An ignored supplier offer is a load the yard doesn't buy, so it
    // deserves the same chase as an unanswered buyer message.
    const sheetRecipients = await prisma.priceSheetRecipient.findMany({
      where: { messages: { some: { senderType: "buyer" } } },
      include: {
        contact: true,
        sheet: {
          select: {
            id: true,
            title: true,
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
      const lastReadMs = r.ownerLastReadAt ? r.ownerLastReadAt.getTime() : 0;
      const unread = r.messages.filter(
        (m) => m.createdAt.getTime() > lastReadMs
      );
      if (unread.length === 0) continue;

      const oldestMs = Math.min(...unread.map((m) => m.createdAt.getTime()));
      if (now - oldestMs < NUDGE_AGE_MS) continue;
      if (r.lastNudgeAt && r.lastNudgeAt.getTime() >= oldestMs) continue;

      let contactName = "A supplier";
      if (r.contact) {
        try {
          contactName = decryptContact(
            r.contact,
            r.sheet.user.encryptionKey
          ).name;
        } catch {
          // Undecryptable contact — keep the generic fallback.
        }
      }

      const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
      try {
        await sendUnreadNudgeEmail({
          to: r.sheet.user.email,
          dealerName: r.sheet.user.name,
          contactName,
          dealTitle: r.sheet.title,
          count: unread.length,
          conversationUrl: `${baseUrl}/dashboard/prices/${r.sheet.id}`,
        });
      } catch (err) {
        console.error("[nudge] price-sheet email send failed:", err);
      }
      await prisma.priceSheetRecipient.update({
        where: { id: r.id },
        data: { lastNudgeAt: new Date() },
      });
    }
  } catch (err) {
    console.error("[nudge] sweep failed:", err);
  } finally {
    globalForNudge.nudgeSweeping = false;
  }
}
