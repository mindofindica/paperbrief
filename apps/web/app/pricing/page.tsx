import Link from 'next/link';

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-4xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold">Pricing</h1>
          <p className="text-gray-400 mt-3">
            Start free. Upgrade when PaperBrief saves you real time.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="border border-gray-800 rounded-2xl p-6 bg-gray-900/50">
            <h2 className="text-2xl font-semibold">Free</h2>
            <p className="text-3xl font-bold mt-2">€0</p>
            <ul className="mt-4 space-y-2 text-gray-300">
              <li>• 1 track</li>
              <li>• Weekly digest</li>
              <li>• Paper summaries</li>
            </ul>
          </div>

          <div className="border border-blue-600 rounded-2xl p-6 bg-blue-600/10">
            <h2 className="text-2xl font-semibold">Pro</h2>
            <p className="text-3xl font-bold mt-2">€12 / month</p>
            <ul className="mt-4 space-y-2 text-gray-200">
              <li>• 5 tracks</li>
              <li>• Daily digest</li>
              <li>• Priority recommendations</li>
              <li>• Early access features</li>
            </ul>
            <Link
              href="/auth/login"
              className="inline-block mt-6 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-5 py-2 rounded-lg"
            >
              Upgrade
            </Link>
          </div>
        </div>

        <div className="text-center mt-10">
          <Link href="/" className="text-blue-400 hover:text-blue-300">
            ← Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
