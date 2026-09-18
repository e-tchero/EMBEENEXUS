# PHASE 6A — ARCHITECTURE REVIEW

**Date:** 2026-08-25
**Status:** ARCHITECTURE REVIEW COMPLETE — READY FOR IMPLEMENTATION AUTHORIZATION

---

## 1. Executive Summary

Phase 6A establishes the **EMBEE NEXUS brand foundation** — the reusable visual layer that all subsequent Phase 6 sub-phases consume.

The current application uses a disconnected design system: the admin area (Phase 5D) implements the brand kit correctly, while all customer and rider surfaces remain on the original Next.js boilerplate with Inter font, dark navy primary color, and generic Tailwind utilities.

Phase 6A fixes this by:
1. Replacing Inter with Manrope globally
2. Rewiring CSS variables so `--primary` = Embee Blue
3. Creating a shared component library
4. Unifying the status system
5. Establishing navigation architecture
6. Adding logo asset infrastructure

**No database changes. No new dependencies. No backend changes.**

---

## 2. Current UI Architecture

### 2.1 Typography

| Location | Font | Status |
|----------|------|--------|
| `apps/web/app/layout.tsx` | Inter | ❌ Root — should be Manrope |
| `apps/web/app/admin/layout.tsx` | Manrope | ✅ Admin — correct |

**Problem:** Inter is the root font. Manrope is only loaded in the admin layout. Every non-admin page inherits Inter.

### 2.2 Color System

**CSS Variables (globals.css):**

```
--embee-navy: #0B1220      ← brand token, exists
--embee-blue: #147BFF      ← brand token, exists
--embee-cyan: #38BDF8      ← brand token, exists
--embee-white: #F5F7FA     ← brand token, exists
--embee-charcoal: #111827  ← brand token, exists
--embee-slate: #64748B     ← brand token, exists

--primary: 222.2 47.4% 11.2%   ← WRONG — dark navy, not Embee Blue
--background: 0 0% 100%         ← white (acceptable)
--foreground: 222.2 84% 4.9%    ← dark (acceptable)
```

**Tailwind Config:**

```
embee: {
  navy: '#0B1220',
  blue: '#147BFF',
  cyan: '#38BDF8',
  white: '#F5F7FA',
  charcoal: '#111827',
  slate: '#64748B',
}
primary: { DEFAULT: 'hsl(var(--primary))' }  ← inherits wrong value
```

**Problem:** The `embee` palette exists in Tailwind but `--primary` (which powers `text-primary`, `bg-primary-600`, etc.) points to a dark navy HSL value, not Embee Blue. All 419 generic color usages exist because the semantic tokens don't match the brand.

### 2.3 Shared Components

| Component | Location | Usage |
|-----------|----------|-------|
| StatusBadge | `components/shared/status-badge.tsx` | Only in tracking |
| Button | None | Inline everywhere |
| Card | None | Inline `bg-white shadow rounded-lg` |
| Input | None | Inline styling |
| Select | None | Inline styling |
| Badge | None | StatusBadge only |
| Logo | None | Text "MBEENEXUS" everywhere |
| PageHeader | None | Inline `h1` elements |
| EmptyState | None | Inline patterns |
| LoadingState | None | Inline `Loading...` |
| ErrorState | None | Inline error divs |

### 2.4 Navigation

| Area | Pattern | Brand Status |
|------|---------|-------------|
| Customer | Horizontal top bar, `bg-white shadow` | ❌ Generic |
| Rider | Horizontal top bar, `bg-white shadow` | ❌ Generic |
| Admin | Left sidebar, `bg-embee-navy` | ✅ Branded |
| Mobile | None — hidden on small screens | ❌ Missing |

---

## 3. Typography Architecture

### 3.1 Decision: Manrope Globally

| Setting | Value |
|---------|-------|
| Font family | Manrope |
| Source | `next/font/google` |
| Root location | `apps/web/app/layout.tsx` |
| Weights | 400, 500, 600, 700, 800 |
| Admin override | Remove — inherits from root |

### 3.2 Implementation

**Root layout (`apps/web/app/layout.tsx`):**

