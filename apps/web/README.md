# @blacklist/web

The Blacklist user interface (Next.js App Router, React, Tailwind CSS, Radix primitives). **Status:** Phase 1 foundation implemented (design system, app shell, mock-backed auth, search and research UIs); see [docs/design/frontend.md](../../docs/design/frontend.md) for the design system, mock architecture and run commands. No backend exists: non-mock builds show a "not connected" state. Development is **frontend-first**. Phases 2–6 build the auth, research, reporting and staff UIs and run a quality pass, all against `@blacklist/contracts` and a typed mock client. Mocks confer no authority.

## Boundaries

- **UI only.** Calls the API: `/api/v1/*` from the browser; `API_INTERNAL_URL` (GET only) from server components.
- May import: `@blacklist/core`, `@blacklist/contracts`. Must never import `@blacklist/domain`, `@blacklist/db`, `@blacklist/chains`, `@blacklist/config`.
- **One server-side secret:** `INTERNAL_API_TOKEN`, read with `API_INTERNAL_URL` in `src/server/env.ts` (`import 'server-only'`). A CI bundle scan proves it never reaches the browser. Only non-secret `NEXT_PUBLIC_*` values reach the client.
- Authorization is enforced by the API. Route protection here is a UX redirect. `proxy.ts` (formerly `middleware.ts`) handles CSP nonces and coarse redirects only, **never** authorization.
- File separation (AGENTS.md §7): `.tsx` for UI, `.ts` for logic, Tailwind/CSS for styling, no standalone HTML, no mixed-responsibility files.

## Route map (V1)

| Group | Routes | Access |
|---|---|---|
| `(public)` | `/`, `/search`, `/address/[chain]/[address]`, `/tx/[chain]/[hash]`, `/project/[slug]`, `/finding/[id]`, `/methodology`, `/terms`, `/privacy`, `/security` | Anyone |
| `(auth)` | `/login`, `/register`, `/register/complete`, `/forgot-password`, `/reset-password`, `/email-change/confirm`, `/staff/enroll`, `/staff/verify` | Flow pages ([identity design](../../docs/design/identity.md)) |
| `(app)` | `/dashboard`, `/reports`, `/reports/new`, `/reports/[id]`, `/appeals/new`, `/responses/new`, `/corrections/new`, `/notifications`, `/settings/profile`, `/settings/security` | Signed in |
| `(staff)` | `/mod`, `/mod/cases/[id]`, `/mod/approvals`, `/mod/appeals`, `/mod/standing`, `/admin/*` | Staff session with WebAuthn assurance |

`[chain]` is a registry slug (`ethereum`, `solana`). Deferred: `/u/[handle]`, `/watchlists/*`, `/investigations/*`, `/trace/*`, `/graph/*`, `/leaderboard`, `/claims/*`.

**Token pages** (`/register/complete`, `/reset-password`, `/email-change/confirm`, `/staff/enroll`):

- read the token from the URL **fragment** (`#token=`) and strip it with `history.replaceState`;
- consume nothing on GET; submit by POST;
- send `Referrer-Policy: no-referrer` and load no third-party resources.

## Login page (`/login`) — build specification

Product requirements: PRD §5.2. Security behaviour: identity design §5, §11–§12.

- **Layout:** Blacklist branding; centred card on desktop, full width on mobile (320 px+); light and dark themes. No third-party scripts except the human-verification widget when challenged.
- **Fields:** email (`type="email"`, `autocomplete="username"`), password (`autocomplete="current-password"`) with an accessible show/hide toggle. Paste and password managers supported.
- **Links/actions:** "Sign in"; "Forgot password?" → `/forgot-password`; "Create an account" → `/register`.
- **States:**
  - idle;
  - inline validation (Zod from `@blacklist/contracts`, `aria-describedby`);
  - submitting (no double submit);
  - human-verification challenge;
  - staff → `/staff/verify` (WebAuthn);
  - generic failure "Email or password is incorrect";
  - rate-limited with guidance;
  - session-expired notice;
  - request ID on unexpected errors.
- **Never:** reveal whether an email exists, echo internals, or store tokens in `localStorage`.
- **Redirect:** `next` only as a validated same-origin relative path.
- **Copy:** "Blacklist will never ask for your seed phrase or private key."
- **Accessibility:** WCAG 2.2 AA, keyboard-only, visible focus, announced errors.
- **Tests:** testing-strategy §10.

`/register` asks for an email only (email-first). `/register/complete` collects handle, password and confirmation (15–128 Unicode code points, ≤ 512 bytes, show/hide, paste allowed). `/staff/enroll` collects the out-of-band enrollment code in addition to the fragment token.

## Planned layout (Phases 1–6)

```
src/
  app/(public)/ (auth)/ (app)/ (staff)/   route groups (.tsx)
  components/                              shared UI (.tsx): SafeExternalLink, AddressDisplay, RiskBadge, TransferBasis …
  styles/                                  globals.css (Tailwind layers, CSS variables)
  lib/api/                                 typed API client interface (.ts; browser + server variants)
  lib/api/mock/                            mock implementation + fixtures (.ts; dev/test only, excluded from production builds)
  lib/wallet/                              standing-proof message signing only (EIP-6963, Wallet Standard)
  server/env.ts                            server-only SSR env (API_INTERNAL_URL, INTERNAL_API_TOKEN)
  proxy.ts                                 CSP nonce, coarse redirects
```
