import { describe, expect, it, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PATCH } from './route';
import { resolveFrequency, FREE_FREQUENCIES, PRO_FREQUENCIES, type DigestFrequencyOverride } from '../../../lib/digest-settings';
import { getServiceSupabase } from '../../../lib/supabase';
import { verifySessionCookie } from '../../../lib/auth';

vi.mock('../../../lib/supabase', () => ({
  getServiceSupabase: vi.fn(),
}));

vi.mock('../../../lib/auth', () => ({
  verifySessionCookie: vi.fn(),
}));

vi.mock('../../../lib/stripe', () => ({
  getSubscription: vi.fn(),
}));

import { getSubscription } from '../../../lib/stripe';

// ── Mock builders ─────────────────────────────────────────────────────────────

type QueryMock = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
};

function createQueryMock(): QueryMock {
  const q: QueryMock = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    upsert: vi.fn(),
  };
  return q;
}

const getServiceSupabaseMock = vi.mocked(getServiceSupabase);
const verifySessionCookieMock = vi.mocked(verifySessionCookie);
const getSubscriptionMock = vi.mocked(getSubscription);

const FREE_SUB = {
  plan: 'free' as const,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  planExpiresAt: null,
  trackLimit: 1,
  digestFrequency: 'weekly',
};

const PRO_SUB = {
  ...FREE_SUB,
  plan: 'pro' as const,
  trackLimit: 5,
  digestFrequency: 'daily',
};

function makeRequest(method = 'GET', body?: object): NextRequest {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'content-type': 'application/json' };
  }
  const req = new NextRequest('http://localhost/api/settings', init);
  // Attach a fake session cookie
  Object.defineProperty(req, 'cookies', {
    value: { get: (name: string) => (name === 'pb_session' ? { value: 'tok' } : undefined) },
  });
  return req;
}

// ── resolveFrequency unit tests ───────────────────────────────────────────────

describe('resolveFrequency()', () => {
  it('auto + free → weekly', () => {
    expect(resolveFrequency('auto', 'free')).toBe('weekly');
  });

  it('auto + pro → daily', () => {
    expect(resolveFrequency('auto', 'pro')).toBe('daily');
  });

  it('weekly + free → weekly', () => {
    expect(resolveFrequency('weekly', 'free')).toBe('weekly');
  });

  it('weekly + pro → weekly (user downgrade preference respected)', () => {
    expect(resolveFrequency('weekly', 'pro')).toBe('weekly');
  });

  it('daily + pro → daily', () => {
    expect(resolveFrequency('daily', 'pro')).toBe('daily');
  });

  it('twice_weekly + pro → twice_weekly', () => {
    expect(resolveFrequency('twice_weekly', 'pro')).toBe('twice_weekly');
  });

  it('daily + free → weekly (pro override falls back when plan degrades)', () => {
    expect(resolveFrequency('daily', 'free')).toBe('weekly');
  });

  it('twice_weekly + free → weekly', () => {
    expect(resolveFrequency('twice_weekly', 'free')).toBe('weekly');
  });
});

// ── GET tests ─────────────────────────────────────────────────────────────────

