<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# ScrapTrader — Agent Guide

Private CRM for scrap metal dealers: create deals, publish them to an encrypted contact list via unique tokenized links, negotiate with buyers through built-in chat. No public marketplace. **Publishing emails email-channel recipients automatically** when SMTP is configured; SMS/WhatsApp links are shared manually. **Dealers share PER-DEAL links** (`/deal/{accessToken}`); the buyer reaches their contact-level portal (`/portal/{portalToken}` — every deal sent to them, grouped Open/Won/Closed) via the "All deals" link on any deal page.

**Read `ARCHITECTURE.md` first** — it has the full stack, data model, flows, API surface, env vars, and the current known-gaps list. Keep both that file and this one updated when architecture or conventions change.

## Hard rules

- **Never edit `src/generated/prisma/`** — regenerate with `npx prisma generate`. Schema changes go through `prisma/schema.prisma` + `npx prisma migrate dev --name <name>`.
- **Every authenticated API route** must call `getCurrentUser()` from `@/lib/auth` and scope every query by `userId` (e.g. `findFirst({ where: { id, userId: user.id } })`, `updateMany`/`deleteMany` with both). Follow the existing routes as templates.
- **Contact PII never touches the DB in plaintext.** Use `encryptContact`/`decryptContact` from `@/lib/encryption` with `user.encryptionKey`. Decryption happens server-side only. **Always wrap `decryptContact` in try/catch** — it's AES-GCM, so a tampered or wrong-key row throws; degrade that row (`"(unreadable contact)"`) instead of failing the whole request.
- **`user.encryptionKey` is stored WRAPPED** under `ENCRYPTION_MASTER_KEY` (`@/lib/master-key`). Pass it to `encryptContact`/`decryptContact` exactly as it comes off the row — they unwrap internally. Never persist a raw key: new accounts go through `wrapKey()`.
- **Public buyer routes** (`/api/public/deal/[token]/**`) authorize by recipient `accessToken` possession only — never expose owner data beyond the whitelisted deal projection (see `public/deal/[token]/route.ts`).
- **Token helpers in `@/lib/portal` do NO authorization** — `ensurePortalToken`/`rotatePortalToken`/`revokePortalToken` take a contact id the caller has already scoped by `userId`. Prove ownership first, always.
- **Cap request bodies** on public, auth, and upload POSTs: call `enforceBodyLimit(req, …)` from `@/lib/body-limit` BEFORE `req.json()`/`req.formData()`.
- Next 16: `params` is a Promise — `await params` in route handlers, `use(params)` in client pages.

## Conventions

- Path alias `@/*` → `src/*`.
- Styling: Tailwind 4 utilities; theme tokens `brand`, `brand-dark`, `accent` are defined in `src/app/globals.css` — use them, not raw hex. Card pattern: `bg-white rounded-xl border border-slate-200`.
- Dashboard/auth pages are client components fetching from API routes with plain `fetch`; no data-fetching library. Match this pattern unless deliberately changing it project-wide.
- Windows dev machine, PowerShell. Local DB is `dev.db` (SQLite via libsql adapter); Turso vars take over in deployment.

## Commands

```
npm run dev
npm run build        # runs prisma generate first
npm run lint
npm run backfill:keys [-- --dry]    # wrap account keys + normalize legacy ciphertext
npx prisma migrate dev --name <name>
```
