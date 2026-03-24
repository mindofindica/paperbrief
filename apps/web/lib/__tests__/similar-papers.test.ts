/**
 * Tests for lib/similar-papers.ts
 *
 * Tests pure helpers directly, and uses a Supabase chainable mock for the
 * async getSimilarPapers() function — matching the pattern in today.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MockedFunction } from 'vitest';

// ── Module mock ───────────────────────────────────────────────────────────────

vi.mock('../supabase', () => ({
  getServiceSupabase: vi.fn(),
}));

import { getServiceSupabase } from '../supabase';
import {
  extractTitleWords,
  computeSimilarityScore,
  getSimilarPapers,
  TITLE_STOPWORDS,
  type SimilarPaper,
} from '../similar-papers';

const mockGetSupa = getServiceSupabase as MockedFunction<typeof getServiceSupabase>;

// ── Chainable mock builder ────────────────────────────────────────────────────

type DbResult<T> = { data?: T | null; error?: { message: string } | null };

function makeChain<T>(result: DbResult<T>) {
  const chain: Record<string, unknown> = {};
  const methods = [
    'select', 'eq', 'neq', 'gte', 'lte', 'single',
    'overlaps', 'limit', 'order', 'not',
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Make the chain itself awaitable
  chain['then'] = (
    resolve: (v: DbResult<T>) => void,
    _reject: (e: unknown) => void,
  ) => Promise.resolve(result).then(resolve, _reject);
  return chain as Record<string, ReturnType<typeof vi.fn>>;
}

/**
 * Wires up mockGetSupa to return different chains for consecutive from() calls.
 */
function mockTwoQueries<A, B>(seedResult: DbResult<A>, candidatesResult: DbResult<B>) {
  const seedChain = makeChain(seedResult);
  const candidatesChain = makeChain(candidatesResult);

  mockGetSupa.mockReturnValue({
    from: vi.fn()
      .mockReturnValueOnce(seedChain)
      .mockReturnValueOnce(candidatesChain),
  } as unknown as ReturnType<typeof getServiceSupabase>);

  return { seedChain, candidatesChain };
}

// ── Sample data ───────────────────────────────────────────────────────────────

const SEED = {
  arxiv_id: '2401.00001',
  title: 'Efficient Transformer Attention Mechanisms',
  categories: ['cs.LG', 'cs.AI'],
};

const CANDIDATE_CLOSE = {
  arxiv_id: '2401.00002',
  title: 'Scalable Transformer Attention for Language Models',
  authors: ['Alice Smith', 'Bob Jones'],
  published_at: '2024-01-14',
  categories: ['cs.LG', 'cs.AI', 'cs.CL'], // 2 shared cats → 6 pts + shared words
};

const CANDIDATE_PARTIAL = {
  arxiv_id: '2401.00003',
  title: 'Reinforcement Learning Agents in Robotics',
  authors: ['Carol White'],
  published_at: '2024-01-10',
  categories: ['cs.AI'], // 1 shared cat → 3 pts
};

const CANDIDATE_UNRELATED = {
  arxiv_id: '2401.00004',
  title: 'Protein Folding in Biochemistry',
  authors: ['Dave Brown'],
  published_at: '2024-01-05',
  categories: ['q-bio.BM'], // no shared cats or title words
};

// ── extractTitleWords ─────────────────────────────────────────────────────────

describe('extractTitleWords()', () => {
  it('returns a Set of significant lowercase words', () => {
    const words = extractTitleWords('Efficient Transformer Attention Mechanisms');
    expect(words).toBeInstanceOf(Set);
    expect(words.has('efficient')).toBe(true);
    expect(words.has('transformer')).toBe(true);
    expect(words.has('attention')).toBe(true);
    expect(words.has('mechanisms')).toBe(true);
  });

  it('filters stopwords', () => {
    const words = extractTitleWords('The Role of Attention in Neural Networks');
    expect(words.has('the')).toBe(false);
    expect(words.has('of')).toBe(false);
    expect(words.has('in')).toBe(false);
  });

  it('filters words shorter than 4 chars', () => {
    const words = extractTitleWords('GPT LLM Scaling Laws for NLP');
    expect(words.has('gpt')).toBe(false); // 3 chars
    expect(words.has('llm')).toBe(false); // 3 chars
    expect(words.has('for')).toBe(false); // stopword + 3 chars
    expect(words.has('nlp')).toBe(false); // 3 chars
    expect(words.has('scaling')).toBe(true);
    expect(words.has('laws')).toBe(true);
  });

  it('filters pure numbers', () => {
    const words = extractTitleWords('GPT-4 with 128 Layers Achieves New Records');
    expect(words.has('128')).toBe(false);
  });

  it('normalises to lowercase', () => {
    const words = extractTitleWords('BERT: Pre-training Language Representations');
    expect(words.has('bert')).toBe(true);
    expect(words.has('pre')).toBe(false); // 3 chars
    expect(words.has('training')).toBe(true);
    expect(words.has('language')).toBe(true);
    expect(words.has('representations')).toBe(true);
  });

  it('returns empty set for empty string', () => {
    expect(extractTitleWords('').size).toBe(0);
  });

  it('deduplicates repeated words', () => {
    const words = extractTitleWords('Neural Neural Networks');
    expect(words.has('neural')).toBe(true);
    expect(words.size).toBeLessThanOrEqual(2); // "neural" + "networks" (deduped)
  });

  it('TITLE_STOPWORDS contains common academic words', () => {
    expect(TITLE_STOPWORDS.has('paper')).toBe(true);
    expect(TITLE_STOPWORDS.has('method')).toBe(true);
    expect(TITLE_STOPWORDS.has('approach')).toBe(true);
    expect(TITLE_STOPWORDS.has('results')).toBe(true);
  });
});

