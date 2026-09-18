# Deployment Runbook — Embee Nexus

## Overview

Embee Nexus is deployed on Vercel with Supabase as the database/auth provider.

## Pre-Deployment Checks

1. **Verify tests pass**
   ```bash
   pnpm typecheck
   pnpm test
   pnpm build
   ```

2. **Check for breaking changes**
   - Database migrations: must be backward-compatible
   - API changes: must be backward-compatible
   - No production secrets in code

3. **Review changes**
   - `git diff --stat`
   - `git diff --check`
   - Attribution scan: ZERO

## Deployment Process

### Automatic (Vercel Git Integration)

1. Push to `master` branch
2. Vercel automatically deploys
3. Monitor deployment in Vercel dashboard
4. Verify deployment URL

### Manual (if needed)

1. `vercel --prod`
2. Verify deployment URL
3. Run smoke tests

## Post-Deployment Verification

1. **Health check**
   ```bash
   curl https://your-domain.com/api/health
   ```

2. **Smoke test critical paths**
   - Customer login
   - Quote generation
   - Order creation (test mode)

3. **Check logs**
   - Vercel Functions logs
   - Structured JSON logs with correlation IDs

## Rollback Procedure

### Vercel Rollback

1. Go to Vercel dashboard
2. Select the project
3. Go to "Deployments"
4. Find the last working deployment
5. Click "Promote to Production"

### Database Rollback (if migration required)

1. **DO NOT** drop tables/columns in production
2. Create a new migration that reverts the change
3. Apply the rollback migration
4. Deploy the code change

## Environment Variables

Required environment variables (set in Vercel):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_JWT_SECRET
DATABASE_URL
PAYSTACK_SECRET_KEY
PAYSTACK_PUBLIC_KEY
PAYSTACK_WEBHOOK_SECRET
MAPS_PROVIDER
STADIA_API_KEY
EMAIL_PROVIDER
RESEND_API_KEY
RESEND_FROM_EMAIL
RESEND_FROM_NAME
RESEND_WEBHOOK_SECRET
```

## Incident Response During Deployment

If deployment fails:

1. Check Vercel build logs
2. Check for TypeScript errors
3. Check for missing environment variables
4. Rollback to last working deployment
5. Investigate offline
