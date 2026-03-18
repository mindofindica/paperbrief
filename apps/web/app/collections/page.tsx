'use client';

/**
 * /collections — My Paper Collections
 *
 * Lists all of the user's named collections.
 * Create new collections, delete existing ones, toggle visibility.
 * Free tier: max 3 collections. Pro: unlimited.
 */

import { useEffect, useState } from 'react';
import AppNav from '../components/AppNav';

interface Collection {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  is_public: boolean;
  created_at: string;
  paper_count: number;
}

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPublic, setNewPublic] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchCollections();
  }, []);

  async function fetchCollections() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/collections');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setCollections(data.collections ?? []);
    } catch {
      setError('Failed to load collections');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, description: newDesc || null, is_public: newPublic }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          setCreateError(`${data.error} Upgrade to Pro for unlimited collections.`);
        } else {
          setCreateError(data.error ?? 'Failed to create collection');
        }
        return;
      }
      setCollections((prev) => [{ ...data.collection, paper_count: 0 }, ...prev]);
      setNewName('');
      setNewDesc('');
      setNewPublic(false);
      setShowForm(false);
    } catch {
      setCreateError('Failed to create collection');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (deletingId !== id) {
      setDeletingId(id);
      return; // First click = confirm
    }
    try {
      const res = await fetch(`/api/collections/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setCollections((prev) => prev.filter((c) => c.id !== id));
    } catch {
      alert('Failed to delete collection');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleTogglePublic(collection: Collection) {
    try {
      const res = await fetch(`/api/collections/${collection.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: !collection.is_public }),
      });
      if (!res.ok) throw new Error();
      setCollections((prev) =>
        prev.map((c) => (c.id === collection.id ? { ...c, is_public: !c.is_public } : c)),
      );
    } catch {
      alert('Failed to update collection');
    }
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <AppNav />

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-100">Collections</h1>
            <p className="text-gray-500 text-sm mt-1">
              Organise papers into named shelves — share them publicly or keep them private.
            </p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="shrink-0 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {showForm ? 'Cancel' : '+ New Collection'}
          </button>
        </header>

        {/* Create form */}
        {showForm && (
          <form
            onSubmit={handleCreate}
            className="bg-gray-900 rounded-xl p-5 space-y-4 border border-gray-800"
          >
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
              New Collection
            </h2>

            {createError && (
              <p className="text-red-400 text-sm">{createError}</p>
            )}

            <div>
              <label className="block text-sm text-gray-400 mb-1">Name *</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. LLM alignment papers"
                maxLength={100}
                required
                className="w-full bg-gray-800 text-gray-100 placeholder-gray-600 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Description (optional)</label>
              <textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="What is this collection about?"
                maxLength={500}
                rows={2}
                className="w-full bg-gray-800 text-gray-100 placeholder-gray-600 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 resize-none"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={newPublic}
                onChange={(e) => setNewPublic(e.target.checked)}
                className="w-4 h-4 accent-violet-500"
              />
              Make this collection public (shareable link)
            </label>

            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="w-full py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {creating ? 'Creating…' : 'Create Collection'}
            </button>
          </form>
        )}

        {/* Collections list */}
        {loading ? (
          <div className="text-gray-500 text-sm text-center py-12">Loading…</div>
        ) : error ? (
          <div className="text-red-400 text-sm text-center py-12">{error}</div>
        ) : collections.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <p className="text-gray-400">No collections yet.</p>
            <p className="text-gray-600 text-sm">
              Create your first collection to start organising papers.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {collections.map((col) => (
              <li
                key={col.id}
                className="bg-gray-900 rounded-xl p-4 border border-gray-800 hover:border-gray-700 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <a
                      href={`/collections/${col.id}`}
                      className="text-gray-100 font-medium hover:text-violet-400 transition-colors block truncate"
                    >
                      {col.name}
                    </a>
                    {col.description && (
                      <p className="text-gray-500 text-sm mt-0.5 line-clamp-2">{col.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-gray-600 text-xs">
                        {col.paper_count} {col.paper_count === 1 ? 'paper' : 'papers'}
                      </span>
                      {col.is_public && (
                        <a
                          href={`/c/${col.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-violet-500 text-xs hover:text-violet-400 transition-colors"
                        >
                          Public link ↗
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleTogglePublic(col)}
                      title={col.is_public ? 'Make private' : 'Make public'}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${
                        col.is_public
                          ? 'border-violet-700 text-violet-400 hover:bg-violet-900/30'
                          : 'border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {col.is_public ? '🔗 Public' : '🔒 Private'}
                    </button>

                    <button
                      onClick={() => handleDelete(col.id)}
                      title={deletingId === col.id ? 'Click again to confirm delete' : 'Delete collection'}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${
                        deletingId === col.id
                          ? 'border-red-700 text-red-400 hover:bg-red-900/30'
                          : 'border-gray-700 text-gray-600 hover:border-red-700 hover:text-red-400'
                      }`}
                    >
                      {deletingId === col.id ? 'Confirm?' : 'Delete'}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Free tier note */}
        {collections.length >= 3 && (
          <p className="text-gray-600 text-xs text-center">
            Free plan: up to 3 collections.{' '}
            <a href="/pricing" className="text-violet-500 hover:text-violet-400 transition-colors">
              Upgrade to Pro
            </a>{' '}
            for unlimited.
          </p>
        )}
      </main>
    </div>
  );
}
