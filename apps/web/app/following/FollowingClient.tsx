'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { AuthorFollow, AuthorPaper } from '../../lib/author-follows';
import { FREE_FOLLOW_LIMIT } from '../../lib/author-follows';

interface Props {
  follows: AuthorFollow[];
  papers: AuthorPaper[];
}

function scoreColor(score: number): string {
  if (score >= 9) return 'text-yellow-400';
  if (score >= 7) return 'text-green-400';
  if (score >= 5) return 'text-blue-400';
  return 'text-gray-500';
}

function scoreIcon(score: number): string {
  if (score >= 9) return '🌟';
  if (score >= 7) return '⭐';
  return '✨';
}

export default function FollowingClient({ follows: initialFollows, papers: initialPapers }: Props) {
  const [follows, setFollows] = useState<AuthorFollow[]>(initialFollows);
  const [papers, setPapers] = useState<AuthorPaper[]>(initialPapers);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isPending, startTransition] = useTransition();

  const atLimit = follows.length >= FREE_FOLLOW_LIMIT;

  async function handleFollow(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!input.trim()) return;

    startTransition(async () => {
      try {
        const res = await fetch('/api/authors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ authorName: input.trim() }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? 'Failed to follow author');
          return;
        }
        setFollows((prev) => [data.follow, ...prev]);
        setInput('');
        setSuccess(`Now following ${data.follow.author_name}`);
        // Refresh papers
        const papersRes = await fetch('/api/authors/papers');
        if (papersRes.ok) {
          const papersData = await papersRes.json();
          setPapers(papersData.papers ?? []);
        }
      } catch {
        setError('Network error — please try again');
      }
    });
  }

  async function handleUnfollow(authorName: string) {
    setError('');
    setSuccess('');
    startTransition(async () => {
      try {
        const res = await fetch(`/api/authors/${encodeURIComponent(authorName)}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error ?? 'Failed to unfollow');
          return;
        }
        setFollows((prev) => prev.filter((f) => f.author_name.toLowerCase() !== authorName.toLowerCase()));
        setSuccess(`Unfollowed ${authorName}`);
        // Refresh papers
        const papersRes = await fetch('/api/authors/papers');
        if (papersRes.ok) {
          const papersData = await papersRes.json();
          setPapers(papersData.papers ?? []);
        }
      } catch {
        setError('Network error — please try again');
      }
    });
  }

  return (
    <div className="space-y-8">

      {/* Follow form */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Follow a researcher</h2>
        <form onSubmit={handleFollow} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(''); setSuccess(''); }}
            placeholder="e.g. Andrej Karpathy"
            disabled={isPending || atLimit}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-gray-100 placeholder-gray-600 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isPending || !input.trim() || atLimit}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isPending ? 'Following…' : 'Follow'}
          </button>
        </form>

        {atLimit && (
          <p className="text-xs text-amber-400">
            Free plan: {FREE_FOLLOW_LIMIT} followed authors max.{' '}
            <Link href="/pricing" className="underline hover:text-amber-300">Upgrade to Pro</Link> for unlimited.
          </p>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
        {success && <p className="text-xs text-green-400">{success}</p>}
      </section>

      {/* Followed authors list */}
      {follows.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
            Following ({follows.length}/{FREE_FOLLOW_LIMIT})
          </h2>
          <ul className="space-y-2">
            {follows.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg px-4 py-3"
              >
                <div>
                  <span className="text-gray-100 text-sm font-medium">{f.author_name}</span>
                  <span className="text-gray-600 text-xs ml-3">
                    since {new Date(f.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                <button
                  onClick={() => handleUnfollow(f.author_name)}
                  disabled={isPending}
                  className="text-gray-600 hover:text-red-400 text-xs transition-colors disabled:opacity-40"
                >
                  Unfollow
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {follows.length === 0 && (
        <div className="text-center py-12 text-gray-600 text-sm">
          <p className="text-3xl mb-3">👤</p>
          <p>No authors followed yet.</p>
          <p className="mt-1">Search for a researcher above to get started.</p>
        </div>
      )}

      {/* Papers from followed authors */}
      {papers.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
            Recent papers ({papers.length})
          </h2>
          <ul className="space-y-3">
            {papers.map((p) => (
              <li key={p.arxiv_id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
                <div className="flex items-start gap-2">
                  <span className={`text-sm font-bold shrink-0 ${scoreColor(p.llm_score)}`}>
                    {scoreIcon(p.llm_score)} {p.llm_score}
                  </span>
                  <Link
                    href={`/paper/${p.arxiv_id}`}
                    className="text-gray-100 text-sm font-medium hover:text-blue-400 transition-colors leading-snug"
                  >
                    {p.title}
                  </Link>
                </div>

                <p className="text-gray-500 text-xs">
                  {p.authors.slice(0, 4).join(', ')}
                  {p.authors.length > 4 ? ` +${p.authors.length - 4} more` : ''}
                </p>

                <div className="flex items-center gap-3 text-xs">
                  <span className="text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full">
                    matched: {p.matched_author}
                  </span>
                  <span className="text-gray-600">
                    {new Date(p.published_at).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {follows.length > 0 && papers.length === 0 && (
        <div className="text-center py-8 text-gray-600 text-sm">
          <p>No papers found from followed authors in the corpus yet.</p>
          <p className="mt-1 text-xs">Papers are indexed daily — check back tomorrow.</p>
        </div>
      )}
    </div>
  );
}
