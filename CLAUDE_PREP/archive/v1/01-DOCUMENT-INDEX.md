# EMBEE NEXUS — DOCUMENT INDEX

**Purpose:** Every document in `CLAUDE_PREP/` listed with authority level.

---

## Authority Levels

| Level | Meaning |
|-------|---------|
| **LEVEL 1 — AUTHORITATIVE** | Treat as ground truth. Override all other docs. |
| **LEVEL 2 — DESIGN / PRODUCT CONTEXT** | Important context. Reference for design decisions. |
| **LEVEL 3 — HISTORICAL / CONTEXTUAL** | Background information. Do not override Level 1–2. |

---

## CLAUDE_PREP/ Directory Contents

### Root Documents

| File | Source | Purpose | Authority |
|------|--------|---------|-----------|
| `README.md` | Created for handoff | Entry point for Claude | Meta |
| `00-BASELINE.md` | Repository state at handoff | Git baseline, commit history | LEVEL 1 |
| `01-DOCUMENT-INDEX.md` | This file | Document map | Meta |
| `02-FRONTEND-ARCHITECTURE.md` | Codebase inspection | Current frontend architecture | LEVEL 1 |
| `03-PRODUCT-UX-BRIEF.md` | Codebase + docs | Product experience for all roles | LEVEL 2 |
| `04-EXISTING-UI-INVENTORY.md` | Codebase inspection | Current pages/components/routes | LEVEL 1 |
| `05-API-CONTRACT-BRIEF.md` | Codebase + ARCHITECTURE.md | API endpoints Claude can consume | LEVEL 1 |
| `06-STATE-MACHINES.md` | ARCHITECTURE.md + code | Order, payment, rider state machines | LEVEL 1 |
| `07-MAPS-LOCATION-BRIEF.md` | Codebase + docs | Maps/location architecture | LEVEL 1 |
| `08-NOTIFICATION-BRIEF.md` | M8 reports + code | Notification architecture | LEVEL 2 |
| `09-SECURITY-UX-BRIEF.md` | ARCHITECTURE.md + code | Frontend security requirements | LEVEL 1 |
| `10-UX-QUALITY-STANDARDS.md` | Design requirements | Responsive, accessibility, UX standards | LEVEL 2 |
| `11-DESIGN-DIRECTION.md` | Design brief | What Claude is being asked to achieve | LEVEL 2 |
| `12-DESIGN-SYSTEM-REQUIREMENTS.md` | Design system spec | Components, tokens, states | LEVEL 2 |
| `13-FIGMA-SCREEN-REQUIREMENTS.md` | Screen inventory | All screens Claude should design | LEVEL 2 |
| `14-FIGMA-HANDOFF-RULES.md` | Rules | Constraints for Figma design | LEVEL 1 |
| `15-CLAUDE-STARTING-PROMPT.md` | Prompt | Complete prompt for Claude to begin | Meta |
| `ASSET-MANIFEST.md` | Asset tracking | Every copied asset with hashes | Meta |

### docs/ — Copied Documentation

| File | Source | Authority |
|------|--------|-----------|
| `docs/ROADMAP.md` | `docs/ROADMAP.md` | LEVEL 1 |
| `docs/ARCHITECTURE.md` | `ARCHITECTURE.md` | LEVEL 1 |
| `docs/ARCHITECTURE-DETAILED.md` | `docs/architecture/ARCHITECTURE.md` | LEVEL 1 |

### brand/ — Visual Identity

| File | Source | Authority |
|------|--------|-----------|
| `brand/LOGO-INVENTORY.md` | Logo analysis | LEVEL 1 |
| `brand/COLOR-SYSTEM.md` | Tailwind + CSS inspection | LEVEL 1 |
| `brand/TYPOGRAPHY.md` | Layout + font inspection | LEVEL 1 |
| `brand/assets/DARK.jpeg` | `EMBEENEXUS_LOGOS/DARK.jpeg` | LEVEL 1 — Founder-provided |
| `brand/assets/FULL_COLOR.jpeg` | `EMBEENEXUS_LOGOS/FULL_COLOR.jpeg` | LEVEL 1 — Founder-provided |
| `brand/assets/FULL_COLOR _02.jpeg` | `EMBEENEXUS_LOGOS/FULL_COLOR _02.jpeg` | LEVEL 1 — Founder-provided |
| `brand/assets/FULL_COLOR-removebg-preview.png` | `EMBEENEXUS_LOGOS/FULL_COLOR-removebg-preview.png` | LEVEL 1 — Founder-provided |
| `brand/assets/LOGO_CONSTRUCTION.jpeg` | `EMBEENEXUS_LOGOS/LOGO_CONSTRUCTION.jpeg` | LEVEL 1 — Founder-provided |
| `brand/assets/WHITE.jpeg` | `EMBEENEXUS_LOGOS/WHITE.jpeg` | LEVEL 1 — Founder-provided |

---

## Important Notes for Claude

1. **`docs/ROADMAP.md` is the authoritative roadmap.** It tracks completed milestones and remaining work.
2. **`ARCHITECTURE.md` is the technical architecture authority.** It defines the database schema, security model, and system design.
3. **Existing application behavior is more authoritative than any documentation.** If docs conflict with code, the code wins.
4. **Brand assets in `brand/assets/` are founder-provided.** Do not modify them.
5. **Do not treat discovery/verification reports as design requirements.** They are historical records.
6. **The frontend redesign must work against the existing backend.** APIs, database, and state machines are fixed.
