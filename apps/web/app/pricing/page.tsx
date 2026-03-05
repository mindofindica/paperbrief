import WaitlistForm from "../components/WaitlistForm";

export default function PricingPage() {
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

      {/* ── Pricing ── */}
      <section className="bg-gray-50 py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-12 text-center">Simple pricing.</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            {/* Free */}
            <div className="bg-white border border-gray-200 rounded-xl p-8">
              <h3 className="font-bold text-xl mb-2">Free</h3>
              <p className="text-gray-600 text-sm mb-4">Get started with no commitment</p>
              <div className="text-4xl font-bold mb-6">€0<span className="text-lg text-gray-500">/mo</span></div>
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
              <div className="text-4xl font-bold mb-6">€12<span className="text-lg text-gray-400">/mo</span></div>
              <ul className="text-gray-300 space-y-2 text-sm mb-8">
                <li>✓ Up to 5 research tracks</li>
                <li>✓ Daily or weekly digest</li>
                <li>✓ Top 20 papers</li>
                <li>✓ Email + Telegram/Slack</li>
                <li>✓ Paper chat</li>
                <li>✓ Reading list + export</li>
              </ul>
              <a
                href="/auth/login"
                className="inline-block bg-white text-gray-900 font-semibold px-5 py-2 rounded-lg"
              >
                Upgrade
              </a>
            </div>
          </div>
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
