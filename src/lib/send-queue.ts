// Background send queue for publishing.
//
// THE PROBLEM THIS SOLVES: publishing used to send every message inside
// the HTTP request. Publishing to 500 contacts meant 500 sequential SMTP
// round-trips in one request — past the reverse proxy's read timeout, so
// the connection died mid-send leaving recipients created, an unknown
// number of emails delivered, and no retry path. The dealer saw a failed
// request and had no way to tell who got it. (ARCHITECTURE gap #43b.)
//
// NOW: publish writes recipient rows as `queued` and returns immediately.
// This worker drains the queue in the background.
//
// WHY THE DATABASE IS THE QUEUE (not an in-memory list): a restart
// mid-send would silently drop the rest of the batch. `queued` rows
// persist, so the sweeper picks up anything left over on the next boot.
// That also makes the whole thing crash-safe without Redis — matching the
// project's single-process constraint (see deploy/scraptrader.service).
//
// Single-process only, like lib/rate-limit.ts and lib/notify.ts. Two
// workers would double-send. That is why the systemd unit forbids
// multiple workers.

import { prisma } from "./db";
import { decryptContact } from "./encryption";
import {
  isEmailConfigured,
  sendDealEmail,
  sendPriceSheetEmail,
} from "./mailer";
import {
  isSmsConfigured,
  isWhatsAppConfigured,
  sendDealSms,
  sendDealWhatsApp,
  sendPriceSheetSms,
  sendPriceSheetWhatsApp,
} from "./sms";
import { materialLabel } from "./materials";
import { formatWeight } from "./deal-fields";
import { formatPrice, formatComexBasis } from "./price-sheet-defaults";

// Rows claimed per pass. Small enough that a restart loses little work,
// large enough that a 200-contact publish drains in a few passes.
const BATCH_SIZE = 20;
// Bounded retries: a bad address or a revoked SMTP credential should stop
// costing sends, not retry forever.
const MAX_ATTEMPTS = 3;
const SWEEP_INTERVAL_MS = 30_000;
// Small gap between sends so a large batch doesn't hammer the SMTP/Twilio
// endpoint hard enough to get rate-limited or greylisted.
const INTER_SEND_MS = 120;

const globalForQueue = globalThis as unknown as {
  sendWorker?: ReturnType<typeof setInterval>;
  sendDraining?: boolean;
  sendAgain?: boolean;
};

export function ensureSendWorker(): void {
  if (globalForQueue.sendWorker) return;
  globalForQueue.sendWorker = setInterval(() => {
    void drain();
  }, SWEEP_INTERVAL_MS);
}

