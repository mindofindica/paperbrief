# PaperBrief — Landing Page Copy

*Skeleton. Wire this into the Next.js landing page.*

---

## Hero

**Headline:**
> Stop drowning in arxiv. Start reading what matters.

**Subheadline:**
> PaperBrief reads 500+ ML papers a day so you don't have to. Enter your research interests, get a weekly digest of the papers that actually matter to your work — ranked by relevance, summarised in plain English.

**CTA:**
> [Get your free digest →]
> *No credit card. Takes 2 minutes to set up.*

**Social proof strip (to add after launch):**
> "Finally, a way to keep up with the field without losing my Saturdays."
> "My arxiv anxiety is gone."
> "This is what Google Scholar Alerts should have been."

---

## Problem Section

**Heading:** The arxiv firehose is impossible.

**Body:**
There are 500+ new papers every single day in machine learning alone.

You can't read them all. But the ones you miss might be the ones that change your thesis direction, invalidate your approach, or give you the exact technique you've been trying to invent yourself.

Right now, your options are:
- **Twitter/X** — noisy, algorithm-driven, never shows you what you actually need
- **RSS feeds** — raw title soup, zero curation, you still have to read everything
- **Newsletters** — someone else's taste, not personalised to your specific research area
- **Waiting** — and hoping your advisor mentions the important one six months later

**You need a better filter. One that's tuned to you.**

---

## Solution Section

**Heading:** Your personal research radar.

**Steps:**

**1. Tell us what you care about**
Add your research tracks: keywords, topics, arxiv categories. "Speculative decoding, LoRA fine-tuning, diffusion models for audio." Whatever you're actually working on.

**2. We read everything**
Every day, PaperBrief pulls every new submission from arxiv and scores it against your tracks using an LLM — not keywords, not citation counts. *Relevance to your work.*

**3. You get the good stuff**
Once a week (or daily, if you want), your inbox gets a clean digest: top papers, ranked by score, with a 3-sentence summary of why this one matters for your research specifically.

---

## Features Section

**Heading:** Everything you need. Nothing you don't.

| Feature | Free | Pro ($12/mo) |
|---|---|---|
| Research tracks | 1 | 5 |
| Digest frequency | Weekly | Daily or weekly |
| Papers per digest | Top 10 | Top 20 |
| Delivery channels | Email | Email + Telegram/Slack |
| Paper chat | — | ✓ Ask questions about any paper |
| Reading list | — | ✓ Save + organise |
| Export | — | ✓ BibTeX / CSV |

---

## Social Proof Section (placeholder — fill after launch)

**Heading:** What researchers say

*[Testimonial 1 — PhD student, NLP research]*
*[Testimonial 2 — Research engineer, large AI company]*
*[Testimonial 3 — Assistant professor]*

---

## Pricing Section

**Heading:** Simple pricing.

**Free**
- 1 track
- Weekly digest
- Top 10 papers
- Email delivery
- **$0/month forever**

[Start free →]

---

**Pro**
- 5 tracks
- Daily or weekly digest
- Top 20 papers
- Email + Telegram/Slack
- Paper chat
- Reading list + export
- **$12/month** (or $99/year — save 31%)

[Start 14-day free trial →]

---

**Team**
- 5 seats
- All Pro features
- Shared reading lists
- Team highlights
- Slack integration
- **$49/month**

[Contact us →]

---

## FAQ

**Q: How is this different from Google Scholar Alerts?**
Scholar alerts do keyword matching — you get everything with your keyword, even tangentially related papers. PaperBrief uses an LLM to judge *actual relevance* to your research area. The result is dramatically less noise.

**Q: How fresh is the data?**
We pull from arxiv daily. Pro users can get daily digests; Free users get a weekly rollup.

**Q: What LLM do you use to score papers?**
We use Claude Sonnet for scoring (accuracy + nuanced relevance) and Claude Haiku for summaries (speed + cost). Scoring runs on the full abstract, not just titles.

**Q: Can I use it for research areas outside ML?**
Yes. arxiv covers cs, math, physics, economics, q-bio, and more. Any arxiv-indexed field works.

**Q: Is there a free tier?**
Yes, free forever — 1 track, weekly digest, top 10 papers.

**Q: Can I cancel anytime?**
Yes. Cancel from your account settings. Your data stays accessible for 30 days after cancellation.

---

## Footer CTA

**Heading:** Start reading the papers that matter.

**Body:** Join 0 researchers who've stopped drowning in arxiv.

[Get your free digest →]

*No credit card required. Takes 2 minutes.*

---

## Email Capture (Waitlist Mode)

**Heading:** Be first.

**Body:** PaperBrief launches soon. Enter your email for early access.

[email input] [Get early access]

*You'll get: early access when we launch, the weekly digest before we charge for it, and a chance to shape what we build.*

---

*Copy written by Indica — night shift 24 Feb 2026. Wire into `apps/web/app/page.tsx`.*