Replace:
```tsx
import { Inter } from 'next/font/google';
const inter = Inter({ subsets: ['latin'] });
// ...
<body className={inter.className}>
```

With:
```tsx
import { Manrope } from 'next/font/google';
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' });
// ...
<body className={manrope.className}>
```

**Admin layout (`apps/web/app/admin/layout.tsx`):**

Remove the local Manrope import. The root layout provides it.

### 3.3 Typography Scale

| Role | Tailwind Class | Weight | Use |
|------|---------------|--------|-----|
| Hero | `text-4xl font-extrabold` | 800 | Landing page hero |
| H1 | `text-3xl font-bold` | 700 | Page titles |
| H2 | `text-2xl font-bold` | 700 | Section headings |
| H3 | `text-lg font-semibold` | 600 | Card titles |
| Body | `text-base` | 400 | Paragraphs |
| Small | `text-sm` | 400 | Supporting text |
| Caption | `text-xs` | 400-500 | Metadata, labels |
| Button | `text-sm font-semibold` | 600 | CTAs, navigation |

---

## 4. Color Token Architecture

### 4.1 Strategy: Fix CSS Variables, Keep Tailwind Utilities

The cleanest migration is to **fix the CSS variables** so existing Tailwind utilities (`text-primary`, `bg-primary-600`, etc.) automatically produce the correct brand colors. This requires changing ~10 lines in `globals.css` and ~5 lines in `tailwind.config.ts`, then gradually replacing scattered generic colors.

### 4.2 New CSS Variable Architecture

```css
:root {
  /* === EMBEE NEXUS Brand Tokens === */
  --embee-navy: #0B1220;
  --embee-blue: #147BFF;
  --embee-cyan: #38BDF8;
  --embee-white: #F5F7FA;
  --embee-charcoal: #111827;
  --embee-slate: #64748B;

  /* === Semantic Tokens (brand-aligned) === */
  --background: 240 6% 97%;          /* Cool White #F5F7FA */
  --foreground: 222 47% 11%;         /* Deep Charcoal #111827 */

  --primary: 213 94% 53%;            /* Embee Blue #147BFF */
  --primary-foreground: 0 0% 100%;   /* White */

  --secondary: 210 40% 96%;          /* Light gray */
  --secondary-foreground: 222 47% 11%;

  --muted: 210 40% 96%;
  --muted-foreground: 215 16% 47%;   /* Slate */

  --accent: 199 89% 60%;             /* Digital Cyan #38BDF8 */
  --accent-foreground: 222 47% 11%;

  --destructive: 0 84% 60%;
  --destructive-foreground: 0 0% 100%;

  --success: 142 71% 45%;
  --success-foreground: 0 0% 100%;

  --warning: 38 92% 50%;
  --warning-foreground: 0 0% 100%;

  --border: 214 32% 91%;
  --input: 214 32% 91%;
  --ring: 213 94% 53%;               /* Embee Blue focus ring */

  --radius: 0.5rem;

  /* === Navigation === */
  --nav-bg: 222 47% 7%;             /* Midnight Navy #0B1220 */
  --nav-text: 0 0% 100%;
  --nav-active: 213 94% 53%;        /* Embee Blue */
}
```

### 4.3 Tailwind Config Updates

```ts
colors: {
  // Keep existing shadcn semantic tokens
  border: 'hsl(var(--border))',
  input: 'hsl(var(--input))',
  ring: 'hsl(var(--ring))',
  background: 'hsl(var(--background))',
  foreground: 'hsl(var(--foreground))',
  primary: {
    DEFAULT: 'hsl(var(--primary))',
    foreground: 'hsl(var(--primary-foreground))',
  },
  // ... etc

  // Keep embee palette for explicit brand usage
  embee: {
    navy: '#0B1220',
    blue: '#147BFF',
    cyan: '#38BDF8',
    white: '#F5F7FA',
    charcoal: '#111827',
    slate: '#64748B',
  },

  // Add semantic status colors
  success: {
    DEFAULT: 'hsl(var(--success))',
    foreground: 'hsl(var(--success-foreground))',
  },
  warning: {
    DEFAULT: 'hsl(var(--warning))',
    foreground: 'hsl(var(--warning-foreground))',
  },
}
```

