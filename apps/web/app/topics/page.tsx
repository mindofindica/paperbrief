import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllTopicsWithCounts } from '../../lib/topics';

export const revalidate = 21600; // 6h ISR

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://paperbrief.ai';

export const metadata: Metadata = {
  title: 'Browse Research Topics — PaperBrief',
  description:
    'Discover the latest ML and AI research papers across 12 key topics: LLM Agents, RAG, Reasoning, Diffusion Models, and more.',
  alternates: { canonical: `${SITE_URL}/topics` },
  openGraph: {
    title: 'Browse Research Topics — PaperBrief',
    description:
      'Discover the latest ML and AI research papers across 12 key topics.',
    url: `${SITE_URL}/topics`,
    siteName: 'PaperBrief',
    type: 'website',
  },
};

export default async function TopicsPage() {
  const topics = await getAllTopicsWithCounts(30);

  return (
    <main className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-200 px-6 py-4 flex items-center gap-6">
        <Link href="/" className="text-lg font-bold text-gray-900 hover:text-gray-700 transition-colors">
          PaperBrief
        </Link>
        <Link href="/trending" className="text-sm text-gray-600 hover:text-gray-900 hidden md:inline">Trending</Link>
        <Link href="/topics" className="text-sm text-gray-900 font-medium hidden md:inline">Topics</Link>
        <div className="ml-auto flex gap-3">
          <Link href="/auth/login" className="text-sm text-gray-600 hover:text-gray-900">Sign in</Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            Explore ML Research by Topic
          </h1>
          <p className="text-gray-500 text-lg">
            Discover the latest papers across 12 key areas of machine learning and AI
          </p>
        </div>

        {/* Topic grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-14">
          {topics.map((topic) => (
            <Link
              key={topic.slug}
              href={`/topics/${topic.slug}`}
              className="group block rounded-xl border border-gray-200 p-5 hover:border-gray-400 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="text-2xl">{topic.emoji}</span>
                <span className="text-xs font-medium bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
                  {topic.count} papers
                </span>
              </div>
              <h2 className="text-base font-semibold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">
                {topic.name}
              </h2>
              <p className="text-sm text-gray-500 line-clamp-2">{topic.description}</p>
            </Link>
          ))}
        </div>

        {/* CTA */}
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-8 text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Get personalised digests delivered to your inbox
          </h2>
          <p className="text-gray-500 mb-5 text-sm">
            Sign up free and track the topics that matter to you.
          </p>
          <Link
            href="/auth/login"
            className="inline-block bg-gray-900 text-white text-sm font-medium px-6 py-2.5 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Get started — it&apos;s free
          </Link>
        </div>
      </div>
    </main>
  );
}
