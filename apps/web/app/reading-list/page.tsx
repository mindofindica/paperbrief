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
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <a href="/digest" className="text-lg font-bold text-gray-100">📄 PaperBrief</a>
          <div className="flex gap-4 text-sm">
            <a href="/digest" className="text-gray-500 hover:text-gray-300 transition-colors">Digest</a>
            <a href="/weekly" className="text-gray-500 hover:text-gray-300 transition-colors">Weekly</a>
            <a href="/search" className="text-gray-500 hover:text-gray-300 transition-colors">Search</a>
            <a href="/reading-list" className="text-gray-100 font-medium">Reading List</a>
          </div>
        </div>
      </nav>

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
