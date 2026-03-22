/**
 * Tests for OG image helpers — topic + trending pages.
 *
 * We can't easily render ImageResponse in unit tests, so we:
 *  1. Export and test the pure helper functions directly
 *  2. Verify the default export returns an ImageResponse for all known slugs
 *  3. Verify fallback ImageResponse for unknown slugs
 *  4. Verify trending OG image helper (formatDate)
 *
 * We mock the topics.ts module for controlled data and @supabase/supabase-js
 * for the trending fetch, matching the pattern established in topics.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock next/og before importing image components ───────────────────────────

vi.mock('next/og', () => ({
  ImageResponse: class MockImageResponse {
    body: unknown;
    options: unknown;
    constructor(body: unknown, options?: unknown) {
      this.body = body;
      this.options = options;
    }
  },
}));

// ── Mock topics module ────────────────────────────────────────────────────────

const MOCK_TOPICS = [
  {
    slug: 'llm-agents',
    name: 'LLM Agents',
    emoji: '🤖',
    description: 'Autonomous agents powered by large language models.',
    arxivCats: ['cs.AI', 'cs.MA'],
    titleKeywords: ['agent', 'multi-agent'],
  },
  {
    slug: 'rag-retrieval',
    name: 'RAG & Retrieval',
    emoji: '🔍',
    description: 'Retrieval-augmented generation and neural information retrieval.',
    arxivCats: ['cs.IR', 'cs.CL'],
    titleKeywords: ['retrieval', 'rag'],
  },
];

const mockGetAllTopicsWithCounts = vi.fn();
const mockGetTopicBySlug = vi.fn((slug: string) =>
  MOCK_TOPICS.find((t) => t.slug === slug),
);

vi.mock('../topics', () => ({
  getTopicBySlug: (slug: string) => mockGetTopicBySlug(slug),
  getAllTopicsWithCounts: (...args: unknown[]) => mockGetAllTopicsWithCounts(...args),
}));

// ── Mock @supabase/supabase-js for trending OG ────────────────────────────────

const mockRpc = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ rpc: mockRpc })),
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import {
  truncate,
  topicAccentColor,
  size as topicOgSize,
  contentType as topicOgContentType,
  runtime as topicOgRuntime,
} from '../../app/topics/[slug]/opengraph-image';
import {
  formatDate,
  size as trendingOgSize,
  contentType as trendingOgContentType,
  runtime as trendingOgRuntime,
} from '../../app/trending/opengraph-image';

// ── truncate ─────────────────────────────────────────────────────────────────

describe('truncate', () => {
  it('returns the string unchanged when within limit', () => {
    expect(truncate('hello world', 20)).toBe('hello world');
  });

  it('returns the string unchanged when exactly at limit', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('truncates and appends ellipsis when over limit', () => {
    const result = truncate('abcdefghij', 6);
    expect(result).toBe('abcde…');
    expect(result.length).toBe(6);
  });

  it('handles empty string', () => {
    expect(truncate('', 10)).toBe('');
  });

  it('handles limit of 1', () => {
    expect(truncate('abc', 1)).toBe('…');
  });

  it('handles multi-word sentence at boundary', () => {
    const long = 'The quick brown fox jumps over the lazy dog';
    const result = truncate(long, 20);
    expect(result.length).toBe(20);
    expect(result.endsWith('…')).toBe(true);
  });
});

// ── topicAccentColor ──────────────────────────────────────────────────────────

describe('topicAccentColor', () => {
  it('returns indigo for 🤖 (LLM Agents)', () => {
    expect(topicAccentColor('🤖')).toBe('#6366f1');
  });

  it('returns blue for 🔍 (RAG)', () => {
    expect(topicAccentColor('🔍')).toBe('#3b82f6');
  });

  it('returns violet for 🧠 (Reasoning)', () => {
    expect(topicAccentColor('🧠')).toBe('#8b5cf6');
  });

  it('returns amber for ⚙️ (Fine-tuning)', () => {
    expect(topicAccentColor('⚙️')).toBe('#f59e0b');
  });

  it('returns cyan for 👁️ (Vision)', () => {
    expect(topicAccentColor('👁️')).toBe('#06b6d4');
  });

  it('returns emerald for 💻 (Code)', () => {
    expect(topicAccentColor('💻')).toBe('#10b981');
  });

  it('returns red for 🛡️ (Alignment)', () => {
    expect(topicAccentColor('🛡️')).toBe('#ef4444');
  });

  it('returns orange for 📊 (Evaluation)', () => {
    expect(topicAccentColor('📊')).toBe('#f97316');
  });

  it('returns yellow for ⚡ (Efficient Inference)', () => {
    expect(topicAccentColor('⚡')).toBe('#eab308');
  });

  it('returns pink for 🎮 (RL)', () => {
    expect(topicAccentColor('🎮')).toBe('#ec4899');
  });

  it('returns purple for 🎨 (Diffusion)', () => {
    expect(topicAccentColor('🎨')).toBe('#a855f7');
  });

  it('returns default indigo for unmapped emoji', () => {
    expect(topicAccentColor('🦄')).toBe('#6366f1');
  });

  it('returns default indigo for empty string', () => {
    expect(topicAccentColor('')).toBe('#6366f1');
  });
});

// ── formatDate ────────────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('formats a known ISO date correctly', () => {
    // 2026-03-19 → "Mar 19, 2026"
    const result = formatDate('2026-03-19T00:00:00.000Z');
    expect(result).toContain('2026');
    expect(result).toContain('19');
    // Month abbreviation (locale-dependent but always 3 chars for en-US)
    expect(result.length).toBeGreaterThan(8);
  });

  it('returns a non-empty string for any valid ISO date', () => {
    expect(formatDate('2024-01-01T00:00:00Z').length).toBeGreaterThan(0);
    expect(formatDate('2023-12-31T23:59:59Z').length).toBeGreaterThan(0);
  });
});

// ── Topic OG image — default export (ImageResponse contract) ─────────────────

describe('topic opengraph-image default export', () => {
  beforeEach(() => {
    mockGetAllTopicsWithCounts.mockReset();
    mockGetTopicBySlug.mockClear();
  });

  it('returns an ImageResponse for a known topic slug', async () => {
    mockGetAllTopicsWithCounts.mockResolvedValue([
      { ...MOCK_TOPICS[0], count: 42 },
      { ...MOCK_TOPICS[1], count: 18 },
    ]);

    const { default: Image } = await import('../../app/topics/[slug]/opengraph-image');
    const result = await Image({ params: Promise.resolve({ slug: 'llm-agents' }) });

    // ImageResponse mock stores body + options
    expect(result).toBeDefined();
    expect((result as any).options).toEqual({ width: 1200, height: 630 });
  });

  it('returns a fallback ImageResponse for an unknown slug', async () => {
    const { default: Image } = await import('../../app/topics/[slug]/opengraph-image');
    const result = await Image({ params: Promise.resolve({ slug: 'unknown-topic-xyz' }) });

    expect(result).toBeDefined();
    expect((result as any).options).toEqual({ width: 1200, height: 630 });
  });

  it('returns ImageResponse even when getAllTopicsWithCounts throws', async () => {
    mockGetAllTopicsWithCounts.mockRejectedValue(new Error('Supabase down'));

    const { default: Image } = await import('../../app/topics/[slug]/opengraph-image');
    const result = await Image({ params: Promise.resolve({ slug: 'llm-agents' }) });

    // Should not throw — paper count is non-fatal
    expect(result).toBeDefined();
    expect((result as any).options).toEqual({ width: 1200, height: 630 });
  });

  it('returns ImageResponse when getAllTopicsWithCounts returns empty array', async () => {
    mockGetAllTopicsWithCounts.mockResolvedValue([]);

    const { default: Image } = await import('../../app/topics/[slug]/opengraph-image');
    const result = await Image({ params: Promise.resolve({ slug: 'rag-retrieval' }) });

    expect(result).toBeDefined();
  });

  it('uses the correct size constants', () => {
    expect(topicOgSize).toEqual({ width: 1200, height: 630 });
    expect(topicOgContentType).toBe('image/png');
  });

  it('uses edge runtime', () => {
    expect(topicOgRuntime).toBe('edge');
  });
});

// ── Trending OG image — default export (ImageResponse contract) ───────────────

describe('trending opengraph-image default export', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  });

  it('returns an ImageResponse', async () => {
    mockRpc.mockResolvedValue({ data: new Array(15).fill({ arxiv_id: 'x' }), error: null });

    const { default: Image } = await import('../../app/trending/opengraph-image');
    const result = await Image();

    expect(result).toBeDefined();
    expect((result as any).options).toEqual({ width: 1200, height: 630 });
  });

  it('returns ImageResponse even when RPC call fails', async () => {
    mockRpc.mockRejectedValue(new Error('network error'));

    const { default: Image } = await import('../../app/trending/opengraph-image');
    const result = await Image();

    // Should not throw — count is non-fatal
    expect(result).toBeDefined();
    expect((result as any).options).toEqual({ width: 1200, height: 630 });
  });

  it('returns ImageResponse when env vars are missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const { default: Image } = await import('../../app/trending/opengraph-image');
    const result = await Image();

    expect(result).toBeDefined();
    expect((result as any).options).toEqual({ width: 1200, height: 630 });
  });

  it('returns ImageResponse when RPC returns null data', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const { default: Image } = await import('../../app/trending/opengraph-image');
    const result = await Image();

    expect(result).toBeDefined();
  });

  it('uses edge runtime', () => {
    expect(trendingOgRuntime).toBe('edge');
  });

  it('uses the correct size constants', () => {
    expect(trendingOgSize).toEqual({ width: 1200, height: 630 });
    expect(trendingOgContentType).toBe('image/png');
  });
});
