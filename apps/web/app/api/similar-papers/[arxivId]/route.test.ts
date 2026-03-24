/**
 * Tests for GET /api/similar-papers/:arxivId
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { getSimilarPapers } from '../../../../lib/similar-papers';

vi.mock('../../../../lib/similar-papers', () => ({
  getSimilarPapers: vi.fn(),
}));

const mockGetSimilarPapers = vi.mocked(getSimilarPapers);

const SAMPLE_PAPERS = [
  {
    arxiv_id: '2401.00002',
    title: 'Scalable Transformer Attention for Language Models',
    authors: ['Alice Smith', 'Bob Jones'],
    published_at: '2024-01-14',
    categories: ['cs.LG', 'cs.AI'],
    score: 8,
  },
  {
    arxiv_id: '2401.00003',
    title: 'Efficient Attention in Vision Transformers',
    authors: ['Carol White'],
    published_at: '2024-01-10',
    categories: ['cs.CV', 'cs.LG'],
    score: 6,
  },
];

function makeParams(arxivId: string) {
  return { params: Promise.resolve({ arxivId }) };
}

describe('GET /api/similar-papers/:arxivId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with papers array when papers are found', async () => {
    mockGetSimilarPapers.mockResolvedValue(SAMPLE_PAPERS);

    const res = await GET(new Request('http://localhost'), makeParams('2401.00001'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.papers).toHaveLength(2);
    expect(body.papers[0].arxiv_id).toBe('2401.00002');
  });

  it('calls getSimilarPapers with decoded arxivId', async () => {
    mockGetSimilarPapers.mockResolvedValue([]);

    const encoded = encodeURIComponent('2401.12345');
    await GET(new Request('http://localhost'), makeParams(encoded));

    expect(mockGetSimilarPapers).toHaveBeenCalledWith('2401.12345');
  });

  it('returns 200 with empty papers array when no similar papers found', async () => {
    mockGetSimilarPapers.mockResolvedValue([]);

    const res = await GET(new Request('http://localhost'), makeParams('2401.00001'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.papers).toEqual([]);
  });

  it('returns Cache-Control header', async () => {
    mockGetSimilarPapers.mockResolvedValue(SAMPLE_PAPERS);

    const res = await GET(new Request('http://localhost'), makeParams('2401.00001'));

    expect(res.headers.get('Cache-Control')).toContain('s-maxage=3600');
    expect(res.headers.get('Cache-Control')).toContain('stale-while-revalidate=86400');
  });

  it('returns 200 with empty papers on unexpected error', async () => {
    mockGetSimilarPapers.mockRejectedValue(new Error('unexpected crash'));

    const res = await GET(new Request('http://localhost'), makeParams('2401.00001'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.papers).toEqual([]);
  });

  it('includes all SimilarPaper fields in the response', async () => {
    mockGetSimilarPapers.mockResolvedValue([SAMPLE_PAPERS[0]!]);

    const res = await GET(new Request('http://localhost'), makeParams('2401.00001'));
    const body = await res.json();

    const paper = body.papers[0];
    expect(paper).toHaveProperty('arxiv_id');
    expect(paper).toHaveProperty('title');
    expect(paper).toHaveProperty('authors');
    expect(paper).toHaveProperty('published_at');
    expect(paper).toHaveProperty('categories');
    expect(paper).toHaveProperty('score');
  });
});
