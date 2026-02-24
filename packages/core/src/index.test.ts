/**
 * Core package unit tests
 *
 * Tests cover: types/helpers, prefilter, digest assembly, rendering.
 * LLM scoring and arxiv fetch are integration concerns (no mocks needed for these unit tests).
 */

import { describe, it, expect } from 'vitest';
import {
  scoreLabel,
  formatAuthors,
  prefilterPapers,
  buildDigest,
  renderDigestText,
  renderDigestMarkdown,
} from './index.js';
import type { ArxivPaper, ScoredPaper } from './types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makePaper = (overrides: Partial<ArxivPaper> = {}): ArxivPaper => ({
  arxivId: '2502.12345',
  version: 'v1',
  title: 'Speculative Decoding via Draft Token Prediction',
  abstract:
    'We propose a new speculative decoding method using a lightweight draft model to predict tokens, reducing latency by 40% on LLM inference tasks.',
  authors: ['Alice Smith', 'Bob Jones', 'Carol Lee'],
  categories: ['cs.LG', 'cs.CL'],
  publishedAt: '2026-02-20T00:00:00Z',
  updatedAt: '2026-02-21T00:00:00Z',
  absUrl: 'https://arxiv.org/abs/2502.12345',
  pdfUrl: 'https://arxiv.org/pdf/2502.12345',
  ...overrides,
});

const makeScoredPaper = (score: number, overrides: Partial<ScoredPaper> = {}): ScoredPaper => ({
  paper: makePaper(),
  trackId: 'track-1',
  trackName: 'Speculative Decoding',
  score,
  reason: 'Directly addresses draft model speculation for LLM inference.',
  summary: 'A new speculative decoding approach using a draft model reduces LLM inference latency by 40%.',
  ...overrides,
});

// ─── scoreLabel ───────────────────────────────────────────────────────────────

describe('scoreLabel', () => {
  it('returns 🔥 Essential for score 5', () => {
    expect(scoreLabel(5)).toBe('🔥 Essential');
  });

  it('returns ⭐ Relevant for score 4', () => {
    expect(scoreLabel(4)).toBe('⭐ Relevant');
  });

  it('returns 📌 Worth a look for score 3', () => {
    expect(scoreLabel(3)).toBe('📌 Worth a look');
  });

  it('returns · Marginal for score 2', () => {
    expect(scoreLabel(2)).toBe('· Marginal');
  });

  it('returns · Marginal for score 0', () => {
    expect(scoreLabel(0)).toBe('· Marginal');
  });
});

// ─── formatAuthors ────────────────────────────────────────────────────────────

describe('formatAuthors', () => {
  it('returns Unknown for empty list', () => {
    expect(formatAuthors([])).toBe('Unknown');
  });

  it('returns single author as-is', () => {
    expect(formatAuthors(['Alice Smith'])).toBe('Alice Smith');
  });

  it('returns two authors comma-separated', () => {
    expect(formatAuthors(['Alice', 'Bob'])).toBe('Alice, Bob');
  });

  it('returns three authors comma-separated', () => {
    expect(formatAuthors(['Alice', 'Bob', 'Carol'])).toBe('Alice, Bob, Carol');
  });

  it('uses et al. for 4+ authors', () => {
    expect(formatAuthors(['Alice', 'Bob', 'Carol', 'Dave'])).toBe('Alice et al.');
  });
});

// ─── prefilterPapers ──────────────────────────────────────────────────────────

describe('prefilterPapers', () => {
  const papers = [
    makePaper({
      arxivId: '2502.00001',
      title: 'Speculative Decoding via Draft Models',
      abstract: 'We introduce a draft model approach for fast inference.',
    }),
    makePaper({
      arxivId: '2502.00002',
      title: 'Protein Folding with Deep Learning',
      abstract: 'A new approach to structure prediction using transformers.',
    }),
    makePaper({
      arxivId: '2502.00003',
      title: 'LoRA Fine-Tuning for LLMs',
      abstract: 'Low-rank adaptation enables efficient model training.',
    }),
  ];

  it('returns all papers with empty keyword list', () => {
    expect(prefilterPapers(papers, [])).toHaveLength(3);
  });

  it('filters to papers matching a keyword (title match)', () => {
    const result = prefilterPapers(papers, ['speculative decoding']);
    expect(result).toHaveLength(1);
    expect(result[0].arxivId).toBe('2502.00001');
  });

  it('filters to papers matching a keyword (abstract match)', () => {
    const result = prefilterPapers(papers, ['low-rank']);
    expect(result).toHaveLength(1);
    expect(result[0].arxivId).toBe('2502.00003');
  });

  it('returns multiple matches when multiple papers match', () => {
    const result = prefilterPapers(papers, ['transformers', 'draft model']);
    expect(result).toHaveLength(2);
  });

  it('is case-insensitive', () => {
    const result = prefilterPapers(papers, ['LORA']);
    expect(result).toHaveLength(1);
  });

  it('returns empty when no papers match', () => {
    const result = prefilterPapers(papers, ['quantum computing']);
    expect(result).toHaveLength(0);
  });
});

