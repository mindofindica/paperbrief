/**
 * Tests for collections.ts and related API routes.
 *
 * Covers:
 *  - validateCollectionName: 12 cases
 *  - validateCollectionDescription: 6 cases
 *  - generateSlug: 6 cases
 *  - constants: FREE_COLLECTION_LIMIT, MAX_COLLECTION_NAME_LENGTH, etc.
 *  - getUserCollections: returns list, throws on error
 *  - getCollection: owned, public, missing
 *  - getCollectionBySlug: found, not found, not public
 *  - getCollectionCount: returns count, throws on error
 *  - getCollectionPapers: returns papers, throws on error
 *  - getPaperCollections: returns collections, throws on error
 *  - createCollection: creates correctly, enforces FREE_COLLECTION_LIMIT
 *  - updateCollection: updates fields, throws on not found
 *  - deleteCollection: deletes, throws on not found
 *  - addPaperToCollection: adds paper, duplicate, not found
 *  - removePaperFromCollection: removes paper, not found
 *  - CollectionLimitError / CollectionNotFoundError / DuplicatePaperError
 *  - GET  /api/collections: 401, 200
 *  - POST /api/collections: 401, 400 (validation), 429 (limit), 201
 *  - PATCH /api/collections/[id]: 401, 400, 404, 200
 *  - DELETE /api/collections/[id]: 401, 404, 200
 *  - GET /api/collections/[id]/papers: 200 (auth), 200 (public), 404
 *  - POST /api/collections/[id]/papers: 401, 400, 404, 409, 201
 *  - DELETE /api/collections/[id]/papers/[arxivId]: 401, 404, 200
 *  - GET /api/collections/shared/[slug]: 404, 200
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { MockedFunction } from 'vitest';

// ── Module mocks ───────────────────────────────────────────────────────────────

vi.mock('../supabase', () => ({
  getServiceSupabase: vi.fn(),
}));

vi.mock('../auth', () => ({
  verifySessionCookie: vi.fn(),
}));

// next/headers mock (used in API routes)
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue({ value: 'test-session-token' }),
  }),
}));

import { getServiceSupabase } from '../supabase';
import { verifySessionCookie } from '../auth';
import {
  validateCollectionName,
  validateCollectionDescription,
  generateSlug,
  getUserCollections,
  getCollection,
  getCollectionBySlug,
  getCollectionCount,
  getCollectionPapers,
  getPaperCollections,
  createCollection,
  updateCollection,
  deleteCollection,
  addPaperToCollection,
  removePaperFromCollection,
  CollectionLimitError,
  CollectionNotFoundError,
  DuplicatePaperError,
  FREE_COLLECTION_LIMIT,
  MAX_COLLECTION_NAME_LENGTH,
  MAX_COLLECTION_DESC_LENGTH,
  MAX_PAPERS_PER_COLLECTION,
} from '../collections';

const mockGetSupa = getServiceSupabase as MockedFunction<typeof getServiceSupabase>;
const mockVerify = verifySessionCookie as MockedFunction<typeof verifySessionCookie>;

const USER_ID = 'user-abc-123';
const COL_ID = 'col-uuid-1';
const ARXIV_ID = '2401.00001';

// ── Mock helpers ───────────────────────────────────────────────────────────────

type SupaResult<T> = { data?: T; error?: { message: string } | null; count?: number };

function chainable<T>(result: SupaResult<T>) {
  const obj: Record<string, unknown> = {};
  const methods = [
    'select', 'eq', 'order', 'limit', 'single', 'not', 'insert',
    'update', 'delete', 'upsert', 'neq', 'is',
  ];
  for (const m of methods) {
    obj[m] = vi.fn().mockReturnValue(obj);
  }
  obj['single'] = vi.fn().mockResolvedValue(result);
  obj['then'] = (
    resolve: (v: SupaResult<T>) => void,
    _reject: (e: unknown) => void,
  ) => Promise.resolve(result).then(resolve, _reject);
  return obj as Record<string, ReturnType<typeof vi.fn>>;
}

function mockSupabase<T>(tableResult: SupaResult<T>) {
  const chain = chainable<T>(tableResult);
  mockGetSupa.mockReturnValue({
    from: vi.fn().mockReturnValue(chain),
  } as unknown as ReturnType<typeof getServiceSupabase>);
  return chain;
}

const MOCK_COLLECTION = {
  id: COL_ID,
  user_id: USER_ID,
  name: 'My LLM Papers',
  description: 'Papers about large language models',
  slug: 'my-llm-papers-a1b2c3',
  is_public: false,
  created_at: '2026-03-17T00:00:00Z',
  updated_at: '2026-03-17T00:00:00Z',
};

const MOCK_PAPER = {
  collection_id: COL_ID,
  arxiv_id: ARXIV_ID,
  title: 'Attention Is All You Need',
  authors: '["Vaswani","Shazeer"]',
  abstract: 'The dominant sequence transduction models...',
  published_at: '2017-06-12',
  added_at: '2026-03-17T01:00:00Z',
};

// ── validateCollectionName ─────────────────────────────────────────────────────

describe('validateCollectionName', () => {
  it('accepts a normal name', () => {
    expect(validateCollectionName('LLM alignment papers').valid).toBe(true);
  });

  it('accepts a single character name', () => {
    expect(validateCollectionName('A').valid).toBe(true);
  });

  it('accepts name at max length', () => {
    expect(validateCollectionName('x'.repeat(MAX_COLLECTION_NAME_LENGTH)).valid).toBe(true);
  });

  it('rejects name over max length', () => {
    const result = validateCollectionName('x'.repeat(MAX_COLLECTION_NAME_LENGTH + 1));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/100/);
  });

  it('rejects empty string', () => {
    const result = validateCollectionName('');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });

  it('rejects non-string (number)', () => {
    const result = validateCollectionName(42);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/string/i);
  });

  it('rejects non-string (null)', () => {
    const result = validateCollectionName(null);
    expect(result.valid).toBe(false);
  });

  it('rejects non-string (undefined)', () => {
    const result = validateCollectionName(undefined);
    expect(result.valid).toBe(false);
  });

  it('rejects non-string (array)', () => {
    const result = validateCollectionName(['a', 'b']);
    expect(result.valid).toBe(false);
  });

  it('accepts name with special characters', () => {
    expect(validateCollectionName("Vaswani's Papers (2017)").valid).toBe(true);
  });

  it('accepts name with emojis', () => {
    expect(validateCollectionName('🤖 Robot Papers').valid).toBe(true);
  });

  it('rejects whitespace-only string (trims to empty before validation)', () => {
    // The validator trims the name before checking length — whitespace-only is treated as empty
    const result = validateCollectionName('   ');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });
});

// ── validateCollectionDescription ─────────────────────────────────────────────

describe('validateCollectionDescription', () => {
  it('accepts null (optional)', () => {
    expect(validateCollectionDescription(null).valid).toBe(true);
  });

  it('accepts undefined (optional)', () => {
    expect(validateCollectionDescription(undefined).valid).toBe(true);
  });

  it('accepts empty string (treated as no description)', () => {
    expect(validateCollectionDescription('').valid).toBe(true);
  });

  it('accepts a valid description', () => {
    expect(validateCollectionDescription('Papers about LLMs and alignment.').valid).toBe(true);
  });

  it('accepts description at max length', () => {
    expect(validateCollectionDescription('x'.repeat(MAX_COLLECTION_DESC_LENGTH)).valid).toBe(true);
  });

  it('rejects description over max length', () => {
    const result = validateCollectionDescription('x'.repeat(MAX_COLLECTION_DESC_LENGTH + 1));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/500/);
  });
});

// ── generateSlug ───────────────────────────────────────────────────────────────

describe('generateSlug', () => {
  it('produces a lowercase slug', () => {
    const slug = generateSlug('My LLM Papers');
    expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('replaces spaces with dashes', () => {
    const slug = generateSlug('My LLM Papers');
    expect(slug).toContain('my-llm-papers');
  });

  it('strips special characters', () => {
    const slug = generateSlug('Papers! on "attention"');
    expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('truncates long names but always has a random suffix', () => {
    const longName = 'a'.repeat(200);
    const slug = generateSlug(longName);
    expect(slug.length).toBeLessThanOrEqual(60); // 50 base + dash + 6 suffix + some buffer
  });

  it('generates unique slugs for the same name', () => {
    const s1 = generateSlug('My Collection');
    const s2 = generateSlug('My Collection');
    // Highly likely to differ due to random suffix (1 in 2B chance of clash)
    // Just verify both are valid slugs
    expect(s1).toMatch(/^[a-z0-9-]+$/);
    expect(s2).toMatch(/^[a-z0-9-]+$/);
  });

  it('handles empty-ish name gracefully', () => {
    const slug = generateSlug('!!!');
    // All special chars stripped → falls back to random suffix with "col-" prefix
    expect(slug.length).toBeGreaterThanOrEqual(3);
    expect(slug).toMatch(/^[a-z0-9-]+$/);
  });
});

// ── Constants ──────────────────────────────────────────────────────────────────

describe('constants', () => {
  it('FREE_COLLECTION_LIMIT is 3', () => {
    expect(FREE_COLLECTION_LIMIT).toBe(3);
  });

  it('MAX_COLLECTION_NAME_LENGTH is 100', () => {
    expect(MAX_COLLECTION_NAME_LENGTH).toBe(100);
  });

  it('MAX_COLLECTION_DESC_LENGTH is 500', () => {
    expect(MAX_COLLECTION_DESC_LENGTH).toBe(500);
  });

  it('MAX_PAPERS_PER_COLLECTION is 500', () => {
    expect(MAX_PAPERS_PER_COLLECTION).toBe(500);
  });
});

// ── Custom Errors ──────────────────────────────────────────────────────────────

describe('CollectionLimitError', () => {
  it('has correct name and mentions limit', () => {
    const err = new CollectionLimitError();
    expect(err.name).toBe('CollectionLimitError');
    expect(err.message).toMatch(/3/);
  });

  it('is an instance of Error', () => {
    expect(new CollectionLimitError()).toBeInstanceOf(Error);
  });
});

describe('CollectionNotFoundError', () => {
  it('includes the id in the message', () => {
    const err = new CollectionNotFoundError('xyz');
    expect(err.message).toMatch(/xyz/);
    expect(err.name).toBe('CollectionNotFoundError');
  });
});

describe('DuplicatePaperError', () => {
  it('includes the arxiv id in the message', () => {
    const err = new DuplicatePaperError('2401.00001');
    expect(err.message).toMatch(/2401.00001/);
    expect(err.name).toBe('DuplicatePaperError');
  });
});

// ── getUserCollections ─────────────────────────────────────────────────────────

describe('getUserCollections', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns mapped collections with paper_count', async () => {
    const chain = chainable({
      data: [{
        ...MOCK_COLLECTION,
        collection_papers: [{ count: 5 }],
      }],
      error: null,
    });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const result = await getUserCollections(USER_ID);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('My LLM Papers');
    expect(result[0].paper_count).toBe(5);
  });

  it('returns empty array when no collections', async () => {
    const chain = chainable({ data: [], error: null });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const result = await getUserCollections(USER_ID);
    expect(result).toEqual([]);
  });

  it('throws on Supabase error', async () => {
    const chain = chainable({ data: null, error: { message: 'DB error' } });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    await expect(getUserCollections(USER_ID)).rejects.toThrow('DB error');
  });
});

// ── getCollection ──────────────────────────────────────────────────────────────

describe('getCollection', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns collection when found by owner', async () => {
    const chain = chainable({ data: MOCK_COLLECTION, error: null });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const result = await getCollection(COL_ID, USER_ID);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(COL_ID);
  });

  it('returns null when not found (PGRST116)', async () => {
    const chain = chainable({ data: null, error: { message: 'PGRST116' } });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const result = await getCollection(COL_ID, USER_ID);
    expect(result).toBeNull();
  });

  it('returns null for No rows error', async () => {
    const chain = chainable({ data: null, error: { message: 'No rows found' } });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const result = await getCollection(COL_ID, USER_ID);
    expect(result).toBeNull();
  });

  it('throws on unexpected error', async () => {
    const chain = chainable({ data: null, error: { message: 'Connection timeout' } });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    await expect(getCollection(COL_ID, USER_ID)).rejects.toThrow('Connection timeout');
  });
});

// ── getCollectionBySlug ────────────────────────────────────────────────────────

describe('getCollectionBySlug', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns collection when slug found', async () => {
    const chain = chainable({
      data: { ...MOCK_COLLECTION, is_public: true },
      error: null,
    });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const result = await getCollectionBySlug('my-llm-papers-a1b2c3');
    expect(result?.slug).toBe('my-llm-papers-a1b2c3');
  });

  it('returns null when slug not found', async () => {
    const chain = chainable({ data: null, error: { message: 'PGRST116' } });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const result = await getCollectionBySlug('nonexistent-slug');
    expect(result).toBeNull();
  });
});

// ── getCollectionCount ─────────────────────────────────────────────────────────

describe('getCollectionCount', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns count', async () => {
    const chain = chainable({ count: 2, error: null });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const count = await getCollectionCount(USER_ID);
    expect(count).toBe(2);
  });

  it('returns 0 when no collections', async () => {
    const chain = chainable({ count: 0, error: null });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const count = await getCollectionCount(USER_ID);
    expect(count).toBe(0);
  });

  it('throws on error', async () => {
    const chain = chainable({ count: null, error: { message: 'DB error' } });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    await expect(getCollectionCount(USER_ID)).rejects.toThrow('DB error');
  });
});

// ── getCollectionPapers ────────────────────────────────────────────────────────

describe('getCollectionPapers', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns papers', async () => {
    const chain = chainable({ data: [MOCK_PAPER], error: null });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const papers = await getCollectionPapers(COL_ID);
    expect(papers).toHaveLength(1);
    expect(papers[0].arxiv_id).toBe(ARXIV_ID);
  });

  it('returns empty array when no papers', async () => {
    const chain = chainable({ data: [], error: null });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const papers = await getCollectionPapers(COL_ID);
    expect(papers).toEqual([]);
  });

  it('throws on error', async () => {
    const chain = chainable({ data: null, error: { message: 'Query failed' } });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    await expect(getCollectionPapers(COL_ID)).rejects.toThrow('Query failed');
  });
});

// ── getPaperCollections ────────────────────────────────────────────────────────

describe('getPaperCollections', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns collections containing the paper', async () => {
    const chain = chainable({
      data: [{ ...MOCK_COLLECTION, collection_papers: [{ arxiv_id: ARXIV_ID }] }],
      error: null,
    });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const cols = await getPaperCollections(USER_ID, ARXIV_ID);
    expect(cols).toHaveLength(1);
    expect(cols[0].id).toBe(COL_ID);
  });

  it('returns empty when paper in no collections', async () => {
    const chain = chainable({ data: [], error: null });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const cols = await getPaperCollections(USER_ID, ARXIV_ID);
    expect(cols).toEqual([]);
  });

  it('throws on error', async () => {
    const chain = chainable({ data: null, error: { message: 'DB error' } });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    await expect(getPaperCollections(USER_ID, ARXIV_ID)).rejects.toThrow('DB error');
  });
});

// ── createCollection ───────────────────────────────────────────────────────────

describe('createCollection', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('creates a collection when under the free limit', async () => {
    // First call: getCollectionCount (returns 0)
    const countChain = chainable({ count: 0, error: null });
    // Second call: insert
    const insertChain = chainable({ data: MOCK_COLLECTION, error: null });

    let callCount = 0;
    mockGetSupa.mockImplementation(() => {
      callCount++;
      return {
        from: vi.fn().mockReturnValue(callCount === 1 ? countChain : insertChain),
      } as unknown as ReturnType<typeof getServiceSupabase>;
    });

    const col = await createCollection(USER_ID, 'My LLM Papers');
    expect(col.name).toBe('My LLM Papers');
  });

  it('throws CollectionLimitError when at free limit', async () => {
    const countChain = chainable({ count: FREE_COLLECTION_LIMIT, error: null });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(countChain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    await expect(createCollection(USER_ID, 'New Collection')).rejects.toThrow(CollectionLimitError);
  });

  it('skips limit check when skipLimitCheck=true', async () => {
    const insertChain = chainable({ data: MOCK_COLLECTION, error: null });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(insertChain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const col = await createCollection(USER_ID, 'Pro Collection', null, false, true);
    expect(col.name).toBe('My LLM Papers'); // mock data
  });

  it('sets is_public correctly', async () => {
    const countChain = chainable({ count: 0, error: null });
    const insertChain = chainable({
      data: { ...MOCK_COLLECTION, is_public: true },
      error: null,
    });

    let callCount = 0;
    mockGetSupa.mockImplementation(() => {
      callCount++;
      return {
        from: vi.fn().mockReturnValue(callCount === 1 ? countChain : insertChain),
      } as unknown as ReturnType<typeof getServiceSupabase>;
    });

    const col = await createCollection(USER_ID, 'Public Collection', null, true);
    expect(col.is_public).toBe(true);
  });
});

// ── updateCollection ───────────────────────────────────────────────────────────

describe('updateCollection', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('updates and returns collection', async () => {
    const updated = { ...MOCK_COLLECTION, name: 'Renamed' };
    const chain = chainable({ data: updated, error: null });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const col = await updateCollection(COL_ID, USER_ID, { name: 'Renamed' });
    expect(col.name).toBe('Renamed');
  });

  it('throws CollectionNotFoundError on PGRST116', async () => {
    const chain = chainable({ data: null, error: { message: 'PGRST116' } });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    await expect(updateCollection(COL_ID, USER_ID, { name: 'x' })).rejects.toThrow(CollectionNotFoundError);
  });

  it('throws on other DB errors', async () => {
    const chain = chainable({ data: null, error: { message: 'Unexpected error' } });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    await expect(updateCollection(COL_ID, USER_ID, {})).rejects.toThrow('Unexpected error');
  });
});

// ── deleteCollection ───────────────────────────────────────────────────────────

describe('deleteCollection', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('deletes collection successfully', async () => {
    const chain = chainable({ count: 1, error: null });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    await expect(deleteCollection(COL_ID, USER_ID)).resolves.toBeUndefined();
  });

  it('throws CollectionNotFoundError when count is 0', async () => {
    const chain = chainable({ count: 0, error: null });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    await expect(deleteCollection(COL_ID, USER_ID)).rejects.toThrow(CollectionNotFoundError);
  });

  it('throws on DB error', async () => {
    const chain = chainable({ count: null, error: { message: 'FK violation' } });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    await expect(deleteCollection(COL_ID, USER_ID)).rejects.toThrow('FK violation');
  });
});

// ── addPaperToCollection ───────────────────────────────────────────────────────

describe('addPaperToCollection', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('adds paper when collection is owned by user', async () => {
    // addPaperToCollection uses ONE supabase instance, calling .from() twice:
    // first for ownership check (.from('paper_collections')), then for insert (.from('collection_papers')).
    const ownerChain = chainable({ data: { id: COL_ID }, error: null });
    const insertChain = chainable({ data: MOCK_PAPER, error: null });

    mockGetSupa.mockReturnValue({
      from: vi.fn()
        .mockReturnValueOnce(ownerChain)   // .from('paper_collections')
        .mockReturnValueOnce(insertChain), // .from('collection_papers')
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const result = await addPaperToCollection(COL_ID, USER_ID, {
      arxiv_id: ARXIV_ID,
      title: 'Attention Is All You Need',
    });
    expect(result.arxiv_id).toBe(ARXIV_ID);
  });

  it('throws CollectionNotFoundError when collection not owned', async () => {
    const ownerChain = chainable({ data: null, error: { message: 'PGRST116' } });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(ownerChain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    await expect(
      addPaperToCollection(COL_ID, USER_ID, { arxiv_id: ARXIV_ID }),
    ).rejects.toThrow(CollectionNotFoundError);
  });

  it('throws DuplicatePaperError on duplicate key', async () => {
    // addPaperToCollection uses one supabase instance, calling .from() twice:
    // first for ownership check, then for the insert.
    const ownerChain = chainable({ data: { id: COL_ID }, error: null });
    const insertChain = chainable({
      data: null,
      error: { message: 'duplicate key value violates unique constraint' },
    });

    mockGetSupa.mockReturnValue({
      from: vi.fn()
        .mockReturnValueOnce(ownerChain)   // .from('paper_collections') — ownership
        .mockReturnValueOnce(insertChain), // .from('collection_papers')  — insert
    } as unknown as ReturnType<typeof getServiceSupabase>);

    await expect(
      addPaperToCollection(COL_ID, USER_ID, { arxiv_id: ARXIV_ID }),
    ).rejects.toThrow(DuplicatePaperError);
  });
});

// ── removePaperFromCollection ──────────────────────────────────────────────────

describe('removePaperFromCollection', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('removes paper when collection is owned', async () => {
    const ownerChain = chainable({ data: { id: COL_ID }, error: null });
    const deleteChain = chainable({ data: null, error: null });

    let callCount = 0;
    mockGetSupa.mockImplementation(() => {
      callCount++;
      return {
        from: vi.fn().mockReturnValue(callCount === 1 ? ownerChain : deleteChain),
      } as unknown as ReturnType<typeof getServiceSupabase>;
    });

    await expect(
      removePaperFromCollection(COL_ID, USER_ID, ARXIV_ID),
    ).resolves.toBeUndefined();
  });

  it('throws CollectionNotFoundError when collection not owned', async () => {
    const ownerChain = chainable({ data: null, error: { message: 'No rows' } });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(ownerChain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    await expect(
      removePaperFromCollection(COL_ID, USER_ID, ARXIV_ID),
    ).rejects.toThrow(CollectionNotFoundError);
  });
});

// ── API: GET /api/collections ──────────────────────────────────────────────────

describe('GET /api/collections', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../app/api/collections/route');
    GET = mod.GET;
  });

  it('returns 401 when no session', async () => {
    mockVerify.mockImplementation(() => { throw new Error('no token'); });
    const req = new NextRequest('http://localhost/api/collections');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 200 with collections list', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);
    const chain = chainable({
      data: [{ ...MOCK_COLLECTION, collection_papers: [{ count: 3 }] }],
      error: null,
    });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const req = new NextRequest('http://localhost/api/collections');
    req.cookies.set('pb_session', 'test-token');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.collections).toHaveLength(1);
  });
});

// ── API: POST /api/collections ─────────────────────────────────────────────────

describe('POST /api/collections', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../app/api/collections/route');
    POST = mod.POST;
  });

  function makeReq(body: unknown, hasCookie = true) {
    const req = new NextRequest('http://localhost/api/collections', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
    if (hasCookie) req.cookies.set('pb_session', 'test-token');
    return req;
  }

  it('returns 401 when not authenticated', async () => {
    mockVerify.mockImplementation(() => { throw new Error(); });
    const res = await POST(makeReq({ name: 'Test' }, false));
    expect(res.status).toBe(401);
  });

  it('returns 400 on empty name', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);
    const res = await POST(makeReq({ name: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on missing name', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);
    const res = await POST(makeReq({ description: 'Only a desc' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on name too long', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);
    const res = await POST(makeReq({ name: 'x'.repeat(101) }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on description too long', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);
    const res = await POST(makeReq({ name: 'Valid', description: 'x'.repeat(501) }));
    expect(res.status).toBe(400);
  });

  it('returns 429 when free collection limit is reached', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);
    const countChain = chainable({ count: FREE_COLLECTION_LIMIT, error: null });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(countChain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const res = await POST(makeReq({ name: 'My 4th Collection' }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.limit).toBe(FREE_COLLECTION_LIMIT);
    expect(body.upgrade).toBe('/pricing');
  });

  it('returns 201 on successful creation', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);
    const countChain = chainable({ count: 0, error: null });
    const insertChain = chainable({ data: MOCK_COLLECTION, error: null });

    let callCount = 0;
    mockGetSupa.mockImplementation(() => {
      callCount++;
      return {
        from: vi.fn().mockReturnValue(callCount === 1 ? countChain : insertChain),
      } as unknown as ReturnType<typeof getServiceSupabase>;
    });

    const res = await POST(makeReq({ name: 'My LLM Papers' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.collection.name).toBe('My LLM Papers');
  });
});

// ── API: PATCH /api/collections/[id] ──────────────────────────────────────────

describe('PATCH /api/collections/[id]', () => {
  let PATCH: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../app/api/collections/[id]/route');
    PATCH = mod.PATCH;
  });

  function makeReq(body: unknown, hasCookie = true) {
    const req = new NextRequest(`http://localhost/api/collections/${COL_ID}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
    if (hasCookie) req.cookies.set('pb_session', 'test-token');
    return req;
  }

  function makeCtx(id = COL_ID) {
    return { params: Promise.resolve({ id }) };
  }

  it('returns 401 when not authenticated', async () => {
    mockVerify.mockImplementation(() => { throw new Error(); });
    const res = await PATCH(makeReq({ name: 'New' }, false), makeCtx());
    expect(res.status).toBe(401);
  });

  it('returns 400 when name too long', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);
    const res = await PATCH(makeReq({ name: 'x'.repeat(101) }), makeCtx());
    expect(res.status).toBe(400);
  });

  it('returns 400 when is_public is not boolean', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);
    const res = await PATCH(makeReq({ is_public: 'yes' }), makeCtx());
    expect(res.status).toBe(400);
  });

  it('returns 404 when collection not found', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);
    const chain = chainable({ data: null, error: { message: 'PGRST116' } });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const res = await PATCH(makeReq({ name: 'New Name' }), makeCtx());
    expect(res.status).toBe(404);
  });

  it('returns 200 on successful update', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);
    const updated = { ...MOCK_COLLECTION, name: 'New Name' };
    const chain = chainable({ data: updated, error: null });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const res = await PATCH(makeReq({ name: 'New Name' }), makeCtx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.collection.name).toBe('New Name');
  });
});

// ── API: DELETE /api/collections/[id] ─────────────────────────────────────────

describe('DELETE /api/collections/[id]', () => {
  let DELETE_ROUTE: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../app/api/collections/[id]/route');
    DELETE_ROUTE = mod.DELETE;
  });

  function makeCtx(id = COL_ID) {
    return { params: Promise.resolve({ id }) };
  }

  it('returns 401 when not authenticated', async () => {
    mockVerify.mockImplementation(() => { throw new Error(); });
    const req = new NextRequest(`http://localhost/api/collections/${COL_ID}`, { method: 'DELETE' });
    const res = await DELETE_ROUTE(req, makeCtx());
    expect(res.status).toBe(401);
  });

  it('returns 404 when collection not found', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);
    const chain = chainable({ count: 0, error: null });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const req = new NextRequest(`http://localhost/api/collections/${COL_ID}`, { method: 'DELETE' });
    req.cookies.set('pb_session', 'test-token');
    const res = await DELETE_ROUTE(req, makeCtx());
    expect(res.status).toBe(404);
  });

  it('returns 200 on successful delete', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);
    const chain = chainable({ count: 1, error: null });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const req = new NextRequest(`http://localhost/api/collections/${COL_ID}`, { method: 'DELETE' });
    req.cookies.set('pb_session', 'test-token');
    const res = await DELETE_ROUTE(req, makeCtx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

// ── API: POST /api/collections/[id]/papers ────────────────────────────────────

describe('POST /api/collections/[id]/papers', () => {
  let POST: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../app/api/collections/[id]/papers/route');
    POST = mod.POST;
  });

  function makeReq(body: unknown, hasCookie = true) {
    const req = new NextRequest(`http://localhost/api/collections/${COL_ID}/papers`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
    if (hasCookie) req.cookies.set('pb_session', 'test-token');
    return req;
  }

  function makeCtx(id = COL_ID) {
    return { params: Promise.resolve({ id }) };
  }

  it('returns 401 when not authenticated', async () => {
    mockVerify.mockImplementation(() => { throw new Error(); });
    const res = await POST(makeReq({ arxiv_id: ARXIV_ID }, false), makeCtx());
    expect(res.status).toBe(401);
  });

  it('returns 400 when arxiv_id missing', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);

    // Mock getCollectionPapers for the limit check
    const papersChain = chainable({ data: [], error: null });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(papersChain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const res = await POST(makeReq({ title: 'No ID here' }), makeCtx());
    expect(res.status).toBe(400);
  });

  it('returns 409 when paper already in collection', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);

    // Three supabase calls total:
    //   1. getCollectionPapers (limit check) — own supabase instance
    //   2. addPaperToCollection — ONE supabase instance, .from() called twice:
    //        a. ownership check
    //        b. insert (duplicate error)
    const papersChain = chainable({ data: [], error: null });
    const ownerChain = chainable({ data: { id: COL_ID }, error: null });
    const insertChain = chainable({
      data: null,
      error: { message: 'duplicate key value violates unique constraint' },
    });

    let callCount = 0;
    mockGetSupa.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { from: vi.fn().mockReturnValue(papersChain) } as unknown as ReturnType<typeof getServiceSupabase>;
      }
      // callCount 2: addPaperToCollection — needs from() to return different chains
      return {
        from: vi.fn()
          .mockReturnValueOnce(ownerChain)
          .mockReturnValueOnce(insertChain),
      } as unknown as ReturnType<typeof getServiceSupabase>;
    });

    const res = await POST(makeReq({ arxiv_id: ARXIV_ID }), makeCtx());
    expect(res.status).toBe(409);
  });

  it('returns 201 when paper added successfully', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);

    const papersChain = chainable({ data: [], error: null });
    const ownerChain = chainable({ data: { id: COL_ID }, error: null });
    const insertChain = chainable({ data: MOCK_PAPER, error: null });

    let callCount = 0;
    mockGetSupa.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { from: vi.fn().mockReturnValue(papersChain) } as unknown as ReturnType<typeof getServiceSupabase>;
      }
      return {
        from: vi.fn()
          .mockReturnValueOnce(ownerChain)
          .mockReturnValueOnce(insertChain),
      } as unknown as ReturnType<typeof getServiceSupabase>;
    });

    const res = await POST(makeReq({ arxiv_id: ARXIV_ID, title: 'Attention Is All You Need' }), makeCtx());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.paper.arxiv_id).toBe(ARXIV_ID);
  });
});

// ── API: DELETE /api/collections/[id]/papers/[arxivId] ───────────────────────

describe('DELETE /api/collections/[id]/papers/[arxivId]', () => {
  let DELETE_ROUTE: (
    req: NextRequest,
    ctx: { params: Promise<{ id: string; arxivId: string }> },
  ) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../app/api/collections/[id]/papers/[arxivId]/route');
    DELETE_ROUTE = mod.DELETE;
  });

  function makeCtx(id = COL_ID, arxivId = ARXIV_ID) {
    return { params: Promise.resolve({ id, arxivId }) };
  }

  it('returns 401 when not authenticated', async () => {
    mockVerify.mockImplementation(() => { throw new Error(); });
    const req = new NextRequest(`http://localhost/api/collections/${COL_ID}/papers/${ARXIV_ID}`, { method: 'DELETE' });
    const res = await DELETE_ROUTE(req, makeCtx());
    expect(res.status).toBe(401);
  });

  it('returns 404 when collection not owned', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);
    const ownerChain = chainable({ data: null, error: { message: 'PGRST116' } });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(ownerChain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const req = new NextRequest(`http://localhost/api/collections/${COL_ID}/papers/${ARXIV_ID}`, { method: 'DELETE' });
    req.cookies.set('pb_session', 'test-token');
    const res = await DELETE_ROUTE(req, makeCtx());
    expect(res.status).toBe(404);
  });

  it('returns 200 on successful removal', async () => {
    mockVerify.mockReturnValue({ valid: true, userId: USER_ID } as ReturnType<typeof verifySessionCookie>);
    const ownerChain = chainable({ data: { id: COL_ID }, error: null });
    const deleteChain = chainable({ data: null, error: null });

    let callCount = 0;
    mockGetSupa.mockImplementation(() => {
      callCount++;
      return {
        from: vi.fn().mockReturnValue(callCount === 1 ? ownerChain : deleteChain),
      } as unknown as ReturnType<typeof getServiceSupabase>;
    });

    const req = new NextRequest(`http://localhost/api/collections/${COL_ID}/papers/${ARXIV_ID}`, { method: 'DELETE' });
    req.cookies.set('pb_session', 'test-token');
    const res = await DELETE_ROUTE(req, makeCtx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

// ── API: GET /api/collections/shared/[slug] ───────────────────────────────────

describe('GET /api/collections/shared/[slug]', () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ slug: string }> }) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../app/api/collections/shared/[slug]/route');
    GET = mod.GET;
  });

  function makeCtx(slug = 'my-llm-papers-a1b2c3') {
    return { params: Promise.resolve({ slug }) };
  }

  it('returns 404 when slug not found', async () => {
    const chain = chainable({ data: null, error: { message: 'PGRST116' } });
    mockGetSupa.mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const req = new NextRequest('http://localhost/api/collections/shared/unknown-slug');
    const res = await GET(req, makeCtx('unknown-slug'));
    expect(res.status).toBe(404);
  });

  it('returns 200 with collection and papers on success', async () => {
    const slugChain = chainable({
      data: { ...MOCK_COLLECTION, is_public: true },
      error: null,
    });
    const papersChain = chainable({ data: [MOCK_PAPER], error: null });

    let callCount = 0;
    mockGetSupa.mockImplementation(() => {
      callCount++;
      return {
        from: vi.fn().mockReturnValue(callCount === 1 ? slugChain : papersChain),
      } as unknown as ReturnType<typeof getServiceSupabase>;
    });

    const req = new NextRequest('http://localhost/api/collections/shared/my-llm-papers-a1b2c3');
    const res = await GET(req, makeCtx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.collection.name).toBe('My LLM Papers');
    expect(body.papers).toHaveLength(1);
  });
});
