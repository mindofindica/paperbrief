import type { Metadata } from 'next';
import { getPaper } from '../../../lib/arxiv-db';
import PaperDetailClient from './PaperDetailClient';
import { paperToJsonLd, paperBreadcrumbJsonLd } from '../../../lib/structured-data';

export const dynamic = 'force-dynamic';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://paperbrief.ai';

// ── Per-paper metadata (title, description, OG tags) ─────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ arxivId: string }>;
}): Promise<Metadata> {
  const { arxivId } = await params;
  const paper = await getPaper(arxivId);

  if (!paper) {
    return {
      title: 'Paper not found — PaperBrief',
    };
  }

  // Parse authors for description
  let authorStr = 'Unknown authors';
  try {
    const parsed = JSON.parse(paper.authors ?? '[]');
    if (Array.isArray(parsed) && parsed.length > 0) {
      const names = parsed as string[];
      authorStr =
        names.length <= 3
          ? names.join(', ')
          : `${names.slice(0, 3).join(', ')} +${names.length - 3} more`;
    }
  } catch {
    if (paper.authors) authorStr = paper.authors;
  }

  const scoreText =
    paper.llm_score !== null ? ` Relevance score: ${paper.llm_score.toFixed(1)}/10.` : '';
  const description = `${authorStr}.${scoreText} ${
    paper.abstract ? paper.abstract.slice(0, 150) + '…' : 'Read on PaperBrief.'
  }`;

  const ogImageUrl = `${SITE_URL}/paper/${arxivId}/opengraph-image`;
  const paperUrl = `${SITE_URL}/paper/${arxivId}`;

  return {
    title: `${paper.title} — PaperBrief`,
    description,
    openGraph: {
      title: paper.title,
      description,
      url: paperUrl,
      siteName: 'PaperBrief',
      type: 'article',
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: paper.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: paper.title,
      description: description.slice(0, 200),
      images: [ogImageUrl],
    },
  };
}

// ── Page component ────────────────────────────────────────────────────────────

export default async function PaperDetailPage({
  params,
}: {
  params: Promise<{ arxivId: string }>;
}) {
  const { arxivId } = await params;
  const paper = await getPaper(arxivId);

  if (!paper) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <main className="max-w-2xl mx-auto px-6 py-12 space-y-4">
          <h1 className="text-2xl font-bold">Paper not found</h1>
          <a href="/search" className="text-blue-400 hover:text-blue-300 transition-colors">
            ← Back to Search
          </a>
        </main>
      </div>
    );
  }

  // Parse authors for JSON-LD
  let authorsArray: string[] = [];
  try {
    const parsed = JSON.parse(paper.authors ?? '[]');
    if (Array.isArray(parsed)) authorsArray = parsed as string[];
  } catch {
    if (paper.authors) authorsArray = [paper.authors];
  }

  const articleJsonLd = paperToJsonLd({
    title: paper.title,
    authors: authorsArray,
    abstract: paper.abstract ?? '',
    publishedDate: paper.published_at ?? undefined,
    arxivId: paper.arxiv_id,
    llmScore: paper.llm_score ?? undefined,
  });

  const breadcrumbJsonLd = paperBreadcrumbJsonLd({
    title: paper.title,
    arxivId: paper.arxiv_id,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <PaperDetailClient paper={paper} />
    </>
  );
}
