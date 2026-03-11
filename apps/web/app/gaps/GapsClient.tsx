'use client';

import { useState } from 'react';
import Link from 'next/link';

interface SuggestedPaper {
  arxiv_id: string;
  title: string;
  abstract: string | null;
  published_at: string | null;
}

interface Gap {
  topic: string;
  why: string;
  suggestedPapers: SuggestedPaper[];
}

interface GapsResponse {
  gaps: Gap[];
  message?: string;
  meta?: {
    tracksAnalyzed: number;
    recentPapersAnalyzed: number;
    generatedAt: string;
  };
}

export default function GapsClient() {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [data, setData] = useState<GapsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyze = async () => {
    setState('loading');
    setError(null);
    try {
      const res = await fetch('/api/gaps');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const body: GapsResponse = await res.json();
      setData(body);
      setState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setState('error');
    }
  };

  return (
    <div className="space-y-8">
      {/* Trigger */}
      {state === 'idle' && (
        <div className="bg-gray-900 rounded-xl p-8 text-center">
          <div className="text-5xl mb-4">🔍</div>
          <p className="text-gray-300 mb-2 text-lg">
            Scan your recent reading to find topic gaps
          </p>
          <p className="text-gray-500 text-sm mb-6">
            Uses your tracks and digest history to spot important areas you&apos;re not covering.
            Takes about 10 seconds.
          </p>
          <button
            onClick={analyze}
            className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors"
          >
            Analyze My Gaps
          </button>
        </div>
      )}

      {/* Loading */}
      {state === 'loading' && (
        <div className="bg-gray-900 rounded-xl p-8 text-center">
          <div className="flex items-center justify-center gap-3 text-gray-400">
            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>Analyzing your reading coverage&hellip;</span>
          </div>
          <p className="text-gray-600 text-sm mt-3">This may take 10–15 seconds</p>
        </div>
      )}

      {/* Error */}
      {state === 'error' && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-6 text-center">
          <p className="text-red-300 mb-4">{error}</p>
          <button
            onClick={() => setState('idle')}
            className="text-sm text-red-400 hover:text-red-300 underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Results */}
      {state === 'done' && data && (
        <>
          {/* Empty state */}
          {data.message && data.gaps.length === 0 && (
            <div className="bg-gray-900 rounded-xl p-8 text-center">
              <div className="text-4xl mb-3">📭</div>
              <p className="text-gray-300">{data.message}</p>
              <p className="text-gray-500 text-sm mt-2">
                Add tracks and check back after a few digests.
              </p>
              <Link href="/tracks" className="inline-block mt-4 text-indigo-400 hover:underline text-sm">
                Manage tracks →
              </Link>
            </div>
          )}

          {/* Meta bar */}
          {data.meta && data.gaps.length > 0 && (
            <div className="flex items-center justify-between text-xs text-gray-600 border-b border-gray-800 pb-3">
              <span>
                Analyzed {data.meta.recentPapersAnalyzed} recent papers across {data.meta.tracksAnalyzed} track{data.meta.tracksAnalyzed !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => setState('idle')}
                className="text-gray-500 hover:text-gray-400 underline"
              >
                Re-analyze
              </button>
            </div>
          )}

          {/* Gap cards */}
          {data.gaps.map((gap, i) => (
            <GapCard key={i} gap={gap} index={i} />
          ))}
        </>
      )}
    </div>
  );
}

function GapCard({ gap, index }: { gap: Gap; index: number }) {
  const [expanded, setExpanded] = useState(false);

  const colors = [
    { badge: 'bg-violet-900 text-violet-300 border border-violet-700', dot: 'bg-violet-400' },
    { badge: 'bg-cyan-900 text-cyan-300 border border-cyan-700', dot: 'bg-cyan-400' },
    { badge: 'bg-amber-900 text-amber-300 border border-amber-700', dot: 'bg-amber-400' },
  ];
  const color = colors[index % colors.length];

  return (
    <div className="bg-gray-900 rounded-xl overflow-hidden">
      {/* Gap header */}
      <div className="p-6">
        <div className="flex items-start gap-4">
          <div className={`mt-0.5 h-2.5 w-2.5 rounded-full flex-shrink-0 ${color.dot}`} />
          <div className="flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mb-2 ${color.badge}`}>
                  Gap #{index + 1}
                </span>
                <h3 className="text-lg font-semibold text-white">{gap.topic}</h3>
              </div>
            </div>
            <p className="text-gray-400 text-sm mt-1 leading-relaxed">{gap.why}</p>
          </div>
        </div>
      </div>

      {/* Suggested papers */}
      {gap.suggestedPapers.length > 0 && (
        <div className="border-t border-gray-800 px-6 py-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-3 font-medium">
            Papers to fill this gap
          </p>
          <div className="space-y-3">
            {gap.suggestedPapers.map((paper) => (
              <PaperSuggestion
                key={paper.arxiv_id}
                paper={paper}
                expanded={expanded}
                onToggleExpand={() => setExpanded(!expanded)}
              />
            ))}
          </div>
        </div>
      )}

      {gap.suggestedPapers.length === 0 && (
        <div className="border-t border-gray-800 px-6 py-4">
          <p className="text-xs text-gray-500 italic">
            No matching papers in your digest database yet — this gap may appear in future digests.
          </p>
        </div>
      )}
    </div>
  );
}

function PaperSuggestion({
  paper,
  expanded,
  onToggleExpand,
}: {
  paper: SuggestedPaper;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const year = paper.published_at ? new Date(paper.published_at).getFullYear() : null;

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-100 leading-snug">{paper.title}</p>
          <div className="flex items-center gap-3 mt-1">
            {year && <span className="text-xs text-gray-500">{year}</span>}
            <a
              href={`https://arxiv.org/abs/${paper.arxiv_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-indigo-400 hover:underline"
            >
              arxiv.org ↗
            </a>
          </div>
          {paper.abstract && expanded && (
            <p className="text-xs text-gray-400 mt-2 leading-relaxed line-clamp-4">
              {paper.abstract}
            </p>
          )}
        </div>
      </div>
      {paper.abstract && (
        <button
          onClick={onToggleExpand}
          className="mt-2 text-xs text-gray-600 hover:text-gray-400"
        >
          {expanded ? 'Hide abstract' : 'Show abstract'}
        </button>
      )}
    </div>
  );
}
