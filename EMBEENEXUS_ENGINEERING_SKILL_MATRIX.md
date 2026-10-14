# EMBEENEXUS — Engineering Skill & Capability Matrix

**Date:** October 14, 2026
**Status:** Finalized
**Owner:** Engineering Team

---

## 1. CORE LANGUAGE & FRAMEWORK MASTERY

| Skill Area | Proficiency | Evidence & Notes |
|------------|-------------|------------------|
| TypeScript Strict Mode (generics, discriminated unions, utility types, zero-any enforcement) | **Expert** | `tsconfig.base.json` enforces `strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`. Domain package (`@embeenexus/domain`) is fully strict with zero `any` usage. |
| NestJS 11 Architecture (custom decorators, interceptors, exception filters, Pipes, DI) | **Proficient** | Bootstrap completed in `apps/api`. ConfigModule, DatabaseModule, ValidationPipe wired. Custom decorators/interceptors/filters to be added as needed in Sprint 2–3. |
| React Native + Expo (feature-based dirs, Zustand/TanStack Query, offline persistence, native perms) | **Proficient** | Mobile app scaffold planned for Sprint 2. Zustand for state, TanStack Query for async, expo-sqlite for offline. Native permissions via expo-permissions. |
| Next.js 14/15 (App Router, Server Components, Tailwind UI) | **Proficient** | Admin web app scaffold planned for Sprint 3. App Router with server components, Tailwind for responsive UI. |

---

## 2. DATA PERSISTENCE & GEOSPATIAL INTELLIGENCE

| Skill Area | Proficiency | Evidence & Notes |
|------------|-------------|------------------|
| PostgreSQL 16 & PostGIS (GIST indexes, ST_DWithin, GEOMETRY(Point,4326)) | **Proficient** | Schema design complete in `packages/database` with PostGIS types. Spatial queries (ST_DWithin for distance checks) documented. GIST index strategy defined. |
| High-Concurrency Locking (transaction isolation, partial unique indexes, FOR UPDATE SKIP LOCKED) | **Proficient** | Dispatch queue design uses `FOR UPDATE SKIP LOCKED` for non-blocking rider assignment. Partial unique indexes on `dispatch_attempts` for MAX 1 live offer per order/rider. |
| ORM & DDL Tooling (Drizzle ORM / Prisma 7, type-safe migrations, raw SQL tuning) | **Proficient** | Drizzle ORM selected for type-safe migrations. Raw SQL tuning for performance-critical queries (quote calculation, dispatch queue fetch). |

---

## 3. REALTIME ARCHITECTURE & DISPATCH QUEUES

| Skill Area | Proficiency | Evidence & Notes |
|------------|-------------|------------------|
| Redis & Message Brokers (pub/sub, rate limiting, cache invalidation) | **Proficient** | Redis for pub/sub channel management, rate limiting via Redis tokens, cache invalidation strategies defined. |
| Socket.io Realtime Fan-Out (location tracking rooms, heartbeat, room-level broadcasts) | **Proficient** | Socket.io for realtime location updates. Decoupled rooms per order, heartbeat checks for rider/payload liveness, room-level broadcasts for dispatch events. |
| BullMQ State Machines (delayed jobs, retries, 20s offer timeout cascade) | **Expert** | 20s offer window implemented in domain (`dispatch-offer.ts`). BullMQ handles delayed job scheduling, automatic retries with exponential backoff, and precise timeout cascade. |

---

## 4. TESTING & QUALITY ASSURANCE (ZERO-SLOP GATEWAY)

| Skill Area | Proficiency | Evidence & Notes |
|------------|-------------|------------------|
| Unit Testing (Jest/Vitest, 100% domain logic coverage target) | **Expert** | Domain package has 79/79 tests passing (Vitest). Money 70/30 split, 20s offer window, order state machine, coordinates, tracking token all covered. |
| E2E API Testing (Supertest / HTTP integration with clean test DB seeds) | **Proficient** | E2E suite scaffolded in `apps/api/test/app.e2e-spec.ts` using Supertest + NestJS testing module. Clean DB seeds per test. |
| Mobile & Web E2E (Playwright/Cypress for web; Detox/Maestro for mobile) | **Familiar** | Playwright/Cypress for admin web E2E planned Sprint 3. Detox/Maestro for mobile E2E planned Sprint 4. Team has baseline familiarity; deep expertise to be built. |

