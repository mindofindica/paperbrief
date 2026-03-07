import { getRecommendationBasis, getRecommendations } from '../../lib/arxiv-db';
import RecommendClient from './RecommendClient';

export const dynamic = 'force-dynamic';

export default function RecommendPage() {
  const papers = getRecommendations(20);
  const basedOn = getRecommendationBasis();

  return <RecommendClient initialPapers={papers} initialBasedOn={basedOn} />;
}
