# EMBEE NEXUS V2 — CANONICAL SOURCE OF TRUTH

**Date:** 2026-09-18 · **Phase:** Documentation & BrandKit reconciliation (post-M3)
**Scope:** Which existing document/decision is authoritative for each domain, what the V2
implementation actually does, where conflicts exist, and what must be decided before
implementation continues.

---

## 0. Authority model (applies to every row below)

| Level | Source | Status |
|------|--------|--------|
| L1 | Explicit founder decisions — current V2 founder authorizations (milestone prompts, Sep 2026) | **Supreme.** Where these speak, they win. |
| L2 | Current V2 implementation (`C:\EMBEENEXUS` M0–M3) | Authoritative for *what exists today*. |
| L3 | Founder business/technology specs (17-09-26 docs, decision registers, Stadia decision, Developer Brand Kit) | Authoritative for *intended product behavior* unless superseded by L1. |
| L4 | `CLAUDE_PREP` (V1-era design-prep package, Sep 1 2026) | Source material. Brand docs (brand/*) reflect founder-supplied assets = L3 evidence; V1-code-derived docs (02, 05, 06, 08) are historical reference only. |
| L5 | `docs/design/*` V2 design-phase docs (Sep 18 2026) | NOT automatically canonical. Reconciled here; corrected where they conflict with L1–L3. |
| L6 | Anything marked *proposed / recommended / founder review* | Never a decision by itself. |

**Document-status vocabulary:** CANONICAL · SUPERSEDED · REFERENCE · DRAFT · DUPLICATE · CONFLICTING · UNKNOWN

---

## 1. Reconciled document register (external workspace)

| Document | Subject | Status | Notes |
|---|---|---|---|
| `17-09-26/Embee_Nexus_Pricing_Policy_and_Strategy.docx` | Pricing | **CANONICAL** | Latest pricing policy (Sep 17). Matches M2 implementation exactly (table below). Adds fleet-future note: 70/30 applies to independent riders only. |
| `17-09-26/Delivery and order workflow.docx` | Delivery workflow | **CANONICAL** | Sep 17, 52 sections. State names here are product labels (§50–51); M3 states are the technical mapping. OTP fallback, waiting, return, no-unauthorised-handover all confirmed. |
| `17-09-26/Payment System.docx` | Payments | **CANONICAL** | Sep 17. Flutterwave locked; payment statuses (Pending/Failed/Under Review/Confirmed/Expired); backend verification; daily payouts; gateway fees = Embee. |
| `17-09-26/EN_NexusSeller_Spec.docx` | Nexus Seller | **CANONICAL** | Sep 17. 3-delivery session cap, batch offers ≤3, permanent public tracking link, Pro credits (5 + 10%), **SMS gateway = founder/CTO selection pending**. |
| `EMBEE_NEXUS_Founder_Business_Decision_Register_FINAL.pdf` | Founder decisions | **CANONICAL** | Sep 17, 17pp, D01–D30 with priorities. All listed decisions remain unanswered (template fields blank) → still unresolved. |
| `EmbeeNexus_Founder_Business_Decisions_Week1.docx` / `.pdf` | Founder decisions | DUPLICATE (same register, pre-FINAL) | Covered by FINAL. |
| `EMBEE_NEXUS_Founder_Technology_Decision_Official_Branded .pdf` | Technology direction | CANONICAL (direction) | Sep 9. Mobile-first product direction; decisions-locked principle. Lists *questions*; the answered decisions live in later docs + V2 authorizations. |
| `EMBEE_NEXUS_Mapping_Provider_Strategy_Stadia_Decision.pdf` | Maps | **CANONICAL** | Sep 11. **KEEP STADIA** for MVP; Starter $20/mo at production; harden endpoints; autocomplete v2; route caching; usage monitoring. |
| `EMBEE_NEXUS_Reconciled_Engineering_Handoff_V2_Official_Cleaned.pdf` | Engineering handoff | **CONFLICTING — SUPERSEDED by L1** | Sep 15, V1-era artifact: mandates **Mapbox**, "do not use Stadia/MapLibre", references Paystack-legacy code and `master` branch. Directly contradicts the Sep 11 Stadia decision and every V2 founder authorization. Its 5 "OPEN BUSINESS DECISIONS" survive only as the D-register items. Do not implement from this document. |
| `EMBEE NEXUS (payment_tracking_technical).md` | Payments/tracking (V1) | SUPERSEDED | Aug 22. Paystack, web Rider Portal, proposed split. |
| `Mapping.md` | Maps (V1) | SUPERSEDED | Aug 22. Mapbox free-tier strategy → replaced by Stadia decision. |
| `Payment_Specification.docx`, `Mapping_Specification.docx`, `Delivery_Workflow_Specification.docx` | Specs (early) | SUPERSEDED / DUPLICATE | Superseded by the 17-09-26 suite; do not use for new work. |
| `Embee_Nexus_Developer_Brand_Kit.md` | Brand | **CANONICAL (L3)** | Aug 24. Full identity: palette, Manrope, E/N monogram, voice, core promise. |
| `Embeenexus brandkit.png` | Brand board | REFERENCE | 1536×1024 AI-generated identity board (C2PA-marked). Visual reference only — not a production logo asset. |
| `EMBEE_NEXUS_OFFICIAL_PDF_TEMPLATE.pdf`, `...POWERPOINT_TEMPLATE.pptx` | Templates | REFERENCE | Document templates, not product decisions. |
| `embee_nexus_status_report.pdf`, `EMBEE_NEXUS_Weekly_Report_14_17_September_2026.pdf` | Reports | REFERENCE | Status narrative; no rules beyond the above. |
| `Embee_Nexus_Team_Resumption_and_Company_Update.md` | Company update | REFERENCE | |
| `Week1_Abdulhameed_v2.docx` | CTO week-1 report | REFERENCE | |
| `CLAUDE_PREP/brand/*` (COLOR-SYSTEM, LOGO-INVENTORY, TYPOGRAPHY, assets) | Brand system | **CANONICAL (L3 evidence)** | Faithful copy of founder logo assets + code-derived tokens; palette/typography match the Developer Brand Kit. Assets byte-identical to originals. |
| `CLAUDE_PREP/00-BASELINE.md`, `02/04/05/06/08-*.md` | V1 repo baseline, APIs, state machines | REFERENCE (V1) | Describe the completed **V1** implementation (Paystack, `pending_payment`/`paid`, web rider portal). Not V2 behavior; superseded as implementation description by L2. |
| `CLAUDE_PREP/03/09/10/12/13/14-*.md`, `11-DESIGN-DIRECTION.md` | UX brief & design direction | REFERENCE (L4) | Product UX context largely still valid; tech references (Paystack, "backend is complete") are V1. Design direction's "do not invent a new brand" is binding guidance that the V2 design docs violated. |
| `CLAUDE_PREP/docs/*` (ROADMAP, ARCHITECTURE) | V1 roadmap/architecture | REFERENCE (V1) | |

**Repository docs:** `docs/architecture/ARCHITECTURE-V2.md`, ADR-0001–0003, `docs/design/*` —
authoritative for V2 engineering decisions (L2/L5). `docs/runbooks/*` — operational, current.

---

## 2. Canonical source-of-truth matrix

| Domain | Canonical source | Authority | Current V2 implementation | Conflicts | Action |
|---|---|---|---|---|---|
| **Brand** | `Embee_Nexus_Developer_Brand_Kit.md` + `CLAUDE_PREP/brand/*` | L3 founder material | None yet (no tokens in code) | V2 BRANDKIT.md proposed a new Inter/blue-700/orange identity — **retracted** | BRANDKIT.md re-anchored to founder palette/Manrope (done this phase) |
| **Logo** | `CLAUDE_PREP/brand/assets/` (6 files, in-repo & tracked) | L3 (founder-supplied) | Text-fallback only; assets unused | Favicon/app-icon/SVG absent | Founder to supply SVG/vector + favicon/app icon |
| **Colors** | Developer Brand Kit §3 + `CLAUDE_PREP/brand/COLOR-SYSTEM.md` | L3 | None | V2 proposal conflicts → retracted | Use: Navy `#0B1220`, Blue `#147BFF`, Cyan `#38BDF8`, White `#F5F7FA`, Charcoal `#111827`, Slate `#64748B` |
| **Typography** | Developer Brand Kit §4 + `CLAUDE_PREP/brand/TYPOGRAPHY.md` | L3 | None (layout.tsx uses system font) | V2 proposal (Inter) → retracted | **Manrope**; weights 400/500/600/700/800 per brand kit |
| **Design system** | `docs/design/DESIGN_SYSTEM.md` (token architecture, component contract) | L5 proposal | None | Values layer must be re-based on founder palette/Manrope | Keep structure; swap values before any implementation |
| **UX / interaction** | `17-09-26/Delivery and order workflow.docx` (behavior) + `docs/design/MOBILE_UX_ARCHITECTURE.md` (V2 mobile IA) | L3 + L5 | M1–M3 flows implemented server-side | `CLAUDE_PREP/03` screens are V1 web screens — reference only | Use workflow doc as behavior source; MOBILE_UX doc for V2 mobile IA |
| **Mobile architecture** | `Reconciled Engineering Handoff V2` §1 + Founder Technology Decision §2 (direction) | L3 (direction), pending founder ratification of vendor specifics | None (no mobile app) | Handoff mandates **React Native + Expo**; consistent with V2 engineering recommendation | **Expo/React Native = the standing recommendation**; ratify before M-mobile build |
| **Delivery workflow** | `17-09-26/Delivery and order workflow.docx` | L3 | M3 order lifecycle + transition RPC | Product labels vs technical states (see §4) | None — mapping documented |
| **Pricing** | `17-09-26/Pricing_Policy_and_Strategy.docx` (+ D-register) | L3 | M2 engine + migration 0004 (exact match) | None | None |
| **Maps** | `Mapping_Provider_Strategy_Stadia_Decision.pdf` | L3 | M2 MapsProvider + Stadia adapter | Reconciled-Handoff says Mapbox → void (superseded by L1) | Keep Stadia; adopt its hardening items (autocomplete v2, route caching, usage monitoring) as M-requirements |
| **Payments** | `17-09-26/Payment System.docx` + V2 founder prompts | L3 | Payment states reserved in M3; no gateway code | Paystack (V1) and Mapbox-era handoff → obsolete | Flutterwave in M4 behind ADR-0002 abstraction |
| **Orders / state machine** | Founder M3 authorization (L1) as implemented; workflow doc (L3) for behavior | L1/L3 | `apps/web/src/lib/domain/order-state.ts` + migration 0005 | V1 state names in CLAUDE_PREP/06 (see §4) | None — do not rename silently |
| **Seller** | `17-09-26/EN_NexusSeller_Spec.docx` | L3 | Not implemented (authorized from M9) | CLAUDE_PREP/03 has no seller (V1 predates it) | Seller spec is the build source when authorized |
| **Notifications** | Workflow doc §28 + Seller spec §9/§12 + `08-NOTIFICATION-BRIEF.md` | L3/L4 | In-app events; notifications service reserved | Resend email = V1 only; SMS provider unselected | SMS = founder decision; no email in MVP |
| **Security** | V2 founder prompts + ADR-0001 + M0–M3 migrations | L1/L2 | Implemented (RLS, RPCs, grants) | None | Maintain |
| **Authentication** | V2 founder prompts (Supabase Auth) | L1/L2 | Implemented (M0) | Handoff adds biometrics/passkeys for mobile (future) | Mobile auth method decided with mobile milestone |
| **API contracts** | `docs/architecture/ARCHITECTURE-V2.md` + V2 routes | L2 | Implemented M3 | CLAUDE_PREP/05 endpoints are V1 | Keep V2 contract docs canonical |
| **Founder decisions** | `Founder_Business_Decision_Register_FINAL.pdf` + `docs/design/FOUNDER_DECISIONS.md` | L3 | n/a | None | Register maintained in FOUNDER_DECISIONS.md |
| **Technology decisions** | V2 authorizations (L1) + Technology Decision PDF (L3) | L1/L3 | M0–M3 stack | Mapbox/Paystack remnants → void | Locked per Technology Decision §6 |

---

## 3. Brand asset inventory (verified from bytes, not filenames)

| Asset | Format | Dimensions | Transparency | Classification | Notes |
|---|---|---|---|---|---|
| `FULL_COLOR.jpeg` | JPEG | 1024×1024 | opaque | CANONICAL (primary, light bg) | Main logo on light surfaces |
| `DARK.jpeg` | JPEG | 1024×1024 | opaque | CANONICAL (dark bg) | Logo for dark surfaces |
| `WHITE.jpeg` | JPEG | 1024×1024 | opaque | CANONICAL (dark bg) | Monochrome white variant |
| `FULL_COLOR _02.jpeg` | JPEG | 750×750 | opaque | REFERENCE | Secondary color variant (smaller, alternate comp) |
| `FULL_COLOR-removebg-preview.png` | PNG | 500×500 | **alpha channel** | CANONICAL (transparent use) | Only transparent asset; "removebg-preview" name suggests auto-cutout — verify edges before print |
| `LOGO_CONSTRUCTION.jpeg` | JPEG | 612×612 | opaque | CONSTRUCTION | Specification/reference, not production |
| `Embeenexus brandkit.png` (external) | PNG | 1536×1024 | alpha | REFERENCE | Identity board/sheet (C2PA-marked, AI-generated Aug 2026) — **not a final logo asset** |

All six `CLAUDE_PREP/brand/assets/` files are byte-identical (md5-verified) to the external
workspace copies; originals are preserved untouched. All are rasters (JPEG/PNG); **no SVG
vector exists** — brand kit itself flags final vector artwork as still-to-finalize. Missing:
favicon, app icon, wordmark-only asset, exact clear-space/minimum-size rules.

---

## 4. State-machine reconciliation

**Implementation is authoritative for current behavior** (L2); workflow doc for intended
behavior (L3). Documented mapping — no code changes made or required:

| Founder workflow label (§50–51, L3) | V2 state (L2, M3) | Notes |
|---|---|---|
| Payment Pending | `draft` → `awaiting_payment` | Split: draft (pre-quote-consumption) vs awaiting payment |
| Payment Confirmed | `payment_verified` | Gate reached only after M4 backend verification |
| Finding Rider | `searching_rider` | Same |
| Rider Assigned | `rider_assigned` | Same |
| On the Way to Pickup | `en_route_pickup` | Founder-canonical name adopted in M3 |
| Arrived at Pickup | `arrived_pickup` | Same |
| Parcel Collected | `picked_up` | Trigger: pickup OTP verified (M6) |
| On the Way to Delivery | `in_transit` | Same |
| Arrived at Delivery Location | `arrived_destination` | Same |
| Delivered Successfully | `delivered` | Trigger: delivery OTP (M6) |
| *(recipient confirms / auto)* | `completed` via `recipient_confirmed` | Founder M3 decision: explicit confirmation; auto-completion policy remains a founder decision |
| Payment Failed | `failed` (+ payment axis) | Payment state is a separate axis (ADR architecture), not conflated |
| Cancelled | `cancelled` | D06/D17/D18 refund rules remain founder decisions |
| Delivery Issue / Recipient Unavailable / Waiting / Returning / Returned | **not modeled as states** | Handled as order events/metadata per V2 design; if the founder wants first-class states, that is a state-machine change requiring authorization |
| `refunded`, `expired`, `disputed` (CLAUDE_PREP/06, V1) | **not in V2 machine** | V1 concepts: refunds belong to the financial axis (M8+); `expired` (no rider) and `disputed` would be new states — flag for founder if needed |

Also: V2 added `under_review` (hold state, founder-authorized in M3) which has no V1
equivalent. Payment lifecycle per `Payment System.docx` §6 (Pending/Failed/Under Review/
Confirmed/Expired) maps to the V2 payment axis to be built in M4.

---

## 5. Business-decision reconciliation (founder-level)

**Confirmed (founder material + implemented):** motorcycle-only independent riders · one
pickup → one destination · 35 km max road distance · Zone A list (17 areas) · fixed-band
pricing table (exact match with M2, kobo integer math, (min,max] semantics) · 70/30 split
(independent-rider model; fleet economics future) · Flutterwave · cashless · pay-before-
confirm · backend verification authority · Under Review hold · daily payouts · waiting
10-min included / 10-min blocks / 30-min max / return to customer / Embee pays return ·
OTP chain + 3 photos + recipient inspection + sender OTP fallback · no unauthorised
handover · seller caps (3/session, batch ≤3, instant signup, permanent public tracking link,
Pro = 5 credits + 10%, price unset) · Stadia kept for MVP.

**Conflicting (resolved by authority):** Mapbox mandate + Paystack references in the
Reconciled Handoff V2 (Sep 15) vs Stadia decision (Sep 11) + V2 authorizations → **Stadia and
Flutterwave win**; handoff demoted to superseded/conflicting. V2-proposed Inter/blue-orange
BrandKit vs founder brand material → **founder material wins**; V2 proposal retracted this phase.

**Superseded:** Paystack · Mapbox · web-based Rider Portal as primary rider experience ·
V1 order state names · Resend email in MVP · V1 UI inventory as design target.

**Unresolved (register FINAL, fields blank):** D01–D30 as listed in
`docs/design/FOUNDER_DECISIONS.md` — notably D05 waiting charge, D06 refund matrix, D07/D08,
D17–D21, D09 quote validity (V2 uses 45-min default, flagged), D26 SMS cost, D28 contact
exposure, D29/D30. Plus: Pro monthly price, SMS gateway selection, auto-completion policy,
VAT stance.

---

## 6. Technology reconciliation

| Area | Decision | Status |
|---|---|---|
| Backend / DB | Next.js modular monolith + Supabase PostgreSQL/PostGIS | FOUNDER DECISION (L1) + IMPLEMENTED |
| RLS / RPCs / Auth | Supabase Auth, forced RLS, SECURITY DEFINER RPCs, locked `search_path` | IMPLEMENTED |
| Maps | Stadia Maps behind MapsProvider abstraction | FOUNDER DECISION (Sep 11) + IMPLEMENTED (M2) |
| Payments | Flutterwave behind provider abstraction (ADR-0002) | FOUNDER DECISION; not implemented (M4) |
| Mobile | React Native + Expo (customer + rider apps; admin stays web) | FOUNDER DIRECTION (L3); vendor choice recommended by engineering — **requires founder ratification before mobile build** |
| Storage | Supabase Storage (photos, M6) | FOUNDER DIRECTION; not implemented |
| Realtime | Supabase Realtime (tracking, seller dashboards) | FOUNDER DIRECTION; not implemented |
| Notifications | MVP: SMS + in-app; email (Resend) V1-only | SMS provider = FOUNDER DECISION REQUIRED |
| Hosting | Vercel | FOUNDER DIRECTION; CI exists, deploy config pending |
| Email, analytics, crash reporting | None authorized | NOT AUTHORIZED for now |
| Push (FCM/APNs) | Future, with mobile milestone | FUTURE |

---

## 7. Standing corrections adopted by this reconciliation

1. **"Zero pre-existing brand assets" (previous phase report) was wrong.** The repository
   itself tracks six founder logo assets under `CLAUDE_PREP/brand/assets/` plus the brand
   system docs. V2 BRANDKIT.md's proposed palette/typography is **retracted** and re-anchored
   to the founder brand kit (see updated BRANDKIT.md).
2. The **Reconciled Engineering Handoff V2** must not be used as an implementation source
   (Mapbox/Paystack/`master`-era). Only its five open business decisions remain live, and
   those are already tracked in the D-register.
3. V1 state-machine names in `CLAUDE_PREP/06-STATE-MACHINES.md` describe the **V1**
   implementation; V2 names are canonical going forward.
4. The V2 mobile recommendation (Expo/React Native) **agrees** with the founder's documented
   direction — it is a vendor ratification, not a new proposal.

---

*This document is the index of authority. It intentionally does not restate full specs; it
points to the single canonical document per domain and records conflicts so that no future
phase has to guess which source governs.*
