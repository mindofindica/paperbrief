/**
 * /author/[slug] — Public author profile page
 *
 * Shows papers by a specific researcher that are indexed in PaperBrief.
 * No auth required — fully public and SEO-crawlable.
 *
 * Slug format: "yoshua-bengio" maps to author name "yoshua bengio" (case-insensitive match).
 * Author names are resolved from paper data when available.
 *
 * ISR: revalidates every 12 hours.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  getAuthorPapers,
  authorSlugToDisplayName,
  authorPageJsonLd,
  formatPublishedDate,
} from '../../../lib/author-pages';
import AuthorClient from './AuthorClient';
import AppNav from '../../components/AppNav';

// ── ISR ───────────────────────────────────────────────────────────────────────

export const revalidate = 43200; // 12 hours

// ── SEO ───────────────────────────────────────────────────────────────────────

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://paperbrief.ai';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const displayName = authorSlugToDisplayName(slug);
  const pageUrl = `${SITE_URL}/author/${slug}`;

  const title = `${displayName} — Research Papers on PaperBrief`;
  const description = `Browse arXiv papers by ${displayName} indexed and scored by PaperBrief. Discover their latest ML and AI research.`;

  return {
    title,
    description,
    openGraph: {
      title: `${displayName} — Research Papers`,
      description,
      url: pageUrl,
      siteName: 'PaperBrief',
      type: 'profile',
      images: [
        {
          url: `${pageUrl}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: `Papers by ${displayName} — PaperBrief`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: description.slice(0, 200),
      images: [`${pageUrl}/opengraph-image`],
    },
    alternates: {
      canonical: pageUrl,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AuthorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Basic slug validation — reject obvious junk
  if (!slug || slug.length > 120 || !/^[a-z0-9-]+$/.test(slug)) {
    notFound();
  }

  const data = await getAuthorPapers(slug, 40);

  const jsonLd = authorPageJsonLd(data, SITE_URL);

  return (
    <div className="min-h-screen bg-gray-950">
      <AppNav />

      {/* JSON-LD structured data */}
      {jsonLd.map((ld, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
        />
      ))}

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* ── Breadcrumb ── */}
        <nav className="text-xs text-gray-600 flex items-center gap-1">
          <Link href="/" className="hover:text-gray-400 transition-colors">
            PaperBrief
          </Link>
          <span>/</span>
          <span className="text-gray-500">Authors</span>
          <span>/</span>
          <span className="text-gray-400">{data.displayName}</span>
        </nav>

        {/* ── Author header ── */}
        <header className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-100">{data.displayName}</h1>
              <p className="text-gray-500 text-sm mt-1">Researcher · arXiv author</p>
            </div>

            {/* arXiv profile link */}
            <a
              href={`https://arxiv.org/search/?searchtype=author&query=${encodeURIComponent(data.displayName)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg text-xs transition-colors border border-gray-700"
            >
              View on arXiv →
            </a>
          </div>

          {/* Stats row */}
          {data.papers.length > 0 && (
            <div className="flex flex-wrap gap-4 text-sm text-gray-500">
              <span>
                <span className="font-semibold text-gray-300">{data.papers.length}</span>{' '}
                paper{data.papers.length === 1 ? '' : 's'} indexed
              </span>
              {data.categoryCount > 0 && (
                <span>
                  <span className="font-semibold text-gray-300">{data.categoryCount}</span>{' '}
                  research area{data.categoryCount === 1 ? '' : 's'}
                </span>
              )}
              {data.latestPublishedAt && (
                <span>
                  Latest:{' '}
                  <span className="text-gray-300">
                    {formatPublishedDate(data.latestPublishedAt)}
                  </span>
                </span>
              )}
            </div>
          )}

          {/* Category breakdown */}
          {data.papers.length > 0 && (
            <CategorySummary papers={data.papers} />
          )}
        </header>

        {/* ── Paper list ── */}
        <section>
          <AuthorClient papers={data.papers} displayName={data.displayName} slug={slug} />
        </section>

        {/* ── Footer CTA ── */}
        {data.papers.length > 0 && (
          <footer className="pt-4 border-t border-gray-800 text-center">
            <p className="text-sm text-gray-500">
              PaperBrief scores and summarizes ML papers to help you keep up with research.
            </p>
            <div className="mt-3 flex gap-3 justify-center">
              <Link
                href="/trending"
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-sm transition-colors"
              >
                Trending papers
              </Link>
              <Link
                href="/today"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors"
              >
                Paper of the day
              </Link>
            </div>
          </footer>
        )}
      </main>
    </div>
  );
}

// ── Category summary strip ────────────────────────────────────────────────────

function CategorySummary({ papers }: { papers: Array<{ categories: string[] }> }) {
  const catCounts: Map<string, number> = new Map();
  for (const paper of papers) {
    for (const cat of paper.categories) {
      catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
    }
  }

  const sorted = [...catCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  if (sorted.length === 0) return null;

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

  return (
    <div className="flex flex-wrap gap-1.5">
      {sorted.map(([cat, count]) => (
        <span
          key={cat}
          className={`px-2.5 py-1 rounded-full text-xs border ${
            CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.default
          }`}
          title={`${count} paper${count === 1 ? '' : 's'} in ${cat}`}
        >
          {cat} · {count}
        </span>
      ))}
    </div>
  );
}
