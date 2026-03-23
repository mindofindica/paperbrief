/**
 * Tests for DigestEmptyState helpers:
 *   - getNextDigestTime (from digest/page.tsx)
 */

import { describe, it, expect } from 'vitest';
import { getNextDigestTime } from '../../../lib/digest-utils';

/**
 * The digest pipeline runs daily at 07:30 UTC (= 08:30 CET).
 */
describe('getNextDigestTime', () => {
  it('returns today at 07:30 UTC when current time is before 07:30 UTC', () => {
    // 06:00 UTC — before the run window
    const now = new Date('2026-03-23T06:00:00Z');
    const next = getNextDigestTime(now);

    expect(next.toISOString()).toBe('2026-03-23T07:30:00.000Z');
  });

  it('returns tomorrow at 07:30 UTC when current time is exactly 07:30 UTC', () => {
    // Exactly on the boundary — should be "next" (tomorrow)
    const now = new Date('2026-03-23T07:30:00Z');
    const next = getNextDigestTime(now);

    expect(next.toISOString()).toBe('2026-03-24T07:30:00.000Z');
  });

  it('returns tomorrow at 07:30 UTC when current time is after 07:30 UTC', () => {
    // 09:00 UTC — pipeline already ran
    const now = new Date('2026-03-23T09:00:00Z');
    const next = getNextDigestTime(now);

    expect(next.toISOString()).toBe('2026-03-24T07:30:00.000Z');
  });

  it('returns today at 07:30 UTC at midnight', () => {
    const now = new Date('2026-03-23T00:00:00Z');
    const next = getNextDigestTime(now);

    expect(next.toISOString()).toBe('2026-03-23T07:30:00.000Z');
  });

  it('returns tomorrow at 07:30 UTC late at night (23:59 UTC)', () => {
    const now = new Date('2026-03-23T23:59:00Z');
    const next = getNextDigestTime(now);

    expect(next.toISOString()).toBe('2026-03-24T07:30:00.000Z');
  });

  it('next digest is always exactly 07:30:00 UTC (no seconds/ms drift)', () => {
    const nows = [
      new Date('2026-03-23T03:15:00Z'),
      new Date('2026-03-23T11:45:00Z'),
      new Date('2026-03-23T19:00:00Z'),
    ];

    for (const now of nows) {
      const next = getNextDigestTime(now);
      expect(next.getUTCHours()).toBe(7);
      expect(next.getUTCMinutes()).toBe(30);
      expect(next.getUTCSeconds()).toBe(0);
      expect(next.getUTCMilliseconds()).toBe(0);
    }
  });

  it('works across month boundaries', () => {
    // Last moment of March — should give April 1
    const now = new Date('2026-03-31T22:00:00Z');
    const next = getNextDigestTime(now);

    expect(next.getUTCMonth()).toBe(3); // April = 3 (0-indexed)
    expect(next.getUTCDate()).toBe(1);
    expect(next.getUTCHours()).toBe(7);
    expect(next.getUTCMinutes()).toBe(30);
  });

  it('is always in the future relative to the input time', () => {
    const testTimes = [
      new Date('2026-03-23T00:00:00Z'),
      new Date('2026-03-23T07:29:59Z'),
      new Date('2026-03-23T07:30:01Z'),
      new Date('2026-03-23T23:59:59Z'),
    ];

    for (const now of testTimes) {
      const next = getNextDigestTime(now);
      expect(next.getTime()).toBeGreaterThan(now.getTime());
    }
  });
});