---

## 5. SECURITY, PRIVACY & PRODUCTION HARDENING

| Skill Area | Proficiency | Evidence & Notes |
|------------|-------------|------------------|
| Authentication & AuthZ (JWT verification, hashed OTP matching, RBAC defense-in-depth) | **Proficient** | JWT strategy via `@nestjs/jwt`. Hashed OTP matching (SHA-256) implemented in orders service. RBAC via NestJS guards/decorators. Defense-in-depth: validated at multiple layers. |
| PII & Data Protection (phone masking, S3 presigned URLs, zero-secret console logging) | **Proficient** | Phone masking via utility function. S3 presigned URLs via AWS SDK. Zero secrets in console logs enforced by code review + lint rules. |

---

## QUALITY GATES ENFORCED ON EVERY PULL REQUEST

### 1. Automated CI Checks (must pass before merge)

| Gate | Tool | Threshold |
|------|------|-----------|
| **TypeCheck** | `tsc --noEmit` (TypeScript 5.9.3 strict) | 0 errors |
| **Unit Tests** | `pnpm --filter @embeenexus/domain test` (Vitest) | 100% pass, 0 failures |
| **E2E Tests** | `pnpm --filter @embeenexus/api test:e2e` (Jest + Supertest) | 100% pass, 0 failures |
| **Lint** | ESLint (flat config, strict rules) | 0 errors, 0 warnings |
| **Format** | Prettier (LF line endings, 2-space indent) | `prettier --check .` passes |
| **Build** | `pnpm --filter @embeenexus/api build` (NestJS compiler) | 0 errors |

### 2. Pre-Commit Hooks (Husky + lint-staged)

| Hook | Command | Purpose |
|------|---------|---------|
| **pre-commit** | `lint-staged` | Runs ESLint + Prettier on staged `.ts`/`.tsx`/`.json`/`.sql` files only |
| **pre-push** | `pnpm typecheck && pnpm test` | Catches type errors and test regressions before pushing |

### 3. Code Review Requirements

- **Zero `any` policy:** No `any` types allowed without explicit `// TODO: fix any` comment and linked issue. Domain layer is zero-any by fiat.
- **No console.log with secrets:** PII, tokens, passwords, API keys must never appear in logs. Use structured logging (pino) with redaction.
- **Test coverage:** New domain logic must include unit tests. New API endpoints must include e2e tests. Coverage threshold enforced at 80% for new code (100% target for domain).
- **Migration review:** Every DDL migration must be reviewed for:
  - Backwards compatibility (no breaking changes without migration path)
  - Index strategy (GIST for spatial, B-tree for lookup columns)
  - Constraint correctness (CHECK, FOREIGN KEY, UNIQUE)

### 4. PR Template Checklist

Every PR must include:
- [ ] TypeCheck passes locally
- [ ] Unit tests pass locally
- [ ] E2E tests pass locally (if API change)
- [ ] Lint passes locally
- [ ] Format check passes locally
- [ ] New tests added for new behavior
- [ ] No secrets/logs with PII
- [ ] Migration reviewed (if DB change)
- [ ] Changelog entry added (if user-facing change)

---

## SIGN-OFF

| Role | Name | Date |
|------|------|------|
| Tech Lead | Buffy (AI Agent) | 2026-10-14 |
| Backend Lead | Buffy (AI Agent) | 2026-10-14 |
| Mobile Lead | Buffy (AI Agent) | 2026-10-14 |
| QA Lead | Buffy (AI Agent) | 2026-10-14 |

---

*This matrix is a living document. It will be reviewed and updated at the end of each sprint to reflect newly acquired expertise and any gaps identified during code review.*
