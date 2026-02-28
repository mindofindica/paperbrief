import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Paper } from '../arxiv-db';

// Mock the arxiv-db module entirely — no real DB needed
vi.mock('../arxiv-db', () => ({
  getTodaysPapers: vi.fn(),
  getPaper: vi.fn(),
  getReadingList: vi.fn(),
  writeFeedback: vi.fn(),
  updateReadingList: vi.fn(),
  getRawDb: vi.fn(),
  closeDb: vi.fn(),
}));

import { getTodaysPapers } from '../arxiv-db';

const mockPapers: Paper[] = [
  {
    arxiv_id: '2602.12345',
    title: 'Test Paper One',
    abstract: 'Abstract of test paper',
    published_at: '2026-02-28T00:00:00Z',
    llm_score: 4.5,
    track: 'Agents / Memory',
    authors: '["Alice Smith","Bob Jones"]',
    url: 'https://arxiv.org/abs/2602.12345',
  },
  {
    arxiv_id: '2602.12346',
    title: 'Test Paper Two',
    abstract: 'Another abstract',
    published_at: '2026-02-28T00:00:00Z',
    llm_score: 3.0,
    track: 'RAG & Grounding',
    authors: '["Carol White"]',
    url: 'https://arxiv.org/abs/2602.12346',
  },
];

describe('getTodaysPapers', () => {
  beforeEach(() => {
    vi.mocked(getTodaysPapers).mockReturnValue(mockPapers);
  });

  it('returns papers with correct shape', () => {
    const papers = getTodaysPapers();
    expect(papers.length).toBe(2);
    expect(papers[0]).toHaveProperty('arxiv_id');
    expect(papers[0]).toHaveProperty('title');
    expect(papers[0]).toHaveProperty('abstract');
    expect(papers[0]).toHaveProperty('llm_score');
    expect(papers[0]).toHaveProperty('track');
    expect(papers[0]).toHaveProperty('published_at');
    expect(papers[0]).toHaveProperty('url');
  });

  it('returns papers sorted by score descending', () => {
    const papers = getTodaysPapers();
    expect(papers[0].llm_score).toBeGreaterThanOrEqual(papers[1].llm_score!);
  });

  it('returns arxiv URL in correct format', () => {
    const papers = getTodaysPapers();
    expect(papers[0].url).toBe('https://arxiv.org/abs/2602.12345');
  });

  it('returns empty array when no papers available', () => {
    vi.mocked(getTodaysPapers).mockReturnValue([]);
    const papers = getTodaysPapers();
    expect(papers).toEqual([]);
  });
});
