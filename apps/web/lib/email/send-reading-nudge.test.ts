/**
 * send-reading-nudge.test.ts
 *
 * Unit tests for sendReadingNudgeEmail.
 * Resend is mocked — no real network calls.
 *
 * Covers:
 *  - Returns skipped when RESEND_API_KEY is not set
 *  - Returns ok:true with email id on success
 *  - Returns ok:false with error message on Resend API error
 *  - Returns ok:false with error message on thrown exception
 *  - Sends to the correct recipient
 *  - Subject includes correct paper count (singular/plural)
 *  - List-Unsubscribe header is set
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSend = vi.fn();

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

vi.mock('react', () => ({
  default: { createElement: vi.fn(() => '<mock-element>') },
  createElement: vi.fn(() => '<mock-element>'),
}));

vi.mock('./templates/reading-nudge', () => ({
  ReadingNudgeEmail: vi.fn(() => null),
}));

import { sendReadingNudgeEmail } from './send-reading-nudge';
import type { NudgePaper } from './templates/reading-nudge';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePapers(n = 3): NudgePaper[] {
  return Array.from({ length: n }, (_, i) => ({
    arxiv_id: `240${i}.00001`,
    title: `Paper ${i + 1}`,
    authors: JSON.stringify([`Author ${i + 1}`]),
    track: 'LLM',
    saved_at: '2026-01-01T00:00:00Z',
  }));
}

const BASE_OPTS = {
  to: 'user@example.com',
  userId: 'user-abc-123',
  papers: makePapers(3),
  unreadCount: 5,
};

// ── Setup ─────────────────────────────────────────────────────────────────────

const ORIG_KEY = process.env.RESEND_API_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = 'test-key-123';
  mockSend.mockResolvedValue({ data: { id: 'msg-xyz' }, error: null });
});

afterEach(() => {
  if (ORIG_KEY === undefined) {
    delete process.env.RESEND_API_KEY;
  } else {
    process.env.RESEND_API_KEY = ORIG_KEY;
  }
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('sendReadingNudgeEmail', () => {
  it('returns skipped:true when RESEND_API_KEY is not set', async () => {
    delete process.env.RESEND_API_KEY;
    const result = await sendReadingNudgeEmail(BASE_OPTS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.skipped).toBe(true);
    }
  });

  it('returns ok:true with email id on success', async () => {
    const result = await sendReadingNudgeEmail(BASE_OPTS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.id).toBe('msg-xyz');
    }
  });

  it('sends to the correct recipient', async () => {
    await sendReadingNudgeEmail(BASE_OPTS);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['user@example.com'] }),
    );
  });

  it('subject contains paper count (plural)', async () => {
    await sendReadingNudgeEmail({ ...BASE_OPTS, unreadCount: 5 });
    const call = mockSend.mock.calls[0][0];
    expect(call.subject).toContain('5');
    expect(call.subject).toContain('papers');
  });

  it('subject uses singular "paper" for count=1', async () => {
    await sendReadingNudgeEmail({ ...BASE_OPTS, unreadCount: 1 });
    const call = mockSend.mock.calls[0][0];
    expect(call.subject).toContain('1 paper');
    expect(call.subject).not.toMatch(/1 papers/);
  });

  it('includes List-Unsubscribe header', async () => {
    await sendReadingNudgeEmail(BASE_OPTS);
    const call = mockSend.mock.calls[0][0];
    expect(call.headers?.['List-Unsubscribe']).toBeDefined();
  });

  it('returns ok:false with error on Resend API error', async () => {
    mockSend.mockResolvedValueOnce({ data: null, error: { message: 'rate limit exceeded' } });
    const result = await sendReadingNudgeEmail(BASE_OPTS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('rate limit');
    }
  });

  it('returns ok:false on thrown exception', async () => {
    mockSend.mockRejectedValueOnce(new Error('network timeout'));
    const result = await sendReadingNudgeEmail(BASE_OPTS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('network timeout');
    }
  });
});
