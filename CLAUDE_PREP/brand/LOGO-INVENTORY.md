# EMBEE NEXUS — LOGO INVENTORY (V2)

**STATUS:** CURRENT · **AUTHORITY:** CANONICAL (founder brand material) · **LAST RECONCILED:** 2026-09-29 · **ERA:** V2

## Founder rule (standing, 2026-09-29)

**Use the existing EMBEE NEXUS logo as supplied. NEVER create, redesign,
redraw, reconstruct, or invent a logo.** No new SVG, no simplified variants,
no AI-generated alternatives, no reconstruction from the construction image.
`LOGO_CONSTRUCTION.jpeg` is reference material only — it is not permission to
rebuild the mark. If a needed variant is missing, **report the gap**.

## Assets on disk (verified by bytes and md5, 2026-09-29)

| Asset | Format | Dimensions | Transparency | Intended use | md5 |
|---|---|---|---|---|---|
| `FULL_COLOR.png` | PNG | 1024×1024 | opaque | **PRIMARY / DEFAULT logo** — light surfaces, general use | `54f00929a81ebd3f58e29450b49af76b` |
| `FULL_COLOR-removebg-preview.png` | PNG | 500×500 | **alpha** | **PRIMARY TRANSPARENT logo** — approved; verify cutout edges before print-scale use | `b1a824efd1b8394ea62780f0e6164cdf` |
| `DARK.png` | PNG | 1024×1024 | opaque | Dark-scheme UI surfaces | `f90a07c68345e61c7abcd26ce5acb492` |
| `WHITE.png` | PNG | 1024×1024 | opaque | Dark backgrounds; monochrome treatment | `3386fe30557fc0edee8fb2506a87ea03` |
| `favicon.ico` | ICO (8 sizes) | 16–? px | — | **Default favicon** | `05219da4d24ecd57903587b6182bb271` |
| `favicon_EMBEENEXUS_DARK.ico` | ICO (8 sizes) | 16–? px | — | Scheme-specific favicon variant (optional) | `c6ce884b00fb4dd3a28f8b03b916d4b3` |
| `favicon_EMBEENEXUS_WHITE.ico` | ICO (8 sizes) | 16–? px | — | Scheme-specific favicon variant (optional) | `16731afdbb767c579fb780f02f3b493b` |
| `LOGO_CONSTRUCTION.jpeg` | JPEG | 612×612 | opaque | **REFERENCE ONLY** — construction/spec, not production | `f67a657c7501035c9509ccdf7ffcfb25` |

`APP_ICONS/` exists but is **empty** — no app icons have been supplied.
Do not generate them.

## Usage guidelines

| Context | Variant |
|---|---|
| Header on light surfaces | `FULL_COLOR.png` (primary) |
| Dark-mode surfaces | `DARK.png` or `WHITE.png` |
| Overlays/transparent contexts | `FULL_COLOR-removebg-preview.png` |
| Browser tab | `favicon.ico` (default; scheme-specific ICOs optional) |
| Loading/splash | `FULL_COLOR.png` |

Usage rules: do not distort, stretch, rotate, recolor, or add effects; use
variants for their intended backgrounds only; compact mark for icon/small
contexts; wordmark where the name must be explicit.

## Gaps (report, never create)

- **SVG / vector logo** — not supplied; all logo assets are rasters. Raster
  use in the app is interim until the founder supplies vector art.
- **Wordmark-only asset** — not supplied.
- **App icons** — `APP_ICONS/` empty; founder must supply.
- **Clear-space / minimum-size rules** — listed as still-to-finalize in the
  founder brand kit.

## Application integration status

The app currently ships **no logo or favicon** (`apps/web/public/` does not
exist; no `favicon.ico`/icon in `src/app/`). Copying assets into the app is a
subsequent implementation phase; destinations were proposed in the BrandKit
reconciliation report (2026-09-29) and await that phase.

## Historical note

The jpeg-era inventory (2026-09-01) described six `.jpeg` assets and listed
the favicon as "MISSING". Both statements are obsolete as of 2026-09-29: the
founder replaced the jpegs with the PNG/ICO set above. The brand folder is
founder material and was not archived — this document supersedes the old
inventory in place.
