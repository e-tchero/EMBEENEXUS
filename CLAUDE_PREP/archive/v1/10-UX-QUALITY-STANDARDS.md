# EMBEE NEXUS — UX QUALITY STANDARDS

**Authority:** LEVEL 2 — Design requirements for the redesign
**Date:** September 1, 2026

---

## Responsive Breakpoints

| Breakpoint | Width | Target |
|------------|-------|--------|
| Mobile | 0–639px | Primary — delivery is mobile-first |
| Tablet | 640–1023px | Secondary |
| Desktop | 1024px+ | Admin dashboard, marketing |

---

## Mobile-First Requirements

- Touch targets minimum 44x44px
- Thumb-friendly navigation (bottom nav for customer/rider)
- Swipeable cards where appropriate
- Pull-to-refresh for lists
- No hover-dependent interactions
- Readable without zoom
- Fast load on 3G/4G networks

---

## Navigation Patterns

### Customer (Mobile)
- Bottom navigation bar
- Tabs: Home, Orders, Profile
- Floating action button for "New Delivery"

### Customer (Desktop)
- Top navigation bar
- Sidebar for dashboard sections

### Rider (Mobile)
- Bottom navigation bar
- Tabs: Dashboard, Deliveries, Earnings
- Prominent availability toggle

### Admin (Desktop)
- Sidebar navigation
- Top bar with user info
- Collapsible sidebar for focus mode

---

## Loading States

| Pattern | Usage |
|---------|-------|
| Skeleton loader | Page content, cards, lists |
| Spinner | Button actions, form submissions |
| Progress bar | Multi-step processes (booking) |
| Shimmer | Image loading, map loading |

---

## Empty States

| Context | Message | Action |
|---------|---------|--------|
| No orders | "No deliveries yet" | "Start your first delivery" button |
| No addresses | "No saved addresses" | "Add your first address" button |
| No notifications | "All caught up!" | — |
| No offers (rider) | "Waiting for offers..." | Availability toggle |
| No earnings | "No earnings yet" | "Complete your first delivery" |
| No search results | "No results found" | Try different search |

---

## Error States

| Error Type | Display | Action |
|------------|---------|--------|
| Network error | "Connection lost" | Retry button |
| Server error | "Something went wrong" | Retry + support link |
| Auth error | "Session expired" | Redirect to login |
| Validation error | Inline field errors | Fix and resubmit |
| Not found | "Page not found" | Go home button |
| Permission denied | "Access denied" | Go back |

---

## Form Design

- Clear labels above inputs
- Placeholder text as examples, not labels
- Inline validation (on blur)
- Error messages below inputs
- Required fields marked with asterisk
- Disabled state for submit while processing
- Success feedback after submission
- Auto-focus on first input

---

## Accessibility

- WCAG 2.1 AA minimum
- Color contrast ratio ≥ 4.5:1 for text
- Focus visible indicators on all interactive elements
- Keyboard navigation support
- Screen reader labels on icons
- Alt text on images
- Semantic HTML (headings, landmarks)
- Reduced motion support (`prefers-reduced-motion`)

---

## Visual Hierarchy

- Primary actions: Embee Blue buttons
- Secondary actions: Outline/ghost buttons
- Destructive actions: Red buttons with confirmation
- Information: Cards with clear typography
- Status: Color-coded badges (green=success, amber=warning, red=error)
- Data: Clear tables with proper alignment

---

## Typography in Practice

| Element | Size | Weight | Color |
|---------|------|--------|-------|
| Page title | 2xl (24px) | Bold | foreground |
| Section heading | xl (20px) | Semibold | foreground |
| Card title | lg (18px) | Semibold | foreground |
| Body text | base (16px) | Regular | foreground |
| Caption/metadata | sm (14px) | Regular | muted-foreground |
| Button text | base (16px) | Semibold | primary-foreground |
| Badge text | xs (12px) | Medium | varies |

---

## Spacing System

Use Tailwind's default spacing scale:
- `p-1` / `m-1` = 4px (tight)
- `p-2` / `m-2` = 8px (compact)
- `p-3` / `m-3` = 12px (default)
- `p-4` / `m-4` = 16px (comfortable)
- `p-6` / `m-6` = 24px (spacious)
- `p-8` / `m-8` = 32px (section gap)

---

## Animation & Motion

- Subtle transitions (150–300ms)
- Ease-out for entrances
- Ease-in for exits
- No jarring animations
- Respect `prefers-reduced-motion`
- Loading skeletons: subtle shimmer
- Page transitions: fade or slide
