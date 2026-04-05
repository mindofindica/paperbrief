'use client';

/**
 * /collections/[id] — Collection detail page
 *
 * Shows all papers in a collection with remove buttons.
 * Edit name / description / visibility inline.
 * Papers link to /paper/[arxivId] for full detail.
 */

import { useEffect, useState, use, useCallback } from 'react';
import AppNav from '../../components/AppNav';

interface CollectionPaper {
  collection_id: string;
  arxiv_id: string;
  title: string | null;
  authors: string | null;
  abstract: string | null;
  published_at: string | null;
  added_at: string;
}

interface Collection {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

function parseAuthors(raw: string | null): string {
  if (!raw) return '';
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.slice(0, 3).join(', ') + (arr.length > 3 ? ' et al.' : '');
    return String(raw);
  } catch {
    return raw;
  }
}

export default function CollectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [collection, setCollection] = useState<Collection | null>(null);
  const [papers, setPapers] = useState<CollectionPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [saving, setSaving] = useState(false);

  // Remove state
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/collections/${id}/papers`);
      if (res.status === 404) { setError('Collection not found'); setLoading(false); return; }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCollection(data.collection);
      setPapers(data.papers ?? []);
      setEditName(data.collection.name);
      setEditDesc(data.collection.description ?? '');
    } catch {
      setError('Failed to load collection');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/collections/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, description: editDesc || null }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCollection(data.collection);
      setEditing(false);
    } catch {
      alert('Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  async function handleTogglePublic() {
    if (!collection) return;
    try {
      const res = await fetch(`/api/collections/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: !collection.is_public }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCollection(data.collection);
    } catch {
      alert('Failed to update visibility');
    }
  }

  async function handleRemovePaper(arxivId: string) {
    if (removingId !== arxivId) { setRemovingId(arxivId); return; }
    try {
      const encoded = encodeURIComponent(arxivId);
      const res = await fetch(`/api/collections/${id}/papers/${encoded}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setPapers((prev) => prev.filter((p) => p.arxiv_id !== arxivId));
    } catch {
      alert('Failed to remove paper');
    } finally {
      setRemovingId(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950">
        <AppNav />
        <div className="text-center py-24 text-gray-500">Loading…</div>
      </div>
    );
  }

  if (error || !collection) {
    return (
      <div className="min-h-screen bg-gray-950">
        <AppNav back={{ href: "/collections", label: "← Collections" }} />
        <div className="text-center py-24 text-red-400">{error ?? 'Not found'}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <AppNav back={{ href: "/collections", label: "← Collections" }} />

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Header / edit form */}
        {editing ? (
          <form onSubmit={handleSaveEdit} className="space-y-3">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={100}
              required
              className="w-full bg-gray-900 text-gray-100 border border-gray-700 rounded-lg px-3 py-2 text-lg font-bold focus:outline-none focus:border-violet-500"
            />
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Description (optional)"
              className="w-full bg-gray-900 text-gray-100 placeholder-gray-600 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 resize-none"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-4 py-1.5 text-gray-400 hover:text-gray-200 text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <header>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-gray-100">{collection.name}</h1>
                {collection.description && (
                  <p className="text-gray-500 text-sm mt-1">{collection.description}</p>
                )}
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-gray-600 text-xs">
                    {papers.length} {papers.length === 1 ? 'paper' : 'papers'}
                  </span>
                  <button
                    onClick={handleTogglePublic}
                    className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                      collection.is_public
                        ? 'border-violet-700 text-violet-400 hover:bg-violet-900/30'
                        : 'border-gray-700 text-gray-500 hover:border-gray-500'
                    }`}
                  >
                    {collection.is_public ? '🔗 Public' : '🔒 Private'}
                  </button>
                  {collection.is_public && (
                    <a
                      href={`/c/${collection.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-500 text-xs hover:text-violet-400 transition-colors"
                    >
                      View public page ↗
                    </a>
                  )}
                </div>
              </div>
              <button
                onClick={() => setEditing(true)}
                className="shrink-0 text-sm text-gray-500 hover:text-gray-300 transition-colors"
              >
                Edit
              </button>
            </div>
          </header>
        )}

        {/* Papers */}
        {papers.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <p className="text-gray-400">No papers in this collection yet.</p>
            <p className="text-gray-600 text-sm">
              Visit any paper page and use the{' '}
              <span className="text-gray-400">Add to Collection</span> button.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {papers.map((p) => (
              <li
                key={p.arxiv_id}
                className="bg-gray-900 rounded-xl p-4 border border-gray-800 hover:border-gray-700 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <a
                      href={`/paper/${p.arxiv_id}`}
                      className="text-gray-100 font-medium text-sm hover:text-violet-400 transition-colors line-clamp-2"
                    >
                      {p.title ?? p.arxiv_id}
                    </a>
                    {p.authors && (
                      <p className="text-gray-500 text-xs mt-1">{parseAuthors(p.authors)}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-gray-700 text-xs font-mono">{p.arxiv_id}</span>
                      {p.published_at && (
                        <span className="text-gray-700 text-xs">
                          {p.published_at.slice(0, 7)}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemovePaper(p.arxiv_id)}
                    title={removingId === p.arxiv_id ? 'Confirm remove' : 'Remove from collection'}
                    className={`shrink-0 text-xs px-2 py-1 rounded border transition-colors ${
                      removingId === p.arxiv_id
                        ? 'border-red-700 text-red-400 hover:bg-red-900/30'
                        : 'border-gray-700 text-gray-600 hover:border-red-700 hover:text-red-400'
                    }`}
                  >
                    {removingId === p.arxiv_id ? 'Confirm?' : '×'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
