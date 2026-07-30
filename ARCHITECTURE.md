# ScrapTrader — Architecture

> Last updated: 2026-07-30 (**buying price sheets** — second outgoing communication type, with supplier responses and counter-offers; **Twilio SMS/WhatsApp** wired but dormant until credentials land; security audit round 3 + envelope encryption). Update this file when the architecture changes.

## What this app is

A private CRM for scrap metal dealers, with **two outgoing communication types**.

**Deals (the dealer SELLS).** A dealer (the only account type) creates **deals** (ISRI material, packaging, loads, weight, shipping types, photos), keeps an **encrypted contact list** organized into **groups**, and **publishes** deals to selected groups and/or individual contacts (de-duplicated). Publishing creates a recipient record per contact per channel and shares a **per-deal link**; **email-channel recipients are emailed automatically when SMTP is configured**, SMS/WhatsApp send via Twilio when configured and otherwise degrade to manual link sharing. Buyers open the link — no account needed — view the deal **under the dealer's own branding**, and negotiate via chat with **text messages and USD bids with automatic weight-unit conversion**. No posted asking price — **price discovery happens in the bids**, and **accepting the latest bid from the other party closes the deal**. A **buyer portal** (contact-level link, reached from any deal page) lists every deal sent to a buyer, grouped Open/Won/Closed.

**Buying price sheets (the dealer BUYS).** The yard publishes what it will **pay** per material grade, sends it to suppliers, and each supplier replies on their own copy with the tonnage they have and the price they want — which the yard then counters, accepts, or declines. **Direction is the mirror of deals**: here the recipient is the seller and the yard's money goes out.

An **inbox** (Conversations) tracks unread buyer messages on deals, with **tab/desktop/email notifications**. There is **no public marketplace**.

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16.2.9, App Router, TypeScript (strict) |
| UI | React 19, Tailwind CSS 4 (`@tailwindcss/postcss`) |
| ORM | Prisma 7, `prisma-client` generator → output to `src/generated/prisma` |
| Database | SQLite via `@prisma/adapter-libsql`; local `file:./dev.db`, Turso-compatible |
| Auth | Hand-rolled: bcryptjs (cost 12) + jose HS256 JWT in httpOnly `session` cookie (7-day) |
| PII encryption | **AES-256-GCM via Node `crypto`** on contact fields, per-user key **wrapped under an env master key** (envelope encryption) |
| Email | nodemailer over SMTP (Google Workspace + App Password); optional |
| Images | sharp — uploads re-encoded (resize + JPEG q80 + metadata strip) |
| Fonts | Geist / Geist Mono via `next/font/google` |

**Path alias:** `@/*` → `./src/*`

## Design language ("weigh ticket")

The visual identity comes from type, density, and structure — NOT from a fixed palette, because dealer colors are runtime variables (white-label). Rules:

- **`.data` class** (globals.css): Geist Mono + tabular figures for EVERY weight, price, count, and timestamp. Numbers are the product; they render like scale-ticket data, not prose.
- **Status rails**: cards carry a 3px left border encoding status (slate draft / green published / blue closed) + a stamped uppercase chip. Rail and chip always agree.
- **Micro-labels/eyebrows**: 10–11px uppercase, letter-spaced (`tracking-[0.08em]`–`[0.12em]`), slate-500.
- **Icons**: hand-rolled stroke SVG set in `components/icons.tsx` (currentColor, no dependency). NO emoji in UI chrome.
- **Radii/density**: `rounded-lg` cards (not xl), tighter padding; nav is a 14-unit bar with underline active states.
- **Theme-engine safety**: brand/accent only via CSS vars (`bg-brand` etc.); neutrals only from slate classes that `.theme-dark` remaps — new slate/status classes need a remap rule (blue + amber added 2026-07-17). Body font previously forced Arial — fixed to Geist.
- **Responsive floor** (2026-07-17): nav collapses to icon-only tabs below `md` (identity block `lg`+, Enable alerts `sm`+); card links carry `min-w-0` (grid items default to `min-width:auto`, which blocks truncation and forces horizontal page overflow on phones); contacts table scrolls inside its card (`overflow-x-auto`); layout gutters `px-4 sm:px-6`. This makes the dashboard FIT phones; a mobile-first pass (touch targets, bottom nav) is future work, sensible pre-deployment alongside the PWA.
- Phase 3 (pending): propagate to deal detail styling, forms, buyer page + portal.

## Theming (white-label engine)

`globals.css` root variables (`--brand-primary/-dark/-secondary`) mapped by `@theme inline` to `bg-brand`/`bg-brand-dark`/`bg-accent` etc. Runtime theming = overriding the variables on a wrapper. Dashboard + all buyer pages apply the dealer palette; nav/headers show the dealer logo. **Dark mode**: `.theme-dark` remaps slate utilities (rules outside `@layer utilities`); palette remap, not redesign. **Extraction** (`lib/theme-extract.ts`): client-side dominant-color → brand/accent/dark, neutral fallback for grayscale logos. Storage on User via `/api/branding` (hex server-validated against a strict `#rrggbb` regex before storage/interpolation — no CSS injection). Logos magic-byte validated, ≤5 MB, SVG rejected. Never hardcode brand hex.

## Buyer pages & public projections

