# Resend Email Setup for PaperBrief

PaperBrief now sends confirmation emails when people join the waitlist. To activate it, you need a Resend account and a verified sending domain.

---

## What's shipped

- **Welcome email** — sent to new signups (clean HTML, on-brand, includes CTA)
- **"Already on the list" email** — sent when someone re-submits their email
- **Graceful fallback** — if `RESEND_API_KEY` isn't set, emails are silently skipped and the waitlist still works exactly as before (no broken deploys)

---

## Step 1 — Create a Resend account

1. Go to [resend.com](https://resend.com) and sign up (free tier: 100 emails/day, 3,000/month)
2. Verify your email

---

## Step 2 — Add a sending domain

The emails are configured to send from `hello@paperbrief.app`.

### Option A: Use your own domain (recommended)

1. In the Resend dashboard → **Domains** → **Add Domain**
2. Enter `paperbrief.app` (or whatever domain you own)
3. Add the DNS records Resend gives you (usually 2–3 TXT/MX records in your domain registrar)
4. Wait for verification (usually a few minutes)

### Option B: Use Resend's shared domain (easiest — no DNS needed)

Skip domain setup and change the `from` address in the code to use Resend's sandbox:

```ts
// apps/web/lib/email/send-welcome.ts — line ~27
from: "PaperBrief <onboarding@resend.dev>",
```

⚠️ With the shared domain, emails only go to the **email address you verified with Resend**. Fine for testing; not for real users.

---

## Step 3 — Get your API key

1. Resend dashboard → **API Keys** → **Create API Key**
2. Name it something like `paperbrief-prod`
3. Permission: **Sending access** is enough
4. Copy the key (you only see it once)

---

## Step 4 — Add the env var to Vercel

1. Go to [vercel.com](https://vercel.com) → Your PaperBrief project → **Settings** → **Environment Variables**
2. Add:
   - **Key:** `RESEND_API_KEY`
   - **Value:** `re_xxxxxxxxxx` (your key from step 3)
   - **Environment:** Production (and Preview if you want)
3. Click **Save**
4. **Redeploy** the project (Vercel doesn't pick up new env vars until the next deploy)

```bash
# Or trigger a redeploy from the CLI:
vercel --prod --yes --token $(pass show deploy/vercel-token | head -1)
```

---

## Step 5 — Test it

Once deployed with the key set, sign up with your own email on the live site and check your inbox.

The email logs will appear in:
- Vercel → Functions → `/api/waitlist` logs
- Resend dashboard → **Emails** tab

---

## Files changed

```
apps/web/lib/email/
  send-welcome.ts                     ← Resend client + sendWelcomeEmail() + sendAlreadyWaitlistedEmail()
  send-welcome.test.ts                ← 16 tests (all passing)
  templates/
    welcome.tsx                       ← React Email HTML template (new signup)
    already-waitlisted.tsx            ← React Email HTML template (duplicate signup)

apps/web/app/api/waitlist/route.ts    ← wired: calls sendWelcomeEmail() after new insert,
                                         sendAlreadyWaitlistedEmail() on 23505 duplicate
```

---

## Notes

- Emails are sent **fire-and-forget** — they don't block the API response. If the send fails, the waitlist entry is still saved and the user gets the normal success message.
- `@react-email/components` was added as a dependency (`npm install` already run).
- The `from` address is `hello@paperbrief.app` — update this in `send-welcome.ts` if you use a different domain.
