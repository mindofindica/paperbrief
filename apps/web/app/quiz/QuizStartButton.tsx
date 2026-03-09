'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function QuizStartButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/quiz/generate', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to generate quiz');
        return;
      }
      router.push(`/quiz/${data.id}`);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1">
      <button
        onClick={handleStart}
        disabled={loading}
        className="w-full py-3 px-6 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-colors"
      >
        {loading ? 'Generating quiz...' : '🧠 Start Quiz'}
      </button>
      {error && (
        <p className="mt-3 text-red-400 text-sm text-center">{error}</p>
      )}
    </div>
  );
}
