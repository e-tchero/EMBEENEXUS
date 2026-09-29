# EMBEE NEXUS — V2 PREPARATION & REFERENCE PACKAGE

**STATUS:** CURRENT · **AUTHORITY:** CANONICAL (package entry point) · **LAST RECONCILED:** 2026-09-29 · **ERA:** V2

> This package was rebased on 2026-09-29 from the V1-era design handoff
> (originally prepared 2026-09-01 against `master@640af0d`). The V1 originals
> are preserved verbatim in `archive/v1/`. The current V2 application is the
> authority for what the product actually does; this package documents it.

---

## Purpose

A coherent, current V2 reference package for anyone working on EMBEE NEXUS:
brand, design system, UX standards, product behavior, screen inventory, and
historical provenance — reconciled against the actual repository.

## Where the real authority lives

| Domain | Canonical source |
|---|---|
| What V2 actually does (code truth) | The repository itself (`main`) |
| Authority model / conflict register | `docs/design/CANONICAL_SOURCE_OF_TRUTH.md` (repo) |
| Design-system contract (tokens) | `apps/web/DESIGN.md` + `apps/web/src/app/globals.css` (repo) |
| Brand identity + assets | `brand/` in this package (founder material) |
| Founder decisions | `docs/design/FOUNDER_DECISIONS.md` (repo) |
| V2 architecture | `docs/architecture/ARCHITECTURE-V2.md` (repo) |

Rule: **this package references those sources; it does not duplicate or
override them.** Where a value appears here and in the repo contract, the repo
contract wins unless this package marks it as founder brand material.

## Start here

1. `00-V2-BASELINE.md` — what V2 is today (stack, routes, migrations)
2. `01-DOCUMENT-INDEX.md` — every file with STATUS / AUTHORITY
3. `brand/` — logo, colors, typography (founder-supplied identity)
4. `02`–`10` — current architecture, product UX, APIs, state machines, security, quality standards
5. `11`–`14` — design direction, system requirements, Figma scope and rules
6. `archive/v1/` — V1-era originals (historical evidence only)

## Hard rules (standing)

1. **The existing logo family is the brand.** Never create, redesign,
   reconstruct, or invent a logo or variant. If something is missing, report
   the gap. `LOGO_CONSTRUCTION.jpeg` is reference material only.
2. **Manrope is the canonical typeface** (founder decision, 2026-09-29).
3. **Do not invent a new brand, palette, voice, or positioning.**
4. Backend, APIs, state machines, RLS, and business rules are fixed;
   documentation describes them, it never redefines them.
5. **No AI attribution anywhere** — commits, source, docs, metadata.
6. Assets in `brand/assets/` are founder-provided: never modify them.
