# EMBEE NEXUS — CLAUDE DESIGN HANDOFF

---

## Purpose

This package exists to prepare Claude + Figma for the **complete frontend redesign** of Embee Nexus — a Nigerian delivery platform connecting customers who need items delivered with verified riders who carry them.

---

## Current Repository State

| Field | Value |
|-------|-------|
| **Branch** | `master` |
| **HEAD** | `640af0db62377619b5fe2e981514eadb38e4793a` |
| **Milestones Complete** | M1–M10 (all) |
| **Backend Status** | ✅ COMPLETE — 46+ API routes, 13 services, full database |
| **Frontend Status** | ⚠️ FUNCTIONAL — needs visual/UX redesign |
| **Design System** | ❌ NOT YET CREATED |

---

## Product State

| Component | Status |
|-----------|--------|
| Customer booking flow | ✅ Backend complete |
| Payment integration | ✅ Paystack integrated |
| Dispatch system | ✅ Complete |
| Rider workflow | ✅ Complete |
| Real-time tracking | ✅ Supabase Realtime |
| Admin dashboard | ✅ Complete |
| Notifications | ✅ M8 complete |
| Production hardening | ✅ M9 complete |
| Launch preparation | ✅ M10 complete |
| **Frontend redesign** | **🔄 YOU ARE HERE** |

---

## Design Objective

**Complete frontend redesign** of the Embee Nexus customer, rider, and admin interfaces.

This is NOT a new product. The backend, APIs, database, and business logic are complete and production-ready. You are redesigning the **visual layer and user experience**.

---

## Source of Truth

| Document | Authority Level |
|----------|----------------|
| `docs/ROADMAP.md` | LEVEL 1 — Ground truth |
| `docs/ARCHITECTURE.md` | LEVEL 1 — Technical architecture |
| `02-FRONTEND-ARCHITECTURE.md` | LEVEL 1 — Current frontend state |
| `05-API-CONTRACT-BRIEF.md` | LEVEL 1 — Available APIs |
| `06-STATE-MACHINES.md` | LEVEL 1 — Valid states |
| `09-SECURITY-UX-BRIEF.md` | LEVEL 1 — Security requirements |
| `brand/assets/*` | LEVEL 1 — Founder-provided logos |
| `03-PRODUCT-UX-BRIEF.md` | LEVEL 2 — Product context |
| `11-DESIGN-DIRECTION.md` | LEVEL 2 — Design brief |
| `12-DESIGN-SYSTEM-REQUIREMENTS.md` | LEVEL 2 — Component specs |
| `13-FIGMA-SCREEN-REQUIREMENTS.md` | LEVEL 2 — Screen checklist |

---

## Important Constraints

1. **Existing backend remains authoritative.** APIs, database, and state machines are fixed.
2. **Existing APIs remain authoritative.** You design against what exists.
3. **Existing state machines remain authoritative.** Design valid states only.
4. **Existing security model remains authoritative.** Never weaken auth/authz.
5. **Brand assets supplied by founder are authoritative.** Use the provided logos and colors.
6. **Figma becomes visual source of truth after approval.**
7. **No provider lock-in.** Don't hard-code Stripe, Paystack, or any vendor into the UI.
8. **No AI attribution.** Never add Codebuff, Buffy, or Co-Authored-By.
9. **No production code changes during design stage.**

---

## Directory Map

```
CLAUDE_PREP/
├── README.md                           ← YOU ARE HERE
├── 00-BASELINE.md                      Repository state
├── 01-DOCUMENT-INDEX.md                Document map
├── 02-FRONTEND-ARCHITECTURE.md         Current frontend architecture
├── 03-PRODUCT-UX-BRIEF.md              Product experience (all roles)
├── 04-EXISTING-UI-INVENTORY.md         Pages, components, routes
├── 05-API-CONTRACT-BRIEF.md            Available API endpoints
├── 06-STATE-MACHINES.md                Order, payment, rider states
├── 07-MAPS-LOCATION-BRIEF.md           Maps architecture
├── 08-NOTIFICATION-BRIEF.md            Notification system
├── 09-SECURITY-UX-BRIEF.md             Security requirements
├── 10-UX-QUALITY-STANDARDS.md          UX/accessibility standards
├── 11-DESIGN-DIRECTION.md              Design brief
├── 12-DESIGN-SYSTEM-REQUIREMENTS.md    Component specifications
├── 13-FIGMA-SCREEN-REQUIREMENTS.md     Screen checklist
├── 14-FIGMA-HANDOFF-RULES.md           Design constraints
├── 15-CLAUDE-STARTING-PROMPT.md        Complete prompt to begin
├── ASSET-MANIFEST.md                   Asset tracking
├── docs/                               Copied documentation
│   ├── ROADMAP.md
│   ├── ARCHITECTURE.md
│   └── ARCHITECTURE-DETAILED.md
└── brand/                              Visual identity
    ├── LOGO-INVENTORY.md
    ├── COLOR-SYSTEM.md
    ├── TYPOGRAPHY.md
    └── assets/                         Logo files
        ├── DARK.jpeg
        ├── FULL_COLOR.jpeg
        ├── FULL_COLOR _02.jpeg
        ├── FULL_COLOR-removebg-preview.png
        ├── LOGO_CONSTRUCTION.jpeg
        └── WHITE.jpeg
```

---

## How to Start

Open `15-CLAUDE-STARTING-PROMPT.md` for the complete prompt.

**Begin by reading every document in this package, then build the Figma design system, then design the screens.**

---

*Package prepared: September 1, 2026*