// Called right after publish so sending starts immediately rather than
// waiting for the next sweep. Deliberately NOT awaited by the route.
export function kickSendQueue(): void {
  ensureSendWorker();
  void drain();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function drain(): Promise<void> {
  // Overlap guard. If a kick lands mid-drain, remember to go round again
  // rather than running two drains over the same rows.
  if (globalForQueue.sendDraining) {
    globalForQueue.sendAgain = true;
    return;
  }
  globalForQueue.sendDraining = true;
  try {
    let worked = true;
    while (worked) {
      worked = false;
      if (await drainDeals()) worked = true;
      if (await drainPriceSheets()) worked = true;
    }
  } catch (err) {
    console.error("[send-queue] drain failed:", err);
  } finally {
    globalForQueue.sendDraining = false;
    if (globalForQueue.sendAgain) {
      globalForQueue.sendAgain = false;
      void drain();
    }
  }
}

// Records the outcome. Attempts are incremented on every try so a
// permanently broken recipient exhausts its budget instead of looping.
async function settleDeal(
  id: string,
  ok: boolean,
  attempts: number,
  error?: string
) {
  await prisma.dealRecipient.update({
    where: { id },
    data: ok
      ? { status: "sent", sentAt: new Date(), sendError: null, sendAttempts: attempts }
      : {
          // Out of attempts → failed (dealer shares the link by hand).
          // Otherwise leave it queued for the next pass.
          status: attempts >= MAX_ATTEMPTS ? "failed" : "queued",
          sendError: error?.slice(0, 300) ?? "Send failed",
          sendAttempts: attempts,
        },
  });
}

async function drainDeals(): Promise<boolean> {
  const rows = await prisma.dealRecipient.findMany({
    where: { status: "queued", sendAttempts: { lt: MAX_ATTEMPTS } },
    take: BATCH_SIZE,
    orderBy: { createdAt: "asc" },
    include: {
      contact: true,
      deal: {
        include: {
          user: true,
        },
      },
    },
  });
  if (rows.length === 0) return false;

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

  for (const r of rows) {
    const attempts = r.sendAttempts + 1;
    const user = r.deal.user;

    if (!r.contact) {
      await settleDeal(r.id, false, MAX_ATTEMPTS, "Contact was deleted");
      continue;
    }

    let decrypted;
    try {
      decrypted = decryptContact(r.contact, user.encryptionKey);
    } catch {
      // Not retryable — the key won't start working on attempt three.
      await settleDeal(r.id, false, MAX_ATTEMPTS, "Contact could not be decrypted");
      continue;
    }

    const dealLink = `${baseUrl}/deal/${r.accessToken}`;
    try {
      if (r.channel === "email") {
        if (!isEmailConfigured() || !decrypted.email) {
          throw new Error("Email not configured or no address on file");
        }
        await sendDealEmail({
          to: decrypted.email,
          contactName: decrypted.name,
          sellerName: user.name,
          companyName: user.companyName,
          replyTo: user.email,
          dealTitle: r.deal.title,
          materialText: materialLabel(r.deal.material),
          quantityText: `${r.deal.numLoads} load${r.deal.numLoads === 1 ? "" : "s"} × ${formatWeight(r.deal.weightPerLoad)} ${r.deal.weightUnit}`,
          priceText:
            r.deal.askingPrice !== null
              ? `$${r.deal.askingPrice.toFixed(2)} ${r.deal.priceUnit}`
              : null,
          dealLink,
          brandColor: user.themeBrand || "#2d5f8a",
          logoUrl: user.logoUrl ? `${baseUrl}${user.logoUrl}` : null,
        });
      } else {
        const to = r.channel === "sms" ? decrypted.phone : decrypted.whatsapp;
        const configured =
          r.channel === "sms" ? isSmsConfigured() : isWhatsAppConfigured();
        if (!configured || !to) {
          throw new Error("Channel not configured or no number on file");
        }
        const payload = {
          to,
          sellerName: user.name,
          companyName: user.companyName,
          dealTitle: r.deal.title,
          dealLink,
        };
        if (r.channel === "sms") await sendDealSms(payload);
        else await sendDealWhatsApp(payload);
      }
      await settleDeal(r.id, true, attempts);
    } catch (err) {
      await settleDeal(
        r.id,
        false,
        attempts,
        err instanceof Error ? err.message : "Send failed"
      );
    }
    await sleep(INTER_SEND_MS);
  }

  return true;
}

async function settleSheet(
  id: string,
  ok: boolean,
  attempts: number,
  error?: string
) {
  await prisma.priceSheetRecipient.update({
    where: { id },
    data: ok
      ? { status: "sent", sentAt: new Date(), sendError: null, sendAttempts: attempts }
      : {
          status: attempts >= MAX_ATTEMPTS ? "failed" : "queued",
          sendError: error?.slice(0, 300) ?? "Send failed",
          sendAttempts: attempts,
        },
  });
}

async function drainPriceSheets(): Promise<boolean> {
  const rows = await prisma.priceSheetRecipient.findMany({
    where: { status: "queued", sendAttempts: { lt: MAX_ATTEMPTS } },
    take: BATCH_SIZE,
    orderBy: { createdAt: "asc" },
    include: {
      contact: true,
      sheet: {
        include: {
          user: true,
          items: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });
  if (rows.length === 0) return false;

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

  for (const r of rows) {
    const attempts = r.sendAttempts + 1;
    const user = r.sheet.user;

    if (!r.contact) {
      await settleSheet(r.id, false, MAX_ATTEMPTS, "Contact was deleted");
      continue;
    }

    let decrypted;
    try {
      decrypted = decryptContact(r.contact, user.encryptionKey);
    } catch {
      await settleSheet(r.id, false, MAX_ATTEMPTS, "Contact could not be decrypted");
      continue;
    }

    const sheetLink = `${baseUrl}/prices/${r.accessToken}`;
    const effectiveDateText = new Date(
      r.sheet.effectiveDate
    ).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    try {
      if (r.channel === "email") {
        if (!isEmailConfigured() || !decrypted.email) {
          throw new Error("Email not configured or no address on file");
        }
        // Rebuilt here rather than captured at publish time: the sheet is
        // locked once published, so this can't drift.
        const categories: {
          name: string;
          items: { name: string; value: string }[];
        }[] = [];
        for (const item of r.sheet.items) {
          let cat = categories.find((c) => c.name === item.category);
          if (!cat) {
            cat = { name: item.category, items: [] };
            categories.push(cat);
          }
          cat.items.push({
            name: item.name,
            value: formatPrice(item.price, item.priceNote, item.unit),
          });
        }

        await sendPriceSheetEmail({
          to: decrypted.email,
          contactName: decrypted.name,
          sellerName: user.name,
          companyName: user.companyName,
          replyTo: user.email,
          sheetTitle: r.sheet.title,
          comexBasisText:
            r.sheet.comexBasis !== null
              ? formatComexBasis(r.sheet.comexBasis)
              : null,
          headerNote: r.sheet.headerNote,
          effectiveDateText,
          categories,
          sheetLink,
          brandColor: user.themeBrand || "#2d5f8a",
          logoUrl: user.logoUrl ? `${baseUrl}${user.logoUrl}` : null,
        });
      } else {
        const to = r.channel === "sms" ? decrypted.phone : decrypted.whatsapp;
        const configured =
          r.channel === "sms" ? isSmsConfigured() : isWhatsAppConfigured();
        if (!configured || !to) {
          throw new Error("Channel not configured or no number on file");
        }
        const payload = {
          to,
          sellerName: user.name,
          companyName: user.companyName,
          sheetTitle: r.sheet.title,
          effectiveDateText,
          sheetLink,
        };
        if (r.channel === "sms") await sendPriceSheetSms(payload);
        else await sendPriceSheetWhatsApp(payload);
      }
      await settleSheet(r.id, true, attempts);
    } catch (err) {
      await settleSheet(
        r.id,
        false,
        attempts,
        err instanceof Error ? err.message : "Send failed"
      );
    }
    await sleep(INTER_SEND_MS);
  }

  return true;
}