`/api/public/deal/[token]`: whitelisted projection — deal facts, images (**`{id, url}` only** — the raw `DealImage` row carries the dealer's original upload filename, which can leak yard names or internal naming), seller name/company, branding, shipping **city+state only**, `biddingClosed`, and **`portalToken`** (powers the "All deals" link back to the portal; null if the contact was deleted — note this makes any deal link a portal credential one click away). **Contact name is dealer-only**: buyer messages are stamped with the decrypted contact name server-side (anti-spoofing) but public reads rewrite buyer `senderName` to "You"; no name entry on the buyer page.

**Buyer identity is the token, full stop — accounts are never consulted.** There is deliberately NO linkage between contacts and registered users: publishing to an email that happens to belong to another ScrapTrader dealer treats them as an ordinary anonymous buyer (nothing appears in their dashboard/inbox; their session cookie is never read on buyer pages). See open decision #3.

**Buyer portal** (`/portal/[token]` ← `Contact.portalToken`): contact-level, channel-independent hub of all deals sent to a buyer. **Grouped into Open / Won / Closed**, newest-first inside each group (closed deals order by `acceptedAt`). `outcome` is derived by testing `Deal.acceptedRecipientId` against *all* of this contact's recipients for that deal — and when they won, the card links to the WINNING thread rather than the busiest one, since that's where the acceptance and agreed price live. Disclosing won/lost is not new information: `finalizeAcceptedBid()` already writes an acceptance notice into the winner's thread and a closed notice into every other, so a buyer can derive it from their own conversation; the price and the winner's identity stay out of the projection. **The dealer shares PER-DEAL links** (`/deal/{accessToken}`) — publishing emails those and shows them in the publish panel for manual SMS/WhatsApp sharing. The portal is reached from the **"All deals from {company}"** link on any deal page, and its token is minted at publish so that link always resolves; it's also copyable on demand from the Contacts page. **⚠ Blast radius: possession of any deal link reaches the portal in one click, granting the buyer's entire history with that dealer** — so the token has a lifecycle: `POST /api/contacts/portal-link` get-or-create, `PUT` rotate (fresh token, old one dead immediately, new link copied for re-sending), `DELETE` revoke (no portal until re-minted). Rotate/Revoke appear on the Contacts page once a token exists. Both invalidate the PORTAL only — per-deal `accessToken` links already in the buyer's hands survive (gap #28). Projection: deal facts + thumbnail + message count + outcome + per-deal token; no contact name, no addresses, no accepted price.

## Inbox & unread tracking (owner side)

`DealRecipient.ownerLastReadAt` is the read marker; **unread = buyer messages with `createdAt > ownerLastReadAt`** (null = never opened). Buyers have no equivalent (their page IS the thread).

- **List data**: `GET /api/deals` recipients carry `contactName` (decrypted), `unreadCount`, and `lastMessage` — encrypted blobs and raw message arrays are stripped server-side. Unread is counted in JS (Prisma can't filter a `_count` against a per-row column); fine single-tenant.
- **Conversations page = inbox**: one row per conversation (deal × contact × channel), sorted by last activity; unread dot + count, bid previews in mono, "You:" prefix, closed chip; 15s refresh. Rows deep-link to `/dashboard/deals/{id}?conversation={recipientId}`.
- **Deal page**: honors `?conversation=` deep link, else auto-expands the most recently active thread. Unread pills on collapsed headers. **Reading marks read**: `POST /api/deals/[id]/mark-read {recipientId}` fires when the open conversation has unread (on expand or on arrival while open), optimistic local update, poll-resurrection self-heal. Copy button on each conversation's deal link.
- **Nav badge**: `GET /api/unread-count` polled by DashboardNav on route change + every 30s (runs in hidden tabs too — browsers throttle to ~1/min there, fine); badge on Conversations tab (99+ cap). Dashboard deal cards show "N new".

## Notifications (tiered)

- **Tier 1 — tab title (shipped):** DashboardNav mirrors the unread count into `document.title` — `(3) ScrapTrader`. Strips/reapplies its own `(n) ` prefix so per-page titles and navigation survive.
- **Tier 2 — desktop notifications (shipped):** when the unread count INCREASES while the tab is hidden and Notification permission is granted, the nav pops an OS toast (tag-deduped; click focuses the tab and routes to the inbox). Permission is requested only via the "Enable alerts" button in the nav (shown while permission is "default" — browsers want a user gesture). Dies with the tab by design; that's Tier 4's job.
- **Tier 3 — email nudges (shipped):** `lib/notify.ts` runs a single in-process sweeper (60s interval, lazily started via `ensureNudgeSweeper()` from the public messages POST route and unread-count GET; HMR-safe global, overlap-guarded). Rule: when a conversation's OLDEST unread buyer message is **≥ 5 minutes old**, email the dealer once (`sendUnreadNudgeEmail` — ScrapTrader-branded, platform→user, deep link to the conversation), stamp `DealRecipient.lastNudgeAt`. **One email per unread batch**: no re-nudge until the dealer reads the conversation (`lastNudgeAt >= oldest unread` ⇒ skip). Send failures are stamped anyway (no retry storms; badge/inbox still show the unread). Single-process like the rate limiter; requires SMTP configured; skipped otherwise.
- **Tier 4 — PWA + Web Push + Badging API (TODO, deliberately deferred):** installable app with OS-level push and icon badges while closed. **Blocked on deploying at the real domain**: installs and push subscriptions are origin-bound, and quick-tunnel origins change per restart, which would orphan every install/subscription. Build at deployment time: manifest + service worker + VAPID keys + `PushSubscription` table + send hook + `setAppBadge`. Platform notes: Windows Chrome/Edge = full badges + toasts; iOS 16.4+ requires add-to-home-screen; Android = push yes, numeric badge no.

## Chat, bids, acceptance & live updates

Messages: senderType "owner"|"buyer"|"system" (system = centered notice pills); type "message"|"bid" (`bidAmount`+`bidUnit`, **stored as entered**, 4-decimal rounding). `lib/bids.ts` = all conversion math (`LBS_PER_UNIT`, `convertPricePerUnit`, `formatBid`, `priceWithEquivalent`), `parseIncomingMessage()` (shared server validation), `buildBidConfirmText()`.

- **Message validation (shared choke point)**: `parseIncomingMessage()` bounds every incoming message — bid amounts to (0, 1e9], text content to **`MAX_MESSAGE_LENGTH` = 4000 chars** (checked after trim). Both owner and buyer routes go through it, so the PUBLIC (token-only) buyer endpoint can't be used to fill the DB or inflate the payload every viewer re-polls.
- **Send confirmation**: every bid confirms with the deal-unit equivalent + warning at **≥2× or ≤0.5×** the conversation's previous bid.
- **Acceptance**: Accept only on the LATEST bid from the other party (both directions; server re-verifies). No sender ratification. `lib/accept-bid.ts` `finalizeAcceptedBid()`: atomic claim (`updateMany` where status ≠ closed), accepted-* snapshot + status closed, system messages (winner + all others), best-effort winner congrats email. **Bid block enforced server-side** on both message POST routes; buyer poll carries `biddingClosed` for live composer removal.
- **Closed is final at the API layer**: the publish route rejects closed deals AND its status write is guarded (`updateMany where status != closed`), so a stale tab or direct POST can never resurrect bidding on an accepted deal.
- Owner UI when closed: blue badge, ✓ WINNER tag, Publish disabled, Pricing card Accepted state. Pricing card pre-close: Highest Bid (converted to deal unit for comparison) + Total Bids Received (buyer bids only).
- **Deal list**: Active (by created date) / Closed (by acceptedAt) sections, newest/oldest/title/heaviest sorting (weight normalized to lbs).
- **Polling**: owner deal 5s, buyer messages 5s, inbox 15s, nav badge 30s (hidden tabs included, browser-throttled) — overlap guards + keep-current-on-failure.

## Buying price sheets (dealer BUYS)

The second outgoing communication type. A sheet lists what the yard will **pay** per grade; suppliers reply with what they have. **Read every "price" in this subsystem as money going OUT** — the direction is inverted from deals, and `buyerPrice` on a response line means the SUPPLIER's ask, not a bid to buy.

**Structure.** `PriceSheet` → `PriceSheetItem[]` grouped by free-text `category` and ordered by `sortOrder`. Modelled on the real Ruby Recycling sheet: seven categories, ~48 lines, everything $/lb. Two details that a generic design gets wrong:

- **A line can be non-numeric.** The source sheet has "Dirty Brass — Need Pics", so `price` and `priceNote` are mutually exclusive (a usable number always wins, enforced server-side). `formatPrice()` in `lib/price-sheet-defaults.ts` is the single renderer shared by the editor, the public page, and email — so the three can't disagree.
- **Recovery percentages live in the item name** ("#1 Heavy (87% basis)", "Irony Alum (50%)"). That's how yards write the grade; splitting them into a field would fight the domain.

**Snapshot semantics.** Publishing LOCKS the sheet (server-enforced on PATCH, mirroring the closed-deal guard). A supplier's counter is meaningless unless the prices they were quoting against are frozen. New prices = a new sheet; **Duplicate** copies the line items forward so nobody retypes 48 rows. The `headerNote` (market basis, e.g. "Comex $4.49") is deliberately **NOT** duplicated — a copied index reading is wrong the moment it's copied.

**Seeding.** The first sheet is pre-filled from `STARTER_ITEMS`; every later one copies the dealer's most recent sheet.

**Per-recipient links.** `PriceSheetRecipient.accessToken` — one per contact per channel, like `DealRecipient`. A response has to be attributable, so there is no shared link. (An earlier design used one public token per sheet; it was replaced when responses were added.)

**The negotiation.** One `PriceSheetResponse` per recipient — revising updates it rather than stacking rows, so there is always exactly one current position per side. Lines are `PriceSheetResponseLine` (weight + unit, optional `buyerPrice` ask, optional `dealerPrice` counter); a null `buyerPrice` means "your quoted price is fine", which is the common case and shouldn't require typing.

| status | meaning | whose move |
|---|---|---|
| `submitted` | supplier sent or revised their numbers | yard |
| `countered` | yard countered one or more lines | supplier |
| `accepted` | yard took their current numbers | — terminal |
| `declined` | yard passed | — terminal |

Terminal states are enforced on **both** sides: the public route refuses further revisions, and the dealer route refuses further actions. A decision can't be silently reversed from a link still sitting in an inbox.

**Channel split.** Email inlines the FULL price table (suppliers compare sheets side by side in their inbox); SMS/WhatsApp send the link only — 48 lines would be dozens of billable segments and unreadable on a phone.

**Publishing guard.** If no selected contact has an address/number for the chosen channels, the route bails with a 400 **before** locking — otherwise a first publish that reached nobody would freeze the sheet and force a duplicate to fix a missing email address.

**Estimated total** on the supplier page sums **per-lb lines only**; ton/each lines display but don't roll up, because mixing bases would produce a confidently wrong number.

## Rate limiting & auth hardening

`lib/rate-limit.ts`: in-memory fixed-window + `clientIp()`; single-process only; resets on restart; self-prunes expired buckets.

| Endpoint | Limit / window |
|---|---|
| `GET public/deal/[token]` | 20 / IP / 60s |
| `POST public/deal/[token]/messages` | 10 / token AND 30 / IP / 60s |
| `GET public/deal/[token]/messages` | 60 / token / 60s |
| `POST public/deal/[token]/accept-bid` | 5 / token AND 10 / IP / 60s |
| `GET public/portal/[token]` | 20 / IP / 60s |
| `GET public/prices/[token]` | 20 / IP / 60s |
| `POST public/prices/[token]` (supplier offer) | 10 / IP / 60s |
| `POST api/auth/login` | 15 / IP AND **5 / email** / 5min |
| `POST api/auth/register` | 5 / IP AND **20 global** / hour |

**Spoofing caveat (audited 2026-07-17):** `x-forwarded-for` is client-controllable when clients reach Next directly or through a pass-through tunnel, so per-IP limits are a politeness layer, not a guarantee. That's why login also keys on the target EMAIL and register has a GLOBAL cap — both spoof-proof. At droplet deployment, configure nginx to overwrite (not append) `X-Forwarded-For` with the real client address.

Other auth measures: uniform "Invalid credentials" on login + **bcrypt timing equalizer** (missing-user path runs a dummy compare so response time can't enumerate accounts); login and register **parse JSON defensively** (malformed body → 400, not an unhandled 500) and coerce every field to a string before use; register enforces password **8–200 chars** (bcrypt only consumes 72 bytes — an unbounded "password" is just wasted CPU), caps `email` 320 / `name` 200 / `companyName` 200, returns generic 500s (real error logged server-side only), and maps a duplicate-email **P2002 race** to the same 400 as the pre-check; `lib/auth.ts` **throws at boot in production if `NEXTAUTH_SECRET` is unset** (dev-fallback secret can never sign prod sessions); session cookie is httpOnly + SameSite=Lax + secure-in-prod. `/api/auth/me` hand-picks fields — never returns `passwordHash` or `encryptionKey`. Known tradeoff: JWTs aren't revocable server-side before their 7-day expiry (logout clears the cookie only).

## PII encryption (contacts)

`lib/encryption.ts` — **AES-256-GCM** via Node's built-in `crypto`. Format: `v2:base64(iv[12] | tag[16] | ciphertext)`. The 32-byte AES key is SHA-256 of the per-user `encryptionKey`; a password-stretching KDF is deliberately NOT used because that key is already uniformly random (two v4 UUIDs ≈ 244 bits), which also avoids storing a per-record salt.

**Why GCM:** the previous implementation (`crypto-js`, now removed as a dependency) used OpenSSL's `EVP_BytesToKey` (single MD5 pass) + unauthenticated AES-CBC — malleable ciphertext, no integrity check, and an archived/unmaintained library. GCM's auth tag means tampered data now **throws** instead of silently yielding garbage or `""`. Every read path that decrypts contacts therefore needs a try/catch fallback (all of them have one: `"(unreadable contact)"`).

**Legacy reads:** removed 2026-07-26. `decrypt()` now throws on any non-`v2:` value — the crypto-js `Salted__` compatibility reader was deleted once `npm run backfill:keys` reported zero remaining legacy rows. Recover it from git history if an old database is ever restored.

**Key custody — envelope encryption (`lib/master-key.ts`):** the per-user data key is **stored wrapped** on the `User` row, never in plaintext. Wrap format `w1:base64(iv|tag|ct)`, AES-256-GCM under a master key derived (SHA-256) from `ENCRYPTION_MASTER_KEY`, which lives in the environment and never in the database. **Reading contacts now requires the database AND the host environment** — a stolen `dev.db` or Turso dump is useless alone.

`encryptContact`/`decryptContact` take the key **as stored** and unwrap internally, so no route or call site knows envelope encryption exists — which is why adding it changed no API code. The raw `encrypt`/`decrypt` primitives take an already-unwrapped key. `unwrapKey()` passes non-`w1:` values through unchanged, so the app runs normally before and during the backfill. Register wraps at account creation.

**Stricter than `NEXTAUTH_SECRET` on purpose:** no dev fallback, and anything under 32 chars is rejected. The failure modes aren't comparable — a changed JWT secret logs people out, a changed or lost master key makes contact PII **permanently unrecoverable**. Back the value up somewhere other than the droplet. Boot fails in production if it's unset.

**This is the realistic ceiling, not end-to-end encryption.** The server must decrypt contacts unattended (publish emails, the Tier-3 nudge sweeper), so a key derived from the dealer's password is impossible without giving up automated email. Landing-page copy reflects this accurately (gap #23).

**Migration:** `npm run backfill:keys` (`-- --dry` to preview) wraps existing plaintext keys and, separately, rewrites legacy crypto-js contact fields to v2. Idempotent. The two are unrelated: wrapping does **not** re-key anything, so existing ciphertext stays valid untouched.

## Request body limits

`lib/body-limit.ts`: `enforceBodyLimit(req, max)` returns a 413 when `Content-Length` exceeds the cap, called BEFORE `req.json()`/`req.formData()` buffers the body into memory. Next's App Router does not apply the old pages-router 1 MB cap, so without this an oversized POST is fully read before any length validation runs.

| Route | Cap |
|---|---|
| `POST api/auth/login`, `api/auth/register` | 64 KB (`JSON_BODY_LIMIT`) |
| `POST public/deal/[token]/messages`, `.../accept-bid` | 64 KB |
| `POST public/prices/[token]` (supplier offer) | 64 KB |
| `POST/PATCH api/price-sheets/**` | 64 KB |
| `POST api/branding` (logo multipart) | 6 MB |
| `POST api/deals/[id]/images` (10 × 10 MB + overhead) | 110 MB |

**This is a first gate, not a guarantee** — `Content-Length` can be omitted or misstated on a chunked/streamed upload. The hard backstop is `client_max_body_size` at the reverse proxy (see gap #22).

## Input bounds (per audit rounds 2–3)

Server-side length caps everywhere untrusted (or bulky-when-encrypted) input is stored: messages 4000 (see Chat); contact name 200, contact email/phone/whatsapp 320 each (trimmed, then encrypted — `contacts` POST); registration email 320 / name 200 / companyName 200 and password 8–200; group names 100; addresses street 200 / city 100 / zip 20; state validated against the US code list. **Price sheets:** title 120, header note 200, category 60, item name 120, price note 60, **300 lines max**; supplier offers cap the note at 1000 and reject weight > 10,000,000 or price > 1,000,000 per line (fat-fingered-zero guard — 10M lbs is ~4,500 tons, far past any truckload). Numeric bounds: bid amount (0, 1e9], loads ≥ 1 integer, weight > 0. These are authenticated-input hygiene for the dealer's own account except the message cap, the register caps, and public-token limits, which are genuine abuse boundaries. Whole-request size is bounded separately — see Request body limits.

## Client fetch hardening

`lib/fetch-json.ts`: `fetchJson<T>()` + `ApiError` — network failures (status 0), non-JSON tolerated, server `{error}` surfaced. Load failures → friendly error cards; mutations → inline banners; polls keep current data.

## Email (SMTP / Google Workspace)

`lib/mailer.ts`: shared branded shell; `sendDealEmail()` + `sendBidAcceptedEmail()` + `sendPriceSheetEmail()` (dealer-identity From display name + Reply-To) + `sendUnreadNudgeEmail()` and `sendPriceSheetResponseNotice()` (platform→dealer, ScrapTrader-branded). Dealer logo renders in buyer-facing emails as a LINKED image (absolute URL from `NEXTAUTH_URL` + `user.logoUrl`) — recipients fetch it at open time, so it requires a reachable origin (tunnel in dev; permanent domain in prod). All user-controlled strings HTML-escaped; plain-text alternatives; failures never break publish/accept/nudge-sweep. **Both `sendDealEmail()` and `sendBidAcceptedEmail()` link to the specific deal** (`/deal/{accessToken}`); buyers reach their portal from the "All deals" link on that page. **`sendPriceSheetEmail()` inlines the full price table** and links to that supplier's own copy (`/prices/{accessToken}`) with a "Tell Us What You Have" CTA; **`sendPriceSheetResponseNotice()`** tells the dealer a supplier replied, and whether they took the quoted prices or are asking above them. Dev: links use `NEXTAUTH_URL` (tunnel: set it to the tunnel URL + restart; `allowedDevOrigins` in next.config.ts) — nudge deep links use it too.

## SMS & WhatsApp (Twilio)

`lib/sms.ts`: `sendDealSms()` / `sendDealWhatsApp()` / `sendPriceSheetSms()` / `sendPriceSheetWhatsApp()` via Twilio's Messages REST endpoint. **Mirrors the mailer pattern deliberately — configuration is detected from env, and an unconfigured channel silently degrades to manual link sharing. There is no feature flag: add the vars and restart.** SMS and WhatsApp are detected INDEPENDENTLY (`isSmsConfigured()` / `isWhatsAppConfigured()`) because Twilio approves them separately and one usually lands first.

**No `twilio` SDK dependency** — the endpoint is one form-encoded POST with basic auth, and this project blocks package install scripts (`allowScripts`). Twilio's `{code, message}` error body is surfaced verbatim to the dealer so "unverified number" is actionable rather than a bare 400.

`toE164()` normalizes the free-text numbers dealers type: bare 10 digits → `+1`, 11 starting with 1 → `+`, already-`+E.164` passes through, **everything else is rejected rather than guessed** (a wrong guess bills you to deliver a deal to a stranger).

**⚠ WhatsApp 24-hour window:** outside an open conversation, Meta permits only pre-approved TEMPLATE messages. A free-form deal notification to a cold contact is rejected (Twilio error 63016) even once the sender is approved — templates are approved separately. See gap #30.

SMS body is kept to one line (`{seller} at {company} sent you a deal: {title}. View and bid: {link}`) because SMS bills per 160-character segment and the link alone eats 40-70.

## Uploads & image pipeline

- **Deal photos are re-encoded at upload, never stored as received** (`sharp` in the images route): EXIF auto-orientation applied, resized to fit 1600×1600 (no enlargement), JPEG q80 (mozjpeg), saved as `.jpg` regardless of input. Typical phone photo: ~4 MB → 200–400 KB.
- **Privacy control, not just disk hygiene:** re-encoding drops all metadata, including EXIF **GPS coordinates** — a "city + state only" deal must not leak the yard's exact location inside a photo file. (Photos uploaded before 2026-07-17 kept their original bytes/EXIF — dev test data only.)
- Validation layers: magic-byte detection first (JPEG/PNG/WebP/GIF; SVG rejected as a stored-XSS vector), then sharp must successfully decode (sharp's default `limitInputPixels` ≈ 268 MP bounds decompression bombs; upload is owner-authed anyway). Batch validated before anything is written. Input limit 10 MB × 10/deal; animated GIFs collapse to first frame.
- **Deletion cleans disk**: single-image DELETE unlinks the file; deal DELETE removes the whole `public/uploads/{dealId}/` directory (best-effort, gated on ownership having been proven by the DB delete).
- Dealer logos (5 MB, magic-byte validated) are NOT re-encoded — they need transparency and exact fidelity; no GPS concern.
- Zip/archive compression of stored photos was considered and REJECTED: JPEGs are already entropy-coded (~2–5% savings) and archives can't be served to buyer pages.

## Directory map

```
prisma/ + prisma.config.ts + next.config.ts (allowedDevOrigins for tunnels)
scripts/backfill-keys.ts   # one-off, idempotent: wrap account keys + normalize legacy ciphertext
src/
  proxy.ts                 # JWT check on /dashboard/*
  lib/
    auth.ts / db.ts / us-states.ts / address.ts / image-validation.ts
    encryption.ts           # AES-256-GCM (Node crypto); v2 only, legacy reader removed
    master-key.ts           # envelope encryption: wrap/unwrap account keys under ENCRYPTION_MASTER_KEY
    body-limit.ts           # enforceBodyLimit + per-route size caps (413)
    deal-fields.ts / materials.ts / theme-extract.ts
    bids.ts                # conversion + parseIncomingMessage (MAX_MESSAGE_LENGTH) + buildBidConfirmText
    accept-bid.ts          # finalizeAcceptedBid (atomic close + notices + winner email)
    notify.ts              # Tier-3 nudge sweeper (in-process, ensureNudgeSweeper)
    portal.ts              # ensurePortalToken / rotatePortalToken / revokePortalToken (caller proves ownership)
    price-sheet-defaults.ts # STARTER_ITEMS (Ruby sheet), PRICE_UNITS, shared formatPrice()
    time.ts / rate-limit.ts / fetch-json.ts
    mailer.ts              # deal + bid-accepted + price-sheet emails; nudge + offer notices
    sms.ts                 # Twilio SMS/WhatsApp; env-detected per channel, no SDK
  components/
    DashboardNav.tsx       # responsive; unread badge; tab title (T1); desktop alerts (T2)
    Logo.tsx / MaterialSelect.tsx / icons.tsx
  app/
    page.tsx / login / register / globals.css (tokens + .data + .theme-dark remaps)
    dashboard/
      layout.tsx           # auth gate + theme vars + theme-dark class
      page.tsx             # Active/Closed sections, sorting, unread "N new" on cards
      contacts/page.tsx    # contacts (Portal link / Rotate / Revoke) above Groups; table scrolls
      conversations/page.tsx  # INBOX: one row per thread, unread, previews, deep links
      settings/page.tsx / deals/new/page.tsx
      deals/[id]/page.tsx  # deep-link/auto-expand, unread pills, mark-read, copy, accept
      prices/page.tsx      # price sheet list; New/Duplicate; "N awaiting you" badge
      prices/[id]/page.tsx # sheet editor (locks on publish) + send panel + Offers Received
    deal/[token]/page.tsx  # PUBLIC per-deal buyer page
    portal/[token]/page.tsx # PUBLIC buyer portal hub
    prices/[token]/page.tsx # PUBLIC supplier offer form (weights + counter prices)
    api/
      auth/{register,login,logout,me}   # register+login RATE LIMITED + body-capped; defensive JSON parse; field caps; timing equalizer; me hand-picks fields
      branding                          # hex regex-validated; logo magic-byte validated; 6 MB body cap
      contacts/route.ts                 # field length clamps; per-user scoped; GET degrades per-row on decrypt failure; exposes hasPortalToken
      contacts/portal-link/route.ts     # POST get-or-create / PUT rotate / DELETE revoke
      contact-groups(+[id]) / yard-addresses
      unread-count/route.ts           # GET total unread (nav badge); warms nudge sweeper
      deals/route.ts                  # GET list w/ contactName+unreadCount+lastMessage / POST
      deals/[id]/route.ts             # GET / PUT / DELETE (delete removes upload dir)
      deals/[id]/mark-read/route.ts   # POST set ownerLastReadAt
      deals/[id]/images/route.ts      # POST sharp re-encode pipeline (110 MB body cap) / DELETE unlinks file
      deals/[id]/messages (bids blocked when closed)
      deals/[id]/accept-bid
      deals/[id]/publish/route.ts     # REJECTS closed deals; guarded status transition
      price-sheets/route.ts           # GET list (+awaitingYou) / POST create (duplicate or seed)
      price-sheets/[id]/route.ts      # GET (items+responses) / PATCH (DRAFT ONLY — locked after publish) / DELETE
      price-sheets/[id]/publish/route.ts          # per-recipient tokens; locks sheet; bails before lock if nothing sent
      price-sheets/[id]/responses/[responseId]    # PATCH counter | accept | decline (terminal states enforced)
      public/deal/[token]/(route|messages|accept-bid)  # RATE LIMITED + body-capped;
                                                       # "You" masking; images projected to {id,url};
                                                       # returns portalToken for the "All deals" link;
                                                       # messages POST warms nudge sweeper
      public/portal/[token]/route.ts                   # RATE LIMITED
      public/prices/[token]/route.ts                   # RATE LIMITED + body-capped;
                                                       # GET supplier's own copy (resumable form state)
                                                       # POST submit/revise offer; notifies dealer
public/uploads/{dealId}/ + public/uploads/branding/{userId}/  # gitignored
```

## Data model

- **User** — auth, `encryptionKey` (**stored wrapped under the master key**), `preferredWeightUnit`, branding fields.
- **Contact** — encrypted PII; groups m2m; `portalToken?` unique (minted at first publish or on demand; rotatable/revocable); `tags` vestigial.
- **ContactGroup / YardAddress** — labels/addresses (plaintext).
- **Deal** — title/material/packaging/loads/weights/shipping, address snapshots, status draft→published→closed, accepted-* snapshot. `askingPrice`/`priceUnit`/`location` vestigial.
- **DealRecipient** — contact × channel; `accessToken` = buyer credential+identity; status pending/sent/viewed; **`ownerLastReadAt?`** = owner read marker; **`lastNudgeAt?`** = last Tier-3 email about this conversation (one per unread batch).
- **Message** — senderType incl. "system"; type message|bid; buyer senderName server-derived, masked "You" publicly.
- **DealImage** — photos (re-encoded .jpg; `filename` keeps the original upload name for display).
- **PriceSheet** — buying prices; `title`, `headerNote` (market basis), `effectiveDate`, status draft→published (**locked on publish**).
- **PriceSheetItem** — one grade: `category` + `name` + `sortOrder`, and EITHER `price` OR `priceNote` ("Need Pics"), `unit` lb/ton/each.
- **PriceSheetRecipient** — contact × channel; `accessToken` = the supplier's own link; status pending/sent/viewed/responded.
- **PriceSheetResponse** — one per recipient (revisions update in place); status submitted→countered→…→accepted|declined; `buyerNote`/`dealerNote`.
- **PriceSheetResponseLine** — what the supplier has: `weight`+`weightUnit`, `buyerPrice` (their ask; null = accepts quoted), `dealerPrice` (yard's counter).

## Publish flows / Auth

**Deals.** **Closed deals rejected (400)**; de-duped union, skip existing pairs, **undecryptable contacts skipped and counted (`unreadable`) rather than aborting the run**, **portal token minted per contact** (not sent — it backs the deal page's "All deals" link), **per-deal links emailed/texted/shared**, **each channel dispatches when its own credentials are present and degrades to link-sharing when they aren't**, failures never abort (they're counted and named in the summary); status write is a guarded transition (never overwrites "closed"); new deals appear on portals automatically. The response is an **explicit projection**, not a spread of the recipient row.

**Price sheets.** Same shape: de-dupe on contact × channel, skip already-sent pairs, skip undecryptable contacts, per-channel dispatch with graceful degradation. Differences: a **per-recipient `accessToken`** is minted for each send, publishing **locks the sheet**, and the route **bails with a 400 before locking** if nothing was actually sent.

**Auth.** Proxy JWT on /dashboard/*, layout gate, userId scoping everywhere, public routes = token + rate limit.

## Environment variables

`NEXTAUTH_SECRET` (JWT; **required in production — boot fails without it**), **`ENCRYPTION_MASTER_KEY`** (wraps every account's contact-encryption key; **required in production, no dev fallback, 32+ chars — losing it makes contact PII unrecoverable, so back it up off-host**), `NEXTAUTH_URL` (links/emails/nudge deep links/logo URLs), `DATABASE_URL` (or `TURSO_*`), `SMTP_USER`/`SMTP_PASS` (+ optional `SMTP_HOST`/`SMTP_PORT`/`SMTP_FROM`), `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` + `TWILIO_SMS_FROM` and/or `TWILIO_WHATSAPP_FROM` (each channel independently optional — absent = manual link sharing).

## Commands

```
npm run dev / build / lint
npm run backfill:keys [-- --dry]       # wrap account keys + normalize legacy ciphertext
npx prisma migrate dev --name <name>   # STOP dev server first on Windows
```

## Open product decisions (to debate with the ScrapTrader team)

1. **Per-deal links vs portal links — REOPENED 2026-07-26, needs a team decision.** *(current shipped state: Option C)* Which URL does a dealer actually hand a buyer? This was implemented three different ways in a single day, which is itself the signal that it's unsettled rather than solved. **The deciding input is empirical and the team has it, not the code: how many deals does a typical buyer receive?** If most buyers see one or two, isolation is worth more than a hub. If the same twenty buyers receive nearly everything, the hub is worth more than isolation. Also interacts with decision #2 — a portal that lists everything forever discloses more than one that ages out.

   **Option A — per-deal links only; portal shared manually, never linked from a deal page.**
   - *For:* true per-deal isolation — a forwarded or pasted link exposes exactly the one deal the dealer meant to share. The scope of a link matches how it looks, with no hidden reach. Email or SMS about one deal opens that deal, no extra click. Rotate/revoke stays meaningful because the portal is only ever shared deliberately.
   - *Against:* the portal is close to dead weight — buyers never discover it unless the dealer remembers to send it separately. A repeat buyer accumulates N links scattered across email, SMS, and WhatsApp with no single home. The Open/Won/Closed grouping we just built is invisible to most buyers. Dealers field "can you resend that link?" requests.

   **Option B — portal link only (the auto-share model, shipped and then replaced).**
   - *For:* one bookmarkable home per buyer, so the portal actually gets used. Full context in one place: what's open to bid on, what they won, what they lost. Exactly one credential per buyer in the wild, which makes rotate/revoke a complete kill switch. Simplest for the dealer — one link type to think about.
   - *Against:* an email about a specific deal lands the buyer on a list, an extra click every time and worse the more deals they have. The dealer *can't* share just one deal even when that's the intent — a one-off buyer receives the whole hub. Deal and notification emails lose their directness. Forwarding exposes full history — though at least the dealer can see they sent a portal link.

   **Option C — per-deal links out, "All deals" link on the deal page (CURRENT).**
   - *For:* the email opens the deal it's about (A's win) and the portal is discoverable with no extra effort from the dealer (B's win). One link type to manage. Buyers who want the hub find it; buyers who don't never notice it.
   - *Against:* **no isolation, but the link still looks isolated.** A per-deal link reaches the entire portal in one click, so a dealer pasting "this copper deal" into WhatsApp has handed over that buyer's full trading history without realising it. B has the same blast radius but at least announces itself. Implicit exposure is harder for a dealer to reason about than explicit exposure. (Controls do still work: revoking nulls the token and the button disappears; rotating repoints it.)

   **Option D — per-deal links everywhere, portal link as a secondary line in the email only.**
   - *For:* the emailed contact — who we know is the intended buyer — gets the hub, while a link the dealer pastes into WhatsApp stays scoped to one deal. Separates the channel we control from wherever the dealer happened to paste something.
   - *Against:* two links in one email invites clicking the wrong one. A forwarded email still exposes everything. The buyer's experience depends on which channel reached them, which is hard to explain and hard to support.

   **Option E — per-dealer setting ("give buyers portal access: on/off").**
   - *For:* dealers with a handful of large repeat buyers turn it on; dealers doing one-off sales leave it off. No single answer has to be right for everyone.
   - *Against:* it's a security-relevant toggle most dealers won't have the context to judge, and defaults will decide the outcome anyway. More surface to build, document, and test. Arguably punts the decision onto users rather than making it.

2. **Retention policy for closed deals & their media.** *(flagged 2026-07-17; current = everything lives forever)* Today a closed deal remains a live page indefinitely: the buyer link keeps working (bidding closed, messaging open), the portal lists it, and its photos stay on disk and servable. Questions for the team: should buyer links expire N months after close? Should closed deals eventually disappear from portals? Should media be deleted/archived after some period (compliance, storage, or "clean history" reasons)? Notes: this is a PRODUCT decision, not a disk-space necessity — at plausible volume, photos (now re-encoded ~10× smaller) accrue single-digit GB/year vs a 25–50 GB droplet, and object storage at deployment makes storage cost a non-issue. Zipping stored photos was evaluated and rejected (already-compressed formats, breaks serving). If a retention policy is adopted, implementation = a sweep job + an "expired" state on DealRecipient links + portal filtering.

3. **Dealer-to-dealer account linking ("Received deals").** *(flagged 2026-07-17; current = no linkage whatsoever)* Today, publishing to an email that belongs to another registered ScrapTrader dealer treats them as any anonymous buyer: token-only identity, nothing in their dashboard or inbox, sessions never consulted on buyer pages, both parties' data fully partitioned under their own encryption keys. (Cosmetic quirk: a dealer-recipient gets your deal emails and their own nudge emails from the same platform address, different display names.) The debate: should incoming deals surface inside a recipient dealer's account — a "Received deals" section, unified inbox across sent + received, network effects between dealers? Arguments for: it's the natural network feature; dealers ARE each other's buyers in real brokerage chains; one login instead of a pile of emailed links. Arguments against, both structural: (a) **it collides with the contact-encryption promise** — matching recipients to accounts requires comparing emails the platform deliberately cannot read; the workaround (store an email hash on DealRecipient at publish time) is a real weakening of the privacy posture and enables cross-dealer correlation the current design makes impossible; (b) **it drifts toward the marketplace this product explicitly is not** — once dealers see inbound flow in-app, pressure follows for discovery, profiles, ratings. Middle ground worth tabling: opt-in linking (a dealer chooses to associate their email hash for receiving), keeping non-consenting users invisible. No implementation until the team decides; touches schema, publish flow, and the privacy model, so it's the heaviest of the three open decisions.

## Known gaps / tech debt (as of 2026-07-30)

1. ~~Encryption key stored beside the data~~ — **RESOLVED 2026-07-26**: envelope encryption. `User.encryptionKey` is stored wrapped (`w1:`, AES-256-GCM) under `ENCRYPTION_MASTER_KEY` from the environment, so a database dump alone no longer yields contact PII. See "PII encryption". **Residual risk, by design:** the master key currently sits in `.env` on the same host as the app, so a full host compromise still reads everything — moving it to a systemd credential, a mounted secret, or KMS is the next increment, and `master-key.ts` is the only file that changes. Also: **back the value up off-host** — losing it destroys all contact data.
2. ~~dev-secret JWT fallback~~ — **RESOLVED 2026-07-17**: auth.ts throws at boot in production without `NEXTAUTH_SECRET`.
3. **Uploads won't survive serverless** — droplet deploy preferred (also SQLite).
4. **Chat "live" updates are polling**, not push.
5. **Accepted `npm audit` moderates (non-runtime)** — npm "fixes" are major downgrades, do NOT apply; `npm audit fix --force` banned.
6. **Vestigial:** `expiresAt`, `Contact.tags`, `Deal.askingPrice`/`priceUnit`/`location` (one future cleanup migration incl. PRICE_UNITS + buyer asking-price block), no contact/address/company-name edit endpoints, legacy material values; pre-email recipients falsely "sent".
7. ~~Register route leaks String(error)~~ — **RESOLVED 2026-07-17**: generic 500, real error server-logged.
8. **Buyer page shows raw material code.**
9. **No server-side contrast enforcement on theme colors.**
10. **No email bounce tracking.**
11. **Dark mode is a slate remap** — new slate classes need `.theme-dark` rules.
12. ~~Login/register unthrottled~~ — **RESOLVED 2026-07-17**: see "Rate limiting & auth hardening" (incl. spoof-proof per-email + global keys, timing equalizer, password floor).
13. **Rate limits in-memory** — reset on restart (nudge sweeper shares the single-process constraint).
14. **Old buyer messages keep typed names owner-side** (pre-identity-from-token).
15. **No un-accept/reopen** — final by design; recovery is human.
16. ~~No portal-token revoke/rotate~~ — **RESOLVED 2026-07-26**: `PUT` (rotate) and `DELETE` (revoke) on `/api/contacts/portal-link`, surfaced as Rotate/Revoke buttons on the Contacts page (shown only when a token exists). Rotate mints a fresh token, kills the old one instantly, and copies the new link ready to re-send; revoke drops the token entirely until the next publish or copy re-mints one. See gap #28 for what these do NOT cover.
17. **Unread counting pulls full message lists** on the deals list endpoint — acceptable single-tenant.
18. **UI Phase 3 pending** — deal detail deep-styling, forms, buyer page + portal not yet on the weigh-ticket language; mobile-first pass (touch targets, bottom nav) also future work.
19. **TODO: Tier-4 notifications (PWA + Web Push + Badging)** — deferred until deployed at the real domain with TLS (origin-bound installs/subscriptions). See "Notifications" for the build list and platform matrix.
20. **Photos uploaded before the sharp pipeline keep their original bytes** (full size + EXIF/GPS intact) — dev test data only; delete/re-upload if it matters.
21. **JWT sessions aren't revocable before expiry** (7 days) — logout clears the cookie only; a stolen token stays valid. Standard tradeoff for stateless sessions; a server-side session table is the fix if it ever matters.
22. **At deployment: configure nginx** to (a) OVERWRITE `X-Forwarded-For` with the real client IP (strip client-supplied values) so per-IP rate limits regain teeth, (b) set `client_max_body_size` per location — small for JSON routes, ~12 MB for `api/deals/[id]/images` — as the hard backstop behind `lib/body-limit.ts`, and (c) send `X-Content-Type-Options: nosniff` on `/uploads/*`.

23. ~~Landing-page claim overstates the encryption model~~ — **RESOLVED 2026-07-26**: `src/app/page.tsx` no longer claims "Even we can't read your contacts"; it now states the real posture (AES-256-GCM at rest under a per-account key, decrypted only to send published deals, never sold/shared/visible to another dealer). The "Secure Pass-Through — your data stays in your hands" card went with it: the platform stores every contact, deal, price, and message, so "conduit" was false. Replaced with a commitment that's keepable (no selling, no market-intelligence mining, no cross-dealer visibility). Both survive the envelope-encryption change unedited. Also de-staled: step 2 said each contact gets "a unique deal link" (it's their portal now) and step 1 listed "pricing" as an input (vestigial — price discovery is in the bids).

24. **Logo URLs embed the dealer's internal `userId`** (`/uploads/branding/{userId}/…`) and are served to buyers on every deal/portal page. Cosmetic ID disclosure, not an access-control hole (the ID grants nothing on its own). Fixing it means a storage-layout change — a random per-logo directory — not a projection tweak.

25. **Per-email login throttle is a targeted-lockout lever.** 5 failures / 5 min keyed on the target email is spoof-proof by design, but anyone who knows a dealer's address can keep that bucket full from rotating IPs and hold them out of login. Softening options: CAPTCHA after N failures, or exponential backoff keyed on the email+IP pair.

26. **Register discloses account existence** ("Email already registered"). Closing it properly requires an email-verification flow (respond identically either way, confirm out of band). Kept deliberately for UX — signup caps (5/IP/hr, 20 global/hr) blunt enumeration at scale.

27. ~~Legacy crypto-js ciphertext branch~~ — **RESOLVED 2026-07-26**: reader deleted; `decrypt()` throws on non-`v2:` input. **The plaintext passthrough in `unwrapKey` deliberately REMAINS** — it's what lets a pre-envelope database (e.g. the `dev.db.bak-*` taken before the backfill) still open. Remove it only when those backups are gone.

28. **No per-deal link revocation.** Portal rotate/revoke (gap #16) invalidates the portal token only; every `DealRecipient.accessToken` the buyer already holds keeps working. This is the right default — deal emails now carry only the portal link, so rotating cuts off a leaked email — but a buyer who opened and bookmarked a deal page retains that page, and a dealer who manually shared a deal link can't take it back. Fix if needed: rotate every `accessToken` for a contact (rows and messages survive; only the URLs change), exposed as a "revoke all access" action.

29. **Master key lives in `.env` on the app host** — so envelope encryption defeats *database* theft (a stolen `dev.db` or Turso dump is useless) but not *host* compromise: an attacker with the droplet reads `.env` and the database together. Moving it to a systemd credential (`LoadCredential=`), a mounted secret, or a KMS closes that. `lib/master-key.ts` is the only file that changes — swap the `process.env` read for a file/KMS read. **Do this at deployment**, alongside gap #22's nginx work. Also: whatever holds the key must be backed up off-host, since losing it destroys all contact PII.

30. **Twilio: unproven, plus three things to settle before switching it on.** The code path is written and dormant (no credentials = manual sharing), so it is UNTESTED against the live API — the first real publish is the first real test. (a) **WhatsApp templates**: free-form messages only reach buyers inside a 24h window; cold outreach needs a Meta-approved template, which is a separate approval AND a code change (template SID + variables instead of a `Body`). (b) **Cost**: unlike email, every message bills. Publishing to a 200-contact group fires 200 SMS with no confirmation step — consider a spend guard or a "this will send N texts" confirmation. (c) **Consent/TCPA**: US commercial SMS needs prior express consent, and contacts were imported by dealers with no consent field anywhere in the schema. Twilio auto-handles STOP on US numbers, but the consent record is the dealer's problem and the product currently gives them nowhere to keep it.

31. **⚠ THE SUPPLIER IS NEVER TOLD THE YARD RESPONDED — the negotiation loop is only half-wired.** Submitting an offer emails the dealer (`sendPriceSheetResponseNotice`). Counter, accept, and decline send the supplier **nothing**. They only find out by revisiting their link on a hunch, so in practice a counter goes unanswered and the deal dies silently. This is the highest-value price-sheet fix: a `sendPriceSheetCounterEmail` / accepted / declined trio using the dealer-identity From, fired from the responses PATCH route, best-effort like every other send. Until then, counters need a phone call to land.

32. **Price-sheet negotiations are invisible to the inbox.** Conversations, unread counts, the nav badge, and Tier-3 nudges all key off `Message` + `DealRecipient`, so an offer sitting at `submitted` produces no badge, no nudge, and no inbox row — only the "N awaiting you" chip on the Prices list, which a dealer has to go looking for. Also no free-text chat on a response: the counter loop carries one note per side per round and nothing else, so "can you do $4.02 if I bring three loads?" has nowhere to go. Unifying means making `Message.dealRecipientId` nullable and adding `priceSheetRecipientId` (existing deal queries all filter on the former, so it's additive), then widening the inbox queries.

33. **Weight units aren't normalized against the quoted basis.** A supplier can enter tons on a line the yard quoted in $/lb, and the dealer's Offers panel shows "40 tons" next to "$3.99" with no conversion — the reader has to do the 2,000× in their head, on a screen where getting it wrong is a five-figure error. The supplier-side estimate sidesteps this by summing per-lb lines only, which is safe but silently omits ton/each lines from the total. Fix: normalize to the item's unit on display (the conversion helpers already exist in `lib/bids.ts`), and show both figures.

34. **An accepted offer is a dead end.** `status = "accepted"` is the whole record — nothing schedules a delivery, produces a purchase record, or feeds anything downstream. Fine while the yard runs fulfillment on paper; worth revisiting if price sheets become a primary channel.

35. **`effectiveDate` is decorative.** Nothing expires a sheet or stops a supplier submitting against three-week-old copper prices. Deliberate for now (the yard controls who gets links), but the pairing of a locked snapshot with an unbounded lifetime is exactly the shape of an eventual dispute. Interacts with open decision #2 (retention).

Resolved (2026-07-15/17/26): upload validation; deal form overhaul; yard addresses; state validation; contact groups + de-dupe; dual addresses; ISRI materials; white-label theme engine + dark mode; SMTP dealer-identity email; dependency cleanup; conversation names; chat polling; bids + unit conversion; timestamps; rate limiting; fetch hardening; buyer identity from token; shipping city/state; Pricing card bid stats; contact-name privacy; bid acceptance flow; Active/Closed sections; buyer portal; design language Phase 1; inbox + unread tracking Phase 2; notifications Tiers 1–3; responsive floor for phones; image pipeline + deal-delete disk cleanup; security audit round 1 (closed-publish guard, auth throttling + timing equalizer, register hygiene, prod secret enforcement); **security audit round 2 — full-codebase read: message-length DoS cap (4000) + contact-field length clamps; confirmed clean on IDOR, SQL injection, secret leakage, stored XSS, CSS injection**; **security audit round 3 — crypto-js → AES-256-GCM (Node crypto) with legacy-format reader and the dependency dropped; request body caps (`lib/body-limit.ts`) on all public/auth/upload POSTs; buyer image projection narrowed to `{id, url}`; register/login defensive JSON parse + field caps + password upper bound + P2002 race; `contacts` GET and the publish loop degrade per-row instead of failing the whole request**; **portal auto-share (open decision #1) with rotate/revoke controls (gap #16)**; **landing-page security claims corrected to match the real posture (gap #23)**; **envelope encryption — account data keys wrapped under `ENCRYPTION_MASTER_KEY`, closing the long-standing key-custody gap #1**; **Twilio SMS/WhatsApp send path (dormant until credentials)**; **buying price sheets — snapshot sheets seeded from a starter grade list, per-recipient links, supplier offers with weights + counter prices, and a counter/accept/decline loop**.
