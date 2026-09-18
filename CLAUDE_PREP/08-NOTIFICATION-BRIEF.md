# EMBEE NEXUS — NOTIFICATION BRIEF

**Authority:** LEVEL 2 — Design context from M8 implementation
**Date:** September 1, 2026

---

## Architecture

```
Notification Domain Logic
        ↓
Notification Service
        ↓
EmailProvider Interface
        ↓
Provider Adapter (ResendEmailProvider)
        ↓
Resend (initial provider)
```

### Provider Neutrality (Mandatory)
- Domain logic depends on `EmailProvider` interface, NOT Resend
- Switching providers requires only: new adapter + config change
- No Resend-specific code in domain logic
- No `resend_email_id` fields — uses `provider_message_id`

---

## Notification Types

| Type | Trigger | Email | In-App |
|------|---------|-------|--------|
| Order Created | Customer creates order | ✅ | ✅ |
| Order Paid | Payment confirmed | ✅ | ✅ |
| Rider Assigned | Rider accepts offer | ✅ | ✅ |
| Rider En Route | Rider heading to pickup | ❌ | ✅ |
| Rider Arrived | Rider at pickup | ✅ | ✅ |
| Package Picked Up | Rider confirms pickup | ✅ | ✅ |
| In Transit | Package in transit | ✅ | ✅ |
| Arrived at Destination | Rider at destination | ✅ | ✅ |
| Delivered | Delivery completed | ✅ | ✅ |
| Order Completed | Order finalized | ✅ | ✅ |
| Order Cancelled | Order cancelled | ✅ | ✅ |
| Refund Processed | Refund completed | ✅ | ✅ |
| Rider Verification | Verification status change | ✅ | ✅ |
| System Announcement | Admin broadcast | ❌ | ✅ |

---

## In-App Notification UI

### Components
- `notification-bell.tsx` — Bell icon with unread count badge
- Dropdown showing recent notifications
- Mark as read / Mark all as read

### Data Model
```typescript
interface Notification {
  id: string;
  user_id: string;
  type: string;          // NOTIFICATION_TYPES constant
  title: string;
  message: string;
  data: JSONB;           // Order ID, rider info, etc.
  read_at: string | null;
  created_at: string;
}
```

### RLS
- Users can only read their own notifications
- Users can only update their own notifications (mark as read)

---

## Email Templates

| Template | Trigger | Content |
|----------|---------|---------|
| Order Confirmation | Order created | Order details, next steps |
| Payment Confirmation | Payment success | Amount, order reference |
| Rider Assigned | Rider assigned | Rider info, estimated time |
| Delivery Update | Status changes | Current status, tracking link |
| Delivery Complete | Delivery done | Summary, rating prompt |
| Cancellation | Order cancelled | Refund info, reason |

### Template Requirements
- Embee Nexus branding (logo, colors)
- Mobile-responsive HTML
- Safe HTML escaping
- Configuration-driven links (not hardcoded)
- No old project references

---

## What Claude Should Design

1. **Notification Bell** — Persistent in navigation, shows unread count
2. **Notification Dropdown/Panel** — List of recent notifications
3. **Notification Detail** — Full notification content
4. **Empty State** — "No notifications yet"
5. **Loading State** — Skeleton loader
6. **Read/Unread Visual Distinction** — Bold/unread indicator
7. **Notification Preferences** — Future: opt-in/opt-out per type

### Design Considerations
- Notifications should be non-intrusive but visible
- Unread count should be prominent on the bell icon
- Notification list should be scrollable
- Each notification should be tappable to navigate to relevant order/entity
- Email notifications are separate from in-app — Claude designs in-app only