describe('GET /api/settings', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 401 when no session cookie', async () => {
    verifySessionCookieMock.mockReturnValue({ valid: false });
    const req = new NextRequest('http://localhost/api/settings');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns default settings when no row in DB (free user)', async () => {
    verifySessionCookieMock.mockReturnValue({ valid: true, userId: 'user-1' });
    getSubscriptionMock.mockResolvedValue(FREE_SUB);

    const q = createQueryMock();
    q.maybeSingle.mockResolvedValue({ data: null, error: null });
    getServiceSupabaseMock.mockReturnValue({ from: () => q } as unknown as ReturnType<typeof getServiceSupabase>);

    const res = await GET(makeRequest());
    const json = await res.json() as { settings: { digestFrequencyOverride: string; digestFrequencyResolved: string; digestHour: number; digestPaused: boolean; plan: string } };

    expect(res.status).toBe(200);
    expect(json.settings.digestFrequencyOverride).toBe('auto');
    expect(json.settings.digestFrequencyResolved).toBe('weekly'); // free plan default
    expect(json.settings.digestHour).toBe(7);
    expect(json.settings.digestPaused).toBe(false);
    expect(json.settings.plan).toBe('free');
  });

  it('returns default settings with daily resolved for pro user', async () => {
    verifySessionCookieMock.mockReturnValue({ valid: true, userId: 'user-2' });
    getSubscriptionMock.mockResolvedValue(PRO_SUB);

    const q = createQueryMock();
    q.maybeSingle.mockResolvedValue({ data: null, error: null });
    getServiceSupabaseMock.mockReturnValue({ from: () => q } as unknown as ReturnType<typeof getServiceSupabase>);

    const res = await GET(makeRequest());
    const json = await res.json() as { settings: { digestFrequencyResolved: string } };

    expect(res.status).toBe(200);
    expect(json.settings.digestFrequencyResolved).toBe('daily');
  });

  it('returns stored settings from DB', async () => {
    verifySessionCookieMock.mockReturnValue({ valid: true, userId: 'user-3' });
    getSubscriptionMock.mockResolvedValue(PRO_SUB);

    const q = createQueryMock();
    q.maybeSingle.mockResolvedValue({
      data: {
        digest_frequency_override: 'twice_weekly',
        digest_hour: 14,
        digest_paused: true,
      },
      error: null,
    });
    getServiceSupabaseMock.mockReturnValue({ from: () => q } as unknown as ReturnType<typeof getServiceSupabase>);

    const res = await GET(makeRequest());
    const json = await res.json() as { settings: { digestFrequencyOverride: string; digestFrequencyResolved: string; digestHour: number; digestPaused: boolean } };

    expect(res.status).toBe(200);
    expect(json.settings.digestFrequencyOverride).toBe('twice_weekly');
    expect(json.settings.digestFrequencyResolved).toBe('twice_weekly');
    expect(json.settings.digestHour).toBe(14);
    expect(json.settings.digestPaused).toBe(true);
  });

  it('returns 500 on DB error', async () => {
    verifySessionCookieMock.mockReturnValue({ valid: true, userId: 'user-4' });
    getSubscriptionMock.mockResolvedValue(FREE_SUB);

    const q = createQueryMock();
    q.maybeSingle.mockResolvedValue({ data: null, error: { message: 'db error' } });
    getServiceSupabaseMock.mockReturnValue({ from: () => q } as unknown as ReturnType<typeof getServiceSupabase>);

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });
});

// ── PATCH tests ───────────────────────────────────────────────────────────────

