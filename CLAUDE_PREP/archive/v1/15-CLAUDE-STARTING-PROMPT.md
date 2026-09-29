# EMBEE NEXUS — CLAUDE STARTING PROMPT

**Purpose:** Complete prompt for Claude to begin the Figma design phase
**Date:** September 1, 2026

---

## PROMPT

You are Claude, a design AI. You have received the Embee Nexus design handoff package at `CLAUDE_PREP/`.

### Your Mission

Design the complete Embee Nexus frontend in Figma. This is a **delivery platform** connecting customers who need items delivered with verified riders who carry them. Think "Uber for package delivery" in Nigeria.

### Step 1: Read Everything

Read every document in `CLAUDE_PREP/` in this order:

1. `README.md` — Entry point
2. `00-BASELINE.md` — Repository state
3. `01-DOCUMENT-INDEX.md` — Document map
4. `02-FRONTEND-ARCHITECTURE.md` — Current frontend architecture
5. `03-PRODUCT-UX-BRIEF.md` — Product experience for all roles
6. `04-EXISTING-UI-INVENTORY.md` — What exists today
7. `05-API-CONTRACT-BRIEF.md` — Available APIs
8. `06-STATE-MACHINES.md` — Order, payment, rider states
9. `07-MAPS-LOCATION-BRIEF.md` — Maps architecture
10. `08-NOTIFICATION-BRIEF.md` — Notification system
11. `09-SECURITY-UX-BRIEF.md` — Security requirements
12. `10-UX-QUALITY-STANDARDS.md` — UX standards
13. `11-DESIGN-DIRECTION.md` — What you're designing
14. `12-DESIGN-SYSTEM-REQUIREMENTS.md` — Component specs
15. `13-FIGMA-SCREEN-REQUIREMENTS.md` — Screen checklist
16. `14-FIGMA-HANDOFF-RULES.md` — Your constraints
17. `brand/LOGO-INVENTORY.md` — Logo assets
18. `brand/COLOR-SYSTEM.md` — Color palette
19. `brand/TYPOGRAPHY.md` — Font system

### Step 2: Study the Brand

- Open `brand/assets/` — These are founder-provided logo assets
- `FULL_COLOR.jpeg` — Primary logo
- `DARK.jpeg` — Logo for dark backgrounds
- `WHITE.jpeg` — Logo for dark mode
- `FULL_COLOR-removebg-preview.png` — Transparent background version
- Use these exact colors: Embee Blue `#147BFF`, Digital Cyan `#38BDF8`, Embee Navy `#0B1220`

### Step 3: Understand the Product

Three user roles:

**Customer:** Books deliveries, tracks packages, rates riders
**Rider:** Accepts deliveries, submits proof, earns money
**Admin:** Manages orders, verifies riders, views analytics

The backend is COMPLETE. You design the frontend only.

### Step 4: Build the Design System First

Create Figma components with variables:

1. **Colors** — Brand + semantic + neutral scale
2. **Typography** — Manrope, all weights, type scale
3. **Spacing** — 4px base, consistent scale
4. **Buttons** — Primary, Secondary, Destructive, Ghost
5. **Inputs** — Text, Select, Checkbox, Radio, Switch
6. **Cards** — Order, Rider, Quote, Earnings
7. **Badges** — Status indicators for orders and riders
8. **Navigation** — Top bar, Bottom tabs, Sidebar
9. **Icons** — Delivery, navigation, action icons

### Step 5: Design Core Flows

Priority order:

1. **Customer Booking Flow** — The money flow. Must be frictionless.
2. **Order Tracking** — The hero experience. Real-time, trustworthy.
3. **Rider Delivery Workflow** — Must work one-handed on mobile.
4. **Admin Dashboard** — Data-dense, efficient, desktop-first.
5. **Authentication** — Clean, trustworthy login/signup.
6. **Address Management** — The primary UX redesign target.

### Step 6: Key Design Decisions

**Address Management (CRITICAL REDESIGN):**
- Current: Manual latitude/longitude entry (UNACCEPTABLE)
- New: Search bar → Map pin → Auto-geocode → Confirm address
- Customer never sees coordinates
- Must work with Nigerian addresses (estates, landmarks, areas)

**Tracking Map:**
- Real-time rider location on map
- Route geometry display
- Estimated time of arrival
- Status timeline alongside map

**Rider Mobile:**
- Large touch targets (riders use phones on the move)
- Bottom navigation
- One-tap actions where possible
- Clear status indicators

### Step 7: Constraints

- ❌ Do NOT modify production code
- ❌ Do NOT invent backend capabilities
- ❌ Do NOT add new API endpoints through design
- ❌ Do NOT replace the mapping provider
- ❌ Do NOT change the payment flow
- ❌ Do NOT use placeholder content (use Nigerian context)
- ❌ Do NOT ignore mobile (this is mobile-first)
- ✅ DO use the supplied brand assets
- ✅ DO use the existing color system
- ✅ DO use Manrope font
- ✅ DO design responsive (mobile + desktop)
- ✅ DO include all states (loading, error, empty)
- ✅ DO use Figma components and variables

### Step 8: Deliver

When complete, provide:

1. Figma design system file
2. Customer flow screens
3. Rider flow screens
4. Admin flow screens
5. Marketing/homepage
6. Interactive prototype for key flows
7. Design documentation

### Remember

This is Embee Nexus — a Nigerian delivery platform. Every design decision should serve the goal of making deliveries feel fast, trustworthy, and professional.

The founder has provided logo assets in `brand/assets/`. Use them.

The existing backend works. You make it beautiful.

---

**Begin.**
