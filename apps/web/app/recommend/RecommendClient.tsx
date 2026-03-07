'use client';

import { useState } from 'react';
import PaperCard from '../components/PaperCard';
import type { Paper } from '../../lib/arxiv-db';

export default function RecommendClient({
  initialPapers,
  initialBasedOn,
}: {
  initialPapers: Paper[];
  initialBasedOn: 'your feedback' | 'top papers';
}) {
  const [papers, setPapers] = useState<Paper[]>(initialPapers);
  const [basedOn, setBasedOn] = useState<'your feedback' | 'top papers'>(initialBasedOn);
  const [loading, setLoading] = useState(false);

  async function refreshRecommendations() {
    setLoading(true);
    try {
      const res = await fetch('/api/recommend?limit=20');
      const data = await res.json();
      setPapers(data.papers || []);
      setBasedOn(data.basedOn === 'your feedback' ? 'your feedback' : 'top papers');
    } catch {
      // Keep current list if refresh fails.
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <nav className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <a href="/digest" className="text-lg font-bold text-gray-100">📄 PaperBrief</a>
          <div className="flex gap-4 text-sm">
            <a href="/digest" className="text-gray-500 hover:text-gray-300 transition-colors">Digest</a>
            <a href="/search" className="text-gray-500 hover:text-gray-300 transition-colors">Search</a>
            <a href="/recommend" className="text-gray-100 font-medium">Recommend</a>
            <a href="/reading-list" className="text-gray-500 hover:text-gray-300 transition-colors">Reading List</a>
          </div>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <header className="space-y-3">
          <h1 className="text-2xl font-bold text-gray-100">🧭 Recommended for You</h1>
          <p className="text-sm text-gray-500">
            {basedOn === 'your feedback'
              ? 'Based on your reading list and feedback'
              : 'Top papers by relevance'}
          </p>
          <div className="flex items-center gap-3">
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                basedOn === 'your feedback'
                  ? 'bg-blue-900/60 text-blue-200'
                  : 'bg-gray-800 text-gray-300'
              }`}
            >
              {basedOn === 'your feedback' ? 'Personalised' : 'Top picks'}
            </span>
            <button
              onClick={refreshRecommendations}
              disabled={loading}
              className="rounded-lg border border-gray-700 hover:border-gray-600 px-3 py-1.5 text-xs text-gray-300 transition-colors disabled:opacity-60"
            >
              {loading ? 'Refreshing...' : 'Refresh recommendations'}
            </button>
          </div>
        </header>

        {papers.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center space-y-2">
            <p className="text-gray-300">Start reading and rating papers to get personalised recommendations</p>
            <a href="/search" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
              Go to search
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            {papers.map((paper) => (
              <PaperCard key={paper.arxiv_id} paper={paper} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
