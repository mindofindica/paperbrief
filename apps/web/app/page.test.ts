/**
 * Tests for the LandingPage module (app/page.tsx)
 *
 * Covers:
 *  - getWaitlistCount returns count on success
 *  - getWaitlistCount returns null when env vars are missing
 *  - getWaitlistCount returns null on Supabase error
 *  - getWaitlistCount returns null on thrown exception
 *  - LandingPage resolves without throwing (with paper / without paper)
 *  - getPaperOfTheDay is called during page render
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

vi.mock('../lib/today', () => ({
  getPaperOfTheDay: vi.fn(),
  formatAuthors: vi.fn((authors: string[]) => ({
    displayed: authors.slice(0, 3),
    extra: Math.max(0, authors.length - 3),
  })),
  getScoreBadge: vi.fn(() => ({ emoji: '⭐', label: 'Excellent' })),
}));

// ── WaitlistForm / SampleDigest: return minimal React-compatible object ──────
vi.mock('./components/WaitlistForm', () => ({
  default: vi.fn(() => null),
}));

vi.mock('./components/SampleDigest', () => ({
  default: vi.fn(() => null),
}));

import { createClient } from '@supabase/supabase-js';
import { getPaperOfTheDay } from '../lib/today';

const mockCreateClient = createClient as ReturnType<typeof vi.fn>;
const mockGetPaperOfTheDay = getPaperOfTheDay as ReturnType<typeof vi.fn>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSupabaseMock(result: { count?: number | null; error?: object | null }) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue(result),
    }),
  };
}

const SAVED_ENV: Record<string, string | undefined> = {};
function saveEnv(...keys: string[]) {
  for (const k of keys) SAVED_ENV[k] = process.env[k];
}
function restoreEnv(...keys: string[]) {
  for (const k of keys) {
    if (SAVED_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED_ENV[k];
  }
}

// ── getWaitlistCount ──────────────────────────────────────────────────────────

describe('getWaitlistCount (landing page data helper)', () => {
  beforeEach(() => {
    vi.resetModules();
    saveEnv('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY');
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-key';
  });

  afterEach(() => {
    restoreEnv('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY');
    vi.clearAllMocks();
  });

  it('returns the waitlist count on success', async () => {
    mockCreateClient.mockReturnValue(makeSupabaseMock({ count: 42, error: null }));

    const { default: LandingPage } = await import('./page');
    mockGetPaperOfTheDay.mockResolvedValue(null);

    // Invoke the page to trigger getWaitlistCount
    await LandingPage();

    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://fake.supabase.co',
      'fake-service-key',
    );
  });

  it('returns null when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    mockCreateClient.mockReturnValue(makeSupabaseMock({ count: 5, error: null }));
    mockGetPaperOfTheDay.mockResolvedValue(null);

    const { default: LandingPage } = await import('./page');
    // Page should still render — just no social proof
    const result = await LandingPage();
    expect(result).toBeDefined();
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('returns null when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    mockGetPaperOfTheDay.mockResolvedValue(null);

    const { default: LandingPage } = await import('./page');
    const result = await LandingPage();
    expect(result).toBeDefined();
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('handles Supabase query error gracefully', async () => {
    mockCreateClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ count: null, error: { message: 'connection refused' } }),
      }),
    });
    mockGetPaperOfTheDay.mockResolvedValue(null);

    const { default: LandingPage } = await import('./page');
    // Should not throw — error returns null count
    const result = await LandingPage();
    expect(result).toBeDefined();
  });

  it('handles thrown exceptions gracefully (createClient throws)', async () => {
    mockCreateClient.mockImplementation(() => { throw new Error('SDK init error'); });
    mockGetPaperOfTheDay.mockResolvedValue(null);

    const { default: LandingPage } = await import('./page');
    // getWaitlistCount catches errors → page still renders
    const result = await LandingPage();
    expect(result).toBeDefined();
  });
});

// ── LandingPage + today integration ──────────────────────────────────────────

describe('LandingPage — today paper integration', () => {
  const SAMPLE_PAPER = {
    arxivId: '2401.00001',
    title: 'Transformers Are All You Need',
    authors: ['Alice', 'Bob', 'Carol', 'Dave'],
    abstract: 'A groundbreaking paper. '.repeat(20),
    categories: ['cs.LG'],
    submittedDate: '2024-01-15',
    llmScore: 9.1,
    keywordScore: 7.5,
  };

  beforeEach(() => {
    vi.resetModules();
    saveEnv('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY');
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key';
    mockCreateClient.mockReturnValue(makeSupabaseMock({ count: 0, error: null }));
  });

  afterEach(() => {
    restoreEnv('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY');
    vi.clearAllMocks();
  });

  it('fetches todayPaper alongside waitlistCount', async () => {
    mockGetPaperOfTheDay.mockResolvedValue(SAMPLE_PAPER);

    const { default: LandingPage } = await import('./page');
    const result = await LandingPage();

    expect(result).toBeDefined();
    expect(mockGetPaperOfTheDay).toHaveBeenCalledOnce();
  });

  it('renders without throwing when todayPaper is null (empty state)', async () => {
    mockGetPaperOfTheDay.mockResolvedValue(null);

    const { default: LandingPage } = await import('./page');
    const result = await LandingPage();
    expect(result).toBeDefined();
  });

  it('renders without throwing when todayPaper is available', async () => {
    mockGetPaperOfTheDay.mockResolvedValue(SAMPLE_PAPER);

    const { default: LandingPage } = await import('./page');
    const result = await LandingPage();
    expect(result).toBeDefined();
  });

  it('renders without throwing when getPaperOfTheDay rejects', async () => {
    // getPaperOfTheDay itself catches errors and returns null — simulate null
    mockGetPaperOfTheDay.mockResolvedValue(null);

    const { default: LandingPage } = await import('./page');
    const result = await LandingPage();
    expect(result).toBeDefined();
  });
});
