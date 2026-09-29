# EMBEE NEXUS — REPOSITORY BASELINE

**Document Status:** Baseline for Claude Design Handoff
**Date:** September 1, 2026

---

## Repository State

| Field | Value |
|-------|-------|
| **Branch** | `master` |
| **HEAD** | `640af0db62377619b5fe2e981514eadb38e4793a` |
| **Short SHA** | `640af0d` |
| **Remote HEAD** | `640af0db62377619b5fe2e981514eadb38e4793a` |
| **Synchronized** | YES |
| **Working Tree** | Modified (.gitignore, vercel.json) + Untracked (EMBEENEXUS_LOGOS/, apps/web/.gitignore, milestone docs) |

---

## Latest Commits

```
640af0d feat(milestone-4-m10): prepare production launch
e24cc40 feat(milestone-4-m9): complete production hardening
dcd42b8 feat(milestone-4-m8): implement notification system
88ec1e1 feat(milestone-4-phase6m): delivery proof storage and admin customers
ff74660 feat(milestone-4-phase6l): complete observability and operational safety
```

---

## Milestone Completion Status

| Milestone | Status | Commit |
|-----------|--------|--------|
| M1 — Foundation | ✅ COMPLETE | `3d20e47` |
| M2 — Customer Booking | ✅ COMPLETE | `4e5e633` |
| M3 — Payment Integration | ✅ COMPLETE | `ee124d8` → `3c07103` |
| M4 — Dispatch | ✅ COMPLETE | `963fbeb` → `2c62e83` |
| M5 — Rider Experience | ✅ COMPLETE | `f92f354` → `729bc86` |
| M6 — Realtime Tracking | ✅ COMPLETE | (part of M5 phases) |
| M7 — Admin Dashboard | ✅ COMPLETE | (part of M5 phases) |
| Phase 6A–6M — Brand/UI/Production | ✅ COMPLETE | `dc434d1` → `88ec1e1` |
| M8 — Notifications | ✅ COMPLETE | `dcd42b8` |
| M9 — Production Hardening | ✅ COMPLETE | `e24cc40` |
| M10 — Launch Preparation | ✅ COMPLETE | `640af0d` |

---

## Project Structure

```
EMBEENEXUS/
├── apps/
│   └── web/                    # Next.js application
│       ├── app/                # App router pages
│       ├── components/         # React components
│       ├── hooks/              # Custom hooks
│       ├── lib/                # Services, utils, configs
│       ├── public/             # Static assets
│       └── types/              # TypeScript types
├── packages/
│   └── shared/                 # Shared validators, constants
├── supabase/
│   └── migrations/             # Database migrations
├── tests/
│   └── load/                   # k6 load testing
├── docs/
│   ├── ROADMAP.md              # Authoritative roadmap
│   ├── architecture/           # Architecture docs
│   ├── milestones/             # Milestone reports
│   └── runbooks/               # Operational runbooks
├── CLAUDE_PREP/                # This handoff package
├── EMBEENEXUS_LOGOS/           # Logo assets (source)
├── ARCHITECTURE.md             # Root architecture
└── package.json                # Monorepo root
```

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Font | Manrope (Google Fonts) |
| Database | Supabase (PostgreSQL + PostGIS) |
| Auth | Supabase Auth (GoTrue) |
| Realtime | Supabase Realtime |
| Storage | Supabase Storage |
| Payments | Paystack |
| Maps | Stadia Maps |
| Email | Resend (provider-abstracted) |
| Deployment | Vercel |
| Package Manager | pnpm (monorepo) |
