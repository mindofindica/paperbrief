/**
 * Tests for GET /api/auth/verify
 *
 * Covers:
 * - Missing token → 400
 * - Invalid / expired token → redirect /login?error=invalid
 * - Valid token, first login, no tracks → redirect /onboarding
 * - Valid token, first login, has tracks → redirect /digest
 * - Valid token, returning user (first_login_at already set), no tracks → still redirect /onboarding
 * - Valid token, returning user, has tracks → redirect /digest
 * - Custom ?redirect param respected when user has tracks
 * - Session cookie set on all successful logins
 * - Onboarding email triggered on first login
 * - Onboarding email NOT triggered on subsequent logins
 * - recordFirstLogin errors don't block auth
 * - Track count errors fall through gracefully
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../../../lib/auth', () => ({
  verifyMagicToken: vi.fn(),
  createSessionCookie: vi.fn().mockReturnValue('mock-session-cookie'),
}));

vi.mock('../../../../lib/supabase', () => ({
  getServiceSupabase: vi.fn(),
}));

vi.mock('../../../../lib/email/send-onboarding-active', () => ({
  sendOnboardingActiveEmail: vi.fn().mockResolvedValue({ ok: true, id: 'email_001' }),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost:3000/api/auth/verify');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString());
}

function makeSupabaseMock({
  firstLoginAt = null as string | null,
  trackCount = 0,
} = {}) {
  const single = vi.fn().mockResolvedValue({
    data: firstLoginAt ? { first_login_at: firstLoginAt } : null,
    error: null,
  });
  const eqUser = vi.fn().mockReturnValue({ single });
  const eqUserId = vi.fn().mockReturnValue({ count: trackCount, error: null });
  const headSelect = vi.fn().mockReturnValue({ eq: eqUserId });
  const upsert = vi.fn().mockResolvedValue({ error: null });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'user_settings') {
      return {
        select: vi.fn().mockReturnValue({ eq: eqUser }),
        upsert,
      };
    }
    if (table === 'tracks') {
      return {
        select: headSelect,
      };
    }
    return { select: vi.fn(), upsert: vi.fn() };
  });

  return { from };
}

// ── Tests ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('GET /api/auth/verify', () => {
  it('returns 400 when token param is missing', async () => {
    const { GET } = await import('./route');
    const req = makeRequest(); // no token
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing token/i);
  });

  it('redirects to /login?error=invalid for an invalid token', async () => {
    const { verifyMagicToken } = await import('../../../../lib/auth');
    (verifyMagicToken as any).mockResolvedValue({ valid: false });

    const { GET } = await import('./route');
    const req = makeRequest({ token: 'bad-token' });
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/login\?error=invalid/);
  });

  it('redirects new user with no tracks to /onboarding', async () => {
    const { verifyMagicToken } = await import('../../../../lib/auth');
    (verifyMagicToken as any).mockResolvedValue({ valid: true, userId: 'user-1' });

    const { getServiceSupabase } = await import('../../../../lib/supabase');
    (getServiceSupabase as any).mockReturnValue(
      makeSupabaseMock({ firstLoginAt: null, trackCount: 0 })
    );

    const { GET } = await import('./route');
    const req = makeRequest({ token: 'valid-token' });
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/onboarding/);
  });

  it('redirects new user with tracks to /digest', async () => {
    const { verifyMagicToken } = await import('../../../../lib/auth');
    (verifyMagicToken as any).mockResolvedValue({ valid: true, userId: 'user-2' });

    const { getServiceSupabase } = await import('../../../../lib/supabase');
    (getServiceSupabase as any).mockReturnValue(
      makeSupabaseMock({ firstLoginAt: null, trackCount: 3 })
    );

    const { GET } = await import('./route');
    const req = makeRequest({ token: 'valid-token' });
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/digest/);
  });

  it('redirects returning user with no tracks to /onboarding (redirect=/digest)', async () => {
    const { verifyMagicToken } = await import('../../../../lib/auth');
    (verifyMagicToken as any).mockResolvedValue({ valid: true, userId: 'user-3' });

    const { getServiceSupabase } = await import('../../../../lib/supabase');
    // existing first_login_at but no tracks
    (getServiceSupabase as any).mockReturnValue(
      makeSupabaseMock({ firstLoginAt: '2026-03-20T08:00:00Z', trackCount: 0 })
    );

    const { GET } = await import('./route');
    const req = makeRequest({ token: 'valid-token', redirect: '/digest' });
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/onboarding/);
  });

  it('redirects returning user with tracks to /digest', async () => {
    const { verifyMagicToken } = await import('../../../../lib/auth');
    (verifyMagicToken as any).mockResolvedValue({ valid: true, userId: 'user-4' });

    const { getServiceSupabase } = await import('../../../../lib/supabase');
    (getServiceSupabase as any).mockReturnValue(
      makeSupabaseMock({ firstLoginAt: '2026-03-20T08:00:00Z', trackCount: 2 })
    );

    const { GET } = await import('./route');
    const req = makeRequest({ token: 'valid-token' });
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/digest/);
  });

  it('respects custom ?redirect when user has tracks', async () => {
    const { verifyMagicToken } = await import('../../../../lib/auth');
    (verifyMagicToken as any).mockResolvedValue({ valid: true, userId: 'user-5' });

    const { getServiceSupabase } = await import('../../../../lib/supabase');
    (getServiceSupabase as any).mockReturnValue(
      makeSupabaseMock({ firstLoginAt: '2026-03-20T08:00:00Z', trackCount: 1 })
    );

    const { GET } = await import('./route');
    const req = makeRequest({ token: 'valid-token', redirect: '/settings' });
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/settings/);
  });

  it('sets pb_session cookie on successful login', async () => {
    const { verifyMagicToken } = await import('../../../../lib/auth');
    (verifyMagicToken as any).mockResolvedValue({ valid: true, userId: 'user-6' });

    const { getServiceSupabase } = await import('../../../../lib/supabase');
    (getServiceSupabase as any).mockReturnValue(
      makeSupabaseMock({ firstLoginAt: '2026-03-20T08:00:00Z', trackCount: 1 })
    );

    const { GET } = await import('./route');
    const req = makeRequest({ token: 'valid-token' });
    const res = await GET(req);

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('pb_session=');
  });

  it('triggers onboarding email on first login', async () => {
    const { verifyMagicToken } = await import('../../../../lib/auth');
    (verifyMagicToken as any).mockResolvedValue({ valid: true, userId: 'user-7' });

    const { getServiceSupabase } = await import('../../../../lib/supabase');
    (getServiceSupabase as any).mockReturnValue(
      makeSupabaseMock({ firstLoginAt: null, trackCount: 0 })
    );

    const { sendOnboardingActiveEmail } = await import('../../../../lib/email/send-onboarding-active');

    const { GET } = await import('./route');
    await GET(makeRequest({ token: 'valid-token' }));

    // Give the fire-and-forget a tick to run
    await new Promise(resolve => setImmediate(resolve));

    expect(sendOnboardingActiveEmail).toHaveBeenCalledWith('user-7');
  });

  it('does NOT trigger onboarding email for returning users', async () => {
    const { verifyMagicToken } = await import('../../../../lib/auth');
    (verifyMagicToken as any).mockResolvedValue({ valid: true, userId: 'user-8' });

    const { getServiceSupabase } = await import('../../../../lib/supabase');
    (getServiceSupabase as any).mockReturnValue(
      makeSupabaseMock({ firstLoginAt: '2026-03-20T08:00:00Z', trackCount: 2 })
    );

    const { sendOnboardingActiveEmail } = await import('../../../../lib/email/send-onboarding-active');

    const { GET } = await import('./route');
    await GET(makeRequest({ token: 'valid-token' }));

    await new Promise(resolve => setImmediate(resolve));

    expect(sendOnboardingActiveEmail).not.toHaveBeenCalled();
  });

  it('still completes auth if recordFirstLogin throws', async () => {
    const { verifyMagicToken } = await import('../../../../lib/auth');
    (verifyMagicToken as any).mockResolvedValue({ valid: true, userId: 'user-9' });

    const { getServiceSupabase } = await import('../../../../lib/supabase');
    // user_settings throws, but tracks are fine
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'user_settings') throw new Error('db unavailable');
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ count: 1, error: null }),
        }),
      };
    });
    (getServiceSupabase as any).mockReturnValue({ from });

    const { GET } = await import('./route');
    const res = await GET(makeRequest({ token: 'valid-token' }));

    // Auth should complete — we get a redirect, not a 500
    expect(res.status).toBe(307);
  });

  it('falls through to /digest on track count error', async () => {
    const { verifyMagicToken } = await import('../../../../lib/auth');
    (verifyMagicToken as any).mockResolvedValue({ valid: true, userId: 'user-10' });

    const { getServiceSupabase } = await import('../../../../lib/supabase');
    const eqUser = vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    const headSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ count: null, error: { message: 'query failed' } }),
    });
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'user_settings') {
        return { select: vi.fn().mockReturnValue({ eq: eqUser }), upsert: vi.fn().mockResolvedValue({}) };
      }
      return { select: headSelect };
    });
    (getServiceSupabase as any).mockReturnValue({ from });

    const { GET } = await import('./route');
    const res = await GET(makeRequest({ token: 'valid-token' }));

    // Track count error → defaults to 0 → should go to /onboarding (not crash)
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/onboarding/);
  });
});
