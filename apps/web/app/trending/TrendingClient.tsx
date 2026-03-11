'use client';

import { useState } from 'react';
import type { TrendingPaper } from '../api/trending/route';

// ── Helpers ──────────────────────────────────────────────────────────────────

const TRACK_COLORS: Record<string, string> = {
  'cs.AI': 'bg-blue-900/60 text-blue-200 border-blue-800',
  'cs.LG': 'bg-purple-900/60 text-purple-200 border-purple-800',
  'cs.CL': 'bg-green-900/60 text-green-200 border-green-800',
  'cs.CV': 'bg-orange-900/60 text-orange-200 border-orange-800',
  'stat.ML': 'bg-pink-900/60 text-pink-200 border-pink-800',
  'cs.RO': 'bg-yellow-900/60 text-yellow-200 border-yellow-800',
  'cs.NE': 'bg-cyan-900/60 text-cyan-200 border-cyan-800',
  default: 'bg-gray-800 text-gray-300 border-gray-700',
};

function trackColor(cat: string): string {
  return TRACK_COLORS[cat] ?? TRACK_COLORS.default;
}

function scoreBar(avg: number): string {
  const filled = Math.round(avg);
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

function scoreColor(avg: number): string {
  if (avg >= 4.5) return 'text-yellow-400';
  if (avg >= 3.5) return 'text-yellow-500';
  if (avg >= 2.5) return 'text-amber-500';
  return 'text-gray-500';
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function arxivUrl(arxiv_id: string): string {
  return `https://arxiv.org/abs/${arxiv_id}`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.lastIndexOf(' ', maxLen);
  return text.slice(0, cut > 0 ? cut : maxLen) + '…';
}

// ── Share button ──────────────────────────────────────────────────────────────

function ShareButton({ paper }: { paper: TrendingPaper }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const shareUrl = arxivUrl(paper.arxiv_id);
    const text = `📄 "${paper.title}" — trending on PaperBrief this week`;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: paper.title, text, url: shareUrl });
        return;
      } catch {
        // fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(`${text}\n${shareUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silently fail
    }
  }

  return (
    <button
      onClick={share}
      className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
      title="Share this paper"
    >
      {copied ? (
        <>✓ <span>Copied!</span></>
      ) : (
        <>↗ <span>Share</span></>
      )}
    </button>
  );
}

// ── Paper card ────────────────────────────────────────────────────────────────

function TrendingCard({ paper, rank }: { paper: TrendingPaper; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const abstract = paper.abstract ?? 'No abstract available.';
  const hasLongAbstract = abstract.length > 220;

  return (
    <article className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
      {/* ── Header row ── */}
      <div className="flex items-start gap-3">
        {/* Rank badge */}
        <span className="mt-0.5 flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-gray-800 text-xs font-bold text-gray-400">
          {rank}
        </span>

        <div className="flex-1 min-w-0">
          {/* Title */}
          <a
            href={arxivUrl(paper.arxiv_id)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-100 font-semibold leading-snug hover:text-blue-400 transition-colors block"
          >
            {paper.title}
          </a>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-gray-500">
            {/* Score */}
            <span className={`font-mono text-sm ${scoreColor(paper.avg_score)}`} title={`Average score: ${paper.avg_score.toFixed(1)} / 5`}>
              {scoreBar(paper.avg_score)}
            </span>
            <span title={`Appeared in ${paper.appearances} digest${paper.appearances === 1 ? '' : 's'} this week`}>
              📊 {paper.appearances} {paper.appearances === 1 ? 'digest' : 'digests'}
            </span>
            {paper.published_at && (
              <span>📅 {formatDate(paper.published_at)}</span>
            )}
          </div>

          {/* Category badges */}
          {paper.categories.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {paper.categories.slice(0, 4).map((cat) => (
                <span
                  key={cat}
                  className={`px-2 py-0.5 rounded-full text-xs border ${trackColor(cat)}`}
                >
                  {cat}
                </span>
              ))}
              {paper.categories.length > 4 && (
                <span className="px-2 py-0.5 rounded-full text-xs border bg-gray-800 text-gray-400 border-gray-700">
                  +{paper.categories.length - 4}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Abstract ── */}
      <div className="mt-3 text-sm text-gray-400 leading-relaxed">
        {hasLongAbstract && !expanded
          ? truncate(abstract, 220)
          : abstract}
        {hasLongAbstract && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="ml-2 text-blue-500 hover:text-blue-400 text-xs"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>

      {/* ── Footer actions ── */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-800">
        <a
          href={arxivUrl(paper.arxiv_id)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-500 hover:text-blue-400 transition-colors"
        >
          Read on arXiv →
        </a>
        <ShareButton paper={paper} />
        {paper.authors.length > 0 && (
          <span className="text-xs text-gray-600 truncate max-w-[200px]" title={paper.authors.join(', ')}>
            {paper.authors[0]}{paper.authors.length > 1 ? ` +${paper.authors.length - 1}` : ''}
          </span>
        )}
      </div>
    </article>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="text-center py-16 text-gray-500">
      <div className="text-5xl mb-4">📭</div>
      <p className="text-lg font-medium text-gray-400">No trending papers yet</p>
      <p className="text-sm mt-2">
        Check back once the first digests have been sent — they refresh weekly.
      </p>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function TrendingClient({
  papers,
  generatedAt,
  days,
}: {
  papers: TrendingPaper[];
  generatedAt: string;
  days: number;
}) {
  const updateTime = new Date(generatedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  return (
    <div>
      {/* Stats bar */}
      <div className="flex items-center justify-between mb-6 text-sm text-gray-500">
        <span>{papers.length} paper{papers.length !== 1 ? 's' : ''} · last {days} days</span>
        <span title="Updated every 6 hours">Updated {updateTime}</span>
      </div>

      {/* Paper list */}
      {papers.length === 0 ? (
        <EmptyState />
      ) : (
        <ol className="space-y-4">
          {papers.map((paper, i) => (
            <li key={paper.arxiv_id}>
              <TrendingCard paper={paper} rank={i + 1} />
            </li>
          ))}
        </ol>
      )}

      {/* Footer CTA */}
      {papers.length > 0 && (
        <div className="mt-10 text-center">
          <p className="text-gray-500 text-sm mb-4">
            Want papers like these tailored to your research interests?
          </p>
          <a
            href="/"
            className="inline-block bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
          >
            Get your personalised digest →
          </a>
        </div>
      )}
    </div>
  );
}
