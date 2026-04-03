'use client';

/**
 * TrendingTodayClient — interactive UI for /trending/today
 *
 * Features:
 * - Top 5 papers with score bars (visual 1-10 scale)
 * - Abstract expand/collapse per paper
 * - Twitter share button (pre-filled with good tweet text)
 * - "Get personalised digest" CTA
 * - Relative timestamp ("Updated X minutes ago")
 */

import { useState } from 'react';
import Link from 'next/link';
import type { TodayPaper } from './page';

// ── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, (score / 10) * 100));
  const color =
    score >= 8 ? '#f97316' : // orange-500 (🔥 hot)
    score >= 6 ? '#3b82f6' : // blue-500
    '#6b7280';               // gray-500

  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-mono tabular-nums" style={{ color, minWidth: '2.5rem', textAlign: 'right' }}>
        {score.toFixed(1)}
      </span>
    </div>
  );
}

// ── Score badge ───────────────────────────────────────────────────────────────

function scoreBadge(score: number): { emoji: string; label: string; color: string } {
  if (score >= 9)   return { emoji: '🔥', label: 'Must Read',  color: '#f97316' };
  if (score >= 7.5) return { emoji: '⭐', label: 'Top Pick',   color: '#eab308' };
  if (score >= 6)   return { emoji: '✨', label: 'Recommended', color: '#3b82f6' };
  return              { emoji: '📄', label: 'Notable',         color: '#6b7280' };
}

// ── Relative time ─────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 2)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Tweet text ────────────────────────────────────────────────────────────────

function buildTweetText(papers: TodayPaper[]): string {
  if (papers.length === 0) return "Today's top ML papers on PaperBrief";

  const top = papers[0]!;
  const truncTitle = top.title.length > 60 ? top.title.slice(0, 57) + '…' : top.title;
  const lines = [
    `🔥 Today's top ML papers on arXiv:`,
    ``,
    `1. ${truncTitle} (${top.avg_score.toFixed(1)}/10)`,
  ];
  for (let i = 1; i < Math.min(papers.length, 3); i++) {
    const p = papers[i]!;
    const t = p.title.length > 55 ? p.title.slice(0, 52) + '…' : p.title;
    lines.push(`${i + 1}. ${t}`);
  }
  lines.push(``, `Full list + daily digest → paperbrief.ai/trending/today`);
  return lines.join('\n');
}

// ── Paper card ────────────────────────────────────────────────────────────────

function PaperCard({ paper, rank }: { paper: TodayPaper; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const badge = scoreBadge(paper.avg_score);
  const firstAuthor = paper.authors[0] ?? 'Unknown';
  const moreAuthors = paper.authors.length > 1 ? ` +${paper.authors.length - 1}` : '';
  const shortAbstract = paper.abstract
    ? paper.abstract.slice(0, 200) + (paper.abstract.length > 200 ? '…' : '')
    : null;

  return (
    <div className="border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
      {/* ── Rank + badge row ── */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl font-bold text-gray-700 w-7">{rank}</span>
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full"
          style={{
            color: badge.color,
            backgroundColor: badge.color + '18',
            border: `1px solid ${badge.color}30`,
          }}
        >
          {badge.emoji} {badge.label}
        </span>
        {paper.appearances > 1 && (
          <span className="text-xs text-gray-600">
            · {paper.appearances} digests
          </span>
        )}
      </div>

      {/* ── Title ── */}
      <a
        href={`https://arxiv.org/abs/${paper.arxiv_id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-gray-100 font-semibold leading-snug hover:text-blue-400 transition-colors mb-2"
      >
        {paper.title}
      </a>

      {/* ── Author + score bar ── */}
      <p className="text-xs text-gray-500 mb-2">
        {firstAuthor}{moreAuthors}
        {paper.published_at && (
          <> · {paper.published_at.slice(0, 10)}</>
        )}
      </p>

      <ScoreBar score={paper.avg_score} />

      {/* ── Abstract expand/collapse ── */}
      {paper.abstract && (
        <div className="mt-3">
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            {expanded ? '▲ Hide abstract' : '▼ Show abstract'}
          </button>
          {expanded && (
            <p className="mt-2 text-sm text-gray-400 leading-relaxed">
              {paper.abstract}
            </p>
          )}
          {!expanded && shortAbstract && (
            <p className="mt-1 text-xs text-gray-600 leading-relaxed">
              {shortAbstract}
            </p>
          )}
        </div>
      )}

      {/* ── Links ── */}
      <div className="flex gap-3 mt-3">
        <a
          href={`https://arxiv.org/abs/${paper.arxiv_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-600 hover:text-blue-400 transition-colors"
        >
          arXiv →
        </a>
        <a
          href={`https://arxiv.org/pdf/${paper.arxiv_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-600 hover:text-blue-400 transition-colors"
        >
          PDF →
        </a>
        <a
          href={`/paper/${paper.arxiv_id}`}
          className="text-xs text-gray-600 hover:text-blue-400 transition-colors"
        >
          PaperBrief →
        </a>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TrendingTodayClient({
  papers,
  generatedAt,
}: {
  papers: TodayPaper[];
  generatedAt: string;
}) {
  const siteUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://paperbrief.ai';

  const tweetText = buildTweetText(papers);
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(`${siteUrl}/trending/today`)}`;

  return (
    <>
      {/* ── Header ── */}
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">⚡</span>
              <h1 className="text-2xl font-bold text-gray-100">Top 5 Today</h1>
            </div>
            <p className="text-gray-500 text-sm">
              The highest-scoring arXiv ML papers from the last 24 hours,
              ranked by LLM relevance across PaperBrief researcher digests.
            </p>
            <p className="text-gray-600 text-xs mt-1">
              Updated {relativeTime(generatedAt)} · refreshes hourly
            </p>
          </div>

          {/* Share button */}
          <a
            href={tweetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Share
          </a>
        </div>
      </header>

      {/* ── Papers ── */}
      {papers.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">🔍</div>
          <p className="text-gray-400 font-medium">No papers scored yet today</p>
          <p className="text-gray-600 text-sm mt-2">
            Check back later — digests run through the morning.
          </p>
          <Link
            href="/trending"
            className="inline-block mt-6 text-blue-400 hover:text-blue-300 text-sm transition-colors"
          >
            ← See this week's trending papers
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {papers.map((paper, i) => (
            <PaperCard key={paper.arxiv_id} paper={paper} rank={i + 1} />
          ))}
        </div>
      )}

      {/* ── CTA ── */}
      {papers.length > 0 && (
        <div className="mt-10 p-6 bg-gray-900 border border-gray-800 rounded-xl text-center">
          <p className="text-gray-300 font-medium mb-1">
            Want papers like these in your inbox?
          </p>
          <p className="text-gray-500 text-sm mb-4">
            PaperBrief sends you a personalised daily digest of the arXiv papers
            that actually matter for your research track.
          </p>
          <Link
            href="/"
            className="inline-block bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm px-6 py-2.5 rounded-lg transition-colors"
          >
            Get your personalised digest →
          </Link>
        </div>
      )}

      {/* ── Nav to /trending ── */}
      <div className="mt-6 text-center">
        <Link
          href="/trending"
          className="text-sm text-gray-600 hover:text-gray-400 transition-colors"
        >
          ← See all trending papers this week
        </Link>
      </div>
    </>
  );
}
