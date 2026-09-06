# ScrapTrader

The private CRM and negotiating platform for scrap metal trading. Two directions of trade, one contact list.

**Selling — deals.** Dealers create deals (material grade, packaging, loads, weight, photos), maintain an encrypted contact list organized into groups, and publish to selected contacts. Each buyer gets a private link to that specific deal — emailed automatically when SMTP is configured, sent by SMS or WhatsApp when Twilio is configured, or shared by hand otherwise. From any deal page they can jump to their own **portal**: one page listing every deal that dealer has sent them, grouped into Open, Won, and Closed. Portal links can be rotated or revoked if one leaks.

Buyers open the link — no account required — see the deal under the dealer's own branding, and negotiate in built-in chat with text messages and USD bids (weight units convert automatically). There's no posted asking price: price discovery happens in the bids, and accepting the other party's latest bid closes the deal.

**Buying — price sheets.** Dealers publish what the yard will **pay** per material grade, starting from a pre-filled grade list so the first sheet is editing numbers rather than typing names. Each supplier receives their own link, enters the tonnage they have, and either takes the quoted price or names their own. The yard then counters line by line, accepts, or declines — and the supplier is notified each time on the channel they were reached on. Both sides can message freely alongside the numbers, and offers show up in the dealer's unread badge and email nudges like any other conversation. Publishing locks a sheet, so suppliers are always quoting against fixed numbers — new prices mean a new sheet, duplicated from the last one, optionally with an expiry date.

**Material grades are yours.** Deals and price sheets share one vocabulary: the grades a yard actually trades, in its own words, grouped by type. Add your own from the deal form as you go.

There is no public marketplace — nothing is visible except to people holding a link.

On the dealer side: an inbox with unread tracking and tab/desktop/email notifications, plus white-label branding (logo + theme, light or dark) applied to the dashboard and to every buyer-facing page.

For the full technical breakdown (stack, data model, auth, API surface, known gaps), see **[ARCHITECTURE.md](./ARCHITECTURE.md)**. Agent/AI-assistant conventions live in **[AGENTS.md](./AGENTS.md)**.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Prisma 7 · SQLite (libsql adapter, Turso-compatible)

## Getting started

1. Install dependencies (this also runs `prisma generate`):

   ```
   npm install
   ```

2. Create a `.env` in the project root:

   ```
   DATABASE_URL="file:./dev.db"
   NEXTAUTH_SECRET="<generate a long random string>"
   NEXTAUTH_URL="http://localhost:3000"
   ENCRYPTION_MASTER_KEY="<generate a long random string>"
   ```

   For a hosted Turso database, also set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` (these take precedence at runtime).

   Generate a secret with:

   ```
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

   `ENCRYPTION_MASTER_KEY` wraps every account's contact-encryption key. It has **no dev fallback** — the app won't create accounts or read wrapped contacts without it, and **changing or losing it makes all contact data permanently unrecoverable**, so back it up somewhere other than the server. Generate it the same way (32+ chars required).

   SMS and WhatsApp are optional and independent: set `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`, then `TWILIO_SMS_FROM` and/or `TWILIO_WHATSAPP_FROM`. A channel without credentials just gives you a link to share by hand.

   Email is optional: set `SMTP_USER` and `SMTP_PASS` to send deal links automatically (plus `SMTP_HOST` / `SMTP_PORT` / `SMTP_FROM` to override the Gmail defaults). Without them everything still works — the app falls back to manual link sharing.

3. Create the local database:

   ```
   npx prisma migrate dev
   ```

4. Run the dev server:

   ```
   npm run dev
   ```

   Open http://localhost:3000, register an account, and you're in the dashboard.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | `prisma generate` + production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint (Next core-web-vitals + TypeScript) |
| `npm run backfill:keys` | Wrap existing account keys under the master key + normalize legacy ciphertext (idempotent; `-- --dry` to preview) |
| `npm run clean:deals` | Delete deals whose material predates the yard-grade switch, including their upload directories (`-- --dry` to preview) |
| `npm run set:company -- "Name"` | Set the dealer's trading name (shown to buyers and suppliers; not the platform name) |
| `npx prisma migrate dev --name <name>` | Apply a schema change as a new migration |

## Notes

- Deal photos are written to `public/uploads/{dealId}/` at runtime — this works on a persistent local disk but **not on serverless hosts** (see ARCHITECTURE.md, Known gaps).
- `NEXTAUTH_SECRET` falls back to a known dev value when unset, so local development runs out of the box. That fallback is refused in production: `lib/auth.ts` **throws at boot** when the variable is missing, rather than signing sessions with a publicly known string.
- Contact PII is encrypted with AES-256-GCM (`lib/encryption.ts`) under a per-account key, and that key is itself stored **wrapped** under `ENCRYPTION_MASTER_KEY` (`lib/master-key.ts`), which lives in the environment rather than the database — so a stolen database file alone decrypts nothing. This is not end-to-end encryption: the server decrypts contacts to send deal emails, so anyone with host access can read them.
- On Windows, stop the dev server before running `npx prisma migrate dev` (the running process holds `dev.db` open).
