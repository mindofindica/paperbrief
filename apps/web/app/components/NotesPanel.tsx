'use client';

import { useState, useEffect, useCallback } from 'react';

export interface Note {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface NotesPanelProps {
  arxivId: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function NotesPanel({ arxivId }: NotesPanelProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/notes?arxivId=${encodeURIComponent(arxivId)}`);
      if (!res.ok) throw new Error('Failed to load notes');
      const data = await res.json();
      setNotes(data.notes ?? []);
    } catch (err) {
      console.error(err);
      setError('Could not load notes.');
    } finally {
      setLoading(false);
    }
  }, [arxivId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  async function handleAdd() {
    if (!newContent.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arxivId, content: newContent.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to save note');
      }
      const data = await res.json();
      setNotes(prev => [data.note, ...prev]);
      setNewContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(note: Note) {
    setEditingId(note.id);
    setEditContent(note.content);
  }

  async function handleEdit(id: string) {
    if (!editContent.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to update note');
      }
      const data = await res.json();
      setNotes(prev => prev.map(n => (n.id === id ? data.note : n)));
      setEditingId(null);
      setEditContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update note');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to delete note');
      }
      setNotes(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete note');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mt-10 border-t border-gray-200 pt-8">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">📝 My Notes</h2>

      {/* New note composer */}
      <div className="mb-6">
        <textarea
          value={newContent}
          onChange={e => setNewContent(e.target.value)}
          placeholder="Jot down your thoughts, key quotes, or follow-up questions…"
          rows={4}
          maxLength={10000}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-vertical"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-gray-400">{newContent.length}/10000</span>
          <button
            onClick={handleAdd}
            disabled={saving || !newContent.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving…' : 'Add Note'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Notes list */}
      {loading ? (
        <div className="text-sm text-gray-400 italic">Loading notes…</div>
      ) : notes.length === 0 ? (
        <div className="text-sm text-gray-400 italic">No notes yet. Add your first one above.</div>
      ) : (
        <ul className="space-y-4">
          {notes.map(note => (
            <li key={note.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              {editingId === note.id ? (
                <>
                  <textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    rows={4}
                    maxLength={10000}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-vertical mb-2"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(note.id)}
                      disabled={saving}
                      className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => { setEditingId(null); setEditContent(''); }}
                      className="px-3 py-1.5 text-gray-600 text-xs font-medium rounded border border-gray-300 hover:bg-gray-100 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{note.content}</p>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-gray-400">
                      {formatDate(note.updated_at !== note.created_at ? note.updated_at : note.created_at)}
                      {note.updated_at !== note.created_at && ' (edited)'}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEdit(note)}
                        className="text-xs text-gray-500 hover:text-gray-800 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(note.id)}
                        disabled={deletingId === note.id}
                        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
                      >
                        {deletingId === note.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
