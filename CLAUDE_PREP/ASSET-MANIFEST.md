# EMBEE NEXUS — ASSET MANIFEST (V2)

**STATUS:** CURRENT · **AUTHORITY:** META (asset tracking) · **LAST RECONCILED:** 2026-09-29 · **ERA:** V2

## Brand assets (verified on disk, md5 + `file` inspection, 2026-09-29)

| # | Asset | Location | Format | Dimensions | Purpose | md5 |
|---|---|---|---|---|---|---|
| 1 | `FULL_COLOR.png` | `CLAUDE_PREP/brand/assets/` | PNG, 1024×1024, colormap | 1024×1024 | **PRIMARY logo** — light surfaces, general use | `54f00929a81ebd3f58e29450b49af76b` |
| 2 | `FULL_COLOR-removebg-preview.png` | `CLAUDE_PREP/brand/assets/` | PNG, RGBA | 500×500 | **PRIMARY transparent logo** (verify cutout edges before print) | `b1a824efd1b8394ea62780f0e6164cdf` |
| 3 | `DARK.png` | `CLAUDE_PREP/brand/assets/` | PNG, 1024×1024 | 1024×1024 | Logo for dark-scheme UI surfaces | `f90a07c68345e61c7abcd26ce5acb492` |
| 4 | `WHITE.png` | `CLAUDE_PREP/brand/assets/` | PNG, 1024×1024 | 1024×1024 | Logo for dark backgrounds (monochrome) | `3386fe30557fc0edee8fb2506a87ea03` |
| 5 | `favicon.ico` | `CLAUDE_PREP/brand/assets/` | ICO, 8 embedded sizes | 16px+ | **Default favicon** | `05219da4d24ecd57903587b6182bb271` |
| 6 | `favicon_EMBEENEXUS_DARK.ico` | `CLAUDE_PREP/brand/assets/` | ICO, 8 embedded sizes | 16px+ | Scheme-specific favicon variant | `c6ce884b00fb4dd3a28f8b03b916d4b3` |
| 7 | `favicon_EMBEENEXUS_WHITE.ico` | `CLAUDE_PREP/brand/assets/` | ICO, 8 embedded sizes | 16px+ | Scheme-specific favicon variant | `16731afdbb767c579fb780f02f3b493b` |
| 8 | `LOGO_CONSTRUCTION.jpeg` | `CLAUDE_PREP/brand/assets/` | JPEG, progressive | 612×612 | Construction/spec — **reference only, never production** | `f67a657c7501035c9509ccdf7ffcfb25` |

`APP_ICONS/` directory exists and is **empty** — no app icons supplied; none
may be generated.

## Change history

| Date | Change |
|---|---|
| 2026-09-01 | Original package: six JPEG logo assets copied from `EMBEENEXUS_LOGOS/` |
| 2026-09-29 (founder, pre-phase) | JPEGs replaced by PNG variants; three favicon ICOs supplied; `APP_ICONS/` created (empty). Git records the three tracked jpegs as deleted and the new files as untracked |
| 2026-09-29 (this phase) | Manifest rebuilt from disk bytes; no asset modified |

## Verification

| Check | Result |
|---|---|
| Assets inspected by bytes (not filenames) | ✅ 8 files |
| No asset modified by this phase | ✅ VERIFIED |
| No secrets in package | ✅ CLEAN |
| No AI attribution | ✅ CLEAN |
| Originals preserved | `archive/v1/` holds document originals; asset history lives in git (tracked jpeg deletions) |

## Application integration plan (proposed destination — not yet executed)

```text
favicon.ico                        → apps/web/src/app/favicon.ico
FULL_COLOR.png                     → apps/web/public/brand/FULL_COLOR.png
DARK.png                           → apps/web/public/brand/DARK.png
WHITE.png                          → apps/web/public/brand/WHITE.png
FULL_COLOR-removebg-preview.png    → apps/web/public/brand/FULL_COLOR-transparent.png
LOGO_CONSTRUCTION.jpeg             → not copied (reference only)
```

`apps/web/public/` must be created at integration time. Copying is a
subsequent implementation phase.
