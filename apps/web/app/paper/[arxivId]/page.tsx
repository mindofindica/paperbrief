import { getPaper } from '../../../lib/arxiv-db';
import PaperDetailClient from './PaperDetailClient';

export const dynamic = 'force-dynamic';

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

  return <PaperDetailClient paper={paper} />;
}
