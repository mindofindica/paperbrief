import { getReadingList } from '../../lib/arxiv-db';
import ReadingListClient from './ReadingListClient';
import AppNav from '../components/AppNav';

export const dynamic = 'force-dynamic';

export default function ReadingListPage() {
  const allItems = getReadingList();
  const unread = getReadingList('unread');
  const reading = getReadingList('reading');
  const done = getReadingList('done');

  return (
    <div className="min-h-screen bg-gray-950">
      <AppNav />

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-gray-100">Reading List</h1>
          <p className="text-gray-500 text-sm mt-1">{allItems.length} papers saved</p>
        </header>

        <ReadingListClient
          all={allItems}
          unread={unread}
          reading={reading}
          done={done}
        />
      </main>
    </div>
  );
}
