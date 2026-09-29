# EMBEE NEXUS — MAPS & LOCATION BRIEF (V2)

**STATUS:** CURRENT · **AUTHORITY:** REFERENCE · **LAST RECONCILED:** 2026-09-29 · **ERA:** V2

## Provider architecture (current)

Maps are provider-abstracted behind a server-side interface with the Stadia
Maps adapter active. Provider choice is a locked founder decision (Stadia for
MVP; keep the abstraction). Server-side key handling only.

## What V2 actually uses maps for

| Use | Exists? | Notes |
|---|---|---|
| Address autocomplete (`/api/geo/search`) | YES | Server-side Stadia; powers booking-wizard location selection |
| Forward geocoding (`/api/geo/geocode`) | YES | Server-side |
| Distance for pricing | YES | Server-side at quote time (kobo math, road distance, 35 km cap) |
| Map rendering | **NO** | No map UI exists in V2 web |
| Route geometry display | **NO** | Not implemented |
| Rider GPS ingestion | **NO** | Founder-excluded; do not design for it |
| Real-time tracking | **NO** | Founder-excluded; no Supabase Realtime in V2 |

The customer never enters or sees coordinates: the wizard presents address
search results; the server resolves and stores coordinates.

## Design implications

1. Do not draw tracking maps, route polylines, or rider markers for the
   current V2 web pilot — those belong to the future mobile/tracking milestone
   with founder authorization.
2. Do not hard-code Stadia branding in UI copy ("View on map" style
   abstraction still applies when map surfaces arrive).
3. Any future map work derives tokens from the founder palette
   (`map.route.*`, `map.marker.*` are PROPOSED extensions pending founder
   review — repo BRANDKIT.md §2).
4. The V1 brief's tracking-map and GPS architecture is preserved in
   `archive/v1/07-MAPS-LOCATION-BRIEF.md` as historical reference.