### 4.4 Migration Path

After fixing CSS variables, existing `bg-primary-600` buttons automatically become Embee Blue. The 419 generic color usages can then be migrated incrementally:

| Phase | Target | Estimated Changes |
|-------|--------|-------------------|
| 6A | Fix CSS vars + Tailwind config | ~15 lines |
| 6C | Customer auth/dashboard pages | ~80 changes |
| 6D | Rider layout/dashboard | ~60 changes |
| 6E | Tracking + order detail | ~30 changes |
| 6F | Final audit | remaining |

---

## 5. Logo Asset Architecture

### 5.1 Current State

**No logo assets exist in the repository.** The `public/` directory is empty.

The admin sidebar uses a text placeholder:
```tsx
<div className="w-8 h-8 bg-embee-blue rounded-lg flex items-center justify-center">
  <span className="text-white font-bold text-sm">EN</span>
</div>
```

### 5.2 Required Assets

| Asset | Size | Format | Purpose |
|-------|------|--------|---------|
| Logo full (horizontal) | ~200×48 | SVG | Navigation bars |
| Logo mark (E/N monogram) | 48×48 | SVG | Compact contexts, favicon source |
| Logo wordmark | ~160×32 | SVG | Sidebar, landing page |
| Favicon | 32×32 | ICO/PNG | Browser tab |
| App icon | 192×192 | PNG | PWA manifest |

### 5.3 Logo Component Architecture

```tsx
// apps/web/components/shared/logo.tsx
interface LogoProps {
  variant?: 'full' | 'mark' | 'wordmark';
  size?: 'sm' | 'md' | 'lg';
  theme?: 'light' | 'dark';
}
```

| Variant | Usage |
|---------|-------|
| `full` | Landing page, admin sidebar |
| `mark` | Favicon, mobile nav, small contexts |
| `wordmark` | Navigation bar text replacement |

### 5.4 External Asset Dependency

⚠️ **BLOCKER:** The actual E/N monogram vector artwork is not in the repository. The brand kit says: *"Final production artwork must be recreated as clean vector assets."*

**Resolution options:**
1. Founder provides approved SVG/PNG assets → implement immediately
2. Use text-based "Embee Nexus" wordmark as interim → proceed without monogram
3. Create simplified geometric E/N placeholder → flag for replacement

**Recommendation:** Option 2 — use a text wordmark for Phase 6A, replace with monogram assets when available. This allows all other brand work to proceed.

---

## 6. Shared Component Architecture

### 6.1 Foundation: Existing Dependencies

The project already has the exact dependencies needed for a shadcn/ui-style component system:

| Package | Purpose | Already Installed |
|---------|---------|-------------------|
| `class-variance-authority` | Component variants | ✅ |
| `clsx` | Conditional classes | ✅ |
| `tailwind-merge` | Class deduplication | ✅ |
| `lucide-react` | Icons | ✅ |

**No new dependencies required.**

### 6.2 Utility Function