// ── computeSimilarityScore ────────────────────────────────────────────────────

describe('computeSimilarityScore()', () => {
  it('returns category_overlap × 3 + word_overlap × 1', () => {
    const seedCats = ['cs.LG', 'cs.AI'];
    const seedWords = new Set(['transformer', 'attention', 'efficient']);
    const candidateCats = ['cs.LG', 'cs.AI']; // 2 shared cats → 6
    const candidateTitle = 'Transformer Attention Scaling'; // 2 shared words → 2
    const score = computeSimilarityScore(seedCats, seedWords, candidateCats, candidateTitle);
    expect(score).toBe(8); // 6 + 2
  });

  it('returns 0 when nothing is shared', () => {
    const score = computeSimilarityScore(
      ['cs.LG'],
      new Set(['neural', 'network']),
      ['q-bio.BM'],
      'Protein Folding in Biochemistry',
    );
    expect(score).toBe(0);
  });

  it('scores only on categories when title words are empty', () => {
    const score = computeSimilarityScore(
      ['cs.LG', 'cs.AI'],
      new Set<string>(),
      ['cs.AI'],
      'Some Unrelated Title Here',
    );
    expect(score).toBe(3); // 1 shared cat × 3
  });

  it('scores only on title words when categories are empty', () => {
    const score = computeSimilarityScore(
      [],
      new Set(['transformer', 'attention']),
      [],
      'Efficient Attention Transformer Model',
    );
    expect(score).toBe(2); // 'transformer' + 'attention' each match → 2
  });

  it('handles partial category overlap correctly', () => {
    const score = computeSimilarityScore(
      ['cs.LG', 'cs.AI', 'cs.CL'],
      new Set<string>(),
      ['cs.AI', 'stat.ML'], // 1 of 3 matches
      '',
    );
    expect(score).toBe(3); // 1 × 3
  });

  it('weights categories higher than title words', () => {
    const oneCategory = computeSimilarityScore(
      ['cs.LG'],
      new Set<string>(),
      ['cs.LG'],
      '',
    );
    const fiveTitleWords = computeSimilarityScore(
      [],
      new Set(['word1', 'word2', 'word3', 'word4', 'word5']),
      [],
      'word1 word2 word3 word4 word5',
    );
    // 1 category = 3 pts; 5 title words = 5 pts
    expect(oneCategory).toBe(3);
    expect(fiveTitleWords).toBe(5);
  });
});

// ── getSimilarPapers ──────────────────────────────────────────────────────────

