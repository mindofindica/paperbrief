/**
 * Tests for app/robots.ts
 *
 * Covers:
 *  - Output is a valid MetadataRoute.Robots object
 *  - Sitemap URL is declared
 *  - Public routes are allowed
 *  - Private/auth routes are disallowed
 *  - API routes are blocked
 *  - NEXT_PUBLIC_SITE_URL env var is respected
 *  - robots() is a pure synchronous function (no side effects)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

describe('robots()', () => {
  const ORIGINAL_ENV = process.env.NEXT_PUBLIC_SITE_URL;

  afterEach(() => {
    vi.resetModules();
    if (ORIGINAL_ENV === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_ENV;
    }
  });

  async function getRobots(siteUrl?: string) {
    if (siteUrl !== undefined) {
      process.env.NEXT_PUBLIC_SITE_URL = siteUrl;
    } else {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    }
    vi.resetModules();
    const { default: robots } = await import('./robots');
    return robots();
  }

  // ── structure ──────────────────────────────────────────────────────────────

  it('returns an object with a rules array', async () => {
    const result = await getRobots();
    expect(result).toHaveProperty('rules');
    expect(Array.isArray(result.rules)).toBe(true);
    expect((result.rules as unknown[]).length).toBeGreaterThan(0);
  });

  it('includes a sitemap URL', async () => {
    const result = await getRobots();
    expect(result.sitemap).toBeTruthy();
    expect(typeof result.sitemap).toBe('string');
    expect((result.sitemap as string).endsWith('/sitemap.xml')).toBe(true);
  });

  it('includes a host declaration', async () => {
    const result = await getRobots();
    expect(result.host).toBeTruthy();
    expect(typeof result.host).toBe('string');
  });

  // ── allowed public routes ──────────────────────────────────────────────────

  it('allows /', async () => {
    const result = await getRobots();
    const rule = (result.rules as { allow?: string[] }[])[0];
    expect(rule.allow).toContain('/');
  });

  it('allows /trending', async () => {
    const result = await getRobots();
    const rule = (result.rules as { allow?: string[] }[])[0];
    expect(rule.allow).toContain('/trending');
  });

  it('allows /search', async () => {
    const result = await getRobots();
    const rule = (result.rules as { allow?: string[] }[])[0];
    expect(rule.allow).toContain('/search');
  });

  it('allows /paper/', async () => {
    const result = await getRobots();
    const rule = (result.rules as { allow?: string[] }[])[0];
    expect(rule.allow).toContain('/paper/');
  });

  it('allows /pricing', async () => {
    const result = await getRobots();
    const rule = (result.rules as { allow?: string[] }[])[0];
    expect(rule.allow).toContain('/pricing');
  });

  it('allows /stats', async () => {
    const result = await getRobots();
    const rule = (result.rules as { allow?: string[] }[])[0];
    expect(rule.allow).toContain('/stats');
  });

  it('allows /rss', async () => {
    const result = await getRobots();
    const rule = (result.rules as { allow?: string[] }[])[0];
    expect(rule.allow).toContain('/rss');
  });

  // ── disallowed private routes ──────────────────────────────────────────────

  it('disallows /api/', async () => {
    const result = await getRobots();
    const rule = (result.rules as { disallow?: string[] }[])[0];
    expect(rule.disallow).toContain('/api/');
  });

  it('disallows /auth/', async () => {
    const result = await getRobots();
    const rule = (result.rules as { disallow?: string[] }[])[0];
    expect(rule.disallow).toContain('/auth/');
  });

  it('disallows /login', async () => {
    const result = await getRobots();
    const rule = (result.rules as { disallow?: string[] }[])[0];
    expect(rule.disallow).toContain('/login');
  });

  it('disallows /dashboard/', async () => {
    const result = await getRobots();
    const rule = (result.rules as { disallow?: string[] }[])[0];
    expect(rule.disallow).toContain('/dashboard/');
  });

  it('disallows /onboarding/', async () => {
    const result = await getRobots();
    const rule = (result.rules as { disallow?: string[] }[])[0];
    expect(rule.disallow).toContain('/onboarding/');
  });

  it('disallows /reading-list/', async () => {
    const result = await getRobots();
    const rule = (result.rules as { disallow?: string[] }[])[0];
    expect(rule.disallow).toContain('/reading-list/');
  });

  it('disallows /digest/', async () => {
    const result = await getRobots();
    const rule = (result.rules as { disallow?: string[] }[])[0];
    expect(rule.disallow).toContain('/digest/');
  });

  it('disallows /quiz/', async () => {
    const result = await getRobots();
    const rule = (result.rules as { disallow?: string[] }[])[0];
    expect(rule.disallow).toContain('/quiz/');
  });

  // ── env override ───────────────────────────────────────────────────────────

  it('uses NEXT_PUBLIC_SITE_URL for sitemap URL', async () => {
    const result = await getRobots('https://staging.paperbrief.ai');
    expect(result.sitemap).toBe('https://staging.paperbrief.ai/sitemap.xml');
  });

  it('uses NEXT_PUBLIC_SITE_URL for host', async () => {
    const result = await getRobots('https://staging.paperbrief.ai');
    expect(result.host).toBe('https://staging.paperbrief.ai');
  });

  it('falls back to https://paperbrief.ai when env var is not set', async () => {
    const result = await getRobots();
    expect(result.sitemap).toBe('https://paperbrief.ai/sitemap.xml');
    expect(result.host).toBe('https://paperbrief.ai');
  });

  // ── purity ─────────────────────────────────────────────────────────────────

  it('is a pure synchronous function (same input → same output)', async () => {
    const { default: robots } = await import('./robots');
    const a = robots();
    const b = robots();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('does not throw', async () => {
    const { default: robots } = await import('./robots');
    expect(() => robots()).not.toThrow();
  });
});