describe('PATCH /api/settings', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns 401 when unauthenticated', async () => {
    verifySessionCookieMock.mockReturnValue({ valid: false });
    const req = new NextRequest('http://localhost/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ digestPaused: true }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid JSON', async () => {
    verifySessionCookieMock.mockReturnValue({ valid: true, userId: 'user-1' });
    const req = new NextRequest('http://localhost/api/settings', {
      method: 'PATCH',
      body: 'not-json',
      headers: { 'content-type': 'application/json' },
    });
    Object.defineProperty(req, 'cookies', {
      value: { get: (name: string) => (name === 'pb_session' ? { value: 'tok' } : undefined) },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 on empty patch body', async () => {
    verifySessionCookieMock.mockReturnValue({ valid: true, userId: 'user-1' });
    const q = createQueryMock();
    getServiceSupabaseMock.mockReturnValue({ from: () => q } as unknown as ReturnType<typeof getServiceSupabase>);

    const res = await PATCH(makeRequest('PATCH', {}));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid digestFrequencyOverride value', async () => {
    verifySessionCookieMock.mockReturnValue({ valid: true, userId: 'user-1' });
    const res = await PATCH(makeRequest('PATCH', { digestFrequencyOverride: 'hourly' as DigestFrequencyOverride }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for digestHour out of range', async () => {
    verifySessionCookieMock.mockReturnValue({ valid: true, userId: 'user-1' });
    const res = await PATCH(makeRequest('PATCH', { digestHour: 25 }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for negative digestHour', async () => {
    verifySessionCookieMock.mockReturnValue({ valid: true, userId: 'user-1' });
    const res = await PATCH(makeRequest('PATCH', { digestHour: -1 }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for fractional digestHour', async () => {
    verifySessionCookieMock.mockReturnValue({ valid: true, userId: 'user-1' });
    const res = await PATCH(makeRequest('PATCH', { digestHour: 7.5 }));
    expect(res.status).toBe(400);
  });

  it('returns 400 if digestPaused is not a boolean', async () => {
    verifySessionCookieMock.mockReturnValue({ valid: true, userId: 'user-1' });
    const res = await PATCH(makeRequest('PATCH', { digestPaused: 'yes' }));
    expect(res.status).toBe(400);
  });

  it('returns 403 when free user tries to set daily frequency', async () => {
    verifySessionCookieMock.mockReturnValue({ valid: true, userId: 'user-1' });
    getSubscriptionMock.mockResolvedValue(FREE_SUB);

    const res = await PATCH(makeRequest('PATCH', { digestFrequencyOverride: 'daily' }));
    const json = await res.json() as { upgrade: boolean };
    expect(res.status).toBe(403);
    expect(json.upgrade).toBe(true);
  });

  it('returns 403 when free user tries twice_weekly', async () => {
    verifySessionCookieMock.mockReturnValue({ valid: true, userId: 'user-1' });
    getSubscriptionMock.mockResolvedValue(FREE_SUB);

    const res = await PATCH(makeRequest('PATCH', { digestFrequencyOverride: 'twice_weekly' }));
    expect(res.status).toBe(403);
  });

  it('allows free user to set weekly frequency', async () => {
    verifySessionCookieMock.mockReturnValue({ valid: true, userId: 'user-1' });
    getSubscriptionMock.mockResolvedValue(FREE_SUB);

    const q = createQueryMock();
    q.upsert.mockResolvedValue({ error: null });
    q.maybeSingle.mockResolvedValue({ data: { digest_frequency_override: 'weekly', digest_hour: 7, digest_paused: false }, error: null });
    getServiceSupabaseMock.mockReturnValue({ from: () => q } as unknown as ReturnType<typeof getServiceSupabase>);

    const res = await PATCH(makeRequest('PATCH', { digestFrequencyOverride: 'weekly' }));
    expect(res.status).toBe(200);
  });

  it('allows pro user to set daily frequency', async () => {
    verifySessionCookieMock.mockReturnValue({ valid: true, userId: 'user-2' });
    getSubscriptionMock.mockResolvedValue(PRO_SUB);

    const q = createQueryMock();
    q.upsert.mockResolvedValue({ error: null });
    q.maybeSingle.mockResolvedValue({ data: { digest_frequency_override: 'daily', digest_hour: 7, digest_paused: false }, error: null });
    getServiceSupabaseMock.mockReturnValue({ from: () => q } as unknown as ReturnType<typeof getServiceSupabase>);

    const res = await PATCH(makeRequest('PATCH', { digestFrequencyOverride: 'daily' }));
    expect(res.status).toBe(200);
  });

  it('allows pro user to set twice_weekly frequency', async () => {
    verifySessionCookieMock.mockReturnValue({ valid: true, userId: 'user-2' });
    getSubscriptionMock.mockResolvedValue(PRO_SUB);

    const q = createQueryMock();
    q.upsert.mockResolvedValue({ error: null });
    q.maybeSingle.mockResolvedValue({ data: { digest_frequency_override: 'twice_weekly', digest_hour: 8, digest_paused: false }, error: null });
    getServiceSupabaseMock.mockReturnValue({ from: () => q } as unknown as ReturnType<typeof getServiceSupabase>);

    const res = await PATCH(makeRequest('PATCH', { digestFrequencyOverride: 'twice_weekly' }));
    expect(res.status).toBe(200);
  });

  it('saves pauseDigest=true for any plan', async () => {
    verifySessionCookieMock.mockReturnValue({ valid: true, userId: 'user-1' });
    getSubscriptionMock.mockResolvedValue(FREE_SUB);

    const q = createQueryMock();
    q.upsert.mockResolvedValue({ error: null });
    q.maybeSingle.mockResolvedValue({ data: { digest_frequency_override: 'auto', digest_hour: 7, digest_paused: true }, error: null });
    getServiceSupabaseMock.mockReturnValue({ from: () => q } as unknown as ReturnType<typeof getServiceSupabase>);

    const res = await PATCH(makeRequest('PATCH', { digestPaused: true }));
    expect(res.status).toBe(200);
    const json = await res.json() as { settings: { digestPaused: boolean } };
    expect(json.settings.digestPaused).toBe(true);
  });

  it('passes digestHour correctly to upsert', async () => {
    verifySessionCookieMock.mockReturnValue({ valid: true, userId: 'user-2' });
    getSubscriptionMock.mockResolvedValue(PRO_SUB);

    const q = createQueryMock();
    q.upsert.mockResolvedValue({ error: null });
    q.maybeSingle.mockResolvedValue({ data: { digest_frequency_override: 'auto', digest_hour: 9, digest_paused: false }, error: null });
    getServiceSupabaseMock.mockReturnValue({ from: () => q } as unknown as ReturnType<typeof getServiceSupabase>);

    await PATCH(makeRequest('PATCH', { digestHour: 9 }));

    // Verify upsert was called with digest_hour: 9
    expect(q.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ digest_hour: 9 }),
      expect.any(Object),
    );
  });

  it('returns 500 on DB upsert error', async () => {
    verifySessionCookieMock.mockReturnValue({ valid: true, userId: 'user-1' });
    getSubscriptionMock.mockResolvedValue(FREE_SUB);

    const q = createQueryMock();
    q.upsert.mockResolvedValue({ error: { message: 'db error' } });
    getServiceSupabaseMock.mockReturnValue({ from: () => q } as unknown as ReturnType<typeof getServiceSupabase>);

    const res = await PATCH(makeRequest('PATCH', { digestPaused: false }));
    expect(res.status).toBe(500);
  });
});
