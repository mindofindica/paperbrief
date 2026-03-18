/**
 * Tests for topics.ts — topic taxonomy + query functions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MockedFunction } from 'vitest';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../supabase', () => ({
  getServiceSupabase: vi.fn(),
}));

import { getServiceSupabase } from '../supabase';
import {
  TOPICS,
  getAllTopics,
  getTopicBySlug,
  getTopicPapers,
  getAllTopicsWithCounts,
  type Topic,
  type TopicPaper,
} from '../topics';

const mockGetSupa = getServiceSupabase as MockedFunction<typeof getServiceSupabase>;

// ── Supabase chainable mock builder ──────────────────────────────────────────

type SupaResult<T> = { data?: T; error?: { message: string } | null };

function chainable<T>(result: SupaResult<T>) {
  const obj: Record<string, unknown> = {};
  const methods = ['select', 'eq', 'or', 'gte', 'order', 'limit'];
  for (const m of methods) {
    obj[m] = vi.fn().mockReturnValue(obj);
  }
  obj['then'] = (
    resolve: (v: SupaResult<T>) => void,
    reject: (e: unknown) => void,
  ) => Promise.resolve(result).then(resolve, reject);
  return obj as Record<string, ReturnType<typeof vi.fn>>;
}

function mockSupabase<T>(result: SupaResult<T>) {
  const chain = chainable(result);
  mockGetSupa.mockReturnValue({
    from: vi.fn().mockReturnValue(chain),
  } as unknown as ReturnType<typeof getServiceSupabase>);
  return chain;
}

// ── getAllTopics ──────────────────────────────────────────────────────────────

describe('getAllTopics', () => {
  it('returns all 12 topics', () => {
    const topics = getAllTopics();
    expect(topics).toHaveLength(12);
  });

  it('returns the TOPICS constant', () => {
    expect(getAllTopics()).toBe(TOPICS);
  });
});

// ── Topic shape validation ────────────────────────────────────────────────────

describe('TOPICS shape', () => {
  const requiredFields: (keyof Topic)[] = [
    'slug',
    'name',
    'emoji',
    'description',
    'arxivCats',
    'titleKeywords',
  ];

  for (const field of requiredFields) {
    it(`every topic has a non-empty "${field}"`, () => {
      for (const topic of TOPICS) {
        const val = topic[field];
        if (Array.isArray(val)) {
          expect(val.length, `${topic.slug}.${field} should not be empty`).toBeGreaterThan(0);
        } else {
          expect(val, `${topic.slug}.${field} should be truthy`).toBeTruthy();
        }
      }
    });
  }

  it('all slugs are unique', () => {
    const slugs = TOPICS.map((t) => t.slug);
    const unique = new Set(slugs);
    expect(unique.size).toBe(slugs.length);
  });

  it('all slugs are kebab-case strings', () => {
    for (const topic of TOPICS) {
      expect(topic.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('all emojis are non-empty strings', () => {
    for (const topic of TOPICS) {
      expect(typeof topic.emoji).toBe('string');
      expect(topic.emoji.length).toBeGreaterThan(0);
    }
  });

  it('arxivCats contains valid-looking category codes', () => {
    for (const topic of TOPICS) {
      for (const cat of topic.arxivCats) {
        expect(cat).toMatch(/^[a-z]+\.[A-Z]+$/);
      }
    }
  });

  it('titleKeywords contains lowercase strings', () => {
    for (const topic of TOPICS) {
      for (const kw of topic.titleKeywords) {
        expect(kw).toBe(kw.toLowerCase());
      }
    }
  });
});

// ── Specific topics exist ─────────────────────────────────────────────────────

describe('specific topics exist', () => {
  const expectedSlugs = [
    'llm-agents',
    'rag-retrieval',
    'reasoning',
    'fine-tuning',
    'vision-language',
    'code-generation',
    'alignment-safety',
    'evaluation',
    'efficient-inference',
    'foundation-models',
    'reinforcement-learning',
    'diffusion-models',
  ];

  for (const slug of expectedSlugs) {
    it(`has topic "${slug}"`, () => {
      expect(TOPICS.find((t) => t.slug === slug)).toBeDefined();
    });
  }
});

// ── getTopicBySlug ────────────────────────────────────────────────────────────

describe('getTopicBySlug', () => {
  it('returns the correct topic for a valid slug', () => {
    const topic = getTopicBySlug('llm-agents');
    expect(topic).toBeDefined();
    expect(topic?.slug).toBe('llm-agents');
    expect(topic?.name).toBe('LLM Agents');
  });

  it('returns undefined for an unknown slug', () => {
    expect(getTopicBySlug('not-a-real-topic')).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(getTopicBySlug('')).toBeUndefined();
  });

  it('is case-sensitive (no match for uppercase)', () => {
    expect(getTopicBySlug('LLM-AGENTS')).toBeUndefined();
  });
});

// ── getTopicPapers ────────────────────────────────────────────────────────────

const SAMPLE_PAPERS: TopicPaper[] = [
  {
    arxiv_id: '2401.00001',
    title: 'An Agentic LLM Framework',
    abstract: 'We propose a new agent framework.',
    authors: ['Alice', 'Bob'],
    categories: ['cs.AI'],
    published_at: '2024-01-15',
  },
  {
    arxiv_id: '2401.00002',
    title: 'Multi-Agent Coordination',
    abstract: 'Multi-agent systems for reasoning.',
    authors: ['Charlie'],
    categories: ['cs.MA'],
    published_at: '2024-01-14',
  },
];

describe('getTopicPapers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns TopicPaper[] on success', async () => {
    mockSupabase({ data: SAMPLE_PAPERS, error: null });
    const papers = await getTopicPapers('llm-agents');
    expect(papers).toEqual(SAMPLE_PAPERS);
  });

  it('calls from("papers") on the supabase client', async () => {
    const chain = mockSupabase({ data: SAMPLE_PAPERS, error: null });
    await getTopicPapers('llm-agents');
    expect(mockGetSupa().from).toHaveBeenCalledWith('papers');
    void chain; // suppress unused warning
  });

  it('uses .or() for combined category + keyword filter', async () => {
    const chain = mockSupabase({ data: [], error: null });
    await getTopicPapers('llm-agents');
    expect(chain.or).toHaveBeenCalled();
    const orArg = chain.or.mock.calls[0][0] as string;
    expect(orArg).toContain('categories.ov.');
    expect(orArg).toContain('title.ilike.');
  });

  it('uses .gte() for date filtering', async () => {
    const chain = mockSupabase({ data: [], error: null });
    await getTopicPapers('llm-agents');
    expect(chain.gte).toHaveBeenCalledWith('published_at', expect.any(String));
  });

  it('uses .limit() with default 30', async () => {
    const chain = mockSupabase({ data: [], error: null });
    await getTopicPapers('llm-agents');
    expect(chain.limit).toHaveBeenCalledWith(30);
  });

  it('uses .limit() with custom limit', async () => {
    const chain = mockSupabase({ data: [], error: null });
    await getTopicPapers('llm-agents', 10);
    expect(chain.limit).toHaveBeenCalledWith(10);
  });

  it('returns [] on DB error (does not throw)', async () => {
    mockSupabase({ data: null, error: { message: 'DB is down' } });
    const result = await getTopicPapers('llm-agents');
    expect(result).toEqual([]);
  });

  it('returns [] for an invalid slug (no DB call)', async () => {
    const result = await getTopicPapers('invalid-slug-xyz');
    expect(result).toEqual([]);
    expect(mockGetSupa).not.toHaveBeenCalled();
  });

  it('returns [] when data is null and no error', async () => {
    mockSupabase({ data: null, error: null });
    const result = await getTopicPapers('reasoning');
    expect(result).toEqual([]);
  });

  it('handles unexpected thrown error gracefully', async () => {
    mockGetSupa.mockImplementation(() => {
      throw new Error('Connection refused');
    });
    const result = await getTopicPapers('llm-agents');
    expect(result).toEqual([]);
  });
});

// ── getAllTopicsWithCounts ─────────────────────────────────────────────────────

describe('getAllTopicsWithCounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an array with 12 items', async () => {
    mockSupabase({ data: SAMPLE_PAPERS, error: null });
    const result = await getAllTopicsWithCounts();
    expect(result).toHaveLength(12);
  });

  it('each item has a count field', async () => {
    mockSupabase({ data: SAMPLE_PAPERS, error: null });
    const result = await getAllTopicsWithCounts();
    for (const item of result) {
      expect(typeof item.count).toBe('number');
    }
  });

  it('each item has all Topic fields', async () => {
    mockSupabase({ data: SAMPLE_PAPERS, error: null });
    const result = await getAllTopicsWithCounts();
    for (const item of result) {
      expect(item.slug).toBeTruthy();
      expect(item.name).toBeTruthy();
      expect(item.emoji).toBeTruthy();
      expect(item.arxivCats.length).toBeGreaterThan(0);
    }
  });

  it('sets count to 0 when DB errors for a topic', async () => {
    mockSupabase({ data: null, error: { message: 'DB error' } });
    const result = await getAllTopicsWithCounts();
    for (const item of result) {
      expect(item.count).toBe(0);
    }
  });

  it('reflects paper count from DB', async () => {
    mockSupabase({ data: SAMPLE_PAPERS, error: null });
    const result = await getAllTopicsWithCounts();
    // All topics share the same mock returning 2 papers
    for (const item of result) {
      expect(item.count).toBe(2);
    }
  });
});
