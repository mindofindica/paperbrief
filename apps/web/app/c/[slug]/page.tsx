/**
 * /c/[slug] — Public collection view
 *
 * Read-only page for publicly shared collections.
 * No auth required. Any visitor can see it.
 * Great for sharing "my top papers on X topic" on Twitter/HN.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import AppNav from '../../components/AppNav';
import { getCollectionBySlug, getCollectionPapers } from '../../../lib/collections';
import type { Collection, CollectionPaper } from '../../../lib/collections';

export const dynamic = 'force-dynamic';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://paperbrief.net';

// ── Metadata ───────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug);

  if (!collection) {
    return { title: 'Collection not found — PaperBrief' };
  }

  return {
    title: `${collection.name} — PaperBrief Collections`,
    description:
      collection.description ??
      `A curated collection of arXiv papers, shared on PaperBrief.`,
    openGraph: {
      title: collection.name,
      description: collection.description ?? `Curated arXiv papers on PaperBrief`,
      url: `${SITE_URL}/c/${slug}`,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: collection.name,
      description: collection.description ?? `Curated arXiv papers on PaperBrief`,
    },
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseAuthors(raw: string | null): string {
  if (!raw) return 'Unknown authors';
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      const names = arr as string[];
      if (names.length <= 3) return names.join(', ');
      return `${names.slice(0, 3).join(', ')} et al.`;
    }
    return String(raw);
  } catch {
    return raw;
  }
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function PublicCollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const collection: Collection | null = await getCollectionBySlug(slug);
  if (!collection) notFound();

  const papers: CollectionPaper[] = await getCollectionPapers(collection.id);

  return (
    <div className="min-h-screen bg-gray-950">
      <AppNav />

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <header className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs bg-violet-900/50 text-violet-400 border border-violet-800 px-2 py-0.5 rounded-full font-medium">
              Public Collection
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-100">{collection.name}</h1>
          {collection.description && (
            <p className="text-gray-400 text-sm">{collection.description}</p>
          )}
          <p className="text-gray-600 text-xs">
            {papers.length} {papers.length === 1 ? 'paper' : 'papers'} ·{' '}
            Curated on{' '}
            <a
              href={SITE_URL}
              className="text-violet-500 hover:text-violet-400 transition-colors"
            >
              PaperBrief
            </a>
          </p>
        </header>

        {/* Papers */}
        {papers.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No papers in this collection yet.
          </div>
        ) : (
          <ul className="space-y-4">
            {papers.map((p) => (
              <li
                key={p.arxiv_id}
                className="bg-gray-900 rounded-xl p-4 border border-gray-800 hover:border-gray-700 transition-colors"
              >
                <a
                  href={`/paper/${p.arxiv_id}`}
                  className="block group"
                >
                  <h2 className="text-gray-100 font-medium text-sm group-hover:text-violet-400 transition-colors line-clamp-2">
                    {p.title ?? p.arxiv_id}
                  </h2>
                  <p className="text-gray-500 text-xs mt-1">{parseAuthors(p.authors)}</p>
                  {p.abstract && (
                    <p className="text-gray-600 text-xs mt-2 line-clamp-3">{p.abstract}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-gray-700 text-xs font-mono">{p.arxiv_id}</span>
                    {p.published_at && (
                      <span className="text-gray-700 text-xs">{p.published_at.slice(0, 7)}</span>
                    )}
                    <span className="text-violet-600 text-xs ml-auto group-hover:text-violet-400 transition-colors">
                      Read →
                    </span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}

        {/* Footer CTA */}
        <div className="pt-4 border-t border-gray-800 text-center space-y-1">
          <p className="text-gray-500 text-xs">
            Build your own paper collections with{' '}
            <a
              href={SITE_URL}
              className="text-violet-500 hover:text-violet-400 transition-colors"
            >
              PaperBrief
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
