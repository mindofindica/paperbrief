# PaperBrief 📄✨

> **Your personal ML research digest. Powered by AI, tuned to your topics.**

[![Waitlist Mode](https://img.shields.io/badge/status-waitlist-blue)](https://paperbrief.vercel.app)
[![Live](https://img.shields.io/badge/live-paperbrief.vercel.app-brightgreen)](https://paperbrief.vercel.app)

🚀 **[paperbrief.vercel.app](https://paperbrief.vercel.app)** — Join the waitlist!

---

PaperBrief monitors arxiv every day, scores papers for relevance to your research interests, and delivers a clean weekly digest to your inbox — ranked by how much you'll actually care.

---

## The Problem

There are 500+ new papers on arxiv cs.LG every single day.

Nobody reads all of them. But the important ones are in there — the ones that will change how you work in six months. Right now you're either:
- Relying on Twitter to surface things (noisy, algorithm-controlled, not yours)
- Running a RSS feed of raw titles (unsorted, unfiltered, overwhelming)
- Waiting for a newsletter (someone else's taste, not personalised)

PaperBrief is different. It's **your** filter, running on **your** topics, delivering the papers **you** would have found if you had time to read everything.

---

## How It Works

1. **You set your topics** — e.g. "speculative decoding, LoRA fine-tuning, diffusion models"
2. **PaperBrief fetches arxiv daily** — pulls every new submission matching your areas
3. **LLM scores each paper** — 0–5 relevance score + a 3-sentence reason why it matters for your work
4. **Weekly digest → your inbox** — top papers, ranked, summarised, with direct arxiv links

That's it. No noise. No algorithm. Just the papers that matter to you.

---

## Features

### Free Tier
- 1 research track
- Weekly email digest
- Top 10 papers per week

### Pro ($12/month)
- Up to 5 research tracks
- Daily or weekly digest
- Telegram/Slack delivery
- Paper chat — ask questions about any paper in your digest
- Reading list management

### Team ($49/month)
- 5 seats
- Shared reading lists + annotations
- Team highlights — "4 members saved this paper"
- Slack integration

---

## Tech Stack

- **Frontend:** Next.js 15 (App Router) → Vercel
- **Auth:** Supabase Auth (magic link)
- **Database:** Supabase (Postgres)
- **Email:** Resend
- **Payments:** Stripe
- **Core engine:** arxiv-coach (battle-tested, 341 passing tests)
- **LLM:** OpenRouter (Claude Sonnet for scoring, Haiku for summaries)

---

## Project Structure

```
paperbrief/
├── apps/
│   └── web/                    # Next.js web app
│       ├── app/
│       │   ├── (auth)/         # login, signup
│       │   ├── (app)/          # dashboard, tracks, reading-list
│       │   ├── api/
│       │   │   ├── digest/     # trigger digest delivery
│       │   │   └── webhook/    # Stripe webhooks
│       │   └── page.tsx        # landing page
│       └── components/
├── packages/
│   ├── core/                   # arxiv fetch + LLM scoring (from arxiv-coach)
│   │   ├── fetch-papers.ts
│   │   ├── score-paper.ts
│   │   ├── format-digest.ts
│   │   └── index.ts
│   └── email/                  # Resend digest templates (React Email)
│       ├── digest-email.tsx
│       └── welcome-email.tsx
├── supabase/
│   └── migrations/
│       ├── 001_users.sql
│       ├── 002_tracks.sql
│       └── 003_deliveries.sql
└── package.json
```

---

## Database Schema

```sql
-- users (managed by Supabase Auth)

CREATE TABLE tracks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,         -- e.g. "Speculative Decoding"
  keywords    TEXT[] NOT NULL,       -- ["speculative decoding", "draft model"]
  arxiv_cats  TEXT[] DEFAULT '{}',   -- ["cs.LG", "cs.CL"]
  min_score   INT DEFAULT 3,         -- filter: only papers scoring >= this
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE papers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  arxiv_id    TEXT UNIQUE NOT NULL,
  title       TEXT NOT NULL,
  abstract    TEXT,
  authors     TEXT[],
  submitted   DATE,
  fetched_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE paper_scores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id    UUID REFERENCES papers(id),
  track_id    UUID REFERENCES tracks(id),
  score       INT NOT NULL,          -- 0-5
  reason      TEXT,                  -- LLM's reason
  scored_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (paper_id, track_id)
);

CREATE TABLE deliveries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id),
  track_id    UUID REFERENCES tracks(id),
  papers_sent INT,
  delivered_at TIMESTAMPTZ DEFAULT now(),
  channel     TEXT DEFAULT 'email'   -- 'email' | 'telegram' | 'slack'
);
```

---

## Getting Started (Development)

```bash
# Clone
git clone https://github.com/mindofindica/paperbrief
cd paperbrief

# Install
npm install

# Environment
cp apps/web/.env.example apps/web/.env.local
# Fill in: SUPABASE_URL, SUPABASE_ANON_KEY, RESEND_API_KEY, 
#          STRIPE_SECRET_KEY, OPENROUTER_API_KEY

# Database
supabase start
supabase db push

# Run
npm run dev
```

---

## Roadmap

### v0.1 — Launch (target: March 2026)
- [ ] Landing page with waitlist
- [ ] Auth (magic link)
- [ ] Track setup (up to 1 track on free)
- [ ] Weekly email digest
- [ ] Stripe billing (Free + Pro)

### v0.2 — Pro Features (target: April 2026)
- [ ] Up to 5 tracks
- [ ] Daily digest option
- [ ] Paper chat (ask about any paper in your digest)
- [ ] Reading list

### v0.3 — Teams (target: May 2026)
- [ ] Team seats + shared library
- [ ] Slack/Telegram delivery
- [ ] Annotation layer

### v1.0 — Conference Coverage (target: July 2026)
- [ ] NeurIPS/ICML/ICLR live coverage
- [ ] API access for programmatic queries

---

## The Story

PaperBrief grew out of arxiv-coach — a personal Signal bot built to solve information overload while doing ML research. After months of running it privately, the core question became: *why is this only for me?*

Every ML researcher has the same problem. PaperBrief is the answer for all of them.

---

## License

MIT

---

*Built by Mikey. Powered by arxiv-coach's battle-tested paper scoring engine.*