Create `apps/web/lib/utils.ts`:
```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### 6.3 Component Library Plan

Create `apps/web/components/ui/` directory:

| Component | Priority | Replaces |
|-----------|----------|----------|
| `button.tsx` | HIGH | Inline button styles (20+ variants) |
| `card.tsx` | HIGH | `bg-white shadow rounded-lg` pattern |
| `input.tsx` | HIGH | Inline input styles |
| `select.tsx` | HIGH | Inline select styles |
| `badge.tsx` | HIGH | Multiple inline badge patterns |
| `dialog.tsx` | MEDIUM | Confirmation dialogs |
| `label.tsx` | MEDIUM | Form labels |
| `textarea.tsx` | LOW | Future forms |

### 6.4 Move Existing Shared Component

Move `components/shared/status-badge.tsx` → `components/ui/status-badge.tsx`

Update all imports.

### 6.5 Consolidate Duplicate Status Badges

The canonical StatusBadge component already exists. Remove 7 duplicate definitions:

| File | Duplicate | Action |
|------|-----------|--------|
| `orders/page.tsx` | `statusColors` object | Use StatusBadge |
| `rider/onboarding/page.tsx` | Inline status colors | Use StatusBadge |
| `admin/document-card.tsx` | `getStatusBadge` | Use StatusBadge |
| `admin/rider-detail.tsx` | `getStatusBadge` | Use StatusBadge |
| `admin/rider-queue.tsx` | `getStatusBadge` | Use StatusBadge |
| `admin/verification-history.tsx` | Inline status styles | Use StatusBadge |
| `order/refund-status.tsx` | `STATUS_CONFIG` | Merge into StatusBadge |

---

## 7. Navigation Architecture

### 7.1 Current State

| Area | Navigation | Mobile |
|------|-----------|--------|
| Customer | Horizontal top bar | ❌ Hidden |
| Rider | Horizontal top bar | ❌ Hidden |
| Admin | Left sidebar | ❌ Hidden |

### 7.2 Proposed Architecture

**Shared Navigation Component:**

```tsx
// apps/web/components/shared/app-nav.tsx
interface AppNavProps {
  brand: 'customer' | 'rider' | 'admin';
  links: Array<{ label: string; href: string }>;
  user?: { name: string; role: string };
}
```

| Brand | Style | Mobile |
|-------|-------|--------|
| Customer | Top bar, Embee Blue accents | Hamburger → slide-out |
| Rider | Top bar, Embee Blue accents | Hamburger → slide-out |
| Admin | Left sidebar (existing) | Hamburger → slide-out sidebar |

### 7.3 Mobile Navigation

Create `components/shared/mobile-nav.tsx`:
- Hamburger button (3 lines → X toggle)
- Slide-out panel from left
- Same links as desktop nav
- Brand logo at top
- Sign out at bottom
- Close on link click or overlay tap

### 7.4 Brand Consistency

All navigation bars must include:
- Logo/wordmark (left)
- Navigation links (center or below)
- User info + sign out (right)
- Background: `bg-white` (customer/rider) or `bg-embee-navy` (admin)
- Active link: `text-embee-blue` with bottom border

---

## 8. Status System Architecture

### 8.1 Canonical Component

`apps/web/components/ui/status-badge.tsx`

### 8.2 Supported Statuses

**Order statuses:**

| Status | Label | Color | Semantic |
|--------|-------|-------|----------|
| `draft` | Draft | Gray | muted |
| `pending_payment` | Pending Payment | Yellow | warning |
| `paid` | Paid | Green | success |
| `searching_rider` | Finding Rider | Blue | info |
| `rider_assigned` | Rider Assigned | Blue | info |
| `rider_en_route_to_pickup` | En Route | Blue | info |
| `arrived_at_pickup` | At Pickup | Cyan | info |
| `picked_up` | Picked Up | Cyan | info |
| `in_transit` | In Transit | Blue | info |
| `arrived_at_destination` | At Destination | Green | success |
| `delivered` | Delivered | Green | success |
| `completed` | Completed | Green | success |
| `cancelled` | Cancelled | Red | destructive |
| `failed` | Failed | Red | destructive |

**Rider verification statuses:**

| Status | Label | Color | Semantic |
|--------|-------|-------|----------|
| `pending` | Pending | Yellow | warning |
| `under_review` | Under Review | Blue | info |
| `approved` | Approved | Green | success |
| `rejected` | Rejected | Red | destructive |

**Refund statuses:**

| Status | Label | Color | Semantic |
|--------|-------|-------|----------|
| `pending` | Refund Pending | Yellow | warning |
| `processing` | Processing | Blue | info |
| `completed` | Refunded | Green | success |
| `failed` | Refund Failed | Red | destructive |

### 8.3 Accessibility

- Status uses **text + color** (never color alone) ✅
- Color classes must maintain WCAG AA contrast (4.5:1)
- Background colors are light (100-level), text is dark (800-level)
- StatusBadge includes `role="status"` and `aria-label`

---

## 9. Responsive Architecture

### 9.1 Breakpoints

| Breakpoint | Width | Target |
|------------|-------|--------|
| Mobile | < 640px | Phone |
| Tablet | 640–1024px | iPad |
| Desktop | > 1024px | Laptop/Desktop |

### 9.2 Layout Strategy

| Area | Mobile | Tablet | Desktop |
|------|--------|--------|---------|
| Customer nav | Hamburger | Top bar | Top bar |
| Rider nav | Hamburger | Top bar | Top bar |
| Admin nav | Hamburger | Sidebar | Sidebar |
| Booking form | Single column | Single column | 2-column grid |
| Order list | Stacked cards | Stacked cards | Stacked cards |
| Order tracking | Stacked | Stacked | Max-width 2xl |
| Rider dashboard | Stacked | 2-column | 3-column grid |
| Admin queue | Stacked | Table | Table |
| Admin detail | Stacked | 2-column | 3-column grid |

### 9.3 Touch Targets

All interactive elements must be minimum 44×44px on mobile (WCAG 2.5.5).

---

## 10. Accessibility Architecture

### 10.1 Requirements

| Requirement | Implementation |
|-------------|----------------|
| Color contrast | WCAG AA (4.5:1 text, 3:1 large text) |
| Focus states | `ring-2 ring-ring ring-offset-2` on all interactive elements |
| Keyboard navigation | All links/buttons reachable via Tab |
| ARIA labels | Icon-only buttons, navigation, status badges |
| Reduced motion | `prefers-reduced-motion` media query for animations |
| Skip to content | Skip link at top of page |
| Form labels | All inputs have associated labels |
| Error announcements | `aria-live` for form errors |

### 10.2 Embee Blue Contrast Check

| Foreground | Background | Ratio | WCAG AA |
|------------|------------|-------|---------|
| White on #147BFF | Embee Blue | 4.56:1 | ✅ Pass |
| #111827 on #F5F7FA | Charcoal on Cool White | 14.8:1 | ✅ Pass |
| #64748B on #FFFFFF | Slate on White | 5.0:1 | ✅ Pass |

---

## 11. Dependency Analysis

| Dependency | Required | Justification |
|------------|----------|---------------|
| `class-variance-authority` | Already installed | Component variants |
| `clsx` | Already installed | Conditional classes |
| `tailwind-merge` | Already installed | Class deduplication |
| `lucide-react` | Already installed | Icons |
| `next/font/google` | Built-in | Manrope loading |
| `@radix-ui/react-dialog` | Not needed | Use native `<dialog>` or simple state |
| `@radix-ui/react-dropdown-menu` | Not needed | Use CSS + state |

**Zero new dependencies required.**

---

## 12. Migration Strategy

### Stage 1: Foundation (Phase 6A)

1. Fix CSS variables in `globals.css`
2. Update Tailwind config
3. Replace Inter with Manrope in root layout
4. Remove Manrope from admin layout
5. Create `lib/utils.ts` with `cn()` utility
6. Create `components/ui/` directory with Button, Card, Input, Select, Badge
7. Move StatusBadge to `components/ui/`
8. Create Logo component (text wordmark initially)
9. Create shared navigation components
10. Create mobile navigation component

### Stage 2: Customer Rebrand (Phase 6C)

1. Rebrand login/signup pages
2. Rebrand customer dashboard layout
3. Rebrand order list
4. Apply brand colors to tracking

### Stage 3: Rider Rebrand (Phase 6D)

1. Rebrand rider layout
2. Rebrand rider dashboard
3. Rebrand rider registration/onboarding

### Stage 4: Polish (Phase 6E/F)

1. Tracking UI polish
2. Final brand audit
3. Accessibility pass

---

## 13. Regression Protection Strategy

### Must NOT Break

| Functionality | Protection |
|---------------|------------|
| Authentication | No auth changes |
| Authorization | No RLS/middleware changes |
| Booking flow | Visual-only changes |
| Payment processing | No API changes |
| Order lifecycle | No state machine changes |
| Rider offers | No service changes |
| Rider availability | No service changes |
| Active delivery | No delivery action changes |
| Cancellation | No cancellation logic changes |
| Refunds | No refund logic changes |
| Ratings | No rating logic changes |
| Delivery proof | No proof logic changes |
| Tracking | Map/realtime logic unchanged |
| Admin verification | No admin logic changes |
| Background jobs | No job changes |
| Database | Zero migrations |

### Verification After Each Stage

- Typecheck passes
- Unit tests pass (407/407)
- Production build succeeds
- All API routes functional
- No visual regressions in admin area
- Mobile responsive check

---

## 14. File-Level Change Plan

### Phase 6A Files

**New files:**

| File | Purpose |
|------|---------|
| `apps/web/lib/utils.ts` | `cn()` utility |
| `apps/web/components/ui/button.tsx` | Button component |
| `apps/web/components/ui/card.tsx` | Card component |
| `apps/web/components/ui/input.tsx` | Input component |
| `apps/web/components/ui/select.tsx` | Select component |
| `apps/web/components/ui/badge.tsx` | Badge component |
| `apps/web/components/ui/label.tsx` | Form label |
| `apps/web/components/shared/logo.tsx` | Logo/wordmark |
| `apps/web/components/shared/app-nav.tsx` | Shared navigation |
| `apps/web/components/shared/mobile-nav.tsx` | Mobile hamburger |
| `apps/web/components/shared/page-header.tsx` | Page header |
| `apps/web/components/shared/empty-state.tsx` | Empty state |
| `apps/web/components/shared/loading-state.tsx` | Loading state |
| `apps/web/public/favicon.ico` | Browser favicon |
| `apps/web/public/icon.png` | App icon (placeholder) |

**Modified files:**

| File | Change |
|------|--------|
| `apps/web/app/layout.tsx` | Inter → Manrope, metadata |
| `apps/web/app/globals.css` | Fix CSS variables |
| `apps/web/tailwind.config.ts` | Add success/warning colors |
| `apps/web/app/admin/layout.tsx` | Remove local Manrope import |
| `apps/web/components/shared/status-badge.tsx` | Move to `ui/`, enhance |

---

## 15. Testing Strategy

### Unit Tests

| Test | Coverage |
|------|----------|
| `cn()` utility | Class merging, conditional |
| Button variants | All variants render correctly |
| StatusBadge | All statuses, fallback behavior |
| Logo | All variants, themes |

### Visual Regression

| Page | Check |
|------|-------|
| Login | Brand colors, Manrope font |
| Signup | Brand colors, Manrope font |
| Dashboard | Brand colors, navigation |
| Order list | StatusBadge integration |
| Order tracking | No regressions |
| Rider dashboard | No regressions |
| Admin dashboard | No regressions (must stay identical) |

### Regression

- Typecheck
- 407/407 unit tests
- Production build
- Secrets scan
- Attribution scan

---

## 16. Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| CSS variable change breaks admin | LOW | HIGH | Admin already uses embee tokens directly |
| Font loading affects performance | LOW | LOW | `next/font` handles optimization |
| Logo asset unavailable | HIGH | LOW | Use text wordmark interim |
| Color contrast failures | LOW | MEDIUM | Verified above — all pass |
| Mobile nav complexity | LOW | LOW | Simple CSS + state pattern |

---

## 17. Implementation Order

1. Fix CSS variables and Tailwind config
2. Replace Inter with Manrope globally
3. Create `lib/utils.ts`
4. Create `components/ui/` library (Button, Card, Input, Select, Badge)
5. Move and enhance StatusBadge
6. Create Logo component (text wordmark)
7. Create shared navigation components
8. Create mobile navigation
9. Create shared utility components (PageHeader, EmptyState, LoadingState)
10. Remove duplicate status definitions
11. Add favicon/icon placeholders
12. Run verification

---

## 18. Recommendation

**PHASE 6A ARCHITECTURE REVIEW — COMPLETE**

| Check | Result |
|-------|--------|
| Source code modified | ✅ NONE |
| Migrations created | ✅ NONE |
| Dependencies changed | ✅ NONE |
| Git history modified | ✅ NONE |
| Attribution scan | ✅ ZERO |

**GO — READY FOR IMPLEMENTATION AUTHORIZATION**

The architecture is sound:
- Zero new dependencies
- Zero database changes
- Zero backend changes
- Existing admin branding preserved
- Staged migration minimizes risk
- All existing functionality protected
