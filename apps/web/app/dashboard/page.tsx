/**
 * Dashboard — the main app screen after login.
 * Shows: active tracks, recent digest, reading list.
 *
 * TODO: Wire to Supabase for real data.
 * This is a skeleton UI — implement in Day 1 of launch sprint.
 */

export default function Dashboard() {
  return (
    <main className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <span className="font-bold text-xl text-gray-900">📄 PaperBrief</span>
        <div className="flex items-center gap-4">
          <a href="/dashboard/tracks" className="text-sm text-gray-600 hover:text-gray-900">My Tracks</a>
          <a href="/dashboard/reading-list" className="text-sm text-gray-600 hover:text-gray-900">Reading List</a>
          <a href="/account" className="text-sm text-gray-600 hover:text-gray-900">Account</a>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* ── Welcome ── */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Your digest</h1>
          <p className="text-gray-500">Week of Feb 23, 2026 · 12 papers across 2 tracks</p>
        </div>

        {/* ── Tracks ── */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700">Your research tracks</h2>
            <a href="/dashboard/tracks/new" className="text-sm text-blue-600 hover:text-blue-800">
              + Add track
            </a>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* TODO: Map over tracks from Supabase */}
            <span className="bg-white border border-gray-200 rounded-full px-4 py-1.5 text-sm font-medium text-gray-700">
              Speculative Decoding
            </span>
            <span className="bg-white border border-gray-200 rounded-full px-4 py-1.5 text-sm font-medium text-gray-700">
              LoRA Fine-Tuning
            </span>
            <span className="bg-gray-100 border border-gray-200 rounded-full px-4 py-1.5 text-sm text-gray-400 cursor-pointer hover:bg-gray-50">
              + Free plan: 1 track max
            </span>
          </div>
        </section>

        {/* ── Papers ── */}
        <section>
          <h2 className="font-semibold text-gray-700 mb-4">This week's papers</h2>
          {/* TODO: Map over digest entries from Supabase */}
          <div className="space-y-4">
            {[
              {
                score: 5,
                scoreLabel: '🔥 Essential',
                title: 'Eagle3: Scalable Speculative Decoding with Mamba Augmentation',
                authors: 'Li et al.',
                summary: 'A new speculative decoding method using a Mamba-augmented draft model achieves 3.2× speedup on LLaMA-3 70B. The key insight is using state-space models for draft generation, which are faster than transformer-based drafters.',
                track: 'Speculative Decoding',
                arxivId: '2502.01234',
                absUrl: 'https://arxiv.org/abs/2502.01234',
              },
            ].map((paper) => (
              <div key={paper.arxivId} className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <span className="text-sm text-gray-500 mb-1 block">
                      {paper.scoreLabel} · {paper.track}
                    </span>
                    <a
                      href={paper.absUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-gray-900 hover:text-blue-700 hover:underline"
                    >
                      {paper.title}
                    </a>
                    <p className="text-sm text-gray-500 mt-1">{paper.authors}</p>
                  </div>
                  <button className="flex-shrink-0 text-gray-400 hover:text-red-500 transition-colors" title="Save to reading list">
                    ♡
                  </button>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{paper.summary}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
