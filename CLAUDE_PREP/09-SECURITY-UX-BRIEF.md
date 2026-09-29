# EMBEE NEXUS — SECURITY UX BRIEF (V2)

**STATUS:** CURRENT · **AUTHORITY:** REFERENCE (principles retained; role model and providers re-based) · **LAST RECONCILED:** 2026-09-29 · **ERA:** V2

## Authentication

| Aspect | Implementation |
|---|---|
| Provider | Supabase Auth (GoTrue), email/password |
| Session | Cookie-based; no tokens in localStorage |
| Redirects | Unauthenticated → login; wrong role → 403/role-appropriate surface |
| Role gates | Server-side `requireRole([...])` on pages and route handlers; hiding UI is never the mechanism |

## Roles (V2)

| Role | Can access | Cannot access |
|---|---|---|
| `customer` | Landing, auth, dashboard, booking wizard, own orders, payment callback | `/rider/*`, `/operator/*` (403) |
| `rider` | Rider home, verification, offers, active-delivery actions, own evidence uploads | customer surfaces beyond shared chrome, `/operator/*` (403) |
| `operator` | Operator console (overview, orders, riders, jobs), controlled actions | customer/rider personal surfaces |

No `admin`/`super_admin` roles exist in V2; the V1 role table is historical.

## Data ownership (V2)

| Data | Owner | Read | Modify |
|---|---|---|---|
| Orders | Customer | participant + operator (RLS) | lifecycle actions via RPC |
| Offers / availability | Rider | rider-own; operator SELECT via migration 0019 policies | RPCs only |
| Rider profile | Rider | rider + operator | verification by operator RPC |
| Evidence photos | System (private bucket) | participant + operator via 300 s signed URLs | upload by custody RPC only |
| Payment rows | System | participant + operator (normalized states, no provider secrets) | verification RPC only |

## Sensitive data rules (retained, re-based)

Never display or expose: service-role keys, Flutterwave secret keys, database
connection strings, internal identifiers where a public reference exists,
other users' data, raw OTP codes (plaintext shown once, to the verifying
party's counterparty only — never stored client-side), provider transaction
identifiers or checkout URLs in operator payloads.

Safe to display: order reference, canonical status, timestamps, price
breakdown, rider first name/vehicle type, verification state, normalized
payment state.

## Webhook security

Flutterwave webhook is signature-verified server-side over the raw body,
idempotent, and has no frontend interaction. Payment status reaches the UI by
polling server truth only.

## Error messages (retained)

Safe: state what happened + next action, never reveal which credential or
record failed. Never show: database errors, stack traces, SQL, provider API
errors raw. Business rejections surface as canonical codes mapped to
human copy per role (`status-copy.ts`, `error-copy.ts`, `operator-labels.ts`).

## Input validation

Client-side validation is convenience only; every route handler re-validates
authoritatively (zod schemas, UUID checks, state-machine checks inside RPCs).
Rate limiting and attempt locks (e.g., 5-attempt OTP lock) are server-side.

## What this brief governs in design work

1. Never weaken server authorization for UI convenience.
2. Never place secrets, OTPs, or provider identifiers in client payloads.
3. Always design the 401/403/404 paths, not only the happy path.
4. Destructive actions require explicit confirmation (typed for operators).
5. Evidence access is metadata-first, signed-URL on explicit action, never
   public, never permanent links.

## Historical note

The V1 brief (Paystack/Resend specifics, admin/super_admin roles) is preserved
in `archive/v1/09-SECURITY-UX-BRIEF.md`.
