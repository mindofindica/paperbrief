/**
 * PaperBrief Landing Page
 * Copy source: ../../../LANDING-COPY.md
 */

import { createClient } from "@supabase/supabase-js";
import WaitlistForm from "./components/WaitlistForm";

export const revalidate = 3600; // ISR: revalidate waitlist count every hour

async function getWaitlistCount(): Promise<number | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const supabase = createClient(url, key);
    const { count } = await supabase
      .from("paperbrief_waitlist")
      .select("*", { count: "exact", head: true });
    return count ?? null;
  } catch {
    return null;
  }
}

export default async function LandingPage() {
  const waitlistCount = await getWaitlistCount();

  // Social proof text — only show when count > 0
  const socialProof =
    waitlistCount && waitlistCount > 0
      ? `Join ${waitlistCount.toLocaleString()} researcher${waitlistCount === 1 ? "" : "s"} on the waitlist`
      : null;

  return (
    <main className="min-h-screen bg-white">
      {/* ── Nav ── */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <span className="font-bold text-xl text-gray-900">📄 PaperBrief</span>
        <div className="flex items-center gap-4">
          <a href="/pricing" className="text-sm text-gray-600 hover:text-gray-900">Pricing</a>
          <div className="hidden md:block w-[320px]">
            <WaitlistForm compact buttonText="Join waitlist" />
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h1 className="text-5xl font-bold text-gray-900 leading-tight mb-6">
          Stop drowning in arxiv.<br />
          Start reading what matters.
        </h1>
        <p className="text-xl text-gray-600 mb-10 max-w-xl mx-auto">
          PaperBrief reads 500+ ML papers a day so you don't have to.{" "}
          Enter your research interests, get a weekly digest of the papers{" "}
          that actually matter to your work — ranked by relevance, summarised{" "}
          in plain English.
        </p>
        <WaitlistForm
          className="max-w-xl mx-auto"
          buttonText="Join the waitlist"
          note={socialProof ?? "No credit card. 2 minutes to set up."}
        />
      </section>

      {/* ── Problem ── */}
      <section className="bg-gray-50 py-20 px-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">
            The arxiv firehose is impossible.
          </h2>
          <p className="text-gray-600 mb-6">
            There are 500+ new papers every single day in machine learning alone.
            You can't read them all. But the ones you miss might be the ones that{" "}
            change your thesis direction, invalidate your approach, or give you the{" "}
            exact technique you've been trying to invent yourself.
          </p>
          <p className="text-gray-600 mb-4">Right now, your options are:</p>
          <ul className="text-gray-600 space-y-2 mb-6">
            <li>❌ <strong>Twitter/X</strong> — noisy, algorithm-driven, never shows you what you actually need</li>
            <li>❌ <strong>RSS feeds</strong> — raw title soup, zero curation, you still have to read everything</li>
            <li>❌ <strong>Newsletters</strong> — someone else's taste, not personalised to your research</li>
            <li>❌ <strong>Waiting</strong> — and hoping your advisor mentions the important one later</li>
          </ul>
          <p className="text-gray-900 font-semibold text-lg">
            You need a better filter. One that's tuned to you.
          </p>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="py-20 px-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">
            Your personal research radar.
          </h2>
          <div className="space-y-10">
            {[
              {
                num: "1",
                title: "Tell us what you care about",
                body: "Add your research tracks: keywords, topics, arxiv categories. \"Speculative decoding, LoRA fine-tuning, diffusion models for audio.\" Whatever you're actually working on.",
              },
              {
                num: "2",
                title: "We read everything",
                body: "Every day, PaperBrief pulls every new submission from arxiv and scores it against your tracks using an LLM — not keywords, not citation counts. Relevance to your work.",
              },
              {
                num: "3",
                title: "You get the good stuff",
                body: "Once a week (or daily), your inbox gets a clean digest: top papers, ranked by score, with a 3-sentence summary of why this one matters for your research specifically.",
              },
            ].map((step) => (
              <div key={step.num} className="flex gap-6">
                <span className="flex-shrink-0 w-10 h-10 bg-gray-900 text-white rounded-full flex items-center justify-center font-bold">
                  {step.num}
                </span>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">{step.title}</h3>
                  <p className="text-gray-600">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="bg-gray-50 py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">Simple pricing.</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            {/* Free */}
            <div className="bg-white border border-gray-200 rounded-xl p-8">
              <h3 className="font-bold text-xl mb-2">Free</h3>
              <p className="text-gray-600 text-sm mb-4">Get started with no commitment</p>
              <div className="text-4xl font-bold mb-6">$0<span className="text-lg text-gray-500">/mo</span></div>
              <ul className="text-gray-600 space-y-2 text-sm mb-8">
                <li>✓ 1 research track</li>
                <li>✓ Weekly email digest</li>
                <li>✓ Top 10 papers per week</li>
                <li>✓ Forever free</li>
              </ul>
              <WaitlistForm compact buttonText="Join waitlist" />
            </div>
            {/* Pro */}
            <div className="bg-gray-900 text-white rounded-xl p-8">
              <h3 className="font-bold text-xl mb-2">Pro</h3>
              <p className="text-gray-400 text-sm mb-4">For serious researchers</p>
              <div className="text-4xl font-bold mb-6">$12<span className="text-lg text-gray-400">/mo</span></div>
              <ul className="text-gray-300 space-y-2 text-sm mb-8">
                <li>✓ Up to 5 research tracks</li>
                <li>✓ Daily or weekly digest</li>
                <li>✓ Top 20 papers</li>
                <li>✓ Email + Telegram/Slack</li>
                <li>✓ Paper chat</li>
                <li>✓ Reading list + export</li>
              </ul>
              <WaitlistForm compact buttonText="Join waitlist" />
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="py-20 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Ready to stop missing important papers?
          </h2>
          <p className="text-gray-600 mb-8">
            Join the waitlist. We'll let you know when PaperBrief opens.
          </p>
          <WaitlistForm
            className="max-w-md mx-auto"
            buttonText="Get early access"
            note={socialProof ?? "Free tier available. No credit card needed."}
          />
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-12 px-6 text-center text-gray-500 text-sm border-t border-gray-100">
        <p className="mb-2">
          <a href="https://paperbrief.ai" className="hover:text-gray-900">PaperBrief</a>
          {" · "}
          <a href="/privacy" className="hover:text-gray-900">Privacy</a>
          {" · "}
          <a href="/terms" className="hover:text-gray-900">Terms</a>
        </p>
        <p className="text-gray-400">Built by a researcher, for researchers. Powered by arxiv + Claude.</p>
      </footer>
    </main>
  );
}
