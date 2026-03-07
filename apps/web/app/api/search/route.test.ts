import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { searchPapers } from '../../../lib/arxiv-db';

vi.mock('../../../lib/arxiv-db', () => ({
  searchPapers: vi.fn(),
}));

const searchPapersMock = vi.mocked(searchPapers);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('GET /api/search', () => {
  it('returns empty result when query is blank', async () => {
    const req = new NextRequest('http://localhost/api/search');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.count).toBe(0);
    expect(body.items).toEqual([]);
    expect(searchPapersMock).not.toHaveBeenCalled();
  });

  it('passes query + filters through to searchPapers', async () => {
    searchPapersMock.mockReturnValue([
      {
        arxiv_id: '2501.00001',
        title: 'Speculative Decoding',
        abstract: 'A paper.',
        published_at: '2026-02-01',
        llm_score: 5,
        track: 'LLM Efficiency',
        authors: null,
        url: 'https://arxiv.org/abs/2501.00001',
      },
    ]);

    const req = new NextRequest('http://localhost/api/search?query=speculative+decoding&track=LLM&from=2026-02-01&limit=7');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(searchPapersMock).toHaveBeenCalledWith({
      query: 'speculative decoding',
      track: 'LLM',
      fromDate: '2026-02-01',
      limit: 7,
    });
    expect(body.count).toBe(1);
    expect(body.items[0].arxiv_id).toBe('2501.00001');
  });

  it('sanitizes invalid from date and clamps limit', async () => {
    searchPapersMock.mockReturnValue([]);

    const req = new NextRequest('http://localhost/api/search?query=rag&from=2026-2-1&limit=999');
    await GET(req);

    expect(searchPapersMock).toHaveBeenCalledWith({
      query: 'rag',
      track: null,
      fromDate: null,
      limit: 20,
    });
  });

  it('returns 500 if search throws', async () => {
    searchPapersMock.mockImplementation(() => {
      throw new Error('boom');
    });

    const req = new NextRequest('http://localhost/api/search?query=kv+cache');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('Failed to search papers');
  });
});
