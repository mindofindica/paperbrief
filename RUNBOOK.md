# PaperBrief — Runbook

Operational guide for running PaperBrief in production. Keep this up to date.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Environment Variables](#2-environment-variables)
3. [Supabase Setup & Migrations](#3-supabase-setup--migrations)
4. [Vercel Deployment](#4-vercel-deployment)
5. [Cron Jobs](#5-cron-jobs)
6. [Waitlist & Beta Invites](#6-waitlist--beta-invites)
7. [Stripe (Billing)](#7-stripe-billing)
8. [Email (Resend)](#8-email-resend)
9. [Admin API Reference](#9-admin-api-reference)
10. [Health & Monitoring](#10-health--monitoring)
11. [Incident Response](#11-incident-response)
12. [Feature Branch Status](#12-feature-branch-status)

---

## 1. Architecture Overview

```
paperbrief.ai  (Vercel — Next.js 14 App Router)
      │
      ├── /api/* — API routes (auth, digest, search, recommend, feedback...)
      ├── /digest — Weekly paper digest reader
      ├── /search — Full-text paper search
      ├── /recommend — Personalised recommendations
      ├── /reading-list — Saved papers
      ├── /paper/[arxivId] — Paper detail + AI explanations
      └── /dashboard — User settings + subscription
             │
             ├── Supabase (Postgres) — users, waitlist, tracks, tokens, subscriptions
             ├── SQLite on Vercel (/tmp/arxiv-coach.db) — papers, scores, feedback
             │     └── Populated from: arxiv-coach DB (Semantic Scholar pipeline)
             ├── Resend — transactional email
             └── OpenRouter — AI paper explanations (cached in Supabase)
```

**Key design decisions:**
- Auth is magic-link email (no passwords). Tokens stored in Supabase `magic_tokens`.
- Sessions are encrypted cookies signed with `SESSION_SECRET`.
- Papers live in a SQLite database synced from the arxiv-coach pipeline. Vercel reads this at runtime.
- AI explanations are generated via OpenRouter and cached in Supabase to avoid redundant API calls.

---

## 2. Environment Variables

All vars set in Vercel → Project → Settings → Environment Variables.

### Required (app won't work without these)

| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (public) | Supabase dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (secret) | Supabase dashboard → Settings → API |
| `SUPABASE_URL` | Same as NEXT_PUBLIC_SUPABASE_URL (server-only alias) | Same as above |
| `SESSION_SECRET` | 32+ byte random secret for signing session cookies | `openssl rand -base64 32` |
| `RESEND_API_KEY` | Resend API key for sending emails | resend.com → API Keys |
| `ADMIN_SECRET` | Secret for admin API endpoints | `openssl rand -base64 24` |
| `CRON_SECRET` | Secret that Vercel Cron passes to /api/digest | Vercel auto-generates; copy from cron config |
| `NEXT_PUBLIC_APP_URL` | Full app URL, e.g. `https://paperbrief.ai` | Manual |
| `PAPERBRIEF_BASE_URL` | Same as above (server-only alias) | Manual |

### Optional (needed for specific features)

| Variable | Description | Status |
|----------|-------------|--------|
| `OPENROUTER_API_KEY` | AI paper explanations (/paper/[id]/explain) | Optional — pages degrade gracefully |
| `UNSUBSCRIBE_SECRET` | HMAC key for CAN-SPAM unsubscribe tokens | Set this before going live: `openssl rand -base64 32` |
| `ARXIV_COACH_DB_PATH` | Path to SQLite file on Vercel | Defaults to `/tmp/arxiv-coach.db` |

### Stripe (pending Mikey's account setup)

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | `sk_live_...` from Stripe dashboard |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` from Stripe webhook config |
| `STRIPE_PRICE_ID_PRO` | Price ID for the $12/mo Pro product |

### Generate secrets quickly

```bash
# SESSION_SECRET
openssl rand -base64 32

# ADMIN_SECRET  
openssl rand -base64 24

# UNSUBSCRIBE_SECRET
openssl rand -base64 32
```

### Set a Vercel env var via CLI (VPS)

```bash
TOKEN=$(pass show deploy/vercel-token | head -1)
vercel env add VARIABLE_NAME production --token "$TOKEN"
# Then paste the value interactively
```

---

## 3. Supabase Setup & Migrations

**Project:** `otekgfkmkrpwidqjslmo`  
**URL:** `https://otekgfkmkrpwidqjslmo.supabase.co`  
**Region:** West Europe (London)

### Run migrations

From `/root/repos/paperbrief`:

```bash
export SUPABASE_ACCESS_TOKEN=$(pass show deploy/supabase-token | head -1)
supabase link --project-ref otekgfkmkrpwidqjslmo
supabase db push
```

### Migration files (in order)

| File | What it does |
|------|-------------|
| `001_initial.sql` | Reference schema (magic_tokens, tracks, deliveries, waitlist) |
| `20260206000001_schema.sql` | Initial production schema |
| `20260206000002_waitlist.sql` | Waitlist table |
| `20260228000001_reader_ui.sql` | Reading list + feedback tables |
| `20260302000001_waitlist_invite.sql` | Beta invite tracking (invited_at, invite_token) |

### Pending migrations (not yet pushed — in feature branches)

| Branch | Migration | What it adds |
|--------|-----------|-------------|
| `feature/stripe-integration` | `20260305000001_stripe_subscriptions.sql` | `user_subscriptions` table (plan, stripe IDs) |
| `feature/unsubscribe-system` | `20260305000002_user_email_prefs.sql` | `user_email_prefs` table (digest_subscribed) |

```bash
# After merging feature branches, run:
supabase db push
```

### Check DB health

```bash
export SUPABASE_ACCESS_TOKEN=$(pass show deploy/supabase-token | head -1)
supabase projects list
```

Or hit the health endpoint:

```bash
curl https://paperbrief.ai/api/health
# {"status":"ok","waitlist_count":N,"timestamp":"..."}
```

---

## 4. Vercel Deployment

**Project:** paperbrief (linked to GitHub `mindofindica/paperbrief`)  
**Production URL:** https://paperbrief.ai  
**Build command:** `npm run build --workspace=packages/core && npm run build --workspace=apps/web`

### Deploy

```bash
TOKEN=$(pass show deploy/vercel-token | head -1)
vercel --prod --yes --token "$TOKEN"
```

### Redeploy without code changes (to pick up new env vars)

```bash
TOKEN=$(pass show deploy/vercel-token | head -1)
vercel --prod --yes --token "$TOKEN" --force
```

### View recent deployments

```bash
TOKEN=$(pass show deploy/vercel-token | head -1)
vercel ls --token "$TOKEN"
```

### Git → auto-deploy

Pushing to `master` triggers Vercel auto-deploy via GitHub integration.  
Feature branches get preview deployments automatically.

---

## 5. Cron Jobs

Defined in `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/digest", "schedule": "0 20 * * 0" },
    { "path": "/api/health", "schedule": "0 9 * * 0" }
  ]
}
```

| Cron | Schedule | What it does |
|------|----------|-------------|
| `POST /api/digest` | Sundays 20:00 UTC | Sends weekly digest emails to all users |
| `GET /api/health` | Sundays 09:00 UTC | Pings DB + logs health (prevents Supabase pause) |

**Important:** Vercel Cron passes `Authorization: Bearer <CRON_SECRET>` automatically. The digest route checks this header. Don't remove that check.

### Trigger digest manually (testing)

```bash
curl -X POST https://paperbrief.ai/api/digest \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"userId": "your-user-id"}'
```

### Preview digest without sending email

```bash
curl https://paperbrief.ai/api/digest/preview \
  -H "Cookie: pb_session=<your-session-cookie>"
```

---

## 6. Waitlist & Beta Invites

### Check waitlist stats

```bash
curl https://paperbrief.ai/api/admin/waitlist \
  -H "x-admin-secret: $ADMIN_SECRET"

# With full entry list:
curl "https://paperbrief.ai/api/admin/waitlist?full=1" \
  -H "x-admin-secret: $ADMIN_SECRET"
```

### Invite users from waitlist

```bash
# Invite the next 5 pending users (oldest signups first)
curl -X POST https://paperbrief.ai/api/admin/invite \
  -H "x-admin-secret: $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"count": 5}'

# Invite a specific user by email
curl -X POST "https://paperbrief.ai/api/admin/invite/user@example.com" \
  -H "x-admin-secret: $ADMIN_SECRET"
```

### Invite flow

1. User signs up at `/` → added to `paperbrief_waitlist`
2. You invite them via admin API → sets `invited_at`, `invite_token` + sends welcome email
3. Welcome email has magic link → user clicks → gets session cookie → goes to `/digest`

---

## 7. Stripe (Billing)

**Status:** Code complete, awaiting Mikey's Stripe account.

### Setup steps

1. Create Stripe account at stripe.com
2. Create a product: "PaperBrief Pro" — $12.00/month recurring
3. Copy the Price ID (`price_xxx`) → set as `STRIPE_PRICE_ID_PRO`
4. Get Secret Key → set as `STRIPE_SECRET_KEY`
5. Set up webhook endpoint: `https://paperbrief.ai/api/stripe/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.deleted`, `invoice.payment_failed`
   - Copy Webhook Signing Secret → set as `STRIPE_WEBHOOK_SECRET`
6. Run pending Supabase migration: `20260305000001_stripe_subscriptions.sql`
7. Merge `feature/stripe-integration` branch
8. Redeploy

### Plan limits

| Plan | Tracks | Price |
|------|--------|-------|
| Free | 1 | — |
| Pro | 5 | $12/mo |

Enforced in `POST /api/tracks` — returns 403 with upgrade hint if free user hits limit.

### Test Stripe locally

Use Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe/webhook`

---

## 8. Email (Resend)

**Account:** mindofindica@gmail.com  
**Domain:** paperbrief.ai (verified ✅)  
**From address:** `hello@paperbrief.ai`

### Email types

| Email | When sent | Template |
|-------|-----------|----------|
| Welcome / invite | After admin invites user | `lib/email/WelcomeEmail.tsx` |
| Weekly digest | Sunday 20:00 UTC via cron | `lib/email/DigestEmail.tsx` |

### Test email sending

```bash
# Trigger a duplicate waitlist email (safe test)
curl -X POST https://paperbrief.ai/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{"email": "pmsorhaindo@gmail.com"}'
```

### Unsubscribe system

- Every digest email includes a one-click unsubscribe link
- Token format: `HMAC-SHA256(UNSUBSCRIBE_SECRET, 'userId:email')` → URL-safe base64
- `GET /api/unsubscribe?token=...&userId=...&email=...` — handles unsubscribe
- `POST /api/unsubscribe` — RFC 8058 mail client support (Gmail, Apple Mail)
- `POST /api/resubscribe` — session-gated re-subscribe
- User's preference stored in `user_email_prefs.digest_subscribed`

**Important:** Set `UNSUBSCRIBE_SECRET` before sending any digest emails, or links will be broken.

```bash
# Set it:
TOKEN=$(pass show deploy/vercel-token | head -1)
SECRET=$(openssl rand -base64 32)
echo "$SECRET" | vercel env add UNSUBSCRIBE_SECRET production --token "$TOKEN"
```

---

## 9. Admin API Reference

All admin endpoints require: `x-admin-secret: <ADMIN_SECRET>`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/waitlist` | Waitlist stats (add `?full=1` for all entries) |
| `POST` | `/api/admin/invite` | Batch invite (body: `{"count": N}`) |
| `POST` | `/api/admin/invite/:email` | Invite specific user |
| `GET` | `/api/health` | App + DB health check |
| `GET` | `/api/digest/today` | Today's fetched papers (no auth) |
| `GET` | `/api/digest/preview` | Preview digest for authed user |

---

## 10. Health & Monitoring

### Quick health check

```bash
curl https://paperbrief.ai/api/health
# Expected: {"status":"ok","waitlist_count":N,"timestamp":"..."}
# Degraded: {"status":"degraded","reason":"..."}
```

### Check Supabase project is alive

```bash
export SUPABASE_ACCESS_TOKEN=$(pass show deploy/supabase-token | head -1)
supabase projects list
```

**Note:** Supabase free tier pauses projects after 1 week of inactivity. The weekly health cron at 09:00 UTC Sunday keeps it alive. If it goes inactive anyway:
1. Go to supabase.com/dashboard
2. Select project → click "Restore"
3. Wait ~30 seconds

### View Vercel function logs

```bash
TOKEN=$(pass show deploy/vercel-token | head -1)
vercel logs https://paperbrief.ai --token "$TOKEN" --follow
```

### Check that digest cron ran

Look for Vercel function logs on Sunday evenings (20:00 UTC). Each run logs:
- Number of users processed
- Number of emails sent
- Any per-user errors

---

## 11. Incident Response

### "Emails not sending"

1. Check `RESEND_API_KEY` is set: Vercel → Settings → Env Vars
2. Check Resend dashboard for bounces/blocks: resend.com/emails
3. Verify paperbrief.ai domain is still verified in Resend
4. Check `UNSUBSCRIBE_SECRET` is set (required for email template to render)
5. Test: `curl -X POST https://paperbrief.ai/api/waitlist -d '{"email":"pmsorhaindo@gmail.com"}'`

### "Auth broken / magic links not working"

1. Check `SESSION_SECRET` is set
2. Check `NEXT_PUBLIC_APP_URL` is set to `https://paperbrief.ai`
3. Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set
4. Check Supabase `magic_tokens` table is accessible
5. Try generating a token: `curl -X POST https://paperbrief.ai/api/auth -d '{"email":"pmsorhaindo@gmail.com"}'`

### "Supabase paused"

```
Supabase free projects pause after 1 week of inactivity.
```

1. Go to supabase.com → select project → click "Restore"
2. Once restored, Vercel requests will resume automatically
3. Long-term fix: upgrade Supabase plan, or make sure the weekly health cron is running

### "Digest not sending on Sunday"

1. Check Vercel Cron logs (Vercel dashboard → Logs → filter by `/api/digest`)
2. Check `CRON_SECRET` is set
3. Manually trigger: `curl -X POST https://paperbrief.ai/api/digest -H "Authorization: Bearer $CRON_SECRET" -d '{}'`
4. Check that `RESEND_API_KEY` is set

### "Search/recommend returning no results"

Papers come from the SQLite database at `ARXIV_COACH_DB_PATH`. If it's empty:
1. Check the arxiv-coach pipeline is still writing to the DB
2. Check `ARXIV_COACH_DB_PATH` env var points to the right file
3. Hit `/api/digest/today` to see if papers are visible

### "Deploy failing"

```bash
cd /root/repos/paperbrief
npm run build --workspace=packages/core  # build core first
npm run build --workspace=apps/web       # then web
```

Common causes:
- TypeScript errors in new code
- Missing env vars causing imports to fail at build time
- Dependency version conflicts

---

## 12. Feature Branch Status

| Branch | What's in it | Status |
|--------|-------------|--------|
| `master` | Everything stable + live | ✅ Live at paperbrief.ai |
| `feature/paper-detail` | Paper detail page + Recommendations page | ✅ Ready to merge |
| `feature/stripe-integration` | Stripe billing, plan limits, UpgradeCTA | ⏳ Awaiting Stripe account |
| `feature/unsubscribe-system` | CAN-SPAM unsubscribe, RFC 8058, email prefs | ⏳ Merge before next digest |

### Merge order (recommended)

1. `feature/paper-detail` — pure UI, no dependencies, ship now
2. `feature/unsubscribe-system` — required before next digest run (compliance)
3. `feature/stripe-integration` — after Stripe account is set up

### Merge a branch to master

```bash
cd /root/repos/paperbrief
git checkout master
git merge feature/<branch-name> --no-ff -m "feat: merge <branch-name>"
git push origin master
# Vercel auto-deploys
```

---

## Quick Reference Card

```bash
# Health check
curl https://paperbrief.ai/api/health

# Waitlist stats
curl https://paperbrief.ai/api/admin/waitlist -H "x-admin-secret: $ADMIN_SECRET"

# Invite next 5 users
curl -X POST https://paperbrief.ai/api/admin/invite \
  -H "x-admin-secret: $ADMIN_SECRET" -d '{"count":5}'

# Trigger digest manually
curl -X POST https://paperbrief.ai/api/digest \
  -H "Authorization: Bearer $CRON_SECRET" -d '{}'

# Deploy
TOKEN=$(pass show deploy/vercel-token | head -1)
vercel --prod --yes --token "$TOKEN"

# Run Supabase migrations
export SUPABASE_ACCESS_TOKEN=$(pass show deploy/supabase-token | head -1)
supabase db push

# Run tests
cd /root/repos/paperbrief/apps/web && npx vitest run
```

---

*Last updated: 2026-03-06 by Indica (night shift session 1)*
