# @paperbrief/web

Next.js 15 web app for PaperBrief.

**Live:** https://paperbrief.vercel.app _(waitlist mode)_

## Status

🟢 **Deployed** — Waitlist capture is live. Emails are stored in Supabase (`paperbrief_waitlist` table).

## Stack

- Next.js 15 (App Router)
- Tailwind CSS v3
- Supabase (email waitlist + future auth)
- Vercel (deploy)

## Routes

| Route | Description |
|---|---|
| `/` | Landing page with waitlist email capture |
| `/api/waitlist` | POST `{email}` → Supabase insert |
| `/api/digest` | Cron-triggered weekly digest (Sundays 20:00 UTC) |
| `/dashboard` | Future: authenticated user dashboard |

## Local Dev

```bash
# From repo root
cp apps/web/.env.example apps/web/.env.local
# Fill in Supabase keys

npm install
npm run dev --workspace=apps/web
```

## Deploy

```bash
# Build locally
npm run build --workspace=packages/core
npm run build --workspace=apps/web

# Deploy
vercel --prod
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon key (for client-side RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key (for waitlist inserts) |
| `RESEND_API_KEY` | 🔜 | Email delivery (Phase 2) |
| `STRIPE_SECRET_KEY` | 🔜 | Payments (Phase 2) |
| `OPENROUTER_API_KEY` | 🔜 | LLM scoring (Phase 2) |
