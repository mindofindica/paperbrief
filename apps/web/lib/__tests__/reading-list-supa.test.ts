/**
 * Tests for reading-list-supa.ts — Supabase-backed per-user reading list helpers.
 *
 * Covers:
 *  - isValidStatus: validates enum correctly (8 cases)
 *  - getUserReadingList: returns empty array when no items
 *  - getUserReadingList: joins paper metadata from SQLite
 *  - getUserReadingList: falls back gracefully when paper not in SQLite
 *  - getUserReadingList: throws on Supabase error
 *  - getUserReadingList: defaults status to "unread" when DB row has null
 *  - getReadingListEntry: returns null when not found
 *  - getReadingListEntry: returns entry details when found
 *  - upsertReadingListItem: sends correct payload via supabase upsert
 *  - upsertReadingListItem: includes optional note and priority
 *  - upsertReadingListItem: defaults priority=0, note=null when options omitted
 *  - upsertReadingListItem: throws on Supabase error
 *  - removeReadingListItem: calls delete with correct table and filters
 *  - removeReadingListItem: throws on Supabase error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks ───────────────────────────────────────────────────────────────

vi.mock('../supabase', () => ({
  getServiceSupabase: vi.fn(),
}));

vi.mock('../arxiv-db', () => ({
  getPaper: vi.fn(),
}));

import { getServiceSupabase } from '../supabase';
import { getPaper } from '../arxiv-db';
import {
  getUserReadingList,
  getReadingListEntry,
  upsertReadingListItem,
  removeReadingListItem,
  isValidStatus,
} from '../reading-list-supa';

import type { MockedFunction } from 'vitest';
const mockGetSupa = getServiceSupabase as MockedFunction<typeof getServiceSupabase>;
const mockGetPaper = getPaper as MockedFunction<typeof getPaper>;

// ── Thenable chain builder ─────────────────────────────────────────────────────
//
// Supabase queries are lazy Promises with chainable methods. We need mocks that
// both chain (.eq(), .not(), .order()) AND can be awaited (implement .then()).
// This helper builds such a "thenable chainable" mock.

function thenable<T>(resolveWith: T) {
  const obj: Record<string, unknown> = {};
  const self = () => obj;

  obj['eq'] = vi.fn().mockReturnValue(obj);
  obj['not'] = vi.fn().mockReturnValue(obj);
  obj['order'] = vi.fn().mockReturnValue(obj);
  obj['single'] = vi.fn().mockResolvedValue(resolveWith);
  // Make it awaitable — this is how Supabase's PostgREST builder works
  obj['then'] = (
    resolve: (v: T) => void,
    reject: (e: unknown) => void,
  ) => Promise.resolve(resolveWith).then(resolve, reject);

  return obj as unknown as {
    eq: ReturnType<typeof vi.fn>;
    not: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
  };
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

const USER_ID = 'user-abc';
const ARXIV_ID = '2401.12345';

const MOCK_PAPER = {
  arxiv_id: ARXIV_ID,
  title: 'Deep Learning is Great',
  abstract: 'We show that deep learning is great.',
  track: 'cs.LG',
  llm_score: 8,
  published_at: '2024-01-15',
};

const DB_ROW = {
  arxiv_id: ARXIV_ID,
  status: 'unread',
  priority: 0,
  note: null,
  saved_at: '2026-03-14T00:00:00Z',
};

// ── isValidStatus ──────────────────────────────────────────────────────────────

describe('isValidStatus', () => {
  it('returns true for "unread"', () => expect(isValidStatus('unread')).toBe(true));
  it('returns true for "reading"', () => expect(isValidStatus('reading')).toBe(true));
  it('returns true for "done"', () => expect(isValidStatus('done')).toBe(true));
  it('returns false for empty string', () => expect(isValidStatus('')).toBe(false));
  it('returns false for "pending"', () => expect(isValidStatus('pending')).toBe(false));
  it('returns false for null', () => expect(isValidStatus(null)).toBe(false));
  it('returns false for number', () => expect(isValidStatus(42)).toBe(false));
  it('returns false for undefined', () => expect(isValidStatus(undefined)).toBe(false));
});

// ── getUserReadingList ─────────────────────────────────────────────────────────

describe('getUserReadingList', () => {
  beforeEach(() => vi.clearAllMocks());

  function makeSelectSupa(rows: unknown[], error: unknown = null) {
    const chain = thenable({ data: rows, error });
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(chain),
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }),
    };
  }

  it('returns empty array when no items saved', async () => {
    mockGetSupa.mockReturnValue(makeSelectSupa([]) as never);

    const result = await getUserReadingList(USER_ID);
    expect(result).toEqual([]);
  });

  it('joins paper metadata from SQLite', async () => {
    mockGetSupa.mockReturnValue(makeSelectSupa([DB_ROW]) as never);
    mockGetPaper.mockReturnValue(MOCK_PAPER as never);

    const result = await getUserReadingList(USER_ID);

    expect(result).toHaveLength(1);
    expect(result[0].arxiv_id).toBe(ARXIV_ID);
    expect(result[0].title).toBe('Deep Learning is Great');
    expect(result[0].track).toBe('cs.LG');
    expect(result[0].llm_score).toBe(8);
    expect(result[0].status).toBe('unread');
    expect(result[0].saved_at).toBe('2026-03-14T00:00:00Z');
  });

  it('falls back gracefully when paper not in SQLite', async () => {
    mockGetSupa.mockReturnValue(makeSelectSupa([DB_ROW]) as never);
    mockGetPaper.mockReturnValue(null);

    const result = await getUserReadingList(USER_ID);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe(ARXIV_ID); // arxiv_id as fallback title
    expect(result[0].abstract).toBeNull();
    expect(result[0].track).toBeNull();
    expect(result[0].llm_score).toBeNull();
  });

  it('throws when Supabase returns an error', async () => {
    mockGetSupa.mockReturnValue(makeSelectSupa([], { message: 'db error' }) as never);

    await expect(getUserReadingList(USER_ID)).rejects.toThrow('db error');
  });

  it('defaults status to "unread" when row has null status', async () => {
    mockGetSupa.mockReturnValue(makeSelectSupa([{ ...DB_ROW, status: null }]) as never);
    mockGetPaper.mockReturnValue(MOCK_PAPER as never);

    const result = await getUserReadingList(USER_ID);
    expect(result[0].status).toBe('unread');
  });
});

// ── getReadingListEntry ────────────────────────────────────────────────────────

describe('getReadingListEntry', () => {
  beforeEach(() => vi.clearAllMocks());

  function makeSingleSupa(result: { data: unknown; error: unknown }) {
    const chain = thenable(result);
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(chain),
      }),
    };
  }

  it('returns null when entry does not exist (Supabase error)', async () => {
    mockGetSupa.mockReturnValue(
      makeSingleSupa({ data: null, error: { message: 'not found' } }) as never,
    );

    const result = await getReadingListEntry(USER_ID, ARXIV_ID);
    expect(result).toBeNull();
  });

  it('returns null when data is null (no row)', async () => {
    mockGetSupa.mockReturnValue(
      makeSingleSupa({ data: null, error: null }) as never,
    );

    const result = await getReadingListEntry(USER_ID, ARXIV_ID);
    expect(result).toBeNull();
  });

  it('returns entry details when found', async () => {
    mockGetSupa.mockReturnValue(
      makeSingleSupa({
        data: { status: 'reading', priority: 1, note: 'Great paper' },
        error: null,
      }) as never,
    );

    const result = await getReadingListEntry(USER_ID, ARXIV_ID);
    expect(result).not.toBeNull();
    expect(result?.status).toBe('reading');
    expect(result?.priority).toBe(1);
    expect(result?.note).toBe('Great paper');
  });
});

// ── upsertReadingListItem ──────────────────────────────────────────────────────

describe('upsertReadingListItem', () => {
  beforeEach(() => vi.clearAllMocks());

  function makeUpsertSupa(upsertError: unknown = null) {
    const upsertFn = vi.fn().mockResolvedValue({ error: upsertError });
    const fromResult = { upsert: upsertFn };
    return { from: vi.fn().mockReturnValue(fromResult), _upsert: upsertFn };
  }

  it('calls supabase upsert with correct payload', async () => {
    const { supa, _upsert } = (() => {
      const upsertFn = vi.fn().mockResolvedValue({ error: null });
      const fromResult = { upsert: upsertFn };
      const s = { from: vi.fn().mockReturnValue(fromResult) };
      mockGetSupa.mockReturnValue(s as never);
      return { supa: s, _upsert: upsertFn };
    })();

    await upsertReadingListItem(USER_ID, ARXIV_ID, 'reading');

    expect(supa.from).toHaveBeenCalledWith('reading_list');
    const payload = _upsert.mock.calls[0][0];
    expect(payload.user_id).toBe(USER_ID);
    expect(payload.arxiv_id).toBe(ARXIV_ID);
    expect(payload.status).toBe('reading');
    const opts = _upsert.mock.calls[0][1];
    expect(opts).toMatchObject({ onConflict: 'user_id,arxiv_id' });
  });

  it('includes optional note and priority when provided', async () => {
    const upsertFn = vi.fn().mockResolvedValue({ error: null });
    mockGetSupa.mockReturnValue({ from: vi.fn().mockReturnValue({ upsert: upsertFn }) } as never);

    await upsertReadingListItem(USER_ID, ARXIV_ID, 'done', { note: 'Read it!', priority: 2 });

    const payload = upsertFn.mock.calls[0][0];
    expect(payload.note).toBe('Read it!');
    expect(payload.priority).toBe(2);
  });

  it('defaults priority=0 and note=null when options omitted', async () => {
    const upsertFn = vi.fn().mockResolvedValue({ error: null });
    mockGetSupa.mockReturnValue({ from: vi.fn().mockReturnValue({ upsert: upsertFn }) } as never);

    await upsertReadingListItem(USER_ID, ARXIV_ID, 'unread');

    const payload = upsertFn.mock.calls[0][0];
    expect(payload.priority).toBe(0);
    expect(payload.note).toBeNull();
  });

  it('throws when Supabase returns an error', async () => {
    const upsertFn = vi.fn().mockResolvedValue({ error: { message: 'constraint violation' } });
    mockGetSupa.mockReturnValue({ from: vi.fn().mockReturnValue({ upsert: upsertFn }) } as never);

    await expect(upsertReadingListItem(USER_ID, ARXIV_ID, 'unread')).rejects.toThrow(
      'constraint violation',
    );
  });
});

// ── removeReadingListItem ──────────────────────────────────────────────────────

describe('removeReadingListItem', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls supabase delete on the correct table and filters', async () => {
    const eqFn2 = vi.fn().mockResolvedValue({ error: null });
    const eqFn1 = vi.fn().mockReturnValue({ eq: eqFn2 });
    const deleteFn = vi.fn().mockReturnValue({ eq: eqFn1 });
    const fromFn = vi.fn().mockReturnValue({ delete: deleteFn });
    mockGetSupa.mockReturnValue({ from: fromFn } as never);

    await removeReadingListItem(USER_ID, ARXIV_ID);

    expect(fromFn).toHaveBeenCalledWith('reading_list');
    expect(deleteFn).toHaveBeenCalled();
    expect(eqFn1).toHaveBeenCalledWith('user_id', USER_ID);
    expect(eqFn2).toHaveBeenCalledWith('arxiv_id', ARXIV_ID);
  });

  it('throws when Supabase returns an error', async () => {
    const eqFn2 = vi.fn().mockResolvedValue({ error: { message: 'delete failed' } });
    const eqFn1 = vi.fn().mockReturnValue({ eq: eqFn2 });
    const deleteFn = vi.fn().mockReturnValue({ eq: eqFn1 });
    mockGetSupa.mockReturnValue({ from: vi.fn().mockReturnValue({ delete: deleteFn }) } as never);

    await expect(removeReadingListItem(USER_ID, ARXIV_ID)).rejects.toThrow('delete failed');
  });
});
