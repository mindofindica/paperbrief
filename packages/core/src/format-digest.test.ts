/**
 * format-digest.test.ts
 *
 * Unit tests for buildDigest, renderDigestText, renderDigestMarkdown,
 * and renderDigestHtml.
 */

import { describe, it, expect } from 'vitest';
import {
  buildDigest,
  renderDigestText,
  renderDigestMarkdown,
  renderDigestHtml,
} from './format-digest.js';
import type { ScoredPaper, Digest } from './types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeScored = (
  overrides: Partial<ScoredPaper> & { trackId?: string; trackName?: string } = {},
): ScoredPaper => ({
  paper: {
    arxivId: overrides.paper?.arxivId ?? '2502.10001',
    version: 'v1',
    title: overrides.paper?.title ?? 'Test Paper Title',
    abstract: 'An abstract about machine learning and neural networks.',
    authors: ['Alice Smith', 'Bob Jones'],
    categories: ['cs.LG'],
    publishedAt: '2026-02-24T00:00:00Z',
    updatedAt: '2026-02-24T00:00:00Z',
    absUrl: overrides.paper?.absUrl ?? 'https://arxiv.org/abs/2502.10001',
    pdfUrl: 'https://arxiv.org/pdf/2502.10001',
  },
  trackId: overrides.trackId ?? 'track-1',
  trackName: overrides.trackName ?? 'Deep Learning',
  score: overrides.score ?? 4,
  reason: overrides.reason ?? 'Highly relevant to the track keywords.',
  summary: overrides.summary ?? 'A concise 2-sentence summary of the paper.',
  ...overrides,
});

const WEEK = '2026-02-24';
const USER = 'user-abc';

// ─── buildDigest ─────────────────────────────────────────────────────────────

