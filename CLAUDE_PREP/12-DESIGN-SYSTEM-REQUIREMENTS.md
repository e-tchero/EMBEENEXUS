# EMBEE NEXUS — DESIGN SYSTEM REQUIREMENTS (V2)

**STATUS:** CURRENT · **AUTHORITY:** REFERENCE (each requirement classified against actual V2) · **LAST RECONCILED:** 2026-09-29 · **ERA:** V2

Classification vocabulary: `IMPLEMENTED · PARTIALLY IMPLEMENTED · PLANNED ·
SUPERSEDED · NOT APPLICABLE TO V2 WEB PILOT · OWNER DECISION REQUIRED`.
The token values layer is governed by the founder palette (brand/) and the
app contract (`apps/web/DESIGN.md`); this document classifies requirements,
not duplicate values.

## Foundation

| Requirement | V2 classification | Notes |
|---|---|---|
| Brand colors (6 swatches) | IMPLEMENTED (documentation) / PLANNED (CSS integration) | founder palette canonical in `brand/COLOR-SYSTEM.md`; app tokens re-base approved |
| Semantic colors (primary/secondary/destructive/success/warning) | PARTIALLY IMPLEMENTED | app has status-* semantics; action color re-base pending |
| Dark-mode variants | IMPLEMENTED | `prefers-color-scheme` auto-flip; AA-verified |
| Neutral scale 50–900 | PARTIALLY IMPLEMENTED | Tailwind neutrals in use; formal scale documented at re-base |
| Accessibility contrast requirements | IMPLEMENTED | AA verified per pairing; derivatives frozen |
| Manrope type scale (12–30px) | PLANNED | typeface integration approved for next phase; no formal scale yet |
| Spacing 4px base, scale 4→96 | IMPLEMENTED (in practice) | Tailwind 4px grid used throughout |
| Radius 8/12/16 + optional 20 | IMPLEMENTED (as 12/16) | founder decision 2026-09-29: border-first, minimal shadows; `rounded-lg` 12 and `rounded-xl` 16 in use; 8 and 20 documented as vocabulary, adopt where appropriate |
| Shadow scale (small/medium/large) | **SUPERSEDED** | founder decision: borders carry elevation; shadows minimal |
| Borders 1px default, 2px focus | PARTIALLY IMPLEMENTED | 1px borders in force; focus uses browser default ring — formalize at re-base |

## Component layer

| Component | V2 classification | Notes |
|---|---|---|
| Button (variants × sizes × states) | PARTIALLY IMPLEMENTED | primary/secondary/danger exist inline per surface; loading/disabled in force; extraction optional, not forced |
| Input / Select / Textarea | PARTIALLY IMPLEMENTED | route-local; labels-above, inline errors in force |
| OTP input | IMPLEMENTED | mono boxes, paste-safe |
| Badge / Status badge | PARTIALLY IMPLEMENTED | status copy single-sourced; no shared primitive |
| Card | IMPLEMENTED | `rounded-xl border p-4` language; border-first |
| Modal/Dialog | PARTIALLY IMPLEMENTED | typed-confirm destructive dialogs (operator) |
| Toast/Alert | PARTIALLY IMPLEMENTED | alert/status regions; no toast system |
| Skeleton / Spinner | **NOT APPLICABLE TO V2 WEB PILOT** | explicit text/region loading states; skeletons deferred to mobile milestone |
| Tooltip / Avatar / Switch / Checkbox / Radio | **NOT APPLICABLE TO V2 WEB PILOT** | no current surface uses them |
| Timeline (order) | IMPLEMENTED | authoritative `order_events` rendering (operator detail) |
| Table / List | IMPLEMENTED | operator monitor + riders tables (wrapped top-nav density) |
| Price breakdown | IMPLEMENTED | server-priced quote display |
| Stat card | IMPLEMENTED | operator overview |

## Navigation

| Requirement | V2 classification | Notes |
|---|---|---|
| Top app bar | PARTIALLY IMPLEMENTED | operator wrapped top-nav; customer/rider minimal headers |
| Bottom tab bar | **NOT APPLICABLE TO V2 WEB PILOT** | future mobile milestone requirement |
| Sidebar | **NOT APPLICABLE TO V2 WEB PILOT** | operator console is top-nav by design |
| Breadcrumb / Pagination | **NOT APPLICABLE TO V2 WEB PILOT** | list sizes do not require them |

## Product-specific cards

| Component | V2 classification |
|---|---|
| Order card (customer) | IMPLEMENTED |
| Quote card | IMPLEMENTED |
| Offer card (rider) | IMPLEMENTED — 20 s TTL countdown |
| Delivery card (rider active) | IMPLEMENTED |
| Rider card (operator) | IMPLEMENTED |
| Status badge | IMPLEMENTED (via status copy single-sourcing) |
| Earnings card | **NOT APPLICABLE** — earnings excluded by founder |
| Notification item | **NOT APPLICABLE** — notifications excluded |
| Map container | **NOT APPLICABLE** — no map rendering in V2 web |

## Pattern layer

| Pattern | V2 classification |
|---|---|
| Loading states (explicit) | IMPLEMENTED |
| Empty states | IMPLEMENTED |
| Error states (retry, safe copy) | IMPLEMENTED |
| Destructive confirmation | IMPLEMENTED (typed) |
| Offline banner / permission deep-link | **PLANNED** (mobile milestone) |
| No-coverage / >35 km rejection | IMPLEMENTED (server-validated, surfaced in wizard) |

## Responsive variants

Mobile-first in force; every surface renders usable at 320px. Component-level
mobile/tablet/desktop variant matrices are **PLANNED** (Figma phase).

## Historical note

The V1-era specification is preserved in `archive/v1/12-DESIGN-SYSTEM-REQUIREMENTS.md`.
