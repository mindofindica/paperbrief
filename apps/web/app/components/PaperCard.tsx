'use client';

import { useState } from 'react';

interface Paper {
  arxiv_id: string;
  title: string;
  abstract: string | null;
  // legacy vs arxiv-coach field names
  published_date?: string | null;
  published_at?: string | null;
  llm_score: number | null;
  track: string | null;
}

const TRACK_COLORS: Record<string, string> = {
  'cs.AI': 'bg-blue-900/60 text-blue-200',
  'cs.LG': 'bg-purple-900/60 text-purple-200',
  'cs.CL': 'bg-green-900/60 text-green-200',
  'cs.CV': 'bg-orange-900/60 text-orange-200',
  'stat.ML': 'bg-pink-900/60 text-pink-200',
  default: 'bg-gray-800 text-gray-300',
};

const FEEDBACK_ACTIONS = [
  { action: 'love', icon: '❤️', label: 'Love' },
  { action: 'save', icon: '📌', label: 'Save' },
  { action: 'read', icon: '📖', label: 'Read' },
  { action: 'meh', icon: '😐', label: 'Meh' },
  { action: 'skip', icon: '⏭️', label: 'Skip' },
];

const EXPLANATION_LEVELS = [
  { key: 'tldr', label: 'TL;DR' },
  { key: 'medium', label: 'Medium' },
  { key: 'deep', label: 'Deep' },
  { key: 'eli14', label: 'ELI14 🧒' },
  { key: 'undergrad', label: 'Undergrad 🎓' },
  { key: 'engineer', label: 'ML Engineer ⚙️' },
];

export default function PaperCard({ paper }: { paper: Paper }) {
  const [expanded, setExpanded] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loadingLevel, setLoadingLevel] = useState<string | null>(null);
  const [activeLevel, setActiveLevel] = useState<string | null>(null);
  const [feedbackGiven, setFeedbackGiven] = useState<string | null>(null);

  const trackColor = TRACK_COLORS[paper.track || ''] || TRACK_COLORS.default;
  const score = paper.llm_score ?? 0;
  const stars = '★'.repeat(Math.round(score)) + '☆'.repeat(5 - Math.round(score));
  const abstractSnippet = paper.abstract
    ? paper.abstract.length > 200
      ? paper.abstract.slice(0, 200) + '…'
      : paper.abstract
    : 'No abstract available.';

  async function loadExplanation(level: string) {
    if (activeLevel === level) {
      setExpanded(false);
      setActiveLevel(null);
      return;
    }
    setLoadingLevel(level);
    setActiveLevel(level);
    setExpanded(true);
    try {
      const res = await fetch(`/api/paper/${encodeURIComponent(paper.arxiv_id)}/explain?level=${level}`);
      const data = await res.json();
      setExplanation(data.content);
    } catch {
      setExplanation('Failed to load explanation.');
    }
    setLoadingLevel(null);
  }

  async function sendFeedback(action: string) {
    setFeedbackGiven(action);
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arxivId: paper.arxiv_id, action }),
      });
    } catch {
      // Silently fail — optimistic UI
    }
  }

  return (
    <article className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4 transition-all duration-200">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold leading-snug flex-1">
            <a
              href={`/paper/${paper.arxiv_id}`}
              className="text-gray-100 hover:text-blue-300 transition-colors no-underline"
            >
              {paper.title}
            </a>
          </h3>
          <span className="text-yellow-400 text-sm whitespace-nowrap font-mono">{stars}</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {paper.track && (
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${trackColor}`}>
              {paper.track}
            </span>
          )}
          {(paper.published_date ?? paper.published_at) && (
            <span className="text-xs text-gray-500">{paper.published_date ?? paper.published_at}</span>
          )}
          <a
            href={`https://arxiv.org/abs/${paper.arxiv_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            arxiv →
          </a>
        </div>
      </div>

      {/* Abstract snippet */}
      <p className="text-sm text-gray-400 leading-relaxed">{abstractSnippet}</p>

      {/* Explanation levels */}
      <div className="flex gap-2">
        {EXPLANATION_LEVELS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => loadExplanation(key)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-all duration-200 ${
              activeLevel === key
                ? 'bg-blue-900/40 border-blue-700 text-blue-200'
                : 'border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
            }`}
          >
            {loadingLevel === key ? '…' : label}
          </button>
        ))}
      </div>

      {/* Expanded explanation */}
      {expanded && explanation && (
        <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 text-sm text-gray-300 leading-relaxed whitespace-pre-wrap transition-all duration-200">
          {explanation}
        </div>
      )}

      {/* Feedback buttons */}
      <div className="flex gap-1 pt-1">
        {FEEDBACK_ACTIONS.map(({ action, icon, label }) => (
          <button
            key={action}
            onClick={() => sendFeedback(action)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all duration-200 ${
              feedbackGiven === action
                ? 'bg-gray-800 text-gray-200'
                : 'text-gray-500 hover:bg-gray-800/50 hover:text-gray-300'
            }`}
          >
            <span>{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>
    </article>
  );
}
