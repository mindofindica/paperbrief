import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAllTopics, getTopicBySlug, getTopicPapers } from '../../../lib/topics';

export const revalidate = 21600; // 6h ISR

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://paperbrief.ai';

export function generateStaticParams() {
  return getAllTopics().map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const topic = getTopicBySlug(slug);
  if (!topic) return {};

  const title = `${topic.emoji} ${topic.name} Papers — PaperBrief`;
  const description = `Browse the latest ${topic.name} research papers on PaperBrief. ${topic.description}`;

  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/topics/${slug}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/topics/${slug}`,
      siteName: 'PaperBrief',
      type: 'website',
    },
  };
}

export default async function TopicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const topic = getTopicBySlug(slug);
  if (!topic) notFound();

  const papers = await getTopicPapers(slug, 30, 30);

  return (
    <main className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-200 px-6 py-4 flex items-center gap-6">
        <Link href="/" className="text-lg font-bold text-gray-900 hover:text-gray-700 transition-colors">
          PaperBrief
        </Link>
        <Link href="/trending" className="text-sm text-gray-600 hover:text-gray-900 hidden md:inline">Trending</Link>
        <Link href="/topics" className="text-sm text-gray-600 hover:text-gray-900 hidden md:inline">Topics</Link>
        <div className="ml-auto">
          <Link href="/auth/login" className="text-sm text-gray-600 hover:text-gray-900">Sign in</Link>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Back link */}
        <Link
          href="/topics"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-8 transition-colors"
        >
          ← All Topics
        </Link>

        {/* Hero */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-4xl">{topic.emoji}</span>
            <h1 className="text-3xl font-bold text-gray-900">{topic.name}</h1>
          </div>
          <p className="text-gray-500 text-lg mb-3">{topic.description}</p>
          <span className="text-sm text-gray-400">
            {papers.length} paper{papers.length !== 1 ? 's' : ''} in the last 30 days
          </span>
        </div>

        {/* Paper list */}
        {papers.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg mb-2">No recent papers found for this topic.</p>
            <p className="text-sm">Check back soon — new papers are indexed daily.</p>
          </div>
        ) : (
          <div className="space-y-6 mb-14">
            {papers.map((paper) => (
              <article
                key={paper.arxiv_id}
                className="border border-gray-200 rounded-xl p-5 hover:border-gray-300 transition-colors"
              >
                <Link
                  href={`/paper/${encodeURIComponent(paper.arxiv_id)}`}
                  className="text-base font-semibold text-gray-900 hover:text-blue-600 transition-colors leading-snug block mb-2"
                >
                  {paper.title}
                </Link>

                {/* Authors */}
                {paper.authors && paper.authors.length > 0 && (
                  <p className="text-sm text-gray-500 mb-2">
                    {paper.authors.slice(0, 3).join(', ')}
                    {paper.authors.length > 3 && ' et al.'}
                  </p>
                )}

                {/* Categories */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {paper.categories?.slice(0, 4).map((cat) => (
                    <span
                      key={cat}
                      className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"
                    >
                      {cat}
                    </span>
                  ))}
                  {paper.published_at && (
                    <span className="text-xs text-gray-400 ml-auto self-center">
                      {new Date(paper.published_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  )}
                </div>

                {/* Abstract snippet */}
                {paper.abstract && (
                  <p className="text-sm text-gray-500 leading-relaxed line-clamp-2">
                    {paper.abstract.slice(0, 200)}
                    {paper.abstract.length > 200 ? '…' : ''}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}

        {/* Bottom CTA */}
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-8 text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Track {topic.name} — Get notified when new papers are scored
          </h2>
          <p className="text-gray-500 mb-5 text-sm">
            Sign up free and get daily digests tailored to your research interests.
          </p>
          <Link
            href="/auth/login"
            className="inline-block bg-gray-900 text-white text-sm font-medium px-6 py-2.5 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Sign up free
          </Link>
        </div>
      </div>
    </main>
  );
}
