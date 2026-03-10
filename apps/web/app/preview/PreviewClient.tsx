'use client';

import { useState } from 'react';
import Link from 'next/link';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface DigestEntry {
  arxivId: string;
  title: string;
  authors: string;
  score: number;
  scoreLabel: string;
  summary: string;
  reason: string;
  absUrl: string;
  trackName: string;
}

interface Digest {
  userId: string;
  weekOf: string;
  entries: DigestEntry[];
  tracksIncluded: string[];
  totalPapersScanned: number;
  totalPapersIncluded: number;
  generatedAt: string;
}

interface PreviewResponse {
  digest: Digest | null;
  tracksQueried: number;
  papersScanned: number;
  durationMs: number;
  message?: string;
}

type PageState = 'idle' | 'loading' | 'done' | 'error';

// ─── Score Badge ───────────────────────────────────────────────────────────────

const SCORE_STYLES: Record<number, string> = {
  5: 'bg-red-900/60 text-red-300 border border-red-800',
  4: 'bg-orange-900/60 text-orange-300 border border-orange-800',
  3: 'bg-yellow-900/60 text-yellow-300 border border-yellow-800',
  2: 'bg-gray-800 text-gray-400 border border-gray-700',
  1: 'bg-gray-900 text-gray-500 border border-gray-800',
};

function ScoreBadge({ score, label }: { score: number; label: string }) {
  const style = SCORE_STYLES[score] ?? SCORE_STYLES[1];
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${style}`}>
      {label}
    </span>
  );
}

// ─── Entry Card ────────────────────────────────────────────────────────────────

function EntryCard({ entry }: { entry: DigestEntry }) {
  const [expanded, setExpanded] = useState(false);
  const year = entry.absUrl?.match(/\/(\d{4})\./)?.[1] ?? null;

  return (
    <div className="bg-gray-900 rounded-xl p-5 space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <ScoreBadge score={entry.score} label={entry.scoreLabel} />
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full border border-gray-700">
              {entry.trackName}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-gray-100 leading-snug">{entry.title}</h3>
          <div className="flex items-center gap-3 mt-1">
            {entry.authors && (
              <span className="text-xs text-gray-500 truncate max-w-xs">{entry.authors}</span>
            )}
            {year && <span className="text-xs text-gray-600">{year}</span>}
            <a
              href={entry.absUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex-shrink-0"
            >
              arxiv.org ↗
            </a>
          </div>
        </div>
      </div>

      {/* Summary */}
      {entry.summary && (
        <p className="text-sm text-gray-300 leading-relaxed">{entry.summary}</p>
      )}

      {/* Reason (collapsible) */}
      {entry.reason && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            {expanded ? 'Hide relevance reason' : 'Why this paper?'}
          </button>
          {expanded && (
            <p className="text-xs text-gray-500 mt-2 leading-relaxed pl-3 border-l border-gray-700">
              {entry.reason}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Track Section ─────────────────────────────────────────────────────────────

const TRACK_COLORS = [
  'bg-violet-900/30 text-violet-300 border border-violet-800',
  'bg-cyan-900/30 text-cyan-300 border border-cyan-800',
  'bg-amber-900/30 text-amber-300 border border-amber-800',
  'bg-emerald-900/30 text-emerald-300 border border-emerald-800',
  'bg-rose-900/30 text-rose-300 border border-rose-800',
  'bg-blue-900/30 text-blue-300 border border-blue-800',
];

function TrackSection({
  name,
  entries,
  colorIndex,
}: {
  name: string;
  entries: DigestEntry[];
  colorIndex: number;
}) {
  const style = TRACK_COLORS[colorIndex % TRACK_COLORS.length];
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${style}`}>
          {name}
        </span>
        <span className="text-xs text-gray-600">
          {entries.length} paper{entries.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="space-y-3">
        {entries.map((entry) => (
          <EntryCard key={entry.arxivId} entry={entry} />
        ))}
      </div>
    </section>
  );
}

// ─── Stats Bar ─────────────────────────────────────────────────────────────────

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <div className="text-lg font-bold text-gray-100">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

// ─── Main Client ───────────────────────────────────────────────────────────────

