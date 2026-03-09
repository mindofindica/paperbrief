import { getStats } from '../../lib/stats';
import AppNav from '../components/AppNav';
import StatsClient from './StatsClient';

export const dynamic = 'force-dynamic';

export default function StatsPage() {
  const stats = getStats();

  return (
    <div className="min-h-screen bg-gray-950">
      <AppNav />

      <main className="max-w-2xl mx-auto px-6 py-8">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-gray-100">📊 Your Stats</h1>
          <p className="text-gray-500 text-sm mt-1">
            Your PaperBrief reading activity at a glance.
          </p>
        </header>

        <StatsClient stats={stats} />
      </main>
    </div>
  );
}
