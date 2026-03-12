'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Paper } from '../../../lib/arxiv-db';

const TRACK_COLORS: Record<string, string> = {
  'cs.AI': 'bg-blue-900/60 text-blue-200',
  'cs.LG': 'bg-purple-900/60 text-purple-200',
  'cs.CL': 'bg-green-900/60 text-green-200',
  'cs.CV': 'bg-orange-900/60 text-orange-200',
  'stat.ML': 'bg-pink-900/60 text-pink-200',
  default: 'bg-gray-800 text-gray-300',
};

const FEEDBACK_ACTIONS = [
  { action: 'love', icon: '❤️', label: 'Love' },
  { action: 'save', icon: '📌', label: 'Save' },
  { action: 'read', icon: '📖', label: 'Read' },
  { action: 'meh', icon: '😐', label: 'Meh' },
  { action: 'skip', icon: '⏭️', label: 'Skip' },
];

const EXPLANATION_LEVELS = [
  { key: 'tldr', label: 'TL;DR' },
  { key: 'medium', label: 'Medium' },
  { key: 'deep', label: 'Deep' },
  { key: 'eli14', label: 'ELI14' },
  { key: 'undergrad', label: 'Undergrad' },
  { key: 'engineer', label: 'ML Engineer' },
];

const STARTER_QUESTIONS = [
  'What problem does this solve?',
  'How does the method work?',
  'What are the key results?',
  'What are the limitations?',
  'How does this compare to GPT-4?',
];

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function formatDate(value: string | null): string {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function parseAuthors(authorsJson: string | null): string {
  if (!authorsJson) return 'Unknown authors';
  try {
    const parsed = JSON.parse(authorsJson);
    if (Array.isArray(parsed)) {
      return parsed.join(', ');
    }
  } catch {
    return authorsJson;
  }
  return authorsJson;
}

// ── Chat Panel ─────────────────────────────────────────────────────────────────

function ChatPanel({ arxivId }: { arxivId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [isPro, setIsPro] = useState<boolean | null>(null); // null = loading
  const [proCheckError, setProCheckError] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Check Pro status on mount by attempting a GET on chat history
  useEffect(() => {
    let mounted = true;
    async function checkPlan() {
      try {
        const res = await fetch(`/api/paper/${encodeURIComponent(arxivId)}/chat`);
        if (!mounted) return;
        if (res.status === 401) { setIsPro(false); return; } // not logged in → treat as free
        if (res.status === 403) { setIsPro(false); return; } // free plan
        if (res.ok) {
          const data = await res.json();
          setIsPro(true);
          // Restore previous conversation if any
          if (data.messages?.length) {
            setMessages(data.messages.map((m: { role: string; content: string }) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            })));
          }
        } else {
          setProCheckError(true);
        }
      } catch {
        if (mounted) setProCheckError(true);
      }
    }
    checkPlan();
    return () => { mounted = false; };
  }, [arxivId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(question?: string) {
    const text = (question ?? input).trim();
    if (!text || streaming) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setStreaming(true);

    // Optimistic empty assistant turn
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch(`/api/paper/${encodeURIComponent(arxivId)}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (res.status === 403) {
        setIsPro(false);
        setMessages((prev) => prev.slice(0, -1)); // remove optimistic assistant turn
        return;
      }

      if (!res.ok || !res.body) {
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: 'assistant', content: 'Something went wrong. Please try again.' },
        ]);
        return;
      }

      // Stream SSE response
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const json = JSON.parse(trimmed.slice(6));
            if (typeof json.delta === 'string') {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role !== 'assistant') return prev;
                return [...prev.slice(0, -1), { role: 'assistant', content: last.content + json.delta }];
              });
            }
          } catch {
            // Malformed — skip
          }
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: 'Network error. Please try again.' },
      ]);
    } finally {
      setStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // ── Locked UI (free plan) ────────────────────────────────────────────────────
  if (isPro === false) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center space-y-3">
        <div className="text-3xl">💬</div>
        <h3 className="text-base font-semibold text-gray-100">Paper Chat</h3>
        <p className="text-sm text-gray-400 leading-relaxed max-w-xs mx-auto">
          Ask anything about this paper — methods, results, equations, comparisons.
          Conversational AI that knows the paper inside out.
        </p>
        <div className="flex flex-col gap-2 text-xs text-gray-600 items-center">
          {STARTER_QUESTIONS.slice(0, 3).map((q) => (
            <span key={q} className="px-3 py-1.5 rounded-lg bg-gray-800/60 text-gray-500 italic">"{q}"</span>
          ))}
        </div>
        <a
          href="/pricing"
          className="inline-block mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Upgrade to Pro — $12/mo
        </a>
      </div>
    );
  }

  // ── Loading state ────────────────────────────────────────────────────────────
  if (isPro === null && !proCheckError) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex items-center justify-center h-24">
        <span className="text-gray-600 text-sm animate-pulse">Loading chat…</span>
      </div>
    );
  }

  // ── Active chat UI ───────────────────────────────────────────────────────────
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-100">💬 Paper Chat</span>
        <span className="text-xs px-2 py-0.5 bg-blue-900/50 text-blue-300 rounded-full font-medium">Pro</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto max-h-96 p-4 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Ask anything about this paper:</p>
            <div className="flex flex-col gap-1.5">
              {STARTER_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  disabled={streaming}
                  className="text-left text-xs text-gray-400 hover:text-gray-200 px-3 py-2 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] text-sm rounded-xl px-4 py-2.5 leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-blue-900/50 text-blue-100'
                  : 'bg-gray-800 text-gray-200'
              }`}
            >
              {msg.content || (streaming && i === messages.length - 1 ? (
                <span className="inline-flex gap-1">
                  <span className="animate-bounce delay-0">·</span>
                  <span className="animate-bounce delay-100">·</span>
                  <span className="animate-bounce delay-200">·</span>
                </span>
              ) : '')}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-800 p-3 flex gap-2 items-end">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={streaming}
          placeholder="Ask about this paper… (Enter to send)"
          rows={2}
          maxLength={1000}
          className="flex-1 bg-gray-800 text-gray-100 placeholder-gray-600 text-sm rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-700 disabled:opacity-50"
        />
        <button
          onClick={() => sendMessage()}
          disabled={!input.trim() || streaming}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded-lg transition-colors"
          aria-label="Send message"
        >
          {streaming ? '…' : '↑'}
        </button>
      </div>

      {messages.length > 0 && (
        <div className="px-4 pb-2 text-xs text-gray-600">
          {messages.filter((m) => m.role === 'user').length} / 10 messages used
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PaperDetailClient({ paper }: { paper: Paper }) {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loadingLevel, setLoadingLevel] = useState<string | null>(null);
  const [activeLevel, setActiveLevel] = useState<string | null>(null);
  const [feedbackGiven, setFeedbackGiven] = useState<string | null>(null);
  const [isInReadingList, setIsInReadingList] = useState(false);
  const [isReadingListLoading, setIsReadingListLoading] = useState(false);

  const stars = useMemo(() => {
    const score = paper.llm_score ?? 0;
    const rounded = Math.min(5, Math.max(0, Math.round(score)));
    return '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
  }, [paper.llm_score]);

  const trackColor = TRACK_COLORS[paper.track || ''] || TRACK_COLORS.default;

  useEffect(() => {
    let mounted = true;
    async function loadReadingListState() {
      try {
        const res = await fetch('/api/reading-list');
        const data = await res.json();
        const exists = Boolean(
          data?.items?.some?.((item: { arxiv_id: string }) => item.arxiv_id === paper.arxiv_id)
        );
        if (mounted) setIsInReadingList(exists);
      } catch {
        if (mounted) setIsInReadingList(false);
      }
    }
    loadReadingListState();
    return () => {
      mounted = false;
    };
  }, [paper.arxiv_id]);

  async function loadExplanation(level: string) {
    if (activeLevel === level) {
      setActiveLevel(null);
      setExplanation(null);
      return;
    }

    setLoadingLevel(level);
    setActiveLevel(level);

    try {
      const res = await fetch(`/api/paper/${encodeURIComponent(paper.arxiv_id)}/explain?level=${level}`);
      const data = await res.json();
      setExplanation(data.content || 'Explanation unavailable.');
    } catch {
      setExplanation('Failed to load explanation.');
    }

    setLoadingLevel(null);
  }

  async function sendFeedback(action: string) {
    setFeedbackGiven(action);
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arxivId: paper.arxiv_id, action }),
      });
    } catch {
      // Optimistic UI only.
    }
  }

  async function toggleReadingList() {
    setIsReadingListLoading(true);

    try {
      if (isInReadingList) {
        await fetch(`/api/reading-list?arxivId=${encodeURIComponent(paper.arxiv_id)}`, {
          method: 'DELETE',
        });
        setIsInReadingList(false);
      } else {
        await fetch('/api/reading-list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ arxivId: paper.arxiv_id, status: 'unread' }),
        });
        setIsInReadingList(true);
      }
    } catch {
      // Keep state unchanged on failure.
    }

    setIsReadingListLoading(false);
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <nav className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <a href="/digest" className="text-lg font-bold text-gray-100">📄 PaperBrief</a>
          <div className="flex gap-4 text-sm">
            <a href="/digest" className="text-gray-500 hover:text-gray-300 transition-colors">Digest</a>
            <a href="/search" className="text-gray-100 font-medium">Search</a>
            <a href="/recommend" className="text-gray-500 hover:text-gray-300 transition-colors">Recommend</a>
            <a href="/reading-list" className="text-gray-500 hover:text-gray-300 transition-colors">Reading List</a>
          </div>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <Link href="/search" className="inline-block text-sm text-blue-400 hover:text-blue-300 transition-colors">
          ← Back to Search
        </Link>

        <header className="space-y-3">
          <h1 className="text-2xl font-bold text-gray-100 leading-snug">{paper.title}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-yellow-400 text-sm font-mono">{stars}</span>
            {paper.track && (
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${trackColor}`}>
                {paper.track}
              </span>
            )}
            <span className="text-xs text-gray-500">{formatDate(paper.published_at)}</span>
            <a
              href={`https://arxiv.org/abs/${paper.arxiv_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              arxiv →
            </a>
          </div>
          <p className="text-sm text-gray-400">{parseAuthors(paper.authors)}</p>
        </header>

        <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-medium text-gray-200 mb-3">Abstract</h2>
          <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">
            {paper.abstract || 'No abstract available.'}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-100">Explain this paper</h2>
          <div className="flex gap-2 flex-wrap">
            {EXPLANATION_LEVELS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => loadExplanation(key)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-all duration-200 ${
                  activeLevel === key
                    ? 'bg-blue-900/40 border-blue-700 text-blue-200'
                    : 'border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                }`}
              >
                {loadingLevel === key ? '…' : label}
              </button>
            ))}
          </div>

          {explanation && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
              {explanation}
            </div>
          )}
        </section>

        {/* ── Paper Chat (Pro) ── */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-100">Ask this paper</h2>
          <ChatPanel arxivId={paper.arxiv_id} />
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-100">Rate this paper</h2>
          <div className="flex gap-1 flex-wrap">
            {FEEDBACK_ACTIONS.map(({ action, icon, label }) => (
              <button
                key={action}
                onClick={() => sendFeedback(action)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all duration-200 ${
                  feedbackGiven === action
                    ? 'bg-gray-800 text-gray-200'
                    : 'text-gray-500 hover:bg-gray-800/50 hover:text-gray-300'
                }`}
              >
                <span>{icon}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <button
            onClick={toggleReadingList}
            disabled={isReadingListLoading}
            className="rounded-lg border border-gray-700 hover:border-gray-600 px-4 py-2 text-sm text-gray-200 transition-colors disabled:opacity-60"
          >
            {isReadingListLoading
              ? 'Working...'
              : isInReadingList
                ? 'Remove from Reading List'
                : 'Add to Reading List'}
          </button>
        </section>
      </main>
    </div>
  );
}
