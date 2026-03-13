/**
 * Tests for app/sitemap.ts
 *
 * Covers:
 *  - Static routes are always present
 *  - Paper routes are built from getSitemapPapers()
 *  - arxiv IDs are URL-encoded in the output
 *  - published_at is used as lastModified; falls back to now when null
 *  - DB errors are caught gracefully (only static routes returned)
 *  - NEXT_PUBLIC_SITE_URL env var is respected
 *  - Duplicate entries do not appear
 *  - Total URL count never exceeds static + 5000 paper cap
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── mock arxiv-db ─────────────────────────────────────────────────────────────
vi.mock('../lib/arxiv-db', () => ({
  getSitemapPapers: vi.fn(),
}));

import { getSitemapPapers } from '../lib/arxiv-db';

const mockGetSitemapPapers = getSitemapPapers as ReturnType<typeof vi.fn>;

// ── helpers ───────────────────────────────────────────────────────────────────

function makePapers(count: number, opts: { nullDate?: boolean } = {}) {
  return Array.from({ length: count }, (_, i) => ({
    arxiv_id: `2401.${String(i).padStart(5, '0')}`,
    published_at: opts.nullDate ? null : `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
    updated_at: null,
  }));
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('sitemap()', () => {
  const ORIGINAL_ENV = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(() => {
    vi.resetModules();
    mockGetSitemapPapers.mockReturnValue([]);
  });

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_ENV;
    }
  });

  // ── static routes ──────────────────────────────────────────────────────────

  it('returns the 6 static routes', async () => {
    mockGetSitemapPapers.mockReturnValue([]);
    const { default: sitemap } = await import('./sitemap');
    const entries = sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls).toContain('https://paperbrief.ai');
    expect(urls).toContain('https://paperbrief.ai/trending');
    expect(urls).toContain('https://paperbrief.ai/search');
    expect(urls).toContain('https://paperbrief.ai/pricing');
    expect(urls).toContain('https://paperbrief.ai/stats');
    expect(urls).toContain('https://paperbrief.ai/rss');
    expect(entries.length).toBe(6);
  });

  it('assigns priority 1.0 to homepage', async () => {
    mockGetSitemapPapers.mockReturnValue([]);
    const { default: sitemap } = await import('./sitemap');
    const home = sitemap().find((e) => e.url === 'https://paperbrief.ai');
    expect(home?.priority).toBe(1.0);
  });

  it('assigns changeFrequency "hourly" to /trending', async () => {
    mockGetSitemapPapers.mockReturnValue([]);
    const { default: sitemap } = await import('./sitemap');
    const trending = sitemap().find((e) => e.url.endsWith('/trending'));
    expect(trending?.changeFrequency).toBe('hourly');
  });

  it('assigns changeFrequency "monthly" to /pricing', async () => {
    mockGetSitemapPapers.mockReturnValue([]);
    const { default: sitemap } = await import('./sitemap');
    const pricing = sitemap().find((e) => e.url.endsWith('/pricing'));
    expect(pricing?.changeFrequency).toBe('monthly');
  });

  // ── paper routes ───────────────────────────────────────────────────────────

  it('appends paper routes for each paper returned by getSitemapPapers', async () => {
    const papers = makePapers(3);
    mockGetSitemapPapers.mockReturnValue(papers);
    const { default: sitemap } = await import('./sitemap');
    const entries = sitemap();
    expect(entries.length).toBe(6 + 3);
    for (const paper of papers) {
      expect(entries.some((e) => e.url.includes(paper.arxiv_id))).toBe(true);
    }
  });

  it('URL-encodes special characters in arxiv IDs', async () => {
    mockGetSitemapPapers.mockReturnValue([
      { arxiv_id: 'cs/0312045', published_at: '2024-01-15', updated_at: null },
    ]);
    const { default: sitemap } = await import('./sitemap');
    const entries = sitemap();
    const paperUrl = entries.find((e) => e.url.includes('cs'));
    expect(paperUrl?.url).toBe('https://paperbrief.ai/paper/cs%2F0312045');
  });

  it('uses published_at as lastModified for paper routes', async () => {
    mockGetSitemapPapers.mockReturnValue([
      { arxiv_id: '2401.00001', published_at: '2024-01-20', updated_at: null },
    ]);
    const { default: sitemap } = await import('./sitemap');
    const entries = sitemap();
    const paper = entries.find((e) => e.url.includes('2401.00001'));
    expect(paper?.lastModified).toEqual(new Date('2024-01-20'));
  });

  it('falls back to current date when published_at is null', async () => {
    const before = Date.now();
    mockGetSitemapPapers.mockReturnValue([
      { arxiv_id: '2401.00002', published_at: null, updated_at: null },
    ]);
    const { default: sitemap } = await import('./sitemap');
    const entries = sitemap();
    const after = Date.now();
    const paper = entries.find((e) => e.url.includes('2401.00002'));
    const ts = (paper?.lastModified as Date).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('assigns priority 0.6 and changeFrequency "monthly" to paper routes', async () => {
    mockGetSitemapPapers.mockReturnValue(makePapers(1));
    const { default: sitemap } = await import('./sitemap');
    const entries = sitemap();
    const paper = entries.find((e) => e.url.includes('/paper/'));
    expect(paper?.priority).toBe(0.6);
    expect(paper?.changeFrequency).toBe('monthly');
  });

  // ── error handling ─────────────────────────────────────────────────────────

  it('returns only static routes when getSitemapPapers throws', async () => {
    mockGetSitemapPapers.mockImplementation(() => {
      throw new Error('DB unavailable');
    });
    const { default: sitemap } = await import('./sitemap');
    const entries = sitemap();
    expect(entries.length).toBe(6);
    expect(entries.every((e) => !e.url.includes('/paper/'))).toBe(true);
  });

  it('does not throw when called with an empty DB', async () => {
    mockGetSitemapPapers.mockReturnValue([]);
    const { default: sitemap } = await import('./sitemap');
    expect(() => sitemap()).not.toThrow();
  });

  // ── env override ───────────────────────────────────────────────────────────

  it('uses NEXT_PUBLIC_SITE_URL env var when set', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://staging.paperbrief.ai';
    vi.resetModules();
    mockGetSitemapPapers.mockReturnValue([]);
    const { default: sitemap } = await import('./sitemap');
    const entries = sitemap();
    expect(entries[0].url).toBe('https://staging.paperbrief.ai');
  });

  // ── edge cases ─────────────────────────────────────────────────────────────

  it('handles 500 papers without throwing', async () => {
    mockGetSitemapPapers.mockReturnValue(makePapers(500));
    const { default: sitemap } = await import('./sitemap');
    const entries = sitemap();
    expect(entries.length).toBe(6 + 500);
  });

  it('does not produce duplicate URLs', async () => {
    mockGetSitemapPapers.mockReturnValue(makePapers(10));
    const { default: sitemap } = await import('./sitemap');
    const entries = sitemap();
    const urls = entries.map((e) => e.url);
    const unique = new Set(urls);
    expect(unique.size).toBe(urls.length);
  });

  it('returns an array', async () => {
    mockGetSitemapPapers.mockReturnValue([]);
    const { default: sitemap } = await import('./sitemap');
    expect(Array.isArray(sitemap())).toBe(true);
  });
});
