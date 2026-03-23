import { describe, it, expect } from 'vitest';
import { getGreeting } from '../../../lib/greeting';

describe('getGreeting', () => {
  it('returns Good morning for hour 6 (UTC)', () => {
    const d = new Date('2024-01-01T06:00:00Z');
    expect(getGreeting(d)).toBe('Good morning');
  });

  it('returns Good afternoon for hour 13', () => {
    const d = new Date('2024-01-01T13:00:00Z');
    expect(getGreeting(d)).toBe('Good afternoon');
  });

  it('returns Good evening for hour 20', () => {
    const d = new Date('2024-01-01T20:00:00Z');
    expect(getGreeting(d)).toBe('Good evening');
  });

  it('returns Good morning for hour 0 (midnight)', () => {
    const d = new Date('2024-01-01T00:00:00Z');
    expect(getGreeting(d)).toBe('Good morning');
  });

  it('returns Good afternoon for hour 12 exactly', () => {
    const d = new Date('2024-01-01T12:00:00Z');
    expect(getGreeting(d)).toBe('Good afternoon');
  });
});
