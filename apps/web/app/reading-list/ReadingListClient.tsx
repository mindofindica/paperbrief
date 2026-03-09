'use client';

import { useState, useEffect } from 'react';
import PaperCard from '../components/PaperCard';

interface Paper {
  arxiv_id: string;
  title: string;
  abstract: string | null;
  published_date?: string | null;
  published_at?: string | null;
  llm_score: number | null;
  track: string | null;
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'reading', label: 'Reading' },
  { key: 'done', label: 'Done' },
];

export default function ReadingListClient({
  all,
  unread,
  reading,
  done,
}: {
  all: Paper[];
  unread: Paper[];
  reading: Paper[];
  done: Paper[];
}) {
  const [activeTab, setActiveTab] = useState('all');
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});

  // Fetch note counts for all papers in the reading list
  useEffect(() => {
    if (all.length === 0) return;
    const ids = all.map(p => p.arxiv_id).join(',');
    fetch(`/api/notes/counts?arxivIds=${encodeURIComponent(ids)}`)
      .then(res => res.ok ? res.json() : { counts: {} })
      .then(data => setNoteCounts(data.counts ?? {}))
      .catch(() => {}); // Non-critical — silently fail
  }, [all]);

  const lists: Record<string, Paper[]> = { all, unread, reading, done };
  const items = lists[activeTab] || [];

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 rounded-lg p-1 w-fit">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`text-sm px-4 py-2 rounded-md transition-all duration-200 ${
              activeTab === key
                ? 'bg-gray-800 text-gray-100 font-medium'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Papers */}
      {items.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
          <div className="text-4xl mb-4">📚</div>
          <p className="text-gray-400">No papers in this list yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((paper) => (
            <PaperCard
              key={paper.arxiv_id}
              paper={paper}
              noteCount={noteCounts[paper.arxiv_id] ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
