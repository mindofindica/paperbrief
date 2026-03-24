'use client';

/**
 * SimilarPapersSection
 *
 * Renders a "Similar Papers" card grid below the AI content tabs on the
 * paper detail page. Fetches from /api/similar-papers/:arxivId client-side
 * so it never blocks the initial page render.
 *
 * - Shows a skeleton while loading
 * - Shows nothing when there are no similar papers (quiet failure)
 * - Scores are computed from category overlap + title-word overlap
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { SimilarPaper } from '../../../lib/similar-papers';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatAuthors(authors: string[]): string {
  if (authors.length === 0) return 'Unknown authors';
  if (authors.length <= 2) return authors.join(', ');
  return `${authors[0]}, ${authors[1]} +${authors.length - 2} more`;
}

// Category badge colour map — consistent with PaperDetailClient
const TRACK_COLORS: Record<string, string> = {
  'cs.AI': 'bg-blue-900/60 text-blue-200',
  'cs.LG': 'bg-purple-900/60 text-purple-200',
  'cs.CL': 'bg-green-900/60 text-green-200',
  'cs.CV': 'bg-orange-900/60 text-orange-200',
  'stat.ML': 'bg-pink-900/60 text-pink-200',
};
function trackColor(cat: string): string {
  return TRACK_COLORS[cat] ?? 'bg-gray-800 text-gray-300';
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 animate-pulse space-y-2">
      <div className="h-4 bg-gray-800 rounded w-3/4" />
      <div className="h-3 bg-gray-800 rounded w-1/2" />
      <div className="h-3 bg-gray-800 rounded w-1/3" />
    </div>
  );
}

// ── Paper card ────────────────────────────────────────────────────────────────

function PaperCard({ paper }: { paper: SimilarPaper }) {
  const primaryCat = paper.categories[0];

  return (
    <Link
      href={`/paper/${encodeURIComponent(paper.arxiv_id)}`}
      className="group block bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl p-4 transition-colors space-y-2"
    >
      {/* Category badge */}
      {primaryCat && (
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${trackColor(primaryCat)}`}>
          {primaryCat}
        </span>
      )}

      {/* Title */}
      <h3 className="text-sm font-medium text-gray-100 group-hover:text-blue-300 transition-colors leading-snug line-clamp-3">
        {paper.title}
      </h3>

      {/* Authors */}
      <p className="text-xs text-gray-500 truncate">{formatAuthors(paper.authors)}</p>

      {/* Date */}
      {paper.published_at && (
        <p className="text-xs text-gray-600">{formatDate(paper.published_at)}</p>
      )}
    </Link>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface SimilarPapersSectionProps {
  arxivId: string;
}

export default function SimilarPapersSection({ arxivId }: SimilarPapersSectionProps) {
  const [papers, setPapers] = useState<SimilarPaper[] | null>(null); // null = loading
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const res = await fetch(`/api/similar-papers/${encodeURIComponent(arxivId)}`);
        if (!res.ok) {
          if (mounted) setError(true);
          return;
        }
        const data = await res.json();
        if (mounted) setPapers(data.papers ?? []);
      } catch {
        if (mounted) setError(true);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [arxivId]);

  // Loading state
  if (papers === null && !error) {
    return (
      <section className="space-y-3" aria-label="Similar papers loading">
        <h2 className="text-lg font-semibold text-gray-100">Similar Papers</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </section>
    );
  }

  // Error or empty — render nothing (quiet failure)
  if (error || !papers || papers.length === 0) return null;

  return (
    <section className="space-y-3" aria-label="Similar papers">
      <h2 className="text-lg font-semibold text-gray-100">Similar Papers</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {papers.map((paper) => (
          <PaperCard key={paper.arxiv_id} paper={paper} />
        ))}
      </div>
    </section>
  );
}
