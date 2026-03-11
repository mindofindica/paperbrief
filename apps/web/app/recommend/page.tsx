import { getRecommendationBasis, getRecommendations } from '../../lib/arxiv-db';
import AppNav from '../components/AppNav';
import RecommendClient from './RecommendClient';

export const dynamic = 'force-dynamic';

export default function RecommendPage() {
  const papers = getRecommendations(20);
  const basedOn = getRecommendationBasis();

  return (
    <div className="min-h-screen bg-gray-950">
      <AppNav />
      <RecommendClient initialPapers={papers} initialBasedOn={basedOn} />
    </div>
  );
}
