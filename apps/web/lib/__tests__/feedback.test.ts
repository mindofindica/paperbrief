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

import { writeFeedback, getReadingList } from '../arxiv-db';

const arxivId = '2602.99999';

function makeEntry(overrides: Partial<ReadingListEntry> = {}): ReadingListEntry {
  return {
    arxiv_id: arxivId,
    title: 'Feedback Test Paper',
    abstract: 'Test abstract',
    published_at: '2026-02-28T00:00:00Z',
    llm_score: 3,
    track: 'Agents / Planning',
    authors: '[]',
    url: `https://arxiv.org/abs/${arxivId}`,
    status: 'unread',
    priority: 5,
    added_at: '2026-02-28T00:00:00Z',
    notes: null,
    ...overrides,
  };
}

describe('writeFeedback', () => {
  beforeEach(() => {
    vi.mocked(writeFeedback).mockClear();
    vi.mocked(getReadingList).mockClear();
  });

  it('save action adds paper to reading list with unread status', () => {
    vi.mocked(getReadingList).mockReturnValue([makeEntry({ status: 'unread', priority: 5 })]);

    writeFeedback(arxivId, 'save');
    expect(writeFeedback).toHaveBeenCalledWith(arxivId, 'save');

    const list = getReadingList('unread');
    const item = list.find(p => p.arxiv_id === arxivId);
    expect(item).toBeDefined();
    expect(item!.status).toBe('unread');
  });

  it('skip action marks paper as done', () => {
    vi.mocked(getReadingList).mockReturnValue([makeEntry({ status: 'done', priority: 0 })]);

    writeFeedback(arxivId, 'skip');
    expect(writeFeedback).toHaveBeenCalledWith(arxivId, 'skip');

    const list = getReadingList('done');
    const item = list.find(p => p.arxiv_id === arxivId);
    expect(item).toBeDefined();
    expect(item!.status).toBe('done');
  });

  it('love action sets high priority', () => {
    vi.mocked(getReadingList).mockReturnValue([makeEntry({ status: 'unread', priority: 8 })]);

    writeFeedback(arxivId, 'love');
    expect(writeFeedback).toHaveBeenCalledWith(arxivId, 'love');

    const list = getReadingList('unread');
    const item = list.find(p => p.arxiv_id === arxivId);
    expect(item).toBeDefined();
    expect(item!.priority).toBeGreaterThanOrEqual(8);
  });

  it('meh action marks paper as done', () => {
    vi.mocked(getReadingList).mockReturnValue([makeEntry({ status: 'done', priority: 0 })]);

    writeFeedback(arxivId, 'meh');
    expect(writeFeedback).toHaveBeenCalledWith(arxivId, 'meh');

    const list = getReadingList('done');
    const item = list.find(p => p.arxiv_id === arxivId);
    expect(item!.status).toBe('done');
  });

  it('read action sets status to reading', () => {
    vi.mocked(getReadingList).mockReturnValue([makeEntry({ status: 'reading', priority: 5 })]);

    writeFeedback(arxivId, 'read');
    expect(writeFeedback).toHaveBeenCalledWith(arxivId, 'read');

    const list = getReadingList('reading');
    const item = list.find(p => p.arxiv_id === arxivId);
    expect(item!.status).toBe('reading');
  });
});