export default function PreviewClient() {
  const [state, setState] = useState<PageState>('idle');
  const [data, setData] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trackFilter, setTrackFilter] = useState('');

  const generate = async () => {
    setState('loading');
    setError(null);
    try {
      const url = new URL('/api/digest/preview', window.location.origin);
      url.searchParams.set('maxEntries', '20');
      if (trackFilter.trim()) {
        url.searchParams.set('track', trackFilter.trim());
      }

      const res = await fetch(url.toString());
      if (res.status === 401) {
        throw new Error('Not signed in — please log in first.');
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
      }
      const body: PreviewResponse = await res.json();
      setData(body);
      setState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setState('error');
    }
  };

  const reset = () => {
    setState('idle');
    setData(null);
    setError(null);
  };

  // ── Idle ──────────────────────────────────────────────────────────────────────
  if (state === 'idle') {
    return (
      <div className="space-y-6">
        <div className="bg-gray-900 rounded-xl p-8 text-center space-y-4">
          <div className="text-5xl">📬</div>
          <div className="space-y-2">
            <p className="text-gray-200 text-lg font-medium">
              Preview your next digest
            </p>
            <p className="text-gray-500 text-sm max-w-md mx-auto">
              Runs the full digest pipeline on today&apos;s arXiv papers — scoring, ranking, and summarising — without sending you an email. Takes 30–60 seconds.
            </p>
          </div>

          {/* Optional track filter */}
          <div className="flex items-center justify-center gap-3 mt-2">
            <input
              type="text"
              value={trackFilter}
              onChange={(e) => setTrackFilter(e.target.value)}
              placeholder="Filter by track (optional)"
              className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-indigo-600 focus:outline-none w-64"
            />
          </div>

          <button
            onClick={generate}
            className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors"
          >
            Generate Preview
          </button>

          <p className="text-xs text-gray-600">
            No email will be sent. Results are not saved.
          </p>
        </div>

        <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-800 space-y-3">
          <h3 className="text-sm font-medium text-gray-400">How it works</h3>
          <ol className="text-sm text-gray-500 space-y-1.5 list-decimal list-inside">
            <li>Fetches papers published on arXiv in the last 7 days</li>
            <li>Pre-filters using your track keywords</li>
            <li>Scores each paper with an LLM (0–5 relevance)</li>
            <li>Returns top papers ranked by score, grouped by track</li>
          </ol>
          <Link href="/dashboard" className="inline-block text-xs text-indigo-400 hover:underline mt-1">
            Manage tracks in dashboard →
          </Link>
        </div>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (state === 'loading') {
    return (
      <div className="bg-gray-900 rounded-xl p-12 text-center space-y-4">
        <div className="flex items-center justify-center gap-3 text-gray-400">
          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span className="text-gray-200 font-medium">Scanning arXiv and scoring papers…</span>
        </div>
        <p className="text-gray-600 text-sm">This takes 30–60 seconds. Hang tight.</p>
        <div className="flex justify-center gap-6 text-xs text-gray-700 mt-2">
          <span>① Fetching papers</span>
          <span>② Pre-filtering</span>
          <span>③ LLM scoring</span>
          <span>④ Building digest</span>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────────
  if (state === 'error') {
    return (
      <div className="bg-red-950 border border-red-800 rounded-xl p-8 text-center space-y-4">
        <div className="text-4xl">⚠️</div>
        <p className="text-red-300">{error}</p>
        {error?.includes('Not signed in') && (
          <Link href="/auth/login" className="text-sm text-indigo-400 hover:underline">
            Sign in →
          </Link>
        )}
        <button
          onClick={reset}
          className="text-sm text-red-400 hover:text-red-300 underline block mx-auto"
        >
          Try again
        </button>
      </div>
    );
  }

  // ── Done ──────────────────────────────────────────────────────────────────────
  if (state === 'done' && data) {
    const digest = data.digest;

    // Message-only state (no tracks or no matching papers)
    if (!digest || digest.entries.length === 0) {
      return (
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-xl p-10 text-center space-y-3">
            <div className="text-4xl">📭</div>
            <p className="text-gray-300">{data.message ?? 'No papers found for your tracks.'}</p>
            <div className="flex justify-center gap-4 text-sm mt-2">
              <Link href="/dashboard" className="text-indigo-400 hover:underline">
                Add tracks →
              </Link>
              <button onClick={reset} className="text-gray-500 hover:text-gray-300 underline">
                Try again
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Group entries by track
    const byTrack: Record<string, DigestEntry[]> = {};
    for (const entry of digest.entries) {
      if (!byTrack[entry.trackName]) byTrack[entry.trackName] = [];
      byTrack[entry.trackName].push(entry);
    }
    const trackNames = Object.keys(byTrack).sort();

    const durationSec = (data.durationMs / 1000).toFixed(1);

    return (
      <div className="space-y-8">
        {/* Stats bar */}
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <div className="grid grid-cols-4 gap-4 divide-x divide-gray-800">
            <StatItem label="Papers scanned" value={data.papersScanned} />
            <StatItem label="In digest" value={digest.totalPapersIncluded} />
            <StatItem label="Tracks" value={data.tracksQueried} />
            <StatItem label="Generated in" value={`${durationSec}s`} />
          </div>
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-800 text-xs text-gray-600">
            <span>Week of {digest.weekOf} · generated {new Date(digest.generatedAt).toLocaleTimeString()}</span>
            <button onClick={reset} className="text-gray-500 hover:text-gray-300 underline">
              Regenerate
            </button>
          </div>
        </div>

        {/* Score legend */}
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <span className="text-gray-600 font-medium">Score:</span>
          {[
            { score: 5, label: '🔥 Essential' },
            { score: 4, label: '⭐ Highly Relevant' },
            { score: 3, label: '📌 Relevant' },
            { score: 2, label: '📄 Low Relevance' },
          ].map(({ score, label }) => (
            <ScoreBadge key={score} score={score} label={label} />
          ))}
        </div>

        {/* Entries by track */}
        {trackNames.map((name, i) => (
          <TrackSection key={name} name={name} entries={byTrack[name]} colorIndex={i} />
        ))}

        {/* Footer */}
        <div className="text-center py-4 border-t border-gray-800 text-xs text-gray-600 space-y-1">
          <p>This was a preview — no email was sent and nothing was saved.</p>
          <p>
            Your weekly digest is delivered automatically. Check{' '}
            <Link href="/digest" className="text-indigo-400 hover:underline">
              digest history
            </Link>{' '}
            or{' '}
            <Link href="/dashboard" className="text-indigo-400 hover:underline">
              manage tracks
            </Link>.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