describe('getSimilarPapers()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns up to limit papers sorted by score descending', async () => {
    mockTwoQueries(
      { data: SEED, error: null },
      { data: [CANDIDATE_CLOSE, CANDIDATE_PARTIAL, CANDIDATE_UNRELATED], error: null },
    );

    const results = await getSimilarPapers('2401.00001', 5);
    expect(results.length).toBeGreaterThan(0);
    // First result should have higher score than second
    if (results.length >= 2) {
      expect(results[0]!.score).toBeGreaterThanOrEqual(results[1]!.score);
    }
  });

  it('excludes papers with score = 0', async () => {
    mockTwoQueries(
      { data: SEED, error: null },
      { data: [CANDIDATE_UNRELATED], error: null },
    );

    const results = await getSimilarPapers('2401.00001');
    expect(results).toHaveLength(0);
  });

  it('respects the limit parameter', async () => {
    const manyCandidates = Array.from({ length: 20 }, (_, i) => ({
      ...CANDIDATE_CLOSE,
      arxiv_id: `2401.${String(i + 10).padStart(5, '0')}`,
    }));

    mockTwoQueries(
      { data: SEED, error: null },
      { data: manyCandidates, error: null },
    );

    const results = await getSimilarPapers('2401.00001', 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('returns [] when seed paper is not found', async () => {
    mockTwoQueries(
      { data: null, error: { message: 'Not found' } },
      { data: [], error: null },
    );

    const results = await getSimilarPapers('nonexistent-id');
    expect(results).toEqual([]);
  });

  it('returns [] when candidates query fails', async () => {
    mockTwoQueries(
      { data: SEED, error: null },
      { data: null, error: { message: 'DB error' } },
    );

    const results = await getSimilarPapers('2401.00001');
    expect(results).toEqual([]);
  });

  it('returns [] when arxivId is empty string', async () => {
    const results = await getSimilarPapers('');
    expect(results).toEqual([]);
    expect(mockGetSupa).not.toHaveBeenCalled();
  });

  it('returns [] when candidates list is empty', async () => {
    mockTwoQueries(
      { data: SEED, error: null },
      { data: [], error: null },
    );

    const results = await getSimilarPapers('2401.00001');
    expect(results).toEqual([]);
  });

  it('returns [] when seed has no categories and no title words', async () => {
    mockTwoQueries(
      { data: { arxiv_id: '2401.00001', title: '', categories: [] }, error: null },
      { data: [CANDIDATE_CLOSE], error: null },
    );

    const results = await getSimilarPapers('2401.00001');
    // Empty signal → bails early, no candidates query
    expect(results).toEqual([]);
  });

  it('populates SimilarPaper fields correctly', async () => {
    mockTwoQueries(
      { data: SEED, error: null },
      { data: [CANDIDATE_CLOSE], error: null },
    );

    const results = await getSimilarPapers('2401.00001');
    expect(results.length).toBeGreaterThan(0);

    const paper = results[0] as SimilarPaper;
    expect(paper.arxiv_id).toBe('2401.00002');
    expect(paper.title).toBe('Scalable Transformer Attention for Language Models');
    expect(paper.authors).toEqual(['Alice Smith', 'Bob Jones']);
    expect(paper.published_at).toBe('2024-01-14');
    expect(paper.categories).toContain('cs.LG');
    expect(paper.score).toBeGreaterThan(0);
  });

  it('handles null/undefined authors gracefully', async () => {
    mockTwoQueries(
      { data: SEED, error: null },
      { data: [{ ...CANDIDATE_CLOSE, authors: null }], error: null },
    );

    const results = await getSimilarPapers('2401.00001');
    if (results.length > 0) {
      expect(results[0]!.authors).toEqual([]);
    }
  });

  it('handles null/undefined categories in candidates gracefully', async () => {
    mockTwoQueries(
      { data: SEED, error: null },
      { data: [{ ...CANDIDATE_CLOSE, categories: null }], error: null },
    );

    const results = await getSimilarPapers('2401.00001');
    // No cat overlap, so score = 0 if categories null → filtered out
    // If some title word overlap → might survive. Either way no crash.
    expect(Array.isArray(results)).toBe(true);
  });

  it('tie-breaks by published_at descending', async () => {
    const olderPaper = {
      ...CANDIDATE_CLOSE,
      arxiv_id: '2401.00010',
      published_at: '2024-01-01',
    };
    const newerPaper = {
      ...CANDIDATE_CLOSE,
      arxiv_id: '2401.00011',
      published_at: '2024-01-20',
    };

    // Both have the same categories → same score
    mockTwoQueries(
      { data: SEED, error: null },
      { data: [olderPaper, newerPaper], error: null },
    );

    const results = await getSimilarPapers('2401.00001');
    if (results.length === 2) {
      // Newer should come first on tie
      expect(results[0]!.published_at).toBe('2024-01-20');
      expect(results[1]!.published_at).toBe('2024-01-01');
    }
  });

  it('returns [] when a JS exception is thrown internally', async () => {
    mockGetSupa.mockImplementation(() => {
      throw new Error('Unexpected crash');
    });

    const results = await getSimilarPapers('2401.00001');
    expect(results).toEqual([]);
  });

  it('default limit is 5', async () => {
    const candidates = Array.from({ length: 10 }, (_, i) => ({
      ...CANDIDATE_CLOSE,
      arxiv_id: `2401.${String(i + 50).padStart(5, '0')}`,
    }));

    mockTwoQueries(
      { data: SEED, error: null },
      { data: candidates, error: null },
    );

    const results = await getSimilarPapers('2401.00001');
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it('higher category overlap produces higher score than lower', async () => {
    const twoSharedCats = {
      arxiv_id: '2401.00020',
      title: 'Unrelated Title XYZ',
      authors: [],
      published_at: '2024-01-10',
      categories: ['cs.LG', 'cs.AI'], // 2 shared → 6
    };
    const oneSharedCat = {
      arxiv_id: '2401.00021',
      title: 'Unrelated Title XYZ',
      authors: [],
      published_at: '2024-01-10',
      categories: ['cs.LG'], // 1 shared → 3
    };

    mockTwoQueries(
      { data: SEED, error: null },
      { data: [oneSharedCat, twoSharedCats], error: null },
    );

    const results = await getSimilarPapers('2401.00001');
    expect(results.length).toBe(2);
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
    expect(results[0]!.arxiv_id).toBe('2401.00020');
  });
});
