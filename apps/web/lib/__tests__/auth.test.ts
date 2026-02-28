import { describe, it, expect } from 'vitest';
import { createSessionCookie, verifySessionCookie } from '../auth';

describe('Session Cookie Auth', () => {
  it('creates and verifies a valid session cookie', () => {
    const cookie = createSessionCookie('user-123');
    const result = verifySessionCookie(cookie);
    expect(result.valid).toBe(true);
    expect(result.userId).toBe('user-123');
  });

  it('rejects a tampered cookie', () => {
    const cookie = createSessionCookie('user-123');
    const tampered = cookie.slice(0, -2) + 'XX';
    const result = verifySessionCookie(tampered);
    expect(result.valid).toBe(false);
  });

  it('rejects an empty cookie', () => {
    const result = verifySessionCookie('');
    expect(result.valid).toBe(false);
  });

  it('rejects garbage input', () => {
    const result = verifySessionCookie('not-a-valid-cookie');
    expect(result.valid).toBe(false);
  });
});
