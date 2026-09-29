# EMBEE NEXUS — DOCUMENT INDEX (V2)

**STATUS:** CURRENT · **AUTHORITY:** META (package map) · **LAST RECONCILED:** 2026-09-29 · **ERA:** V2

Every file in this package carries an explicit status. Statuses:
`CURRENT · PARTIALLY CURRENT · SUPERSEDED · HISTORICAL · UNKNOWN`. The
authority order when information conflicts:

1. Current explicit founder decisions (latest instructions win)
2. Current V2 implementation (the repository, `main`)
3. Current canonical repo documentation (`docs/design/CANONICAL_SOURCE_OF_TRUTH.md`, `apps/web/DESIGN.md`, `globals.css`)
4. Current BrandKit assets (`brand/assets/` — founder material)
5. Historical CLAUDE_PREP documentation (`archive/v1/` — evidence only)

---

## Root documents

| File | Status | Authority | Era | Notes |
|---|---|---|---|---|
| `README.md` | CURRENT | CANONICAL | V2 | Package entry point |
| `00-V2-BASELINE.md` | CURRENT | CANONICAL | V2 | Current repo state, verified 2026-09-29 |
| `00-BASELINE.md` | HISTORICAL | REFERENCE | V1 | V1 baseline, headered in place; see `00-V2-BASELINE.md` |
| `01-DOCUMENT-INDEX.md` | CURRENT | META | V2 | This file |
| `02-FRONTEND-ARCHITECTURE.md` | CURRENT | REFERENCE | V2 | Describes the real V2 web app |
| `03-PRODUCT-UX-BRIEF.md` | CURRENT | REFERENCE | V2 | V2 journeys; absent features marked absent-by-decision |
| `04-EXISTING-UI-INVENTORY.md` | CURRENT | REFERENCE | V2 | The 14 real pages |
| `05-API-CONTRACT-BRIEF.md` | CURRENT | REFERENCE | V2 | The 31 real API routes |
| `06-STATE-MACHINES.md` | CURRENT | CANONICAL-for-reconstruction | V2 | Derived from `order-state.ts` + migration 0005 |
| `07-MAPS-LOCATION-BRIEF.md` | CURRENT | REFERENCE | V2 | Server-side geo only; GPS/realtime excluded by founder |
| `08-NOTIFICATION-BRIEF.md` | HISTORICAL | REFERENCE | V1 | No V2 notifications; SMS pending founder D26 |
| `09-SECURITY-UX-BRIEF.md` | CURRENT | REFERENCE | V2 | Principles retained; V2 role model |
| `10-UX-QUALITY-STANDARDS.md` | CURRENT | REFERENCE | V2 | Standards retained; mobile patterns deferred to mobile milestone |
| `11-DESIGN-DIRECTION.md` | CURRENT | REFERENCE | V2 | Binding principle: never invent a brand |
| `12-DESIGN-SYSTEM-REQUIREMENTS.md` | CURRENT | REFERENCE | V2 | Per-requirement V2 classification |
| `13-FIGMA-SCREEN-REQUIREMENTS.md` | CURRENT | REFERENCE | V2 | V2 screen inventory; Figma not yet approved as source of truth |
| `14-FIGMA-HANDOFF-RULES.md` | CURRENT | CANONICAL-when-activated | V1-era, still valid | Status header added; content unchanged |
| `15-CLAUDE-STARTING-PROMPT.md` | HISTORICAL | REFERENCE | V1 | Original Figma kickoff prompt |
| `ASSET-MANIFEST.md` | CURRENT | REFERENCE | V2 | Re-verified against disk bytes with md5 |
| `archive/v1/*` | HISTORICAL | REFERENCE | V1 | Verbatim V1 originals, preserved for provenance |

## Brand

| File | Status | Authority | Notes |
|---|---|---|---|
| `brand/COLOR-SYSTEM.md` | CURRENT | CANONICAL | Founder resolutions of 2026-09-29 incorporated |
| `brand/LOGO-INVENTORY.md` | CURRENT | CANONICAL | Disk truth; founder never-create-logo rule |
| `brand/TYPOGRAPHY.md` | CURRENT | CANONICAL | Manrope canonical; implementation gap documented |
| `brand/assets/*` | CURRENT | **FOUNDER MATERIAL — DO NOT MODIFY** | md5-verified 2026-09-29 |

## Founder resolutions recorded 2026-09-29

1. **Muted foreground:** `#94A3B8` is the documented brand value; a separate
   AA derivative governs normal-size text use (frozen in COLOR-SYSTEM.md).
2. **Embee Blue:** `#147BFF` is never darkened/redefined; AA text derivative
   frozen separately for normal-size text.
3. **Radius:** 8/12/16 base, border-first elevation, minimal shadows; 20px
   retained as an optional larger radius.
4. **Mobile patterns** (bottom nav, skeletons): future Figma/mobile
   requirements — not applied to the V2 web pilot.
5. **Manrope:** integrate in the next implementation phase.
6. **Package structure** approved (rebuilt index, rebased docs, `archive/`).

## Pointers the index must answer

- **Mobile-milestone material (not current web pilot):** bottom tab
  navigation, mobile navigation patterns, skeleton-loader system, mobile
  sidebar patterns — classified in `10-UX-QUALITY-STANDARDS.md` and
  `12-DESIGN-SYSTEM-REQUIREMENTS.md`; designed in the future Figma/mobile
  phase.
- **Next implementation phase:** V2 design-system implementation in the app —
  founder-value token re-base (incl. AA derivatives), Manrope integration,
  logo + favicon integration (destinations in `ASSET-MANIFEST.md`), then
  visual QA. Do not start it without founder authorization.
- **V1 archive:** `archive/v1/` (verbatim originals, 20 files).
- **Canonical brand assets:** `brand/assets/` (founder material; md5s in
  `ASSET-MANIFEST.md`).

---
