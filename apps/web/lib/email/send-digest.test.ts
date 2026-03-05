/**
 * send-digest.test.ts
 *
 * Unit tests for sendDigestEmail + buildSubject (via side effects).
 * Resend is mocked — no real network calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Digest } from '@paperbrief/core';

// ── Mock Resend before importing the module under test ────────────────────────

const mockSend = vi.fn();

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

// Mock React.createElement so we don't need a full React renderer
vi.mock('react', () => ({
  default: { createElement: vi.fn(() => '<mock-react-element>') },
  createElement: vi.fn(() => '<mock-react-element>'),
}));

// Mock the template — we're testing the send wrapper, not the template itself
vi.mock('./templates/digest', () => ({
  DigestEmail: vi.fn(() => null),
}));

// Import AFTER mocks are set up
import { sendDigestEmail } from './send-digest';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeDigest(overrides: Partial<Digest> = {}): Digest {
  return {
    userId: 'user-123',
    weekOf: '2026-02-24',
    entries: [
      {
        arxivId: '2502.10001',
        title: 'Test Paper',
        authors: 'Alice Smith et al.',
        score: 4,
        scoreLabel: '⭐ Relevant',
        summary: 'A paper about deep learning.',
        reason: 'Highly relevant to the track.',
        absUrl: 'https://arxiv.org/abs/2502.10001',
        trackName: 'Deep Learning',
      },
    ],
    tracksIncluded: ['track-1'],
    totalPapersScanned: 42,
    totalPapersIncluded: 1,
    generatedAt: '2026-02-24T00:00:00.000Z',
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('sendDigestEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 'test-resend-key-123';
  });

  it('returns skipped when RESEND_API_KEY is not set', async () => {
    delete process.env.RESEND_API_KEY;
    const result = await sendDigestEmail({ to: 'user@example.com', digest: makeDigest() });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.skipped).toBe(true);
      expect(result.error).toContain('RESEND_API_KEY');
    }
  });

  it('returns skipped for empty digest', async () => {
    const result = await sendDigestEmail({
      to: 'user@example.com',
      digest: makeDigest({ entries: [], totalPapersIncluded: 0 }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.skipped).toBe(true);
    }
  });

  it('returns error for invalid email', async () => {
    const result = await sendDigestEmail({ to: 'not-an-email', digest: makeDigest() });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Invalid');
    }
  });

  it('returns error for empty email', async () => {
    const result = await sendDigestEmail({ to: '', digest: makeDigest() });
    expect(result.ok).toBe(false);
  });

  it('calls Resend with correct from address', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 'email-id-1' }, error: null });
    await sendDigestEmail({ to: 'user@example.com', digest: makeDigest() });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'PaperBrief <digest@paperbrief.ai>' }),
    );
  });

  it('calls Resend with correct to address', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 'email-id-2' }, error: null });
    await sendDigestEmail({ to: 'mikey@example.com', digest: makeDigest() });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['mikey@example.com'] }),
    );
  });

  it('includes weekOf in subject line', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 'email-id-3' }, error: null });
    await sendDigestEmail({ to: 'user@example.com', digest: makeDigest() });
    const call = mockSend.mock.calls[0][0];
    expect(call.subject).toContain('Feb 24');
  });

  it('uses singular "paper" in subject for 1 entry', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 'email-id-4' }, error: null });
    await sendDigestEmail({ to: 'user@example.com', digest: makeDigest() });
    const call = mockSend.mock.calls[0][0];
    expect(call.subject).toMatch(/1 paper/);
  });

  it('uses plural "papers" in subject for multiple entries', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 'email-id-5' }, error: null });
    const multiDigest = makeDigest({
      entries: [
        { arxivId: '2502.10001', title: 'P1', authors: 'A', score: 4, scoreLabel: '⭐', summary: 'S', reason: 'R', absUrl: 'https://arxiv.org/abs/2502.10001', trackName: 'DL' },
        { arxivId: '2502.10002', title: 'P2', authors: 'B', score: 3, scoreLabel: '📌', summary: 'S', reason: 'R', absUrl: 'https://arxiv.org/abs/2502.10002', trackName: 'NLP' },
      ],
      totalPapersIncluded: 2,
    });
    await sendDigestEmail({ to: 'user@example.com', digest: multiDigest });
    const call = mockSend.mock.calls[0][0];
    expect(call.subject).toMatch(/2 papers/);
  });

  it('returns ok: true with id on success', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 'resend-abc-123' }, error: null });
    const result = await sendDigestEmail({ to: 'user@example.com', digest: makeDigest() });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.id).toBe('resend-abc-123');
    }
  });

  it('returns ok: false with error message on Resend error', async () => {
    mockSend.mockResolvedValueOnce({ data: null, error: { message: 'Rate limit exceeded' } });
    const result = await sendDigestEmail({ to: 'user@example.com', digest: makeDigest() });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Rate limit');
    }
  });

  it('returns ok: false on unexpected thrown error', async () => {
    mockSend.mockRejectedValueOnce(new Error('Network error'));
    const result = await sendDigestEmail({ to: 'user@example.com', digest: makeDigest() });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Network error');
    }
  });

  it('accepts custom from address override', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 'x' }, error: null });
    await sendDigestEmail({
      to: 'user@example.com',
      digest: makeDigest(),
      from: 'Custom <custom@test.io>',
    });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'Custom <custom@test.io>' }),
    );
  });

  it('includes the react email component in the send call', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 'y' }, error: null });
    await sendDigestEmail({ to: 'user@example.com', digest: makeDigest() });
    const call = mockSend.mock.calls[0][0];
    expect(call).toHaveProperty('react');
  });
});
