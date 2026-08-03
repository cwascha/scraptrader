# ScrapTrader — Architecture

> Last updated: 2026-07-30 (**buying price sheets** with a fully-wired supplier negotiation — counter/accept/decline notified on the supplier's own channel, threads unified into the inbox; **yard-owned material grades** replacing the ISRI list; **Twilio SMS/WhatsApp** and **COMEX market data** both wired but dormant pending credentials). Update this file when the architecture changes.

## What this app is

A private CRM for scrap metal dealers, with **two outgoing communication types**.

**Deals (the dealer SELLS).** A dealer (the only account type) creates **deals** (material grade, packaging, loads, weight, shipping types, photos), keeps an **encrypted contact list** organized into **groups**, and **publishes** deals to selected groups and/or individual contacts (de-duplicated). Publishing creates a recipient record per contact per channel and shares a **per-deal link**; **email-channel recipients are emailed automatically when SMTP is configured**, SMS/WhatsApp send via Twilio when configured and otherwise degrade to manual link sharing. Buyers open the link — no account needed — view the deal **under the dealer's own branding**, and negotiate via chat with **text messages and USD bids with automatic weight-unit conversion**. No posted asking price — **price discovery happens in the bids**, and **accepting the latest bid from the other party closes the deal**. A **buyer portal** (contact-level link, reached from any deal page) lists every deal sent to a buyer, grouped Open/Won/Closed.

**Buying price sheets (the dealer BUYS).** The yard publishes what it will **pay** per material grade, sends it to suppliers, and each supplier replies on their own copy with the tonnage they have and the price they want — which the yard then counters, accepts, or declines. **Direction is the mirror of deals**: here the recipient is the seller and the yard's money goes out.

An **inbox** (Conversations) tracks unread buyer messages on deals, with **tab/desktop/email notifications**; **price-sheet negotiations feed the same unread counting and nudges**. There is **no public marketplace**.

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

`DealRecipient.ownerLastReadAt` is the read marker; **unread = buyer messages with `createdAt > ownerLastReadAt`** (null = never opened). Buyers have no equivalent (their page IS the thread). **`PriceSheetRecipient` carries the same two columns and follows the same rule**, so a supplier's offer counts toward the badge and the nudge sweeper exactly like a buyer message.

- **List data**: `GET /api/deals` recipients carry `contactName` (decrypted), `unreadCount`, and `lastMessage` — encrypted blobs and raw message arrays are stripped server-side. Unread is counted in JS (Prisma can't filter a `_count` against a per-row column); fine single-tenant.
- **Conversations page = inbox**: one row per conversation (deal × contact × channel), sorted by last activity; unread dot + count, bid previews in mono, "You:" prefix, closed chip; 15s refresh. Rows deep-link to `/dashboard/deals/{id}?conversation={recipientId}`.
- **Deal page**: honors `?conversation=` deep link, else auto-expands the most recently active thread. Unread pills on collapsed headers. **Reading marks read**: `POST /api/deals/[id]/mark-read {recipientId}` fires when the open conversation has unread (on expand or on arrival while open), optimistic local update, poll-resurrection self-heal. Copy button on each conversation's deal link.
- **Nav badge**: `GET /api/unread-count` polled by DashboardNav on route change + every 30s (runs in hidden tabs too — browsers throttle to ~1/min there, fine); badge on Conversations tab (99+ cap). Dashboard deal cards show "N new". **Counts deals AND price-sheet threads.**
- **Price-sheet threads are NOT yet rows on the Conversations page** — they surface via the badge, the nudge email, and the "N awaiting you" chip on the Prices list. That page builds its rows from `/api/deals`, so adding them needs its own data source (gap #36).

## Notifications (tiered)

- **Tier 1 — tab title (shipped):** DashboardNav mirrors the unread count into `document.title` — `(3) ScrapTrader`. Strips/reapplies its own `(n) ` prefix so per-page titles and navigation survive.
- **Tier 2 — desktop notifications (shipped):** when the unread count INCREASES while the tab is hidden and Notification permission is granted, the nav pops an OS toast (tag-deduped; click focuses the tab and routes to the inbox). Permission is requested only via the "Enable alerts" button in the nav (shown while permission is "default" — browsers want a user gesture). Dies with the tab by design; that's Tier 4's job.
- **Tier 3 — email digests (shipped):** `lib/notify.ts` runs a single in-process sweeper (60s interval, lazily started via `ensureNudgeSweeper()` from the deal messages POST, the price-sheet offer and messages POSTs, and unread-count GET; HMR-safe global, overlap-guarded). **ONE EMAIL PER DEALER, NOT PER CONVERSATION** — a digest listing everything waiting. Schedule: a thread QUALIFIES once its oldest unread is ≥ 15 minutes old (Tiers 1–2 cover live attention, so email doesn't need a hair trigger); a digest SENDS if anything qualifies and the dealer hasn't had one in 6 hours. Fast on the first thing that needs you, quiet on repeats; ceiling of ~4 emails per dealer per day. "Last digested" is derived as the max `lastNudgeAt` across the dealer's recipients — no extra column. Deal and price-sheet threads share the digest and both deep-link to the thread. Send failures are stamped anyway (no retry storms; badge/inbox still show the work). **Why a digest:** every dealer shares ONE Workspace sending account whose daily quota is mostly spent on publish emails, and a mailbox of "you have unread messages" trains the reader to ignore them. Requires SMTP; skipped otherwise.
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

**Snapshot semantics.** Publishing LOCKS the sheet (server-enforced on PATCH, mirroring the closed-deal guard). A supplier's counter is meaningless unless the prices they were quoting against are frozen. New prices = a new sheet; the line items carry forward so nobody retypes 48 rows.

**The COMEX basis is its own numeric column** (`comexBasis`), not prose in the header note, because it does real work: it drives the staleness check. `headerNote` is free text for anything else (terms, "Delivered to our yard"). The editor links out to a public COMEX quote page rather than fetching — we link, never scrape.

**Seeding.** The first sheet is pre-filled from `STARTER_ITEMS`. Every later one seeds from the most recent **published** sheet — categories, names, prices, notes, units and ordering, plus the title — falling back to any sheet if the dealer hasn't published one yet. Published is preferred deliberately: it's a known-good state, whereas an abandoned half-edited draft would propagate its blanked lines into every sheet after it. **Duplicate** on a specific row bypasses that and copies that exact sheet whatever its status.

What is NOT carried forward: `comexBasis`, `headerNote`, `effectiveDate` (resets to today), and `expiresAt`. Everything that is a point-in-time statement is cleared; everything structural comes along. A blank basis on a new sheet isn't an omission — it forces the deliberate re-entry that the staleness check then compares the inherited prices against.

**Per-recipient links.** `PriceSheetRecipient.accessToken` — one per contact per channel, like `DealRecipient`. A response has to be attributable, so there is no shared link. (An earlier design used one public token per sheet; it was replaced when responses were added.)

**The negotiation.** One `PriceSheetResponse` per recipient — revising updates it rather than stacking rows, so there is always exactly one current position per side. Lines are `PriceSheetResponseLine` (weight + unit, optional `buyerPrice` ask, optional `dealerPrice` counter); a null `buyerPrice` means "your quoted price is fine", which is the common case and shouldn't require typing.

| status | meaning | whose move |
|---|---|---|
| `submitted` | supplier sent or revised their numbers | yard |
| `countered` | yard countered one or more lines | supplier |
| `accepted` | yard took their current numbers | — terminal |
| `declined` | yard passed | — terminal |

Terminal states are enforced on **both** sides: the public route refuses further revisions, and the dealer route refuses further actions. A decision can't be silently reversed from a link still sitting in an inbox.

**Both sides get told.** Submitting or revising an offer emails the yard (`sendPriceSheetResponseNotice`, platform-branded). Counter/accept/decline notifies the SUPPLIER on **the channel they were reached on** — a full `sendPriceSheetOutcomeEmail` with line detail and total, or a short SMS/WhatsApp with the link. Best-effort throughout: a send failure never blocks the decision. Without the supplier half the loop is one-way and counters die unanswered, which is exactly how it shipped for a few hours (gap #31).

**Threads, not just numbers.** Every offer and every yard action also writes a `Message` on the recipient thread — the offer as a `senderType: "buyer"` row with a generated summary, the counter/accept/decline as `"owner"`. That one decision is what makes price sheets free: unread counting, the nav badge, and Tier-3 nudges all work with **no special-casing**, because an offer is literally an unread buyer message. Free-text chat runs on the same rows (`/api/public/prices/[token]/messages`, `/api/price-sheets/[id]/messages`) for everything the numbers can't carry.

**Weight normalization.** A supplier may enter tons against a line quoted in $/lb. `weightInPriceUnit()` and `lineValue()` (in `price-sheet-defaults.ts`) convert to the LINE's basis before anything is displayed or summed — the dealer sees the weight in the quoted unit with "entered as 40 tons" underneath, plus a per-line dollar value. Totals are shown **only when every line can be valued**; a partial sum labelled "total" is worse than none, so per-each lines suppress it and say so.

**Expiry.** `expiresAt` is optional. Past it the public page still SHOWS the prices (a supplier needs to see what lapsed) but POST refuses — a locked snapshot with an unbounded lifetime is how a yard ends up honouring three-week-old copper.

**Channel split.** Email inlines the FULL price table (suppliers compare sheets side by side in their inbox); SMS/WhatsApp send the link only — 48 lines would be dozens of billable segments and unreadable on a phone.

**Publishing guard.** If no selected contact has an address/number for the chosen channels, the route bails with a 400 **before** locking — otherwise a first publish that reached nobody would freeze the sheet and force a duplicate to fix a missing email address.

## Material grades (deals)

**The ISRI specification list was REMOVED 2026-07-30.** ~180 formal codes ("Taint/Tabor", "Birch/Cliff") were replaced by the grades a yard actually trades, in the yard's own words, grouped the way a price sheet is grouped. Nobody picks "Taldon" from a dropdown. If formal codes are ever needed again — export contracts quote them — reintroduce them as an OPTIONAL cross-reference field on `MaterialGrade`, not as the primary vocabulary.

**Per-user data, not a static file.** `MaterialGrade` rows, lazily seeded from `DEFAULT_GRADES` the first time a user's list is read (lazy so existing accounts get it without a backfill, and `createMany`+`skipDuplicates` makes concurrent reads safe). Yards add their own grades inline **from the deal form** — the moment you need a missing grade is while creating a deal, and bouncing to a settings page would lose the form.

**One vocabulary for both subsystems.** `DEFAULT_GRADES` is *derived* from `STARTER_ITEMS` — the same list that seeds a price sheet — rather than being a second copy. "Romex" therefore means the same thing on a deal and on a price sheet by construction, and the two can't drift.

**Deals snapshot the NAME, not a foreign key** (`Deal.material` is a string), same rule as address snapshots. Consequences, all deliberate: deleting a grade removes it from the picker but never rewrites deals published under it; there is no rename, because renaming would leave the deals and the list quietly disagreeing; and PUT validates the material **only when it's being changed**, so a deal carrying a retired grade stays editable (you can fix its weight without re-picking a material that no longer exists).

`lib/materials.ts` is client-safe (imported by `MaterialSelect`); anything needing the DB lives in `lib/materials-server.ts` (`isValidMaterial`, which accepts any of the user's grade names OR category names). `npm run clean:deals` deletes deals whose material predates the switch, removing their upload directories too — a raw DB delete would orphan the files.

## COMEX market data (dormant)

`lib/market.ts` + `GET /api/market/copper` (authenticated — it spends a third-party quota) fetch a live COMEX copper basis, used for two things on a DRAFT price sheet: a **"Use current Comex"** button that prefills `headerNote`, and a **staleness warning**.

**⚠ DORMANT.** Copper is premium-only on API Ninjas' free tier (which also rotates its free commodity list weekly), and that tier forbids commercial use regardless. With no `COMMODITY_API_KEY` the button and warning simply don't render. A paid plan is the only change needed.

**Licensing posture.** CME licenses real-time, delayed AND end-of-day data, and powering an application with it is separately licensed as "non-display" use. The number therefore **prefills a field the dealer edits and publishes as their own stated reference** — exactly what they already do by hand. Keep it that way; an automatic unreviewed figure stamped on outgoing sheets is a different licensing question.

**Staleness heuristic.** Rather than tracking provenance, the basis is inferred from the sheet itself: the highest per-pound line on a scrap buying sheet is essentially always bare bright copper at ~90% of COMEX, so dividing recovers what the sheet was written against. Past 15% divergence the editor warns, states its own assumption, and tells the operator to ignore it if their spreads differ. Catches both the starter template published unedited and last month's sheet duplicated after the market moved.

**Provider evaluation is recorded in `market.ts`** — don't re-run it. The trap: most "copper APIs" sell LME-based SPOT per troy ounce or tonne, which is NOT the COMEX futures price in $/lb that a US scrap sheet means. metals.dev (lbma/lme/mcx/ibja only), Metals-API (LME-XCU per troy ounce) and Metal Sentinel (unofficial Kitco mirror, no exchange field) were all rejected on that basis.

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

## COMEX basis (manual)

A price sheet carries a **`comexBasis`** column — the COMEX copper $/lb it was priced against — entered by the dealer, with a **"Look up COMEX ↗"** link beside the field (`COMEX_LOOKUP_URL`) so the lookup isn't a memory test. We LINK, never scrape: comexlive.org isn't a licensed redistributor and its layout is not a contract.

**Staleness check** (`checkBasis`) compares the sheet's IMPLIED basis against the one the dealer entered. Implied is inferred from the sheet itself — the highest per-pound line on a scrap buying sheet is essentially always bare bright copper at ~90% of COMEX, so dividing recovers what it was written against. Past 15% divergence the editor warns. Needs no market feed, and catches both directions: a sheet duplicated without repricing, and a basis updated without repricing the grades under it.

**A live-fetch integration was built and then REMOVED (2026-07-30)** — `lib/market.ts` + `/api/market/copper` prefilled the field from an API. Deleted because the dedicated field plus the lookup link does the job with no dependency, no cost, and no licensing exposure. **Don't rebuild it without reading this first:**

- **The trap:** most "copper APIs" sell LME-based SPOT priced per troy ounce or tonne, which is NOT the COMEX futures price in $/lb that a US scrap sheet means by "Comex". Labelling an LME-derived number "Comex" would be wrong in a way nobody would catch. Verify EXCHANGE and UNIT on a live response, not just that the provider says "copper".
- **Providers evaluated:** API Ninjas — COMEX, USD/USX per lb, CORRECT contract, but copper is premium-only and the free tier forbids commercial use. metals.dev — authorities are lbma/lme/mcx/ibja, no COMEX, spot in troy ounces; rejected. Metals-API — LME-XCU per troy ounce; rejected. Metal Sentinel — unofficial Kitco mirror with no exchange field, so COMEX is unverifiable; rejected. OroTracker — gold/silver only.
- **Licensing if revisited:** CME requires an Information License Agreement for real-time, delayed AND end-of-day data, and powering an application with it is separately licensed as "non-display" use. Keep any fetched number a PREFILL the dealer reviews and publishes as their own stated reference — never an automatic figure stamped on outgoing sheets.

## Security headers

Set in `next.config.ts` (not nginx) so they hold in dev, through a tunnel, and on any host:

- **`Referrer-Policy: strict-origin-when-cross-origin`** — the significant one. Buyer/supplier pages carry a CREDENTIAL IN THE PATH (`/deal/{token}`, `/portal/{token}`, `/prices/{token}`). Any outbound link from those pages would otherwise leak the whole URL, token included, in the `Referer` header. Nothing links out today; this makes it safe when something does.
- **`X-Frame-Options: DENY`** — nothing here is meant to be framed, and a framed dashboard invites clickjacking a Delete or Accept.
- **`X-Content-Type-Options: nosniff`** — logos are stored as received (only deal photos are re-encoded), so a file that sniffs as HTML must not be served as HTML. Covers the `/uploads/*` half of gap #22 regardless of proxy.
- **`Permissions-Policy`** — camera/mic/geolocation/payment denied; nothing uses them.

No CSP yet — Next's inline styles/scripts make a strict one real work, and the dynamic `--brand-*` custom properties on buyer pages would need `style-src 'unsafe-inline'` or nonces. Worth doing before public launch, not before beta.

## Input bounds (per audit rounds 2–3)

Server-side length caps everywhere untrusted (or bulky-when-encrypted) input is stored: messages 4000 (see Chat); contact name 200, contact email/phone/whatsapp 320 each (trimmed, then encrypted — `contacts` POST); registration email 320 / name 200 / companyName 200 and password 8–200; group names 100; addresses street 200 / city 100 / zip 20; state validated against the US code list. **Price sheets:** title 120, header note 200, category 60, item name 120, price note 60, **300 lines max**; supplier offers cap the note at 1000 and reject weight > 10,000,000 or price > 1,000,000 per line (fat-fingered-zero guard — 10M lbs is ~4,500 tons, far past any truckload). Numeric bounds: bid amount (0, 1e9], loads ≥ 1 integer, weight > 0. These are authenticated-input hygiene for the dealer's own account except the message cap, the register caps, and public-token limits, which are genuine abuse boundaries. Whole-request size is bounded separately — see Request body limits.

## Client fetch hardening

`lib/fetch-json.ts`: `fetchJson<T>()` + `ApiError` — network failures (status 0), non-JSON tolerated, server `{error}` surfaced. Load failures → friendly error cards; mutations → inline banners; polls keep current data.

## Email (SMTP / Google Workspace)

`lib/mailer.ts`: shared branded shell; `sendDealEmail()` + `sendBidAcceptedEmail()` + `sendPriceSheetEmail()` (dealer-identity From display name + Reply-To) + `sendUnreadNudgeEmail()` and `sendPriceSheetResponseNotice()` (platform→dealer, ScrapTrader-branded). Dealer logo renders in buyer-facing emails as a LINKED image (absolute URL from `NEXTAUTH_URL` + `user.logoUrl`) — recipients fetch it at open time, so it requires a reachable origin (tunnel in dev; permanent domain in prod). All user-controlled strings HTML-escaped; plain-text alternatives; failures never break publish/accept/nudge-sweep. **Both `sendDealEmail()` and `sendBidAcceptedEmail()` link to the specific deal** (`/deal/{accessToken}`); buyers reach their portal from the "All deals" link on that page. **`sendPriceSheetEmail()` inlines the full price table** and links to that supplier's own copy (`/prices/{accessToken}`) with a "Tell Us What You Have" CTA; **`sendPriceSheetResponseNotice()`** tells the dealer a supplier replied, and whether they took the quoted prices or are asking above them. **`sendPriceSheetOutcomeEmail()`** tells the SUPPLIER the yard countered/accepted/declined, with line detail and total — dealer identity AND dealer branding, because it must look like the sheet that opened the conversation. The two platform→dealer emails (nudge, response notice) stay ScrapTrader-branded on purpose: those are the app talking to its user. Dev: links use `NEXTAUTH_URL` (tunnel: set it to the tunnel URL + restart; `allowedDevOrigins` in next.config.ts) — nudge deep links use it too.

## SMS & WhatsApp (Twilio)

`lib/sms.ts`: `sendDealSms()` / `sendDealWhatsApp()` / `sendPriceSheetSms()` / `sendPriceSheetWhatsApp()` / `sendOutcomeSms()` / `sendOutcomeWhatsApp()` via Twilio's Messages REST endpoint. **Mirrors the mailer pattern deliberately — configuration is detected from env, and an unconfigured channel silently degrades to manual link sharing. There is no feature flag: add the vars and restart.** SMS and WhatsApp are detected INDEPENDENTLY (`isSmsConfigured()` / `isWhatsAppConfigured()`) because Twilio approves them separately and one usually lands first.

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
scripts/
  backfill-keys.ts         # one-off, idempotent: wrap account keys + normalize legacy ciphertext
  clean-orphan-deals.ts    # delete deals whose material predates the yard-grade switch (+ upload dirs)
  set-company.ts           # set User.companyName (dealer trading name, not the platform name)
src/
  proxy.ts                 # JWT check on /dashboard/*
  lib/
    auth.ts / db.ts / us-states.ts / address.ts / image-validation.ts
    encryption.ts           # AES-256-GCM (Node crypto); v2 only, legacy reader removed
    master-key.ts           # envelope encryption: wrap/unwrap account keys under ENCRYPTION_MASTER_KEY
    body-limit.ts           # enforceBodyLimit + per-route size caps (413)
    deal-fields.ts / theme-extract.ts
    materials.ts            # DEFAULT_GRADES (derived from STARTER_ITEMS), groupGrades — CLIENT-SAFE
    materials-server.ts     # isValidMaterial (DB) — server only, keeps Prisma out of the client bundle
    market.ts               # COMEX copper fetch + provider evaluation notes (DORMANT)
    bids.ts                # conversion + parseIncomingMessage (MAX_MESSAGE_LENGTH) + buildBidConfirmText
    accept-bid.ts          # finalizeAcceptedBid (atomic close + notices + winner email)
    notify.ts              # Tier-3 nudge sweeper (in-process, ensureNudgeSweeper)
    portal.ts              # ensurePortalToken / rotatePortalToken / revokePortalToken (caller proves ownership)
    price-sheet-defaults.ts # STARTER_ITEMS (Ruby sheet), PRICE_UNITS, formatPrice, weight/basis math, staleness check
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
      price-sheets/[id]/responses/[responseId]    # PATCH counter | accept | decline (terminal states enforced;
                                                  # notifies the supplier on their own channel)
      price-sheets/[id]/messages/route.ts         # POST dealer message | markRead
      materials/route.ts              # GET (lazy-seeds the yard's grades) / POST add
      materials/[id]/route.ts         # DELETE (picker only — deals keep their snapshot)
      market/copper/route.ts          # GET COMEX basis; authed; dormant without COMMODITY_API_KEY
      public/deal/[token]/(route|messages|accept-bid)  # RATE LIMITED + body-capped;
                                                       # "You" masking; images projected to {id,url};
                                                       # returns portalToken for the "All deals" link;
                                                       # messages POST warms nudge sweeper
      public/portal/[token]/route.ts                   # RATE LIMITED
      public/prices/[token]/route.ts                   # RATE LIMITED + body-capped;
                                                       # GET supplier's own copy (resumable form state)
                                                       # POST submit/revise offer; notifies dealer
      public/prices/[token]/messages/route.ts          # RATE LIMITED; supplier free-text thread
public/uploads/{dealId}/ + public/uploads/branding/{userId}/  # gitignored
```

## Data model

- **User** — auth, `encryptionKey` (**stored wrapped under the master key**), `preferredWeightUnit`, branding fields.
- **Contact** — encrypted PII; groups m2m; `portalToken?` unique (minted at first publish or on demand; rotatable/revocable); `tags` vestigial.
- **ContactGroup / YardAddress** — labels/addresses (plaintext).
- **Deal** — title/material/packaging/loads/weights/shipping, address snapshots, status draft→published→closed, accepted-* snapshot. `askingPrice`/`priceUnit`/`location` vestigial.
- **DealRecipient** — contact × channel; `accessToken` = buyer credential+identity; status pending/sent/viewed; **`ownerLastReadAt?`** = owner read marker; **`lastNudgeAt?`** = last Tier-3 email about this conversation (one per unread batch).
- **Message** — **polymorphic since 2026-07-30**: belongs to EITHER a `DealRecipient` OR a `PriceSheetRecipient` (exactly one FK set, both nullable). senderType incl. "system"; type message|bid; buyer senderName server-derived, masked "You" publicly. Generalized so price-sheet negotiations reuse the inbox rather than forming a parallel silo.
- **MaterialGrade** — the yard's own grade vocabulary: `category` + `name` + `sortOrder`, unique per `[userId, name]`. Lazily seeded from `DEFAULT_GRADES` on first read; extensible by the yard.
- **DealImage** — photos (re-encoded .jpg; `filename` keeps the original upload name for display).
- **PriceSheet** — buying prices; `title`, `headerNote` (market basis), `effectiveDate`, **`expiresAt?`** (past it the page still shows prices but refuses offers), status draft→published (**locked on publish**).
- **PriceSheetItem** — one grade: `category` + `name` + `sortOrder`, and EITHER `price` OR `priceNote` ("Need Pics"), `unit` lb/ton/each.
- **PriceSheetRecipient** — contact × channel; `accessToken` = the supplier's own link; status pending/sent/viewed/responded; **`ownerLastReadAt?`/`lastNudgeAt?`** mirroring DealRecipient so the inbox machinery works unchanged.
- **PriceSheetResponse** — one per recipient (revisions update in place); status submitted→countered→…→accepted|declined; `buyerNote`/`dealerNote`; **`agreedTotal?`** frozen at acceptance so later changes to conversion logic can't restate what was agreed.
- **PriceSheetResponseLine** — what the supplier has: `weight`+`weightUnit`, `buyerPrice` (their ask; null = accepts quoted), `dealerPrice` (yard's counter).

## Publish flows / Auth

**Deals.** **Closed deals rejected (400)**; de-duped union, skip existing pairs, **undecryptable contacts skipped and counted (`unreadable`) rather than aborting the run**, **portal token minted per contact** (not sent — it backs the deal page's "All deals" link), **per-deal links emailed/texted/shared**, **each channel dispatches when its own credentials are present and degrades to link-sharing when they aren't**, failures never abort (they're counted and named in the summary); status write is a guarded transition (never overwrites "closed"); new deals appear on portals automatically. The response is an **explicit projection**, not a spread of the recipient row.

**Price sheets.** Same shape: de-dupe on contact × channel, skip already-sent pairs, skip undecryptable contacts, per-channel dispatch with graceful degradation. Differences: a **per-recipient `accessToken`** is minted for each send, publishing **locks the sheet**, and the route **bails with a 400 before locking** if nothing was actually sent.

**Auth.** Proxy JWT on /dashboard/*, layout gate, userId scoping everywhere, public routes = token + rate limit.

## Environment variables

`NEXTAUTH_SECRET` (JWT; **required in production — boot fails without it**), **`ENCRYPTION_MASTER_KEY`** (wraps every account's contact-encryption key; **required in production, no dev fallback, 32+ chars — losing it makes contact PII unrecoverable, so back it up off-host**), `NEXTAUTH_URL` (links/emails/nudge deep links/logo URLs), `DATABASE_URL` (or `TURSO_*`), `SMTP_USER`/`SMTP_PASS` (+ optional `SMTP_HOST`/`SMTP_PORT`/`SMTP_FROM`), `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` + `TWILIO_SMS_FROM` and/or `TWILIO_WHATSAPP_FROM` (each channel independently optional — absent = manual link sharing), `COMMODITY_API_KEY` (optional; COMEX basis prefill + staleness warning — absent = the feature doesn't render).

## Commands

```
npm run dev / build / lint
npm run backfill:keys [-- --dry]       # wrap account keys + normalize legacy ciphertext
npm run clean:deals [-- --dry]         # delete deals whose material predates the yard-grade switch
npm run set:company -- "Name" [email]  # set the dealer's trading name
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

## Deployment

`deploy/` holds the production setup: systemd unit (+ launch wrapper), nginx site and proxy snippet, deploy/rollback scripts, nightly backup, and a step-by-step README. Target is a single DigitalOcean droplet (~$15/mo all-in): one Node process, SQLite on local disk, nginx terminating TLS.

**Single process is architectural, not a cost saving.** In-memory rate-limit buckets and the nudge sweeper mean a second worker would duplicate every digest email and multiply rate-limit ceilings. The systemd unit says so; see gap #43 for the order things break as yards are added.

Key properties: master key injected via systemd `LoadCredential` (never in `.env`, never in a snapshot — gap #29); nginx **overwrites** `X-Forwarded-For` so per-IP limits can't be spoofed (gap #22); uploads live at `/var/scraptrader/uploads` outside the release directories, so a deploy can't wipe deal photos (gap #3); timestamped releases with a `current` symlink, so rollback is a symlink swap (code only — not migrations).

**Vercel was considered and rejected**: ephemeral filesystem (uploads vanish), no persistent process (rate limiter and sweeper both break), and Hobby is non-commercial so a real beta means $20/mo before rewriting three subsystems.

## Known gaps / tech debt (as of 2026-07-30)

1. ~~Encryption key stored beside the data~~ — **RESOLVED 2026-07-26**: envelope encryption. `User.encryptionKey` is stored wrapped (`w1:`, AES-256-GCM) under `ENCRYPTION_MASTER_KEY` from the environment, so a database dump alone no longer yields contact PII. See "PII encryption". **Residual risk, by design:** the master key currently sits in `.env` on the same host as the app, so a full host compromise still reads everything — moving it to a systemd credential, a mounted secret, or KMS is the next increment, and `master-key.ts` is the only file that changes. Also: **back the value up off-host** — losing it destroys all contact data.
2. ~~dev-secret JWT fallback~~ — **RESOLVED 2026-07-17**: auth.ts throws at boot in production without `NEXTAUTH_SECRET`.
3. **Uploads won't survive serverless** — droplet deploy preferred (also SQLite).
4. **Chat "live" updates are polling**, not push.
5. **Accepted `npm audit` moderates (non-runtime)** — npm "fixes" are major downgrades, do NOT apply; `npm audit fix --force` banned.
6. **Vestigial:** `Contact.tags`, `Deal.askingPrice`/`priceUnit`/`location` (one future cleanup migration incl. PRICE_UNITS + buyer asking-price block), no contact/address edit endpoints; pre-email recipients falsely "sent". (`Deal.expiresAt` was vestigial and remains so — note `PriceSheet.expiresAt` is a DIFFERENT, live column.) Company name has no UI — use `npm run set:company`.
7. ~~Register route leaks String(error)~~ — **RESOLVED 2026-07-17**: generic 500, real error server-logged.
8. ~~Buyer page shows raw material code~~ — **RESOLVED 2026-07-30** as a side effect of dropping ISRI: `Deal.material` now stores a human grade name ("Clean Auto Rads"), so there's nothing to translate. `materialLabel()` is an identity function, kept only so call sites don't have to care if a cross-reference field is ever added.
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
22. **At deployment: configure nginx** to (a) OVERWRITE `X-Forwarded-For` with the real client IP (strip client-supplied values) so per-IP rate limits regain teeth, (b) set `client_max_body_size` per location — small for JSON routes, ~12 MB for `api/deals/[id]/images` — as the hard backstop behind `lib/body-limit.ts`, and (c) send `X-Content-Type-Options: nosniff` on `/uploads/*`. **Do gaps #29 (master key off the app host) and #39 (transactional email) in the same session** — all four are deployment-time config, not code.

23. ~~Landing-page claim overstates the encryption model~~ — **RESOLVED 2026-07-26**, with a **second instance found and fixed 2026-07-30**: the Contacts page subtitle still read "Even ScrapTrader cannot read your contact list" long after the landing page was corrected. Both now state the real posture (AES-256-GCM at rest under a per-account key, decrypted only server-side, never sold/shared/cross-visible). **If this claim reappears anywhere, it's wrong** — the server must decrypt contacts to send publish emails and run the nudge sweeper, so "we can't read them" can never be true without giving up automated email.

24. **Logo URLs embed the dealer's internal `userId`** (`/uploads/branding/{userId}/…`) and are served to buyers on every deal/portal page. Cosmetic ID disclosure, not an access-control hole (the ID grants nothing on its own). Fixing it means a storage-layout change — a random per-logo directory — not a projection tweak.

25. **Per-email login throttle is a targeted-lockout lever.** 5 failures / 5 min keyed on the target email is spoof-proof by design, but anyone who knows a dealer's address can keep that bucket full from rotating IPs and hold them out of login. Softening options: CAPTCHA after N failures, or exponential backoff keyed on the email+IP pair.

26. **Register discloses account existence** ("Email already registered"). Closing it properly requires an email-verification flow (respond identically either way, confirm out of band). Kept deliberately for UX — signup caps (5/IP/hr, 20 global/hr) blunt enumeration at scale.

27. ~~Legacy crypto-js ciphertext branch~~ — **RESOLVED 2026-07-26**: reader deleted; `decrypt()` throws on non-`v2:` input. **The plaintext passthrough in `unwrapKey` deliberately REMAINS** — it's what lets a pre-envelope database (e.g. the `dev.db.bak-*` taken before the backfill) still open. Remove it only when those backups are gone.

28. **No per-deal link revocation.** Portal rotate/revoke (gap #16) invalidates the portal token only; every `DealRecipient.accessToken` the buyer already holds keeps working. This is the right default — deal emails now carry only the portal link, so rotating cuts off a leaked email — but a buyer who opened and bookmarked a deal page retains that page, and a dealer who manually shared a deal link can't take it back. Fix if needed: rotate every `accessToken` for a contact (rows and messages survive; only the URLs change), exposed as a "revoke all access" action.

29. **Master key lives in `.env` on the app host** — so envelope encryption defeats *database* theft (a stolen `dev.db` or Turso dump is useless) but not *host* compromise: an attacker with the droplet reads `.env` and the database together. Moving it to a systemd credential (`LoadCredential=`), a mounted secret, or a KMS closes that. `lib/master-key.ts` is the only file that changes — swap the `process.env` read for a file/KMS read. **Do this at deployment**, alongside gap #22's nginx work. Also: whatever holds the key must be backed up off-host, since losing it destroys all contact PII.

30. **Twilio: unproven, plus three things to settle before switching it on.** The code path is written and dormant (no credentials = manual sharing), so it is UNTESTED against the live API — the first real publish is the first real test. (a) **WhatsApp templates**: free-form messages only reach buyers inside a 24h window; cold outreach needs a Meta-approved template, which is a separate approval AND a code change (template SID + variables instead of a `Body`). (b) **Cost**: unlike email, every message bills. Publishing to a 200-contact group fires 200 SMS with no confirmation step — consider a spend guard or a "this will send N texts" confirmation. (c) **Consent/TCPA**: US commercial SMS needs prior express consent, and contacts were imported by dealers with no consent field anywhere in the schema. Twilio auto-handles STOP on US numbers, but the consent record is the dealer's problem and the product currently gives them nowhere to keep it.

31. ~~The supplier is never told the yard responded~~ — **RESOLVED 2026-07-30**: counter/accept/decline notify the supplier on the channel they were reached on (`sendPriceSheetOutcomeEmail` with line detail and total, or a short SMS/WhatsApp). Best-effort; a send failure never blocks the decision.

32. ~~Price-sheet negotiations are invisible to the inbox~~ — **RESOLVED 2026-07-30**: `Message` is polymorphic (`dealRecipientId` OR `priceSheetRecipientId`), offers and yard actions are written as thread messages, and `PriceSheetRecipient` carries `ownerLastReadAt`/`lastNudgeAt`. Nav badge and Tier-3 nudges now cover both. Free-text chat added on both sides. **Residual: still no rows on the Conversations page — see gap #36.**

33. ~~Weight units aren't normalized against the quoted basis~~ — **RESOLVED 2026-07-30**: `weightInPriceUnit()`/`lineValue()` convert to the line's basis before display or summation; the dealer sees the quoted unit with the entered figure beneath it, plus a per-line value. Totals appear only when every line can be valued.

34. ~~An accepted offer is a dead end~~ — **PARTLY RESOLVED 2026-07-30**: acceptance freezes `agreedTotal` on the response and both sides display it, so there's a durable record of what was agreed. Still nothing schedules a delivery or produces a purchase record — fine while fulfillment runs on paper.

35. ~~`effectiveDate` is decorative~~ — **RESOLVED 2026-07-30**: optional `PriceSheet.expiresAt`. Past it the page still shows prices (a supplier needs to see what lapsed) but submissions are refused server-side.

36. **Price-sheet threads aren't rows on the Conversations page.** The badge, the nudge email, and the "N awaiting you" chip all cover them, so nothing is missed — but the inbox itself still lists deals only, because that page builds rows from `/api/deals`. Needs its own data source (or a unified endpoint) to merge the two. Do this before the inbox is the dealer's primary surface.

37. **The starter grade template is anchored to a stale basis.** `STARTER_ITEMS` came from Ruby's 2025-09-02 sheet at Comex $4.49; copper has moved a long way since. A first-time dealer gets copper grades priced ~40% low. On a BUYING sheet that errs toward underpaying (so it costs nothing directly), and the staleness warning catches it — but only when market data is configured, which it currently isn't (gap #38). Consider labelling the values as placeholders in the editor.

38. **COMEX market data is dormant** — copper is premium-only on API Ninjas' free tier, whose free commodity list also rotates weekly, and that tier forbids commercial use. So the basis prefill and the staleness warning don't render. `lib/market.ts` works as-is against a paid plan; the provider survey (and why metals.dev / Metals-API / Metal Sentinel were rejected) is recorded in that file so it isn't repeated.

39. **TODO — MOVE TRANSACTIONAL EMAIL OFF WORKSPACE SMTP.** *(deferred 2026-07-30; do it with the nginx work in gap #22, and before a second yard onboards)*

    **Why.** Every dealer sends through ONE Google Workspace account (`SMTP_USER`), sharing its ~2,000/day external recipient cap. The dominant consumer is **publishing**, not notifications: one sheet to a 200-contact group is 200 emails in a single click, so a handful of yards exhausts the quota. Tier-3 digests (~4/dealer/day) are a rounding error by comparison. Workspace then refuses sends and nothing surfaces why — the dealer sees "12 failed to send" with no reason (gap #10).

    **Decision already made: a sending SUBDOMAIN we control, NOT per-dealer domains.** Per-dealer domains would mean each yard adding DKIM/SPF/return-path records at their own registrar. Scrap yards frequently don't know where their DNS lives, the login often sits with whoever built their site years ago, and a subtly wrong record doesn't bounce — it lands in spam silently, so nobody notices until a supplier says the sheet never arrived. Not a reasonable ask. Dealer identity is already carried by the From display name + Reply-To (suppliers see "Ross (Ruby Recycling)" and replies reach Ross), which is the part that actually matters. Offer per-dealer domains later as an upgrade for yards big enough to have someone who owns their DNS.

    **Steps.** DNS for `thescraptrader.com` is at **GoDaddy** (nameservers `ns63/ns64.domaincontrol.com`). 1) Pick a provider — Postmark (easiest, best transactional deliverability, clear webhooks) or SES (far cheaper at volume, needs an AWS account + production-access request out of sandbox). 2) Add `mail.thescraptrader.com` as a sending domain there; it generates the DKIM / SPF / return-path records. 3) Paste them into GoDaddy. 4) Verify. 5) Point `SMTP_HOST`/`PORT`/`USER`/`PASS` at the provider and set `SMTP_FROM` to `ScrapTrader <deals@mail.thescraptrader.com>`. **No code change** — `lib/mailer.ts` is plain SMTP either way. ~30-60 min, mostly waiting.

    **Two traps.** GoDaddy's **Name** field is RELATIVE and it appends the domain: type `mail`, not `mail.thescraptrader.com`, or you silently create `mail.thescraptrader.com.thescraptrader.com` and verification fails with no useful error. And **never add a second `v=spf1` TXT to the root** — a domain may have exactly one, and a second breaks SPF for ALL mail including Workspace inbound; merge an `include:` into the existing record instead. Keeping everything on the `mail.` subdomain avoids both, and leaves the root MX (Google Workspace inbound for `deals@thescraptrader.com`) untouched.

    **Do gap #10 at the same time** — a provider with delivery webhooks is what makes "why did this fail" answerable, and that's a better reason to switch than the raw volume.

40. **`undefined` in a Prisma WHERE means "no filter" — a whole bug class, found and fixed 2026-07-30.** `deleteMany({ where: { id, userId } })` with `id === undefined` collapses to `deleteMany({ where: { userId } })` and destroys every row the dealer owns, returning success. Three endpoints had it (`contacts`, `contact-groups`, `yard-addresses` DELETE); `deals/[id]/images` DELETE had the milder form, where `findFirst` matched an ARBITRARY image and deleted it. All now require a non-empty string id and 404 on no match. **Rule for any new endpoint: never let a client-supplied id reach a Prisma filter without a `typeof x === "string"` guard.** Prefer `deleteMany` + `result.count === 0 → 404` over `delete`, which throws on miss. There is no soft delete and no undo anywhere in this app.

41. **Uploaded deal photos are permanently public to anyone with the URL.** `/uploads/{dealId}/{uuid}.jpg` is served straight off disk by the static handler — no session check, no token check, no expiry. UUID filenames make them unguessable, and the buyer projection no longer leaks the original filename (gap #5), so the practical exposure is limited to whoever was legitimately sent the URL. But note what it means: **revoking a portal or closing a deal does NOT revoke image access.** A buyer who saved a photo URL keeps it forever, and so does anyone they forwarded it to. Fixing properly means serving images through an authorizing route (`/api/images/{id}` checking session-or-token) instead of `public/`, which also costs the static-file performance. Acceptable for yard photos; revisit if anything sensitive is ever attached to a deal.

42. **`GET /api/materials` performs a write.** It lazily seeds the yard's 48 default grades on first read. A GET that mutates is CSRF-reachable under `SameSite=Lax` (top-level navigation sends the cookie) and isn't cacheable. Impact is nil — it seeds defaults for an account that has none, and is idempotent — but it's the wrong shape. Move the seed to registration, or to an explicit POST, if the endpoint ever grows.

43. **SCALING ORDER — what breaks first, and it isn't the box.** *(logged 2026-07-30)* A $12 droplet handles dozens of yards on compute; scrap dealing is low-traffic and resizing is a reboot. Compute is not the constraint. The actual sequence:

    **(a) Email volume — first, around 5-10 active yards.** See gap #39. One 200-contact publish is 200 emails through a shared Workspace account.

    **(b) Synchronous publishing — next, and a CUSTOMER will find this, not a metric.** `POST /api/deals/[id]/publish` and the price-sheet equivalent send every email inside the request. That's why `deploy/scraptrader-proxy.conf` sets a 120s `proxy_read_timeout`. At ~500 contacts the request times out mid-send, leaving recipients created and some emails unsent — with no retry path. Fix: move sending to a job queue (or at minimum respond immediately and send in the background with a status the dealer can poll).

    **(c) In-process singletons — blocking at ~10 yards.** `lib/rate-limit.ts` buckets and the `lib/notify.ts` sweeper live in module memory. Consequences today: every deploy resets rate-limit state, every restart is a nudge gap until a request re-warms the sweeper, and **horizontal scaling is impossible** — two processes means two sweepers and duplicate digests to every dealer. This is why `deploy/scraptrader.service` forbids multiple workers. Fix: Redis for buckets, a real cron/worker for the sweeper.

    **(d) SQLite — a redundancy limit, not a performance one.** Two app servers can't share a local SQLite file, so the first time you want a second box (failover, zero-downtime deploys) you migrate. The Prisma schema ports to Postgres nearly unchanged — a day's work, but a day you can't do casually with live customer data. **Cheaper hedge:** `lib/db.ts` already uses the libSQL adapter, so hosted **Turso** is close to a config change (`TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` are already read) and buys replication without leaving SQLite.

    Nothing here is fixed by a bigger droplet. Treat the first sign of email trouble as the trigger to start (a), and do (b) before onboarding a yard with a large contact list.

Resolved (2026-07-15/17/26): upload validation; deal form overhaul; yard addresses; state validation; contact groups + de-dupe; dual addresses; ISRI materials; white-label theme engine + dark mode; SMTP dealer-identity email; dependency cleanup; conversation names; chat polling; bids + unit conversion; timestamps; rate limiting; fetch hardening; buyer identity from token; shipping city/state; Pricing card bid stats; contact-name privacy; bid acceptance flow; Active/Closed sections; buyer portal; design language Phase 1; inbox + unread tracking Phase 2; notifications Tiers 1–3; responsive floor for phones; image pipeline + deal-delete disk cleanup; security audit round 1 (closed-publish guard, auth throttling + timing equalizer, register hygiene, prod secret enforcement); **security audit round 2 — full-codebase read: message-length DoS cap (4000) + contact-field length clamps; confirmed clean on IDOR, SQL injection, secret leakage, stored XSS, CSS injection**; **security audit round 3 — crypto-js → AES-256-GCM (Node crypto) with legacy-format reader and the dependency dropped; request body caps (`lib/body-limit.ts`) on all public/auth/upload POSTs; buyer image projection narrowed to `{id, url}`; register/login defensive JSON parse + field caps + password upper bound + P2002 race; `contacts` GET and the publish loop degrade per-row instead of failing the whole request**; **portal auto-share (open decision #1) with rotate/revoke controls (gap #16)**; **landing-page security claims corrected to match the real posture (gap #23)**; **envelope encryption — account data keys wrapped under `ENCRYPTION_MASTER_KEY`, closing the long-standing key-custody gap #1**; **Twilio SMS/WhatsApp send path (dormant until credentials)**; **buying price sheets — snapshot sheets seeded from a starter grade list, per-recipient links, supplier offers with weights + counter prices, and a counter/accept/decline loop**; **price-sheet negotiation completed — supplier notified on their own channel, `Message` generalized so offers feed the inbox/badge/nudges, free-text chat both sides, weight normalized to the quoted basis, agreed total frozen at acceptance, optional sheet expiry (gaps #31–35)**; **ISRI list replaced by yard-owned, extensible material grades sharing one vocabulary with price sheets (gap #8)**.
