/**
 * Tests for /rss/topics/[slug]/route.ts
 *
 * Covers:
 * - Pure helper functions: xmlEscape, toRfc2822, truncateAbstract, formatAuthors, clamp
 * - buildItem: item XML generation
 * - buildFeed: full feed XML structure
 * - GET handler: routing, param parsing, error paths, 404 for unknown slug
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MockedFunction } from 'vitest';

// ── Mock topics module ────────────────────────────────────────────────────────

vi.mock('../topics', () => ({
  getTopicBySlug: vi.fn(),
  getTopicPapers: vi.fn(),
  getAllTopics: vi.fn(),
}));

import { getTopicBySlug, getTopicPapers, getAllTopics } from '../topics';
import type { Topic, TopicPaper } from '../topics';

const mockGetTopicBySlug = getTopicBySlug as MockedFunction<typeof getTopicBySlug>;
const mockGetTopicPapers = getTopicPapers as MockedFunction<typeof getTopicPapers>;
const mockGetAllTopics = getAllTopics as MockedFunction<typeof getAllTopics>;

// Import helpers + handler AFTER mocks are set up
import {
  xmlEscape,
  toRfc2822,
  truncateAbstract,
  formatAuthors,
  clamp,
  buildItem,
  buildFeed,
  GET,
} from '../../app/rss/topics/[slug]/route';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SAMPLE_TOPIC: Topic = {
  slug: 'llm-agents',
  name: 'LLM Agents',
  emoji: '🤖',
  description: 'Autonomous agents powered by large language models.',
  arxivCats: ['cs.AI', 'cs.MA'],
  titleKeywords: ['agent', 'multi-agent'],
};

const SAMPLE_PAPER: TopicPaper = {
  arxiv_id: '2401.12345',
  title: 'ToolFormer: Language Models Can Teach Themselves to Use Tools',
  abstract:
    'We introduce Toolformer, a model trained to decide which APIs to call, when to call them, ' +
    'what arguments to pass, and how to best incorporate the results into the future token prediction.',
  authors: ['Jane Smith', 'Bob Jones', 'Alice Lee'],
  categories: ['cs.AI', 'cs.LG'],
  published_at: '2024-01-15T00:00:00Z',
};

const MINIMAL_PAPER: TopicPaper = {
  arxiv_id: '2401.00001',
  title: 'Minimal Paper',
  abstract: null,
  authors: [],
  categories: [],
  published_at: null,
};

// ── Helper: build a NextRequest ───────────────────────────────────────────────

function makeRequest(url: string): Request {
  return new Request(url);
}

// ── xmlEscape ────────────────────────────────────────────────────────────────

describe('xmlEscape', () => {
  it('passes through plain ASCII untouched', () => {
    expect(xmlEscape('hello world')).toBe('hello world');
  });

  it('escapes ampersand', () => {
    expect(xmlEscape('RAG & Retrieval')).toBe('RAG &amp; Retrieval');
  });

  it('escapes less-than', () => {
    expect(xmlEscape('a < b')).toBe('a &lt; b');
  });

  it('escapes greater-than', () => {
    expect(xmlEscape('a > b')).toBe('a &gt; b');
  });

  it('escapes double quote', () => {
    expect(xmlEscape('"quoted"')).toBe('&quot;quoted&quot;');
  });

  it('escapes single quote', () => {
    expect(xmlEscape("it's")).toBe('it&apos;s');
  });

  it('escapes multiple entities in one string', () => {
    expect(xmlEscape('<title>Foo & "Bar"</title>')).toBe(
      '&lt;title&gt;Foo &amp; &quot;Bar&quot;&lt;/title&gt;',
    );
  });

  it('returns empty string for empty input', () => {
    expect(xmlEscape('')).toBe('');
  });
});

// ── toRfc2822 ────────────────────────────────────────────────────────────────

describe('toRfc2822', () => {
  it('converts a valid ISO timestamp to RFC 2822', () => {
    const result = toRfc2822('2024-01-15T00:00:00Z');
    expect(result).toContain('Jan 2024');
    expect(result).toContain('+0000');
    expect(result).not.toContain('GMT');
  });

  it('returns a date string when iso is null', () => {
    const result = toRfc2822(null);
    expect(result).toBeTruthy();
    expect(result).toContain('+0000');
  });

  it('falls back gracefully on invalid ISO string', () => {
    const result = toRfc2822('not-a-date');
    expect(result).toBeTruthy();
    expect(result).toContain('+0000');
  });
});

// ── truncateAbstract ──────────────────────────────────────────────────────────

describe('truncateAbstract', () => {
  it('returns empty string for null', () => {
    expect(truncateAbstract(null)).toBe('');
  });

  it('returns the abstract unchanged when short enough', () => {
    const short = 'A brief abstract.';
    expect(truncateAbstract(short)).toBe(short);
  });

  it('truncates abstracts longer than 500 chars', () => {
    const long = 'word '.repeat(150); // 750 chars
    const result = truncateAbstract(long);
    expect(result.length).toBeLessThanOrEqual(504); // 500 + ellipsis
    expect(result).toMatch(/…$/);
  });

  it('breaks at a word boundary — no mid-word cuts', () => {
    // Build a 501-char string ending mid-word
    const prefix = 'a '.repeat(249); // 498 chars
    const str = prefix + 'xyz'; // 501 chars — "xyz" straddles the 500 boundary
    const result = truncateAbstract(str);
    // Should not end with partial "xy" or "x"
    expect(result).not.toMatch(/xy…$|x…$/);
    expect(result).toMatch(/…$/);
  });
});

// ── formatAuthors ─────────────────────────────────────────────────────────────

describe('formatAuthors', () => {
  it('returns empty string for null', () => {
    expect(formatAuthors(null)).toBe('');
  });

  it('returns empty string for empty array', () => {
    expect(formatAuthors([])).toBe('');
  });

  it('formats a single author', () => {
    expect(formatAuthors(['Alice'])).toBe('Alice');
  });

  it('joins multiple authors with comma-space', () => {
    expect(formatAuthors(['Alice', 'Bob', 'Carol'])).toBe('Alice, Bob, Carol');
  });

  it('caps at 5 authors and appends et al.', () => {
    const six = ['A', 'B', 'C', 'D', 'E', 'F'];
    expect(formatAuthors(six)).toBe('A, B, C, D, E et al.');
  });

  it('does not append et al. for exactly 5 authors', () => {
    const five = ['A', 'B', 'C', 'D', 'E'];
    const result = formatAuthors(five);
    expect(result).toBe('A, B, C, D, E');
    expect(result).not.toContain('et al.');
  });
});

// ── clamp ─────────────────────────────────────────────────────────────────────

describe('clamp', () => {
  it('returns the value when inside range', () => {
    expect(clamp(7, 1, 30, 14)).toBe(7);
  });

  it('clamps to min when below range', () => {
    expect(clamp(0, 1, 30, 14)).toBe(1);
  });

  it('clamps to max when above range', () => {
    expect(clamp(99, 1, 30, 14)).toBe(30);
  });

  it('returns fallback when value is NaN', () => {
    expect(clamp(NaN, 1, 30, 14)).toBe(14);
  });

  it('handles min === max', () => {
    expect(clamp(5, 7, 7, 7)).toBe(7);
  });
});

// ── buildItem ─────────────────────────────────────────────────────────────────

describe('buildItem', () => {
  const siteUrl = 'https://paperbrief.ai';

  it('includes the paper title', () => {
    const xml = buildItem(SAMPLE_PAPER, siteUrl);
    expect(xml).toContain('ToolFormer');
  });

  it('includes a link to the paper detail page', () => {
    const xml = buildItem(SAMPLE_PAPER, siteUrl);
    expect(xml).toContain(`${siteUrl}/paper/2401.12345`);
  });

  it('includes pubDate', () => {
    const xml = buildItem(SAMPLE_PAPER, siteUrl);
    expect(xml).toContain('<pubDate>');
  });

  it('includes author dc:creator when authors are present', () => {
    const xml = buildItem(SAMPLE_PAPER, siteUrl);
    expect(xml).toContain('<dc:creator>Jane Smith');
  });

  it('includes primary category', () => {
    const xml = buildItem(SAMPLE_PAPER, siteUrl);
    expect(xml).toContain('<category>cs.AI</category>');
  });

  it('includes abstract description when present', () => {
    const xml = buildItem(SAMPLE_PAPER, siteUrl);
    expect(xml).toContain('<description>');
    expect(xml).toContain('Toolformer');
  });

  it('handles minimal paper with no authors, categories, or abstract', () => {
    const xml = buildItem(MINIMAL_PAPER, siteUrl);
    expect(xml).toContain('<title>Minimal Paper</title>');
    expect(xml).not.toContain('<dc:creator>');
    expect(xml).not.toContain('<category>');
    expect(xml).not.toContain('<description>');
  });

  it('XML-escapes special characters in title', () => {
    const paper: TopicPaper = {
      ...SAMPLE_PAPER,
      title: 'RAG & <Grounding>: A "Survey"',
    };
    const xml = buildItem(paper, siteUrl);
    expect(xml).toContain('RAG &amp; &lt;Grounding&gt;: A &quot;Survey&quot;');
  });

  it('uses guid with isPermaLink=true', () => {
    const xml = buildItem(SAMPLE_PAPER, siteUrl);
    expect(xml).toContain('isPermaLink="true"');
  });
});

// ── buildFeed ─────────────────────────────────────────────────────────────────

describe('buildFeed', () => {
  const baseOpts = {
    feedUrl: 'https://paperbrief.ai/rss/topics/llm-agents',
    topicPageUrl: 'https://paperbrief.ai/topics/llm-agents',
    channelTitle: '🤖 LLM Agents Papers — PaperBrief',
    channelDescription: 'Latest LLM Agents research papers.',
    lastBuildDate: 'Mon, 15 Jan 2024 00:00:00 +0000',
    items: [SAMPLE_PAPER],
    siteUrl: 'https://paperbrief.ai',
  };

  it('produces a valid RSS 2.0 root element', () => {
    const xml = buildFeed(baseOpts);
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('</rss>');
  });

  it('includes atom:link self-reference', () => {
    const xml = buildFeed(baseOpts);
    expect(xml).toContain('rel="self"');
    expect(xml).toContain('type="application/rss+xml"');
    expect(xml).toContain('https://paperbrief.ai/rss/topics/llm-agents');
  });

  it('includes channel title', () => {
    const xml = buildFeed(baseOpts);
    expect(xml).toContain('LLM Agents Papers');
  });

  it('includes dc namespace', () => {
    const xml = buildFeed(baseOpts);
    expect(xml).toContain('xmlns:dc=');
  });

  it('includes TTL element', () => {
    const xml = buildFeed(baseOpts);
    expect(xml).toContain('<ttl>');
  });

  it('includes item content when papers provided', () => {
    const xml = buildFeed(baseOpts);
    expect(xml).toContain('<item>');
    expect(xml).toContain('ToolFormer');
  });

  it('produces valid XML declaration', () => {
    const xml = buildFeed(baseOpts);
    expect(xml.trimStart()).toMatch(/^<\?xml version="1\.0"/);
  });

  it('renders empty feed body when no items', () => {
    const xml = buildFeed({ ...baseOpts, items: [] });
    expect(xml).not.toContain('<item>');
    expect(xml).toContain('</channel>');
  });
});

// ── GET handler ───────────────────────────────────────────────────────────────

describe('GET /rss/topics/[slug]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllTopics.mockReturnValue([SAMPLE_TOPIC]);
  });

  it('returns 404 for an unknown slug', async () => {
    mockGetTopicBySlug.mockReturnValue(undefined);
    const req = makeRequest('https://paperbrief.ai/rss/topics/unknown-topic');
    const res = await GET(req as never, {
      params: Promise.resolve({ slug: 'unknown-topic' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 body listing valid slugs', async () => {
    mockGetTopicBySlug.mockReturnValue(undefined);
    const req = makeRequest('https://paperbrief.ai/rss/topics/unknown-topic');
    const res = await GET(req as never, {
      params: Promise.resolve({ slug: 'unknown-topic' }),
    });
    const text = await res.text();
    expect(text).toContain('llm-agents');
  });

  it('returns 200 with RSS XML for a valid slug', async () => {
    mockGetTopicBySlug.mockReturnValue(SAMPLE_TOPIC);
    mockGetTopicPapers.mockResolvedValue([SAMPLE_PAPER]);
    const req = makeRequest('https://paperbrief.ai/rss/topics/llm-agents');
    const res = await GET(req as never, {
      params: Promise.resolve({ slug: 'llm-agents' }),
    });
    expect(res.status).toBe(200);
  });

  it('sets application/rss+xml content-type', async () => {
    mockGetTopicBySlug.mockReturnValue(SAMPLE_TOPIC);
    mockGetTopicPapers.mockResolvedValue([SAMPLE_PAPER]);
    const req = makeRequest('https://paperbrief.ai/rss/topics/llm-agents');
    const res = await GET(req as never, {
      params: Promise.resolve({ slug: 'llm-agents' }),
    });
    expect(res.headers.get('Content-Type')).toContain('application/rss+xml');
  });

  it('sets cache-control header', async () => {
    mockGetTopicBySlug.mockReturnValue(SAMPLE_TOPIC);
    mockGetTopicPapers.mockResolvedValue([]);
    const req = makeRequest('https://paperbrief.ai/rss/topics/llm-agents');
    const res = await GET(req as never, {
      params: Promise.resolve({ slug: 'llm-agents' }),
    });
    expect(res.headers.get('Cache-Control')).toContain('max-age=3600');
  });

  it('calls getTopicPapers with default days=14 and limit=50', async () => {
    mockGetTopicBySlug.mockReturnValue(SAMPLE_TOPIC);
    mockGetTopicPapers.mockResolvedValue([]);
    const req = makeRequest('https://paperbrief.ai/rss/topics/llm-agents');
    await GET(req as never, { params: Promise.resolve({ slug: 'llm-agents' }) });
    expect(mockGetTopicPapers).toHaveBeenCalledWith('llm-agents', 50, 14);
  });

  it('respects custom days query param', async () => {
    mockGetTopicBySlug.mockReturnValue(SAMPLE_TOPIC);
    mockGetTopicPapers.mockResolvedValue([]);
    const req = makeRequest('https://paperbrief.ai/rss/topics/llm-agents?days=7');
    await GET(req as never, { params: Promise.resolve({ slug: 'llm-agents' }) });
    expect(mockGetTopicPapers).toHaveBeenCalledWith('llm-agents', 50, 7);
  });

  it('respects custom limit query param', async () => {
    mockGetTopicBySlug.mockReturnValue(SAMPLE_TOPIC);
    mockGetTopicPapers.mockResolvedValue([]);
    const req = makeRequest('https://paperbrief.ai/rss/topics/llm-agents?limit=25');
    await GET(req as never, { params: Promise.resolve({ slug: 'llm-agents' }) });
    expect(mockGetTopicPapers).toHaveBeenCalledWith('llm-agents', 25, 14);
  });

  it('clamps days above max to 30', async () => {
    mockGetTopicBySlug.mockReturnValue(SAMPLE_TOPIC);
    mockGetTopicPapers.mockResolvedValue([]);
    const req = makeRequest('https://paperbrief.ai/rss/topics/llm-agents?days=999');
    await GET(req as never, { params: Promise.resolve({ slug: 'llm-agents' }) });
    expect(mockGetTopicPapers).toHaveBeenCalledWith('llm-agents', 50, 30);
  });

  it('clamps limit above max to 100', async () => {
    mockGetTopicBySlug.mockReturnValue(SAMPLE_TOPIC);
    mockGetTopicPapers.mockResolvedValue([]);
    const req = makeRequest('https://paperbrief.ai/rss/topics/llm-agents?limit=999');
    await GET(req as never, { params: Promise.resolve({ slug: 'llm-agents' }) });
    expect(mockGetTopicPapers).toHaveBeenCalledWith('llm-agents', 100, 14);
  });

  it('clamps days below min to 1', async () => {
    mockGetTopicBySlug.mockReturnValue(SAMPLE_TOPIC);
    mockGetTopicPapers.mockResolvedValue([]);
    const req = makeRequest('https://paperbrief.ai/rss/topics/llm-agents?days=0');
    await GET(req as never, { params: Promise.resolve({ slug: 'llm-agents' }) });
    expect(mockGetTopicPapers).toHaveBeenCalledWith('llm-agents', 50, 1);
  });

  it('uses default days=14 for non-numeric days param', async () => {
    mockGetTopicBySlug.mockReturnValue(SAMPLE_TOPIC);
    mockGetTopicPapers.mockResolvedValue([]);
    const req = makeRequest('https://paperbrief.ai/rss/topics/llm-agents?days=banana');
    await GET(req as never, { params: Promise.resolve({ slug: 'llm-agents' }) });
    expect(mockGetTopicPapers).toHaveBeenCalledWith('llm-agents', 50, 14);
  });

  it('returns 500 when getTopicPapers throws', async () => {
    mockGetTopicBySlug.mockReturnValue(SAMPLE_TOPIC);
    mockGetTopicPapers.mockRejectedValue(new Error('DB exploded'));
    const req = makeRequest('https://paperbrief.ai/rss/topics/llm-agents');
    const res = await GET(req as never, {
      params: Promise.resolve({ slug: 'llm-agents' }) ,
    });
    expect(res.status).toBe(500);
  });

  it('returns RSS XML containing topic name in channel title', async () => {
    mockGetTopicBySlug.mockReturnValue(SAMPLE_TOPIC);
    mockGetTopicPapers.mockResolvedValue([SAMPLE_PAPER]);
    const req = makeRequest('https://paperbrief.ai/rss/topics/llm-agents');
    const res = await GET(req as never, {
      params: Promise.resolve({ slug: 'llm-agents' }),
    });
    const xml = await res.text();
    expect(xml).toContain('LLM Agents');
  });

  it('returns RSS XML containing paper title', async () => {
    mockGetTopicBySlug.mockReturnValue(SAMPLE_TOPIC);
    mockGetTopicPapers.mockResolvedValue([SAMPLE_PAPER]);
    const req = makeRequest('https://paperbrief.ai/rss/topics/llm-agents');
    const res = await GET(req as never, {
      params: Promise.resolve({ slug: 'llm-agents' }),
    });
    const xml = await res.text();
    expect(xml).toContain('ToolFormer');
  });

  it('returns empty feed (valid XML) when no papers found', async () => {
    mockGetTopicBySlug.mockReturnValue(SAMPLE_TOPIC);
    mockGetTopicPapers.mockResolvedValue([]);
    const req = makeRequest('https://paperbrief.ai/rss/topics/llm-agents');
    const res = await GET(req as never, {
      params: Promise.resolve({ slug: 'llm-agents' }),
    });
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('<?xml');
    expect(xml).not.toContain('<item>');
  });
});
