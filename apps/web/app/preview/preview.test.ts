/**
 * Unit tests for the /preview page logic.
 *
 * We test the data-shaping layer — the grouping, stat computation, and
 * URL-building logic that the PreviewClient relies on — without mounting React
 * (that would require jsdom + testing-library, which this repo wires via
 * the full vitest/browser config).  These unit tests can run in the fast
 * Node environment.
 */

import { describe, it, expect } from 'vitest';

// ─── Helpers copied / adapted from PreviewClient ──────────────────────────────

interface DigestEntry {
  arxivId: string;
  title: string;
  authors: string;
  score: number;
  scoreLabel: string;
  summary: string;
  reason: string;
  absUrl: string;
  trackName: string;
}

/** Group entries by trackName, preserving insertion order. */
function groupByTrack(entries: DigestEntry[]): Record<string, DigestEntry[]> {
  const result: Record<string, DigestEntry[]> = {};
  for (const entry of entries) {
    if (!result[entry.trackName]) result[entry.trackName] = [];
    result[entry.trackName].push(entry);
  }
  return result;
}

/** Build preview API URL with optional track filter. */
function buildPreviewUrl(origin: string, trackFilter: string): string {
  const url = new URL('/api/digest/preview', origin);
  url.searchParams.set('maxEntries', '20');
  if (trackFilter.trim()) {
    url.searchParams.set('track', trackFilter.trim());
  }
  return url.toString();
}

/** Format duration ms → human-readable seconds string. */
function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Determine whether a response has no usable digest. */
function isEmpty(digest: { entries: DigestEntry[] } | null): boolean {
  return !digest || digest.entries.length === 0;
}

// ─── fixtures ─────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<DigestEntry> = {}): DigestEntry {
  return {
    arxivId: '2501.00001',
    title: 'Test Paper',
    authors: 'Alice, Bob',
    score: 4,
    scoreLabel: '⭐ Highly Relevant',
    summary: 'A brief summary.',
    reason: 'Strong keyword match.',
    absUrl: 'https://arxiv.org/abs/2501.00001',
    trackName: 'LLM Efficiency',
    ...overrides,
  };
}

// ─── groupByTrack ─────────────────────────────────────────────────────────────

describe('groupByTrack', () => {
  it('returns empty object for empty entries', () => {
    expect(groupByTrack([])).toEqual({});
  });

  it('groups single entry under its track', () => {
    const entry = makeEntry({ trackName: 'Speculative Decoding' });
    const result = groupByTrack([entry]);
    expect(Object.keys(result)).toEqual(['Speculative Decoding']);
    expect(result['Speculative Decoding']).toHaveLength(1);
  });

  it('groups multiple entries under the same track', () => {
    const entries = [
      makeEntry({ arxivId: 'a', trackName: 'Track A' }),
      makeEntry({ arxivId: 'b', trackName: 'Track A' }),
    ];
    const result = groupByTrack(entries);
    expect(result['Track A']).toHaveLength(2);
  });

  it('splits entries across multiple tracks', () => {
    const entries = [
      makeEntry({ arxivId: 'a', trackName: 'Track A' }),
      makeEntry({ arxivId: 'b', trackName: 'Track B' }),
      makeEntry({ arxivId: 'c', trackName: 'Track A' }),
    ];
    const result = groupByTrack(entries);
    expect(Object.keys(result)).toContain('Track A');
    expect(Object.keys(result)).toContain('Track B');
    expect(result['Track A']).toHaveLength(2);
    expect(result['Track B']).toHaveLength(1);
  });

  it('preserves insertion order within each track', () => {
    const entries = [
      makeEntry({ arxivId: 'first', trackName: 'X' }),
      makeEntry({ arxivId: 'second', trackName: 'X' }),
    ];
    const result = groupByTrack(entries);
    expect(result['X'][0].arxivId).toBe('first');
    expect(result['X'][1].arxivId).toBe('second');
  });
});

// ─── buildPreviewUrl ──────────────────────────────────────────────────────────

describe('buildPreviewUrl', () => {
  const ORIGIN = 'https://paperbrief.app';

  it('always includes maxEntries=20', () => {
    const url = buildPreviewUrl(ORIGIN, '');
    expect(url).toContain('maxEntries=20');
  });

  it('does not include track param when filter is empty', () => {
    const url = buildPreviewUrl(ORIGIN, '');
    expect(url).not.toContain('track=');
  });

  it('does not include track param when filter is whitespace-only', () => {
    const url = buildPreviewUrl(ORIGIN, '   ');
    expect(url).not.toContain('track=');
  });

  it('includes trimmed track param when filter is provided', () => {
    const url = buildPreviewUrl(ORIGIN, '  speculative decoding  ');
    expect(url).toContain('track=speculative+decoding');
  });

  it('points to the correct endpoint', () => {
    const url = buildPreviewUrl(ORIGIN, '');
    expect(url).toMatch(/\/api\/digest\/preview/);
  });
});

// ─── formatDuration ───────────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('formats 0 ms', () => {
    expect(formatDuration(0)).toBe('0.0s');
  });

  it('formats 1000 ms as 1.0s', () => {
    expect(formatDuration(1000)).toBe('1.0s');
  });

  it('formats 1500 ms as 1.5s', () => {
    expect(formatDuration(1500)).toBe('1.5s');
  });

  it('rounds to one decimal place', () => {
    expect(formatDuration(2345)).toBe('2.3s');
  });

  it('formats large value (60 s)', () => {
    expect(formatDuration(60000)).toBe('60.0s');
  });
});

// ─── isEmpty ─────────────────────────────────────────────────────────────────

describe('isEmpty', () => {
  it('returns true for null digest', () => {
    expect(isEmpty(null)).toBe(true);
  });

  it('returns true for digest with no entries', () => {
    expect(isEmpty({ entries: [] })).toBe(true);
  });

  it('returns false for digest with one entry', () => {
    expect(isEmpty({ entries: [makeEntry()] })).toBe(false);
  });
});

// ─── Score badge style map ────────────────────────────────────────────────────

const SCORE_STYLES: Record<number, string> = {
  5: 'bg-red-900/60 text-red-300 border border-red-800',
  4: 'bg-orange-900/60 text-orange-300 border border-orange-800',
  3: 'bg-yellow-900/60 text-yellow-300 border border-yellow-800',
  2: 'bg-gray-800 text-gray-400 border border-gray-700',
  1: 'bg-gray-900 text-gray-500 border border-gray-800',
};

describe('SCORE_STYLES', () => {
  it('has an entry for scores 1–5', () => {
    for (const score of [1, 2, 3, 4, 5]) {
      expect(SCORE_STYLES[score]).toBeTruthy();
    }
  });

  it('score 5 uses red styling (highest importance)', () => {
    expect(SCORE_STYLES[5]).toContain('red');
  });

  it('score 1 uses gray styling (lowest importance)', () => {
    expect(SCORE_STYLES[1]).toContain('gray');
  });

  it('scores decrease in intensity from 5 to 1', () => {
    // Structural check: 5 → red, 4 → orange, 3 → yellow, 2 & 1 → gray
    expect(SCORE_STYLES[5]).toContain('red');
    expect(SCORE_STYLES[4]).toContain('orange');
    expect(SCORE_STYLES[3]).toContain('yellow');
    expect(SCORE_STYLES[2]).toContain('gray');
    expect(SCORE_STYLES[1]).toContain('gray');
  });
});
