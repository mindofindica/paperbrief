'use client';

/**
 * AddToCollectionButton
 *
 * A button that opens a dropdown listing the user's collections.
 * Clicking a collection adds/removes the paper from it.
 * Shown on paper detail pages.
 *
 * If the user has no collections, prompts them to create one.
 */

import { useEffect, useRef, useState } from 'react';

interface Collection {
  id: string;
  name: string;
  is_public: boolean;
  paper_count: number;
}

interface Props {
  arxivId: string;
  title?: string | null;
  authors?: string | null;
  abstract?: string | null;
  publishedAt?: string | null;
}

export default function AddToCollectionButton({
  arxivId,
  title,
  authors,
  abstract,
  publishedAt,
}: Props) {
  const [open, setOpen] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [inCollections, setInCollections] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  async function fetchCollections() {
    setLoading(true);
    try {
      const [colRes, paperColRes] = await Promise.all([
        fetch('/api/collections'),
        fetch(`/api/collections?forPaper=${encodeURIComponent(arxivId)}`),
      ]);
      const colData = await colRes.json();
      setCollections(colData.collections ?? []);

      // Check which collections already contain this paper by trying each
      // (we'll use the per-paper endpoint if we build it, for now optimistically track)
      // We'll re-derive inCollections from a fresh check after toggle actions.
    } catch {
      setCollections([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleOpen() {
    setOpen((v) => !v);
    if (!open) {
      await fetchCollections();
    }
  }

  async function handleToggle(collectionId: string) {
    setPendingId(collectionId);
    const isIn = inCollections.has(collectionId);

    try {
      if (isIn) {
        // Remove
        const encoded = encodeURIComponent(arxivId);
        const res = await fetch(
          `/api/collections/${collectionId}/papers/${encoded}`,
          { method: 'DELETE' },
        );
        if (!res.ok) throw new Error();
        setInCollections((prev) => {
          const next = new Set(prev);
          next.delete(collectionId);
          return next;
        });
      } else {
        // Add
        const res = await fetch(`/api/collections/${collectionId}/papers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            arxiv_id: arxivId,
            title: title ?? null,
            authors: authors ?? null,
            abstract: abstract ?? null,
            published_at: publishedAt ?? null,
          }),
        });
        if (res.status === 409) {
          // Already in collection — mark as in
          setInCollections((prev) => new Set([...prev, collectionId]));
          return;
        }
        if (!res.ok) throw new Error();
        setInCollections((prev) => new Set([...prev, collectionId]));
      }
    } catch {
      alert('Failed to update collection');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <button
        onClick={handleOpen}
        className="rounded-lg border border-gray-700 hover:border-gray-600 px-4 py-2 text-sm text-gray-200 transition-colors"
      >
        Add to Collection
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-gray-900 border border-gray-700 rounded-xl shadow-xl overflow-hidden">
          {loading ? (
            <div className="px-4 py-3 text-gray-500 text-sm">Loading…</div>
          ) : collections.length === 0 ? (
            <div className="px-4 py-4 text-center space-y-2">
              <p className="text-gray-400 text-sm">No collections yet.</p>
              <a
                href="/collections"
                className="inline-block text-xs text-violet-400 hover:text-violet-300 transition-colors"
              >
                Create your first collection →
              </a>
            </div>
          ) : (
            <>
              <div className="max-h-56 overflow-y-auto">
                {collections.map((col) => {
                  const isIn = inCollections.has(col.id);
                  const pending = pendingId === col.id;
                  return (
                    <button
                      key={col.id}
                      onClick={() => handleToggle(col.id)}
                      disabled={pending}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-800 transition-colors flex items-center justify-between gap-2 group"
                    >
                      <span className="text-sm text-gray-200 truncate">{col.name}</span>
                      <span
                        className={`shrink-0 text-xs ${
                          isIn
                            ? 'text-violet-400'
                            : 'text-gray-600 group-hover:text-gray-400'
                        }`}
                      >
                        {pending ? '…' : isIn ? '✓' : '+'}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="border-t border-gray-800 px-4 py-2">
                <a
                  href="/collections"
                  className="text-xs text-gray-500 hover:text-violet-400 transition-colors"
                >
                  Manage collections →
                </a>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
