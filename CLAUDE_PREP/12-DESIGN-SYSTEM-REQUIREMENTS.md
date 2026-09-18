# EMBEE NEXUS — DESIGN SYSTEM REQUIREMENTS

**Authority:** LEVEL 2 — What Claude should build in Figma
**Date:** September 1, 2026

---

## Foundation Layer

### Colors
- Brand colors (6 swatches)
- Semantic colors (primary, secondary, destructive, success, warning)
- Neutral scale (50–900)
- Dark mode variants
- Usage guidelines per color

### Typography
- Manrope font family
- Type scale (12px–30px)
- Heading styles (h1–h6)
- Body text styles
- Caption/metadata styles
- Font weight assignments
- Line height scale

### Spacing
- 4px base unit
- Scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96
- Usage guidelines

### Border Radius
- Small: 4px (badges, tags)
- Medium: 8px (cards, inputs)
- Large: 12px (modals, panels)
- Full: 9999px (avatars, pills)

### Shadows
- Small: subtle elevation (cards)
- Medium: moderate elevation (dropdowns)
- Large: high elevation (modals)
- Dark mode shadow adjustments

### Borders
- Default: 1px solid border color
- Focus: 2px solid primary color
- Input: 1px solid input border

---

## Component Layer

### Primitives
| Component | States | Variants |
|-----------|--------|----------|
| Button | Default, Hover, Focus, Active, Disabled, Loading | Primary, Secondary, Destructive, Ghost, Outline; Sm, Md, Lg |
| Input | Default, Focus, Error, Disabled, ReadOnly | Text, Password, Email, Phone, Number, Search |
| Select | Default, Focus, Error, Disabled | Single, Multi |
| Badge | Default | Success, Warning, Error, Info, Neutral; Sm, Md |
| Card | Default, Hover, Selected | Flat, Elevated, Outlined |
| Avatar | Default, Loading, Error | Sm, Md, Lg; Image, Initials, Icon |
| Checkbox | Default, Checked, Indeterminate, Disabled | — |
| Radio | Default, Selected, Disabled | — |
| Switch | Default, On, Off, Disabled | — |
| Modal/Dialog | Default | Sm, Md, Lg, Fullscreen |
| Toast/Alert | Default | Success, Warning, Error, Info |
| Skeleton | Loading | Rectangle, Circle, Text |
| Spinner | Loading | Sm, Md, Lg |
| Tooltip | Default | Top, Bottom, Left, Right |

### Navigation
| Component | Context | Notes |
|-----------|---------|-------|
| Top Navbar | Customer, Rider | Logo, nav links, notification bell, avatar |
| Bottom Tab Bar | Customer (mobile), Rider (mobile) | 3–5 tabs with icons |
| Sidebar | Admin (desktop) | Collapsible, icon + text |
| Breadcrumb | Admin, deep pages | Optional |
| Pagination | Lists | Previous/Next + page numbers |

### Forms
| Component | Notes |
|-----------|-------|
| Form Group | Label + Input + Error message |
| Address Input | Search + map pin + manual fields |
| Phone Input | Country code + number |
| Date Picker | If needed for scheduling |
| File Upload | Document upload with preview |
| Textarea | Multi-line with character count |

### Data Display
| Component | Notes |
|-----------|-------|
| Table | Sortable columns, row actions, pagination |
| List Item | For order lists, rider lists, etc. |
| Stat Card | Number + label + trend indicator |
| Timeline | Order status timeline |
| Progress Bar | Multi-step delivery progress |
| Price Breakdown | Itemized cost display |

### Product-Specific
| Component | Context |
|-----------|---------|
| Order Card | Customer order list |
| Quote Card | Booking quote display |
| Rider Card | Tracking view rider info |
| Delivery Card | Rider active delivery |
| Offer Card | Rider incoming offer |
| Earnings Card | Rider earnings summary |
| Notification Item | Notification list |
| Map Container | Tracking map wrapper |
| Status Badge | Order/rider status |

---

## Pattern Layer

### Loading Patterns
- Skeleton screen (page-level)
- Inline spinner (button-level)
- Progress indicator (multi-step)
- Shimmer (image/content loading)

### Empty Patterns
- Illustration + message + action button
- Different per context (orders, addresses, etc.)

### Error Patterns
- Inline field error
- Form-level error
- Page-level error
- Network error
- Server error

### Navigation Patterns
- Tab switching
- Back navigation
- Deep linking
- Modal stacking

---

## Responsive Variants

Every component should have:
- **Mobile** (0–639px): Stacked, full-width, touch-optimized
- **Tablet** (640–1023px): Partial grid, side-by-side where appropriate
- **Desktop** (1024px+): Full layout, sidebar, multi-column

---

## Variables / Tokens

Figma variables should map to:

```json
{
  "color.brand.blue": "#147BFF",
  "color.brand.cyan": "#38BDF8",
  "color.brand.navy": "#0B1220",
  "color.semantic.primary": "{color.brand.blue}",
  "color.neutral.50": "#F8FAFC",
  "color.neutral.900": "#0F172A",
  "spacing.sm": "8px",
  "spacing.md": "16px",
  "spacing.lg": "24px",
  "radius.sm": "4px",
  "radius.md": "8px",
  "radius.lg": "12px",
  "font.family": "Manrope",
  "font.size.sm": "14px",
  "font.size.base": "16px",
  "font.size.lg": "18px"
}
```
