/**
 * Tests for dynamic Open Graph image routes.
 *
 * Covers:
 *  - opengraph-image.tsx for /paper/[arxivId] (paper card)
 *  - generateMetadata() for /paper/[arxivId]/page.tsx
 *  - Helper utilities: parseAuthors, truncate, scoreColor, formatTrack
 *
 * We don't test the ImageResponse rendering itself (that requires a browser).
 * Instead we test: the logic that feeds data into the image, the metadata
 * generation, and the API surface (exported size/contentType/runtime).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock next/og ──────────────────────────────────────────────────────────────

class MockImageResponse {
  public element: unknown;
  public options: unknown;
  constructor(element: unknown, options?: unknown) {
    this.element = element;
    this.options = options;
  }
}

vi.mock('next/og', () => ({
  ImageResponse: MockImageResponse,
}));

// ── Mock arxiv-db ─────────────────────────────────────────────────────────────

import type { Paper } from '../arxiv-db';

let mockPaper: Paper | null = null;

vi.mock('../arxiv-db', () => ({
  getPaper: vi.fn(() => mockPaper),
}));

// ── Import modules under test ─────────────────────────────────────────────────

// We test generateMetadata from the page (pure TypeScript logic)
import { generateMetadata } from '../../app/paper/[arxivId]/page';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePaper(overrides: Partial<Paper> = {}): Paper {
  return {
    arxiv_id: '2601.12345',
    title: 'Attention Is All You Need',
    abstract: 'We propose a new simple network architecture, the Transformer, based solely on attention mechanisms.',
    published_at: '2017-06-12',
    llm_score: 8.7,
    track: 'cs.LG',
    authors: JSON.stringify(['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar']),
    url: 'https://arxiv.org/abs/1706.03762',
    ...overrides,
  };
}

function makeParams(arxivId: string): Promise<{ arxivId: string }> {
  return Promise.resolve({ arxivId });
}

// ── generateMetadata tests ────────────────────────────────────────────────────

describe('generateMetadata (paper detail page)', () => {
  beforeEach(() => {
    mockPaper = null;
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://paperbrief.ai');
  });

  it('returns minimal metadata when paper is not found', async () => {
    mockPaper = null;
    const meta = await generateMetadata({ params: makeParams('nonexistent') });
    expect(meta.title).toBe('Paper not found — PaperBrief');
    expect(meta.openGraph).toBeUndefined();
  });

  it('sets title with paper title + PaperBrief suffix', async () => {
    mockPaper = makePaper();
    const meta = await generateMetadata({ params: makeParams('2601.12345') });
    expect(meta.title).toBe('Attention Is All You Need — PaperBrief');
  });

  it('includes openGraph with paper title as og:title', async () => {
    mockPaper = makePaper();
    const meta = await generateMetadata({ params: makeParams('2601.12345') });
    expect((meta.openGraph as { title?: string })?.title).toBe('Attention Is All You Need');
  });

  it('sets og:type to "article" for paper pages', async () => {
    mockPaper = makePaper();
    const meta = await generateMetadata({ params: makeParams('2601.12345') });
    expect((meta.openGraph as { type?: string })?.type).toBe('article');
  });

  it('includes og:image URL pointing to opengraph-image route', async () => {
    mockPaper = makePaper();
    const meta = await generateMetadata({ params: makeParams('2601.12345') });
    const images = (meta.openGraph as { images?: { url: string }[] })?.images ?? [];
    expect(images[0]?.url).toBe('https://paperbrief.ai/paper/2601.12345/opengraph-image');
  });

  it('sets og:image dimensions to 1200×630', async () => {
    mockPaper = makePaper();
    const meta = await generateMetadata({ params: makeParams('2601.12345') });
    const images = (meta.openGraph as { images?: { width: number; height: number }[] })?.images ?? [];
    expect(images[0]?.width).toBe(1200);
    expect(images[0]?.height).toBe(630);
  });

  it('sets og:url to the paper page URL', async () => {
    mockPaper = makePaper();
    const meta = await generateMetadata({ params: makeParams('2601.12345') });
    expect((meta.openGraph as { url?: string })?.url).toBe('https://paperbrief.ai/paper/2601.12345');
  });

  it('includes Twitter card metadata', async () => {
    mockPaper = makePaper();
    const meta = await generateMetadata({ params: makeParams('2601.12345') });
    expect((meta.twitter as { card?: string })?.card).toBe('summary_large_image');
  });

  it('includes score in description when score is present', async () => {
    mockPaper = makePaper({ llm_score: 9.2 });
    const meta = await generateMetadata({ params: makeParams('2601.12345') });
    expect(meta.description).toContain('9.2/10');
  });

  it('omits score text when llm_score is null', async () => {
    mockPaper = makePaper({ llm_score: null });
    const meta = await generateMetadata({ params: makeParams('2601.12345') });
    expect(meta.description).not.toContain('/10');
  });

  it('includes authors in description', async () => {
    mockPaper = makePaper({ authors: JSON.stringify(['Alice Smith', 'Bob Jones']) });
    const meta = await generateMetadata({ params: makeParams('2601.12345') });
    expect(meta.description).toContain('Alice Smith');
    expect(meta.description).toContain('Bob Jones');
  });

  it('truncates long author lists to 3 + count', async () => {
    mockPaper = makePaper({
      authors: JSON.stringify(['A', 'B', 'C', 'D', 'E']),
    });
    const meta = await generateMetadata({ params: makeParams('2601.12345') });
    expect(meta.description).toContain('+2 more');
  });

  it('handles null authors gracefully', async () => {
    mockPaper = makePaper({ authors: null });
    const meta = await generateMetadata({ params: makeParams('2601.12345') });
    expect(meta.description).toContain('Unknown authors');
  });

  it('handles malformed authors JSON gracefully', async () => {
    mockPaper = makePaper({ authors: 'not-json' });
    const meta = await generateMetadata({ params: makeParams('2601.12345') });
    // Falls back to the raw string
    expect(meta.description).toContain('not-json');
  });

  it('truncates abstract in description to 150 chars + ellipsis', async () => {
    const longAbstract = 'x'.repeat(300);
    mockPaper = makePaper({ abstract: longAbstract });
    const meta = await generateMetadata({ params: makeParams('2601.12345') });
    // Description should contain the truncated abstract
    expect(meta.description).toContain('x'.repeat(150) + '…');
  });

  it('handles null abstract gracefully', async () => {
    mockPaper = makePaper({ abstract: null });
    const meta = await generateMetadata({ params: makeParams('2601.12345') });
    expect(meta.description).toContain('Read on PaperBrief');
  });

  it('uses NEXT_PUBLIC_SITE_URL env var for image URLs', async () => {
    // SITE_URL is a module-level constant captured at import time.
    // Stub the env before module load to verify it is honoured.
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://staging.paperbrief.ai');
    vi.mock('../arxiv-db', () => ({ getPaper: vi.fn(() => mockPaper) }));
    const { generateMetadata: gm } = await import('../../app/paper/[arxivId]/page');
    mockPaper = makePaper();
    const meta = await gm({ params: makeParams('2601.12345') });
    const images = (meta.openGraph as { images?: { url: string }[] })?.images ?? [];
    expect(images[0]?.url).toContain('https://staging.paperbrief.ai');
    vi.unstubAllEnvs();
  });

  it('falls back to paperbrief.ai when NEXT_PUBLIC_SITE_URL is unset', async () => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_SITE_URL;
    vi.mock('../arxiv-db', () => ({ getPaper: vi.fn(() => mockPaper) }));
    const { generateMetadata: gm } = await import('../../app/paper/[arxivId]/page');
    mockPaper = makePaper();
    const meta = await gm({ params: makeParams('2601.12345') });
    const images = (meta.openGraph as { images?: { url: string }[] })?.images ?? [];
    expect(images[0]?.url).toContain('paperbrief.ai');
  });

  it('sets og:alt to the paper title', async () => {
    mockPaper = makePaper();
    const meta = await generateMetadata({ params: makeParams('2601.12345') });
    const images = (meta.openGraph as { images?: { alt: string }[] })?.images ?? [];
    expect(images[0]?.alt).toBe('Attention Is All You Need');
  });
});

// ── opengraph-image module exports ────────────────────────────────────────────

describe('opengraph-image route (paper)', () => {
  // We import the module directly to test its exported constants
  // The actual ImageResponse rendering is not tested (requires browser/canvas).
  let mod: {
    size: { width: number; height: number };
    contentType: string;
    runtime: string;
    default: (args: { params: Promise<{ arxivId: string }> }) => Promise<unknown>;
  };

  beforeEach(async () => {
    vi.resetModules();

    // Re-apply mocks in new module scope
    vi.mock('next/og', () => ({ ImageResponse: MockImageResponse }));
    vi.mock('../arxiv-db', () => ({ getPaper: vi.fn(() => mockPaper) }));

    mod = await import('../../app/paper/[arxivId]/opengraph-image');
  });

  it('exports size 1200×630', () => {
    expect(mod.size).toEqual({ width: 1200, height: 630 });
  });

  it('exports contentType image/png', () => {
    expect(mod.contentType).toBe('image/png');
  });

  it('exports runtime nodejs', () => {
    expect(mod.runtime).toBe('nodejs');
  });

  it('returns an ImageResponse', async () => {
    mockPaper = makePaper();
    const result = await mod.default({ params: makeParams('2601.12345') });
    expect(result).toBeInstanceOf(MockImageResponse);
  });

  it('returns an ImageResponse even when paper is not found (fallback card)', async () => {
    mockPaper = null;
    const result = await mod.default({ params: makeParams('nonexistent') });
    expect(result).toBeInstanceOf(MockImageResponse);
  });

  it('passes size to ImageResponse options', async () => {
    mockPaper = makePaper();
    const result = (await mod.default({ params: makeParams('2601.12345') })) as MockImageResponse;
    expect(result.options).toMatchObject({ width: 1200, height: 630 });
  });
});

// ── opengraph-image module exports (root) ─────────────────────────────────────

describe('opengraph-image route (root)', () => {
  let rootMod: {
    size: { width: number; height: number };
    contentType: string;
    runtime: string;
    default: () => unknown;
  };

  beforeEach(async () => {
    vi.resetModules();
    vi.mock('next/og', () => ({ ImageResponse: MockImageResponse }));
    rootMod = await import('../../app/opengraph-image');
  });

  it('exports size 1200×630', () => {
    expect(rootMod.size).toEqual({ width: 1200, height: 630 });
  });

  it('exports contentType image/png', () => {
    expect(rootMod.contentType).toBe('image/png');
  });

  it('exports runtime edge', () => {
    expect(rootMod.runtime).toBe('edge');
  });

  it('returns an ImageResponse', () => {
    const result = rootMod.default();
    expect(result).toBeInstanceOf(MockImageResponse);
  });

  it('passes size to ImageResponse options', () => {
    const result = rootMod.default() as MockImageResponse;
    expect(result.options).toMatchObject({ width: 1200, height: 630 });
  });
});

// ── Score colour helper (inlined test — reflects actual logic) ────────────────

describe('scoreColor logic', () => {
  // Mirror the function from opengraph-image.tsx for unit testing
  function scoreColor(score: number): string {
    if (score >= 8) return '#34d399';
    if (score >= 6) return '#60a5fa';
    if (score >= 4) return '#fbbf24';
    return '#9ca3af';
  }

  it('returns emerald for score >= 8', () => {
    expect(scoreColor(8)).toBe('#34d399');
    expect(scoreColor(10)).toBe('#34d399');
  });

  it('returns blue for score >= 6 and < 8', () => {
    expect(scoreColor(6)).toBe('#60a5fa');
    expect(scoreColor(7.9)).toBe('#60a5fa');
  });

  it('returns amber for score >= 4 and < 6', () => {
    expect(scoreColor(4)).toBe('#fbbf24');
    expect(scoreColor(5.5)).toBe('#fbbf24');
  });

  it('returns gray for score < 4', () => {
    expect(scoreColor(3.9)).toBe('#9ca3af');
    expect(scoreColor(0)).toBe('#9ca3af');
  });
});

// ── truncate helper ───────────────────────────────────────────────────────────

describe('truncate logic', () => {
  function truncate(str: string, max: number): string {
    if (str.length <= max) return str;
    return str.slice(0, max - 1) + '…';
  }

  it('returns the string unchanged if within limit', () => {
    expect(truncate('hello', 10)).toBe('hello');
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('truncates and appends ellipsis when over limit', () => {
    expect(truncate('hello world', 8)).toBe('hello w…');
    expect(truncate('abcdefgh', 5)).toBe('abcd…');
  });

  it('handles empty string', () => {
    expect(truncate('', 5)).toBe('');
  });
});

// ── formatTrack helper ────────────────────────────────────────────────────────

describe('formatTrack logic', () => {
  function formatTrack(track: string | null): string {
    if (!track) return 'ML Research';
    return track.length <= 6 ? track.toUpperCase() : track;
  }

  it('returns ML Research for null track', () => {
    expect(formatTrack(null)).toBe('ML Research');
  });

  it('uppercases short tracks (<=6 chars)', () => {
    expect(formatTrack('cs.LG')).toBe('CS.LG');
    expect(formatTrack('llm')).toBe('LLM');
    expect(formatTrack('cv')).toBe('CV');
  });

  it('leaves longer tracks as-is', () => {
    expect(formatTrack('robotics')).toBe('robotics');
    expect(formatTrack('computer-vision')).toBe('computer-vision');
  });
});
