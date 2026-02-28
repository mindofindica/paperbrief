import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReadingListEntry } from '../arxiv-db';

vi.mock('../arxiv-db', () => ({
  getTodaysPapers: vi.fn(),
  getPaper: vi.fn(),
  getReadingList: vi.fn(),
  writeFeedback: vi.fn(),
  updateReadingList: vi.fn(),
  getRawDb: vi.fn(),
  closeDb: vi.fn(),
}));

import { getReadingList, updateReadingList } from '../arxiv-db';

function makeEntry(arxivId: string, status: string, priority = 0): ReadingListEntry {
  return {
    arxiv_id: arxivId,
    title: `Paper ${arxivId}`,
    abstract: 'Test abstract',
    published_at: '2026-02-28T00:00:00Z',
    llm_score: 3,
    track: 'Agents / Memory',
    authors: '[]',
    url: `https://arxiv.org/abs/${arxivId}`,
    status,
    priority,
    added_at: '2026-02-28T00:00:00Z',
    notes: null,
  };
}

const allEntries: ReadingListEntry[] = [
  makeEntry('2602.10001', 'unread', 1),
  makeEntry('2602.10002', 'reading', 0),
  makeEntry('2602.10003', 'done', 0),
];

describe('getReadingList', () => {
  beforeEach(() => {
    vi.mocked(getReadingList).mockClear();
    vi.mocked(updateReadingList).mockClear();
  });

  it('returns empty list when nothing saved', () => {
    vi.mocked(getReadingList).mockReturnValue([]);
    expect(getReadingList()).toEqual([]);
  });

  it('returns all items with no status filter', () => {
    vi.mocked(getReadingList).mockReturnValue(allEntries);
    const list = getReadingList();
    expect(list.length).toBe(3);
  });

  it('filters by unread status', () => {
    vi.mocked(getReadingList).mockReturnValue(allEntries.filter(e => e.status === 'unread'));
    const list = getReadingList('unread');
    expect(list.length).toBe(1);
    expect(list[0].status).toBe('unread');
  });

  it('filters by reading status', () => {
    vi.mocked(getReadingList).mockReturnValue(allEntries.filter(e => e.status === 'reading'));
    const list = getReadingList('reading');
    expect(list.length).toBe(1);
    expect(list[0].status).toBe('reading');
  });

  it('filters by done status', () => {
    vi.mocked(getReadingList).mockReturnValue(allEntries.filter(e => e.status === 'done'));
    const list = getReadingList('done');
    expect(list.length).toBe(1);
    expect(list[0].status).toBe('done');
  });

  it('returns all when status is "all"', () => {
    vi.mocked(getReadingList).mockReturnValue(allEntries);
    const list = getReadingList('all');
    expect(list.length).toBe(3);
  });

  it('entries have correct shape', () => {
    vi.mocked(getReadingList).mockReturnValue(allEntries);
    const list = getReadingList();
    const item = list[0];
    expect(item).toHaveProperty('arxiv_id');
    expect(item).toHaveProperty('title');
    expect(item).toHaveProperty('status');
    expect(item).toHaveProperty('priority');
    expect(item).toHaveProperty('published_at');
    expect(item).toHaveProperty('llm_score');
    expect(item).toHaveProperty('track');
    expect(item).toHaveProperty('notes');
  });
});

describe('updateReadingList', () => {
  it('is called with correct arguments', () => {
    updateReadingList('2602.10001', 'reading', 5);
    expect(updateReadingList).toHaveBeenCalledWith('2602.10001', 'reading', 5);
  });

  it('can be called without priority', () => {
    updateReadingList('2602.10002', 'done');
    expect(updateReadingList).toHaveBeenCalledWith('2602.10002', 'done');
  });
});