describe('buildDigest', () => {
  it('returns a Digest with correct metadata', () => {
    const scored = [makeScored(), makeScored({ paper: { arxivId: '2502.10002', absUrl: 'https://arxiv.org/abs/2502.10002', title: 'Paper 2', abstract: '', authors: [], categories: [], version: 'v1', publishedAt: '', updatedAt: '', pdfUrl: null }, trackId: 'track-1', trackName: 'Deep Learning', score: 3 })];
    const digest = buildDigest(scored, { userId: USER, weekOf: WEEK });
    expect(digest.userId).toBe(USER);
    expect(digest.weekOf).toBe(WEEK);
    expect(digest.totalPapersScanned).toBe(2);
    expect(digest.totalPapersIncluded).toBe(2);
    expect(digest.tracksIncluded).toContain('track-1');
    expect(digest.generatedAt).toBeTruthy();
  });

  it('sorts papers by score descending within each track', () => {
    const low = makeScored({ score: 2, paper: { arxivId: '2502.00001', absUrl: '', title: 'Low', abstract: '', authors: [], categories: [], version: 'v1', publishedAt: '', updatedAt: '', pdfUrl: null } });
    const high = makeScored({ score: 5, paper: { arxivId: '2502.00002', absUrl: '', title: 'High', abstract: '', authors: [], categories: [], version: 'v1', publishedAt: '', updatedAt: '', pdfUrl: null } });
    const mid = makeScored({ score: 3, paper: { arxivId: '2502.00003', absUrl: '', title: 'Mid', abstract: '', authors: [], categories: [], version: 'v1', publishedAt: '', updatedAt: '', pdfUrl: null } });
    const digest = buildDigest([low, high, mid], { userId: USER, weekOf: WEEK });
    const scores = digest.entries.map((e) => e.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('respects maxEntries', () => {
    const papers = Array.from({ length: 10 }, (_, i) =>
      makeScored({ paper: { arxivId: `2502.0${i}`, absUrl: '', title: `Paper ${i}`, abstract: '', authors: [], categories: [], version: 'v1', publishedAt: '', updatedAt: '', pdfUrl: null } }),
    );
    const digest = buildDigest(papers, { userId: USER, weekOf: WEEK, maxEntries: 3 });
    expect(digest.entries.length).toBeLessThanOrEqual(3);
  });

  it('respects maxPerTrack', () => {
    const papers = Array.from({ length: 8 }, (_, i) =>
      makeScored({ trackId: 'track-1', trackName: 'NLP', paper: { arxivId: `2502.0${i}`, absUrl: '', title: `Paper ${i}`, abstract: '', authors: [], categories: [], version: 'v1', publishedAt: '', updatedAt: '', pdfUrl: null } }),
    );
    const digest = buildDigest(papers, { userId: USER, weekOf: WEEK, maxPerTrack: 3 });
    expect(digest.entries.length).toBeLessThanOrEqual(3);
  });

  it('handles multiple tracks with round-robin interleaving', () => {
    const trackA = Array.from({ length: 3 }, (_, i) =>
      makeScored({ trackId: 'a', trackName: 'Track A', paper: { arxivId: `2502.a${i}`, absUrl: '', title: `A${i}`, abstract: '', authors: [], categories: [], version: 'v1', publishedAt: '', updatedAt: '', pdfUrl: null } }),
    );
    const trackB = Array.from({ length: 3 }, (_, i) =>
      makeScored({ trackId: 'b', trackName: 'Track B', paper: { arxivId: `2502.b${i}`, absUrl: '', title: `B${i}`, abstract: '', authors: [], categories: [], version: 'v1', publishedAt: '', updatedAt: '', pdfUrl: null } }),
    );
    const digest = buildDigest([...trackA, ...trackB], { userId: USER, weekOf: WEEK });
    const trackNames = digest.entries.map((e) => e.trackName);
    expect(new Set(trackNames).size).toBe(2);
    // Should alternate: A, B, A, B, ...
    expect(trackNames[0]).toBe('Track A');
    expect(trackNames[1]).toBe('Track B');
  });

  it('returns empty entries for empty input', () => {
    const digest = buildDigest([], { userId: USER, weekOf: WEEK });
    expect(digest.entries).toHaveLength(0);
    expect(digest.totalPapersIncluded).toBe(0);
  });

  it('includes tracksIncluded for all tracks in input', () => {
    const multi = [
      makeScored({ trackId: 'x', trackName: 'X' }),
      makeScored({ trackId: 'y', trackName: 'Y', paper: { arxivId: '9999.00001', absUrl: '', title: 'Y paper', abstract: '', authors: [], categories: [], version: 'v1', publishedAt: '', updatedAt: '', pdfUrl: null } }),
    ];
    const digest = buildDigest(multi, { userId: USER, weekOf: WEEK });
    expect(digest.tracksIncluded).toContain('x');
    expect(digest.tracksIncluded).toContain('y');
  });
});

// ─── renderDigestText ─────────────────────────────────────────────────────────

describe('renderDigestText', () => {
  const makeDigest = (): Digest =>
    buildDigest(
      [
        makeScored({ score: 5 }),
        makeScored({ trackId: 't2', trackName: 'NLP', score: 4, paper: { arxivId: '2502.99999', absUrl: 'https://arxiv.org/abs/2502.99999', title: 'NLP Paper', abstract: '', authors: ['Jane'], categories: [], version: 'v1', publishedAt: '', updatedAt: '', pdfUrl: null } }),
      ],
      { userId: USER, weekOf: WEEK },
    );

  it('contains the week header', () => {
    const text = renderDigestText(makeDigest());
    expect(text).toContain('Week of 2026-02-24');
  });

  it('contains both track names', () => {
    const text = renderDigestText(makeDigest());
    expect(text).toContain('DEEP LEARNING');
    expect(text).toContain('NLP');
  });

  it('contains paper titles', () => {
    const text = renderDigestText(makeDigest());
    expect(text).toContain('Test Paper Title');
    expect(text).toContain('NLP Paper');
  });

  it('contains arXiv IDs', () => {
    const text = renderDigestText(makeDigest());
    expect(text).toContain('2502.10001');
    expect(text).toContain('2502.99999');
  });

  it('contains manage link and unsubscribe link', () => {
    const text = renderDigestText(makeDigest());
    expect(text).toContain('https://paperbrief.io/dashboard');
    expect(text).toContain('https://paperbrief.io/unsubscribe');
  });

  it('contains score labels', () => {
    const text = renderDigestText(makeDigest());
    expect(text).toContain('🔥 Essential');
    expect(text).toContain('⭐ Relevant');
  });

  it('renders correctly for empty digest', () => {
    const digest = buildDigest([], { userId: USER, weekOf: WEEK });
    const text = renderDigestText(digest);
    expect(text).toContain('Week of 2026-02-24');
    expect(text).not.toContain('undefined');
  });

  it('includes papers scanned count', () => {
    const text = renderDigestText(makeDigest());
    expect(text).toMatch(/\d+ papers selected from \d+ scanned/);
  });
});

// ─── renderDigestMarkdown ─────────────────────────────────────────────────────

describe('renderDigestMarkdown', () => {
  const scored = [makeScored({ score: 4 })];

  it('uses bold for the week header', () => {
    const md = renderDigestMarkdown(buildDigest(scored, { userId: USER, weekOf: WEEK }));
    expect(md).toContain('**📄 PaperBrief — Week of 2026-02-24**');
  });

  it('formats title as a markdown link', () => {
    const md = renderDigestMarkdown(buildDigest(scored, { userId: USER, weekOf: WEEK }));
    expect(md).toContain('[Test Paper Title]');
    expect(md).toContain('https://arxiv.org/abs/2502.10001');
  });

  it('includes track name as bold heading', () => {
    const md = renderDigestMarkdown(buildDigest(scored, { userId: USER, weekOf: WEEK }));
    expect(md).toContain('**Deep Learning**');
  });
});

// ─── renderDigestHtml ─────────────────────────────────────────────────────────

describe('renderDigestHtml', () => {
  const makeDigest = (): Digest =>
    buildDigest(
      [
        makeScored({ score: 5 }),
        makeScored({ trackId: 'nlp', trackName: 'NLP', score: 3, paper: { arxivId: '2502.77777', absUrl: 'https://arxiv.org/abs/2502.77777', title: 'Attention Is All You Need Again', abstract: '', authors: ['Alice', 'Bob'], categories: ['cs.CL'], version: 'v2', publishedAt: '', updatedAt: '', pdfUrl: null } }),
      ],
      { userId: USER, weekOf: WEEK },
    );

  it('returns a valid HTML doctype string', () => {
    const html = renderDigestHtml(makeDigest());
    expect(html).toMatch(/^<!DOCTYPE html>/i);
  });

  it('contains week of header', () => {
    const html = renderDigestHtml(makeDigest());
    expect(html).toContain('2026-02-24');
  });

  it('contains both track section headings', () => {
    const html = renderDigestHtml(makeDigest());
    // Track names appear as-is in HTML; CSS handles text-transform:uppercase visually
    expect(html).toContain('Deep Learning');
    expect(html).toContain('NLP');
  });

  it('contains paper titles', () => {
    const html = renderDigestHtml(makeDigest());
    expect(html).toContain('Test Paper Title');
    expect(html).toContain('Attention Is All You Need Again');
  });

  it('contains arXiv links', () => {
    const html = renderDigestHtml(makeDigest());
    expect(html).toContain('https://arxiv.org/abs/2502.10001');
    expect(html).toContain('https://arxiv.org/abs/2502.77777');
  });

  it('contains Read on arXiv buttons', () => {
    const html = renderDigestHtml(makeDigest());
    expect(html).toContain('Read on arXiv');
  });

  it('contains manage tracks link', () => {
    const html = renderDigestHtml(makeDigest());
    expect(html).toContain('https://paperbrief.io/dashboard');
  });

  it('contains unsubscribe link', () => {
    const html = renderDigestHtml(makeDigest());
    expect(html).toContain('https://paperbrief.io/unsubscribe');
  });

  it('escapes HTML special chars in title', () => {
    const xss = makeScored({ paper: { arxivId: '2502.xss', absUrl: '', title: '<script>alert("xss")</script>', abstract: '', authors: [], categories: [], version: 'v1', publishedAt: '', updatedAt: '', pdfUrl: null } });
    const html = renderDigestHtml(buildDigest([xss], { userId: USER, weekOf: WEEK }));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes HTML special chars in authors', () => {
    const xss = makeScored({ paper: { arxivId: '2502.author', absUrl: '', title: 'Safe Title', abstract: '', authors: ['O\'Brien & Co <malicious>'], categories: [], version: 'v1', publishedAt: '', updatedAt: '', pdfUrl: null } });
    const html = renderDigestHtml(buildDigest([xss], { userId: USER, weekOf: WEEK }));
    expect(html).not.toContain('<malicious>');
    expect(html).toContain('&lt;malicious&gt;');
  });

  it('truncates long summaries to 200 chars with ellipsis', () => {
    const longSummary = 'A'.repeat(250);
    const paper = makeScored({ summary: longSummary });
    const html = renderDigestHtml(buildDigest([paper], { userId: USER, weekOf: WEEK }));
    expect(html).toContain('A'.repeat(197) + '…');
    expect(html).not.toContain('A'.repeat(250));
  });

  it('shows score dots for essential paper', () => {
    const essential = makeScored({ score: 5 });
    const html = renderDigestHtml(buildDigest([essential], { userId: USER, weekOf: WEEK }));
    expect(html).toContain('●●●●●');
  });

  it('shows correct dot pattern for score 3', () => {
    const mid = makeScored({ score: 3 });
    const html = renderDigestHtml(buildDigest([mid], { userId: USER, weekOf: WEEK }));
    expect(html).toContain('●●●○○');
  });

  it('applies correct badge style for essential score', () => {
    const essential = makeScored({ score: 5 });
    const html = renderDigestHtml(buildDigest([essential], { userId: USER, weekOf: WEEK }));
    expect(html).toContain('background:#fef3c7');
  });

  it('applies correct badge style for relevant score', () => {
    const relevant = makeScored({ score: 4 });
    const html = renderDigestHtml(buildDigest([relevant], { userId: USER, weekOf: WEEK }));
    expect(html).toContain('background:#dbeafe');
  });

  it('renders empty digest as valid HTML', () => {
    const html = renderDigestHtml(buildDigest([], { userId: USER, weekOf: WEEK }));
    expect(html).toMatch(/^<!DOCTYPE html>/i);
    expect(html).toContain('0 papers');
    expect(html).not.toContain('undefined');
  });

  it('shows reason as blockquote-style section when present', () => {
    const paper = makeScored({ reason: 'This is why it matters.' });
    const html = renderDigestHtml(buildDigest([paper], { userId: USER, weekOf: WEEK }));
    expect(html).toContain('This is why it matters.');
    expect(html).toContain('border-left');
  });

  it('omits reason section when reason is empty', () => {
    const paper = makeScored({ reason: '' });
    const html = renderDigestHtml(buildDigest([paper], { userId: USER, weekOf: WEEK }));
    // Should not have an empty border-left blockquote
    expect(html).not.toContain('Why this matters:');
  });

  it('includes correct papers-scanned count in header', () => {
    const papers = [makeScored(), makeScored({ paper: { arxivId: '2502.99990', absUrl: '', title: 'Second', abstract: '', authors: [], categories: [], version: 'v1', publishedAt: '', updatedAt: '', pdfUrl: null } })];
    const html = renderDigestHtml(buildDigest(papers, { userId: USER, weekOf: WEEK }));
    expect(html).toContain('2 papers from 2 scanned');
  });

  it('uses singular "paper" for single result', () => {
    const html = renderDigestHtml(buildDigest([makeScored()], { userId: USER, weekOf: WEEK }));
    expect(html).toMatch(/1 paper from 1 scanned/);
  });
});
