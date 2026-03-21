'use client';

import { useState } from 'react';
import type { AuthorPagePaper } from '../../../lib/author-pages';
import {
  formatAuthorsShort,
  formatPublishedDate,
  scoreToStars,
  scoreToColor,
  truncateAbstract,
  authorNameToSlug,
} from '../../../lib/author-pages';

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  'cs.AI': 'bg-blue-900/60 text-blue-200 border-blue-800',
  'cs.LG': 'bg-purple-900/60 text-purple-200 border-purple-800',
  'cs.CL': 'bg-green-900/60 text-green-200 border-green-800',
  'cs.CV': 'bg-orange-900/60 text-orange-200 border-orange-800',
  'stat.ML': 'bg-pink-900/60 text-pink-200 border-pink-800',
  'cs.RO': 'bg-yellow-900/60 text-yellow-200 border-yellow-800',
  'cs.NE': 'bg-cyan-900/60 text-cyan-200 border-cyan-800',
  default: 'bg-gray-800 text-gray-300 border-gray-700',
};

function catColor(cat: string): string {
  return CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.default;
}

// ── Paper card ────────────────────────────────────────────────────────────────

function PaperCard({
  paper,
  rank,
  currentAuthorSlug,
}: {
  paper: AuthorPagePaper;
  rank: number;
  currentAuthorSlug: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const abstract = paper.abstract ?? 'No abstract available.';
  const hasLongAbstract = abstract.length > 250;

  return (
    <article className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
      {/* ── Header ── */}
      <div className="flex items-start gap-3">
        {/* Rank badge */}
        <span className="mt-0.5 flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-gray-800 text-xs font-bold text-gray-400">
          {rank}
        </span>

        <div className="flex-1 min-w-0">
          {/* Title → PaperBrief detail page */}
          <a
            href={`/paper/${encodeURIComponent(paper.arxiv_id)}`}
            className="text-gray-100 font-semibold leading-snug hover:text-blue-400 transition-colors block"
          >
            {paper.title}
          </a>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-gray-500">
            {paper.llm_score !== null && (
              <span
                className={`font-mono text-sm ${scoreToColor(paper.llm_score)}`}
                title={`Relevance score: ${paper.llm_score.toFixed(1)} / 5`}
              >
                {scoreToStars(paper.llm_score)}
              </span>
            )}
            {paper.published_at && (
              <span>📅 {formatPublishedDate(paper.published_at)}</span>
            )}
          </div>

          {/* Authors — link co-authors to their profiles */}
          {paper.authors.length > 0 && (
            <div className="flex flex-wrap gap-x-1 mt-2 text-xs text-gray-500">
              {paper.authors.slice(0, 6).map((author, i) => {
                const isCurrentAuthor =
                  authorNameToSlug(author) === currentAuthorSlug;
                return (
                  <span key={i}>
                    {isCurrentAuthor ? (
                      <span className="text-blue-400 font-medium">{author}</span>
                    ) : (
                      <a
                        href={`/author/${encodeURIComponent(authorNameToSlug(author))}`}
                        className="hover:text-gray-300 transition-colors"
                      >
                        {author}
                      </a>
                    )}
                    {i < Math.min(paper.authors.length, 6) - 1 && (
                      <span className="text-gray-700">, </span>
                    )}
                  </span>
                );
              })}
              {paper.authors.length > 6 && (
                <span className="text-gray-600">+{paper.authors.length - 6} more</span>
              )}
            </div>
          )}

          {/* Category badges */}
          {paper.categories.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {paper.categories.slice(0, 4).map((cat) => (
                <span
                  key={cat}
                  className={`px-2 py-0.5 rounded-full text-xs border ${catColor(cat)}`}
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
        {hasLongAbstract && !expanded ? truncateAbstract(abstract, 250) : abstract}
        {hasLongAbstract && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="ml-2 text-blue-500 hover:text-blue-400 text-xs"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-800">
        <a
          href={`https://arxiv.org/abs/${paper.arxiv_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-500 hover:text-blue-400 transition-colors"
        >
          Read on arXiv →
        </a>
        <a
          href={`/paper/${encodeURIComponent(paper.arxiv_id)}`}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          PaperBrief summary →
        </a>
      </div>
    </article>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ displayName }: { displayName: string }) {
  return (
    <div className="text-center py-16 text-gray-500">
      <div className="text-5xl mb-4">🔬</div>
      <p className="text-lg font-medium text-gray-400">
        No papers found for {displayName}
      </p>
      <p className="text-sm mt-2 max-w-md mx-auto">
        PaperBrief indexes papers surfaced in ML researcher digests. Papers by this author
        may not have been scored yet — check back as the index grows.
      </p>
      <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
        <a
          href={`https://arxiv.org/search/?searchtype=author&query=${encodeURIComponent(displayName)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-sm transition-colors"
        >
          Search arXiv →
        </a>
        <a
          href="/trending"
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-sm transition-colors"
        >
          Browse trending papers
        </a>
      </div>
    </div>
  );
}

// ── Sort controls ─────────────────────────────────────────────────────────────

type SortKey = 'recent' | 'score';

function SortToggle({
  sort,
  setSort,
  disabled,
}: {
  sort: SortKey;
  setSort: (s: SortKey) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex rounded-lg border border-gray-700 overflow-hidden text-xs">
      {(['recent', 'score'] as SortKey[]).map((key) => (
        <button
          key={key}
          onClick={() => setSort(key)}
          disabled={disabled}
          className={`px-3 py-1.5 transition-colors ${
            sort === key
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
          }`}
        >
          {key === 'recent' ? '🕐 Newest' : '★ Score'}
        </button>
      ))}
    </div>
  );
}

// ── Main client component ─────────────────────────────────────────────────────

export default function AuthorClient({
  papers,
  displayName,
  slug,
}: {
  papers: AuthorPagePaper[];
  displayName: string;
  slug: string;
}) {
  const [sort, setSort] = useState<SortKey>('recent');

  const sorted = [...papers].sort((a, b) => {
    if (sort === 'score') {
      // Nulls go to bottom
      const scoreA = a.llm_score ?? -Infinity;
      const scoreB = b.llm_score ?? -Infinity;
      return scoreB - scoreA;
    }
    // Default: most recently published first
    const dateA = a.published_at ?? '';
    const dateB = b.published_at ?? '';
    return dateB.localeCompare(dateA);
  });

  if (papers.length === 0) {
    return <EmptyState displayName={displayName} />;
  }

  return (
    <div>
      {/* Sort controls */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {papers.length} paper{papers.length === 1 ? '' : 's'} indexed
        </p>
        <SortToggle sort={sort} setSort={setSort} />
      </div>

      {/* Paper list */}
      <div className="space-y-4">
        {sorted.map((paper, i) => (
          <PaperCard
            key={paper.arxiv_id}
            paper={paper}
            rank={i + 1}
            currentAuthorSlug={slug}
          />
        ))}
      </div>
    </div>
  );
}
