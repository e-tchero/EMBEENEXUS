# EMBEE NEXUS — DESIGN DIRECTION

**Authority:** LEVEL 2 — What Claude is being asked to achieve
**Date:** September 1, 2026

---

## The Ask

**A complete Embee Nexus frontend redesign.**

This is NOT a new product. The backend, APIs, database, and business logic are complete and production-ready. Claude is being asked to redesign the **visual layer and user experience** of an existing, functional delivery platform.

---

## Brand Personality

| Trait | Expression |
|-------|-----------|
| **Professional** | Clean lines, consistent spacing, no clutter |
| **Trustworthy** | Clear status indicators, transparent pricing, reliable feedback |
| **Modern** | Contemporary design patterns, smooth interactions |
| **Nigerian-market appropriate** | Works on mobile, works on slow networks, handles imperfect addresses |
| **Delivery-focused** | Every screen serves the delivery mission |
| **Operationally clear** | Riders know what to do, admins see what matters |
| **Fast** | Minimal friction, quick actions, instant feedback |

---

## Visual Language

### Color Usage
- **Embee Blue (#147BFF):** Primary brand, CTAs, active states
- **Digital Cyan (#38BDF8):** Accents, highlights, "NEXUS" in logo
- **Embee Navy (#0B1220):** Dark backgrounds, authority
- **Embee Charcoal (#111827):** Text, cards on dark
- **Embee White (#F5F7FA):** Light backgrounds
- **Embee Slate (#64748B):** Muted text, secondary info

### Typography
- **Manrope** — Professional, geometric, clean
- Extra bold for "EMBEE", Light for "NEXUS"
- Clear hierarchy through weight and size

### Shapes
- Rounded corners (0.5rem default)
- Card-based layouts
- Clean borders (subtle, not heavy)

### Imagery
- Founder-supplied logo assets (see `brand/assets/`)
- Minimal illustrations — let the product speak
- Map imagery from Stadia Maps
- Delivery-related icons

---

## What NOT to Do

1. **Do not invent a new brand.** Use the supplied Embee Nexus logo and color system.
2. **Do not add new providers.** Maps, payments, email are already integrated.
3. **Do not redesign the backend.** APIs, database, state machines are fixed.
4. **Do not add features not in the existing system.** Design what exists.
5. **Do not use placeholder content.** Use realistic Nigerian data (Abuja addresses, NGN currency).
6. **Do not ignore mobile.** This is primarily a mobile delivery product.
7. **Do not copy other delivery apps blindly.** Be inspired, but be original.

---

## Design Philosophy

### Functional Beauty
Every design decision should serve the user's goal. Beautiful but confusing is worse than simple and clear.

### Progressive Disclosure
Show the minimum needed. Reveal complexity only when the user needs it.

### Trust Through Transparency
Show status, show progress, show pricing breakdown. Never leave the user guessing.

### Mobile-First, Always
Design for the phone in a rider's hand on a busy Abuja street. Then scale up.

---

## Inspiration References

| Category | Inspiration |
|----------|------------|
| Delivery tracking | Uber, Bolt, Glovo tracking screens |
| Payment flows | Paystack Checkout, Flutterwave |
| Admin dashboards | Stripe Dashboard, Supabase Dashboard |
| Mobile navigation | Instagram, Twitter bottom nav |
| Map interactions | Google Maps, Apple Maps |
| Form design | Linear, Notion |

---

## Success Criteria

The redesign is successful when:

1. A new customer can book a delivery without instructions
2. A rider can complete a delivery workflow intuitively
3. An admin can manage operations at a glance
4. The product feels professional and trustworthy
5. Every screen works beautifully on mobile
6. The brand is consistently applied
7. The design system is reusable and maintainable
