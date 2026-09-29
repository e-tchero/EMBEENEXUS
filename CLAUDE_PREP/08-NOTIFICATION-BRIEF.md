# EMBEE NEXUS — NOTIFICATION BRIEF

**STATUS:** HISTORICAL · **AUTHORITY:** REFERENCE (V1-era M8 design) · **LAST RECONCILED:** 2026-09-29 · **ERA:** V1 — NOT CURRENT V2

> **V2 reality:** no notification system exists in the V2 web pilot. There is
> no notifications table UI, no notification bell, no email/SMS/push
> integration. Notifications were excluded from the pilot scope by founder
> order. SMS provider selection remains founder-gated (register decision D26).
> The content below is preserved as the V1-era design reference for a future
> notification milestone; it must not be treated as a description of current
> V2 behavior.

---

*(V1 content below, unchanged from the original package — see
`archive/v1/08-NOTIFICATION-BRIEF.md` provenance.)*

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

## Email Templates

| Template | Trigger | Content |
|----------|---------|---------|
| Order Confirmation | Order created | Order details, next steps |
| Payment Confirmation | Payment success | Amount, order reference |
| Rider Assigned | Rider assigned | Rider info, estimated time |
| Delivery Update | Status changes | Current status, tracking link |
| Delivery Complete | Delivery done | Summary, rating prompt |
| Cancellation | Order cancelled | Refund info, reason |

## Design Considerations (for the future milestone)

- Notifications should be non-intrusive but visible
- Unread count should be prominent on the bell icon
- Each notification should be tappable to navigate to the relevant order
- Email notifications are separate from in-app