// ─── buildDigest ──────────────────────────────────────────────────────────────

describe('buildDigest', () => {
  it('builds a digest with correct metadata', () => {
    const scored = [
      makeScoredPaper(5),
      makeScoredPaper(4, { paper: makePaper({ arxivId: '2502.99999' }) }),
    ];
    const digest = buildDigest(scored, {
      userId: 'user-1',
      weekOf: '2026-02-23',
    });
    expect(digest.userId).toBe('user-1');
    expect(digest.weekOf).toBe('2026-02-23');
    expect(digest.entries).toHaveLength(2);
    expect(digest.totalPapersScanned).toBe(2);
    expect(digest.totalPapersIncluded).toBe(2);
  });

  it('respects maxEntries option', () => {
    const scored = Array.from({ length: 10 }, (_, i) =>
      makeScoredPaper(5, { paper: makePaper({ arxivId: `2502.0000${i}` }) }),
    );
    const digest = buildDigest(scored, {
      userId: 'user-1',
      weekOf: '2026-02-23',
      maxEntries: 3,
    });
    expect(digest.entries).toHaveLength(3);
  });

  it('respects maxPerTrack option', () => {
    const scored = Array.from({ length: 6 }, (_, i) =>
      makeScoredPaper(5, { paper: makePaper({ arxivId: `2502.0000${i}` }) }),
    );
    const digest = buildDigest(scored, {
      userId: 'user-1',
      weekOf: '2026-02-23',
      maxEntries: 10,
      maxPerTrack: 3,
    });
    expect(digest.entries).toHaveLength(3);
  });

  it('includes correct track names', () => {
    const scored = [makeScoredPaper(5)];
    const digest = buildDigest(scored, { userId: 'u', weekOf: '2026-02-23' });
    expect(digest.tracksIncluded).toContain('track-1');
  });

  it('handles empty scored papers list', () => {
    const digest = buildDigest([], { userId: 'u', weekOf: '2026-02-23' });
    expect(digest.entries).toHaveLength(0);
    expect(digest.totalPapersIncluded).toBe(0);
  });
});

// ─── renderDigestText ─────────────────────────────────────────────────────────

describe('renderDigestText', () => {
  const singleEntry = buildDigest([makeScoredPaper(5)], {
    userId: 'u',
    weekOf: '2026-02-23',
  });

  it('includes the week of header', () => {
    const text = renderDigestText(singleEntry);
    expect(text).toContain('Week of 2026-02-23');
  });

  it('includes the paper title', () => {
    const text = renderDigestText(singleEntry);
    expect(text).toContain('Speculative Decoding via Draft Token Prediction');
  });

  it('includes the arxiv ID', () => {
    const text = renderDigestText(singleEntry);
    expect(text).toContain('arxiv:2502.12345');
  });

  it('includes the score label', () => {
    const text = renderDigestText(singleEntry);
    expect(text).toContain('🔥 Essential');
  });

  it('includes the arxiv link', () => {
    const text = renderDigestText(singleEntry);
    expect(text).toContain('https://arxiv.org/abs/2502.12345');
  });

  it('includes a manage tracks link', () => {
    const text = renderDigestText(singleEntry);
    expect(text).toContain('paperbrief.io/dashboard');
  });
});

// ─── renderDigestMarkdown ─────────────────────────────────────────────────────

describe('renderDigestMarkdown', () => {
  const digest = buildDigest(
    [
      makeScoredPaper(5),
      makeScoredPaper(3, {
        paper: makePaper({ arxivId: '2502.99998', title: 'Another Paper on LoRA' }),
        trackName: 'Fine-Tuning',
        trackId: 'track-2',
      }),
    ],
    { userId: 'u', weekOf: '2026-02-23' },
  );

  it('renders track names in bold', () => {
    const md = renderDigestMarkdown(digest);
    expect(md).toContain('**Speculative Decoding**');
    expect(md).toContain('**Fine-Tuning**');
  });

  it('renders paper titles as markdown links', () => {
    const md = renderDigestMarkdown(digest);
    expect(md).toContain('[Speculative Decoding via Draft Token Prediction]');
    expect(md).toContain('(https://arxiv.org/abs/2502.12345)');
  });

  it('includes score labels', () => {
    const md = renderDigestMarkdown(digest);
    expect(md).toContain('🔥 Essential');
    expect(md).toContain('📌 Worth a look');
  });
});
