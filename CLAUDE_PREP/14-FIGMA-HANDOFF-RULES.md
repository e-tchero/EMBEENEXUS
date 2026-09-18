# EMBEE NEXUS — FIGMA HANDOFF RULES

**Authority:** LEVEL 1 — Constraints for Figma design
**Date:** September 1, 2026

---

## Design Source of Truth

After design approval, **Figma becomes the visual source of truth.** All implementation references Figma.

---

## Mandatory Rules

### 1. Use Reusable Components
- Every repeated UI element must be a Figma component
- No copy-paste styling — use instances
- Components must have clear naming: `Button/Primary/Lg`, `Card/Order/Default`

### 2. Use Variables / Design Tokens
- Colors → Figma color variables
- Spacing → Figma spacing variables
- Typography → Figma text styles
- Border radius → Figma number variables
- No hard-coded values in components

### 3. Build Responsive Variants
- Every component must have mobile/tablet/desktop variants
- Use Figma auto-layout for responsive behavior
- Define breakpoint behavior clearly

### 4. Use Semantic Naming
- `color/primary` not `color/blue-500`
- `spacing/md` not `spacing/16px`
- `text/heading-lg` not `text/24px-bold`

### 5. Preserve Accessibility
- Minimum contrast ratios (4.5:1 text, 3:1 large text)
- Focus states on all interactive elements
- Touch targets ≥ 44x44px
- Screen reader labels documented

### 6. Preserve Actual Product Behavior
- Design the actual states, not idealized ones
- Include error states, loading states, empty states
- Show real data, not lorem ipsum
- Use Nigerian context (NGN, Abuja addresses)

### 7. Do NOT Invent Backend Capabilities
- Do not design features the backend doesn't support
- Do not add API endpoints that don't exist
- Do not assume real-time capabilities beyond Supabase Realtime
- Reference `05-API-CONTRACT-BRIEF.md` for available APIs

### 8. Do NOT Invent Database Fields
- Design against the existing data model
- Reference `06-STATE-MACHINES.md` for valid states
- Do not add fields to the schema through design

### 9. Do NOT Hard-Code Provider-Specific UI
- Maps: provider-abstracted (Stadia Maps current, but replaceable)
- Payments: Paystack checkout (external, not custom UI)
- Email: Resend (server-side, no frontend UI)
- Do not brand the UI around a specific provider

### 10. Keep Vendor Integrations Abstract
- Payment = "Secure checkout" (not "Pay with Paystack")
- Maps = "View on map" (not "Powered by Stadia Maps")
- Email = system concern (not visible in UI)

---

## Figma Structure

```
Embee Nexus Design System/
├── Foundations/
│   ├── Colors
│   ├── Typography
│   ├── Spacing
│   ├── Icons
│   └── Shadows
├── Components/
│   ├── Primitives/ (Button, Input, Badge, etc.)
│   ├── Navigation/ (Navbar, TabBar, Sidebar)
│   ├── Cards/ (Order, Rider, Quote, etc.)
│   ├── Forms/ (Address, Booking, etc.)
│   └── Product/ (Tracking, Timeline, etc.)
├── Customer/
│   ├── Auth (Login, Signup)
│   ├── Dashboard
│   ├── Booking Flow
│   ├── Orders
│   ├── Tracking
│   └── Address Management
├── Rider/
│   ├── Registration
│   ├── Onboarding
│   ├── Dashboard
│   ├── Deliveries
│   └── Earnings
├── Admin/
│   ├── Dashboard
│   ├── Orders
│   ├── Riders
│   └── Customers
└── Marketing/
    └── Homepage
```

---

## Handoff Deliverables

When design is complete, provide:

1. **Design System file** — All tokens, components, variants
2. **Customer flow file** — All customer screens
3. **Rider flow file** — All rider screens
4. **Admin flow file** — All admin screens
5. **Marketing file** — Homepage/landing
6. **Prototype** — Key flows (booking, tracking, delivery)

---

## Review Gates

| Gate | What to Review | Who |
|------|---------------|-----|
| 1 | Design system foundations | Founder + Engineering |
| 2 | Key screens (5–10 core) | Founder |
| 3 | Complete screen set | Founder + Engineering |
| 4 | Prototype flows | Founder |
| 5 | Final handoff | Engineering |

---

## What Claude Must NOT Do

- ❌ Modify production code
- ❌ Create Figma designs without reading CLAUDE_PREP first
- ❌ Invent backend capabilities
- ❌ Replace the mapping provider
- ❌ Change the payment flow
- ❌ Add new database tables through design
- ❌ Design for a different product — this is Embee Nexus
- ❌ Use AI attribution in design files
