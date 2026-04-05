'use client';

/**
 * DemoDigestClient — interactive digest view for /demo
 *
 * Lightweight client component: no auth, no feedback, no API calls.
 * Shows papers with score bars, abstract toggle, and external links.
 */

import { useState } from 'react';
import type { DemoTrack, DemoPaper } from './page';

// ── Score bar ─────────────────────────��───────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, (score / 5) * 100));
  const color =
    score >= 4.5 ? '#f97316' :
    score >= 3.5 ? '#3b82f6' :
    score >= 2.5 ? '#6b7280' :
    '#374151';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden max-w-[80px]">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-mono tabular-nums shrink-0" style={{ color }}>
        {score.toFixed(1)}/5
      </span>
    </div>
  );
}

// ── Score label ───────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  if (score >= 4.5) return <span className="text-[11px] font-medium text-orange-400">🔥 Must read</span>;
  if (score >= 3.5) return <span className="text-[11px] font-medium text-blue-400">⭐ Recommended</span>;
  if (score >= 2.5) return <span className="text-[11px] font-medium text-gray-400">📄 Notable</span>;
  return <span className="text-[11px] font-medium text-gray-600">· Marginal</span>;
}

// ── Paper card ────────────────────────────────────────────────────────────────

function DemoPaperCard({ paper }: { paper: DemoPaper }) {
  const [showAbstract, setShowAbstract] = useState(false);

  const firstAuthor = paper.authors[0] ?? 'Unknown';
  const moreAuthors = paper.authors.length > 1 ? ` +${paper.authors.length - 1}` : '';
  const shortAbstract = paper.abstract
    ? paper.abstract.length > 250
      ? paper.abstract.slice(0, 250) + '…'
      : paper.abstract
    : null;

  return (
    <div className="border border-gray-800 hover:border-gray-700 rounded-xl p-4 transition-colors">
      {/* Title */}
      <a
        href={`https://arxiv.org/abs/${paper.arxiv_id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-sm font-semibold text-gray-100 leading-snug hover:text-blue-400 transition-colors mb-2"
      >
        {paper.title}
      </a>

      {/* Author + date */}
      <p className="text-xs text-gray-600 mb-2">
        {firstAuthor}{moreAuthors}
        {paper.published_at && (
          <span> · {paper.published_at.slice(0, 10)}</span>
        )}
      </p>

      {/* Score row */}
      <div className="flex items-center gap-3 mb-3">
        <ScoreBar score={paper.score} />
        <ScoreBadge score={paper.score} />
      </div>

      {/* Abstract toggle */}
      {paper.abstract && (
        <div>
          <button
            onClick={() => setShowAbstract((v) => !v)}
            className="text-xs text-gray-700 hover:text-gray-500 transition-colors"
          >
            {showAbstract ? '▲ Hide abstract' : '▼ Show abstract'}
          </button>
          {showAbstract ? (
            <p className="mt-2 text-xs text-gray-400 leading-relaxed">
              {paper.abstract}
            </p>
          ) : shortAbstract ? (
            <p className="mt-1 text-xs text-gray-700 leading-relaxed">
              {shortAbstract}
            </p>
          ) : null}
        </div>
      )}

      {/* Links */}
      <div className="flex gap-3 mt-3">
        <a
          href={`https://arxiv.org/abs/${paper.arxiv_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-700 hover:text-blue-400 transition-colors"
        >
          arXiv →
        </a>
        <a
          href={`https://arxiv.org/pdf/${paper.arxiv_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-700 hover:text-blue-400 transition-colors"
        >
          PDF →
        </a>
      </div>
    </div>
  );
}

// ── Track section ─────────────────────────────────────────────────────────────

function TrackSection({ track }: { track: DemoTrack }) {
  const [collapsed, setCollapsed] = useState(false);
  const topScore = track.papers[0]?.score ?? 0;
  const isHot = topScore >= 4;

  return (
    <section className="mb-8">
      {/* Track header */}
      <div
        className="flex items-center justify-between cursor-pointer mb-3 group"
        onClick={() => setCollapsed((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-300 group-hover:text-gray-100 transition-colors">
            {isHot && <span className="mr-1">🔥</span>}
            {track.name}
          </h2>
          <span className="text-xs text-gray-600">{track.papers.length} papers</span>
        </div>
        <span className="text-gray-700 group-hover:text-gray-500 text-xs transition-colors">
          {collapsed ? '▼' : '▲'}
        </span>
      </div>

      {/* Papers */}
      {!collapsed && (
        <div className="space-y-3">
          {track.papers.map((paper) => (
            <DemoPaperCard key={paper.arxiv_id} paper={paper} />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function DemoDigestClient({ tracks }: { tracks: DemoTrack[] }) {
  return (
    <div>
      {tracks.map((track) => (
        <TrackSection key={track.name} track={track} />
      ))}
    </div>
  );
}
