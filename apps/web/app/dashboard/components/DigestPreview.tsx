'use client';

/**
 * DigestPreview — "What would I get this week?" panel
 *
 * Calls GET /api/digest/preview and renders the scored entries.
 * Read-only: no email is sent, no DB writes happen.
 */

import { useState, useCallback } from 'react';
import type { Digest, DigestEntry } from '@paperbrief/core';

interface PreviewResponse {
  digest: Digest | null;
  tracksQueried: number;
  papersScanned: number;
  durationMs: number;
  message?: string;
}

function ScoreLabel({ label }: { label: string }) {
  const colour =
    label.startsWith('🔥') ? 'text-red-400' :
    label.startsWith('⭐') ? 'text-yellow-400' :
    label.startsWith('📌') ? 'text-blue-400' :
                              'text-gray-500';

  return <span className={`text-xs font-semibold ${colour}`}>{label}</span>;
}

function EntryCard({ entry }: { entry: DigestEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-800 rounded-lg p-4 space-y-2 hover:border-gray-700 transition-colors">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <a
            href={entry.absUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-white hover:text-indigo-300 transition-colors line-clamp-2"
          >
            {entry.title}
          </a>
          <p className="text-xs text-gray-500 mt-0.5">{entry.authors}</p>
        </div>
        <div className="flex-shrink-0 ml-2">
          <ScoreLabel label={entry.scoreLabel} />
        </div>
      </div>

      <p className="text-xs text-gray-400 line-clamp-3">{entry.summary}</p>

      <button
        onClick={() => setExpanded((p) => !p)}
        className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
      >
        {expanded ? '▲ hide reason' : '▼ why this paper?'}
      </button>

      {expanded && (
        <p className="text-xs text-gray-500 italic border-l-2 border-gray-700 pl-2">
          {entry.reason}
        </p>
      )}

      <div className="flex items-center gap-2">
        <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
          {entry.trackName}
        </span>
        <a
          href={entry.absUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-indigo-500 hover:text-indigo-300"
        >
          arxiv →
        </a>
      </div>
    </div>
  );
}

export default function DigestPreview() {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<PreviewResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [trackFilter, setTrackFilter] = useState('');

  const run = useCallback(async () => {
    setState('loading');
    setResult(null);
    setErrorMsg('');

    const params = new URLSearchParams();
    if (trackFilter.trim()) params.set('track', trackFilter.trim());

    try {
      const res = await fetch(`/api/digest/preview?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as PreviewResponse;
      setResult(data);
      setState('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
      setState('error');
    }
  }, [trackFilter]);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Preview This Week&apos;s Digest</h2>
          <p className="text-sm text-gray-500">
            Dry-run: scores papers against your tracks. No email sent.
          </p>
        </div>
      </div>

      <div className="flex gap-3 items-center">
        <input
          type="text"
          placeholder="Filter by track name (optional)"
          value={trackFilter}
          onChange={(e) => setTrackFilter(e.target.value)}
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={run}
          disabled={state === 'loading'}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-white transition-colors"
        >
          {state === 'loading' ? (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Scoring…
            </span>
          ) : (
            'Run Preview'
          )}
        </button>
      </div>

      {state === 'error' && (
        <div className="rounded-lg bg-red-950 border border-red-800 p-3 text-sm text-red-300">
          {errorMsg}
        </div>
      )}

      {state === 'done' && result && (
        <div className="space-y-4">
          {/* Meta bar */}
          <div className="flex flex-wrap gap-4 text-xs text-gray-500">
            <span>📡 {result.papersScanned} papers scanned</span>
            <span>🎯 {result.tracksQueried} track{result.tracksQueried !== 1 ? 's' : ''}</span>
            {result.digest && (
              <span>📄 {result.digest.entries.length} selected</span>
            )}
            <span>⏱ {(result.durationMs / 1000).toFixed(1)}s</span>
          </div>

          {result.message && !result.digest && (
            <div className="rounded-lg bg-gray-900 border border-gray-800 p-4 text-sm text-gray-400">
              {result.message}
            </div>
          )}

          {result.digest?.entries.length === 0 && (
            <div className="rounded-lg bg-gray-900 border border-gray-800 p-4 text-sm text-gray-400">
              No papers matched your tracks this week. Try adding more keywords or lowering your
              minimum relevance score.
            </div>
          )}

          {result.digest && result.digest.entries.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-gray-600">
                Week of {result.digest.weekOf} ·{' '}
                {result.digest.tracksIncluded.join(', ')}
              </p>
              {result.digest.entries.map((entry) => (
                <EntryCard key={entry.arxivId} entry={entry} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
