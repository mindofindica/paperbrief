import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendMagicLinkEmail } from '../send-magic-link';

// Mock Resend
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn(),
    },
  })),
}));

const MAGIC_URL = 'https://paperbrief.ai/api/auth/verify?token=abc123';
const EMAIL = 'mikey@test.com';

function getResendSendMock() {
  const { Resend } = require('resend');
  return Resend.mock.results[Resend.mock.results.length - 1]?.value?.emails?.send;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('sendMagicLinkEmail', () => {
  it('returns skipped when RESEND_API_KEY is not set', async () => {
    const orig = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;

    const result = await sendMagicLinkEmail(EMAIL, MAGIC_URL);

    expect(result.ok).toBe(false);
    expect((result as any).skipped).toBe(true);

    process.env.RESEND_API_KEY = orig;
  });

  it('returns ok:true with id on success', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    const { Resend } = await import('resend');
    const mockSend = vi.fn().mockResolvedValue({ data: { id: 'msg_123' }, error: null });
    (Resend as any).mockImplementation(() => ({ emails: { send: mockSend } }));

    const { sendMagicLinkEmail: fn } = await import('../send-magic-link');
    const result = await fn(EMAIL, MAGIC_URL);

    expect(result.ok).toBe(true);
    expect((result as any).id).toBe('msg_123');
  });

  it('returns ok:false when Resend returns an error', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    const { Resend } = await import('resend');
    const mockSend = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Invalid recipient', name: 'validation_error' },
    });
    (Resend as any).mockImplementation(() => ({ emails: { send: mockSend } }));

    const { sendMagicLinkEmail: fn } = await import('../send-magic-link');
    const result = await fn(EMAIL, MAGIC_URL);

    expect(result.ok).toBe(false);
    expect((result as any).error).toContain('Invalid recipient');
  });

  it('returns ok:false when Resend throws', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    const { Resend } = await import('resend');
    const mockSend = vi.fn().mockRejectedValue(new Error('network timeout'));
    (Resend as any).mockImplementation(() => ({ emails: { send: mockSend } }));

    const { sendMagicLinkEmail: fn } = await import('../send-magic-link');
    const result = await fn(EMAIL, MAGIC_URL);

    expect(result.ok).toBe(false);
    expect((result as any).error).toContain('network timeout');
  });

  it('sends from hello@paperbrief.ai with correct subject', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    const { Resend } = await import('resend');
    const mockSend = vi.fn().mockResolvedValue({ data: { id: 'x' }, error: null });
    (Resend as any).mockImplementation(() => ({ emails: { send: mockSend } }));

    const { sendMagicLinkEmail: fn } = await import('../send-magic-link');
    await fn(EMAIL, MAGIC_URL);

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'PaperBrief <hello@paperbrief.ai>',
        to: EMAIL,
        subject: 'Your PaperBrief sign-in link',
      })
    );
  });
});
