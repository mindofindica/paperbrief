'use client';

import { useState } from 'react';

interface Props {
  /** Display name of the author to follow */
  authorName: string;
  /** Whether the user is already following this author (optional — defaults to unknown) */
  initiallyFollowing?: boolean;
}

/**
 * Small inline "Follow" / "Following" toggle button for a single author.
 * Appears next to author names on the paper detail page.
 * Makes API calls to /api/authors (POST) and /api/authors/[name] (DELETE).
 */
export default function FollowAuthorButton({ authorName, initiallyFollowing = false }: Props) {
  const [following, setFollowing] = useState(initiallyFollowing);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function toggle() {
    setLoading(true);
    setError('');

    try {
      if (following) {
        const res = await fetch(`/api/authors/${encodeURIComponent(authorName)}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          setFollowing(false);
        } else {
          const data = await res.json();
          setError(data.error ?? 'Failed to unfollow');
        }
      } else {
        const res = await fetch('/api/authors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ authorName }),
        });
        if (res.ok) {
          setFollowing(true);
        } else {
          const data = await res.json();
          setError(data.error ?? 'Failed to follow');
        }
      }
    } catch {
      setError('Network error');
    }

    setLoading(false);
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        onClick={toggle}
        disabled={loading}
        title={following ? `Unfollow ${authorName}` : `Follow ${authorName}`}
        className={`text-xs px-2 py-0.5 rounded-full border transition-colors disabled:opacity-40 ${
          following
            ? 'border-blue-700 bg-blue-900/40 text-blue-300 hover:border-red-700 hover:bg-red-900/20 hover:text-red-400'
            : 'border-gray-700 text-gray-500 hover:border-blue-700 hover:text-blue-400'
        }`}
      >
        {loading ? '…' : following ? '✓ Following' : '+ Follow'}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </span>
  );
}
