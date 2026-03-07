import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { getRecommendationBasis, getRecommendations } from '../../../lib/arxiv-db';

vi.mock('../../../lib/arxiv-db', () => ({
  getRecommendationBasis: vi.fn(),
  getRecommendations: vi.fn(),
}));

const getRecommendationBasisMock = vi.mocked(getRecommendationBasis);
const getRecommendationsMock = vi.mocked(getRecommendations);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('GET /api/recommend', () => {
  it('returns recommendations with expected response shape', async () => {
    getRecommendationBasisMock.mockReturnValue('your feedback');
    getRecommendationsMock.mockReturnValue([
      {
        arxiv_id: '2604.00001',
        title: 'Recommended Paper',
        abstract: 'Test abstract',
        published_at: '2026-03-01',
        llm_score: 5,
        track: 'cs.LG',
        authors: '["Alice"]',
        url: 'https://arxiv.org/abs/2604.00001',
      },
    ]);

    const req = new NextRequest('http://localhost/api/recommend?limit=20');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(getRecommendationsMock).toHaveBeenCalledWith(20);
    expect(body).toEqual({
      papers: expect.any(Array),
      basedOn: 'your feedback',
      count: 1,
    });
  });

  it('returns 500 when recommendation query fails', async () => {
    getRecommendationBasisMock.mockReturnValue('top papers');
    getRecommendationsMock.mockImplementation(() => {
      throw new Error('boom');
    });

    const req = new NextRequest('http://localhost/api/recommend');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('Failed to fetch recommendations');
  });
});
