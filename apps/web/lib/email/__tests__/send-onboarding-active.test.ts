import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Resend before importing the module under test
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn(),
    },
  })),
}));

// Mock supabase — controls getUserEmail and onboarding_sent_at checks
vi.mock('../../supabase', () => ({
  getServiceSupabase: vi.fn(),
}));

const DEFAULT_USER_ID = 'user-abc-123';
const DEFAULT_EMAIL = 'researcher@university.edu';

function makeSupabaseMock({
  email = DEFAULT_EMAIL,
  onboardingSentAt = null as string | null,
  upsertOk = true,
} = {}) {
  const single = vi.fn().mockResolvedValue({
    data: onboardingSentAt ? { onboarding_sent_at: onboardingSentAt } : null,
    error: null,
  });
  const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single }) });
  const upsert = vi.fn().mockResolvedValue(upsertOk ? { error: null } : { error: { message: 'db err' } });
  const from = vi.fn().mockReturnValue({ select, upsert });
  const getUserById = vi.fn().mockResolvedValue({
    data: { user: { email } },
    error: null,
  });
  return {
    from,
    auth: { admin: { getUserById } },
    _mocks: { from, select, upsert, single, getUserById },
  };
}

function makeResendMock(result: { data?: { id: string } | null; error?: { message: string } | null } = {}) {
  const send = vi.fn().mockResolvedValue({
    data: result.data ?? { id: 'email_001' },
    error: result.error ?? null,
  });
  return { emails: { send } };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  delete process.env.RESEND_API_KEY;
});

describe('sendOnboardingActiveEmail', () => {
  it('returns skipped when RESEND_API_KEY is not set', async () => {
    const { getServiceSupabase } = await import('../../supabase');
    (getServiceSupabase as any).mockReturnValue(makeSupabaseMock());

    const { sendOnboardingActiveEmail } = await import('../send-onboarding-active');
    const result = await sendOnboardingActiveEmail(DEFAULT_USER_ID);

    expect(result.ok).toBe(false);
    expect((result as any).skipped).toBe(true);
  });

  it('returns skipped when onboarding email was already sent', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    const { getServiceSupabase } = await import('../../supabase');
    (getServiceSupabase as any).mockReturnValue(
      makeSupabaseMock({ onboardingSentAt: '2026-03-23T00:30:00Z' })
    );

    const { sendOnboardingActiveEmail } = await import('../send-onboarding-active');
    const result = await sendOnboardingActiveEmail(DEFAULT_USER_ID);

    expect(result.ok).toBe(false);
    expect((result as any).skipped).toBe(true);
    expect((result as any).error).toMatch(/already sent/i);
  });

  it('returns error when user email cannot be resolved', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    const { getServiceSupabase } = await import('../../supabase');
    const supabase = makeSupabaseMock();
    supabase.auth.admin.getUserById = vi.fn().mockResolvedValue({
      data: { user: null },
      error: null,
    });
    (getServiceSupabase as any).mockReturnValue(supabase);

    const { sendOnboardingActiveEmail } = await import('../send-onboarding-active');
    const result = await sendOnboardingActiveEmail(DEFAULT_USER_ID);

    expect(result.ok).toBe(false);
    expect((result as any).error).toMatch(/resolve user email/i);
  });

  it('sends email and returns ok:true with id on success', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    const { getServiceSupabase } = await import('../../supabase');
    (getServiceSupabase as any).mockReturnValue(makeSupabaseMock());

    const { Resend } = await import('resend');
    const resendMock = makeResendMock();
    (Resend as any).mockImplementation(() => resendMock);

    const { sendOnboardingActiveEmail } = await import('../send-onboarding-active');
    const result = await sendOnboardingActiveEmail(DEFAULT_USER_ID);

    expect(result.ok).toBe(true);
    expect((result as any).id).toBe('email_001');
  });

  it('sends to the correct email address', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    const { getServiceSupabase } = await import('../../supabase');
    (getServiceSupabase as any).mockReturnValue(
      makeSupabaseMock({ email: 'phd@mit.edu' })
    );

    const { Resend } = await import('resend');
    const resendMock = makeResendMock();
    (Resend as any).mockImplementation(() => resendMock);

    const { sendOnboardingActiveEmail } = await import('../send-onboarding-active');
    await sendOnboardingActiveEmail(DEFAULT_USER_ID);

    const callArgs = resendMock.emails.send.mock.calls[0][0];
    expect(callArgs.to).toEqual(['phd@mit.edu']);
  });

  it('sends from the PaperBrief address', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    const { getServiceSupabase } = await import('../../supabase');
    (getServiceSupabase as any).mockReturnValue(makeSupabaseMock());

    const { Resend } = await import('resend');
    const resendMock = makeResendMock();
    (Resend as any).mockImplementation(() => resendMock);

    const { sendOnboardingActiveEmail } = await import('../send-onboarding-active');
    await sendOnboardingActiveEmail(DEFAULT_USER_ID);

    const callArgs = resendMock.emails.send.mock.calls[0][0];
    expect(callArgs.from).toContain('paperbrief.ai');
  });

  it('uses custom appUrl when provided', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    const { getServiceSupabase } = await import('../../supabase');
    (getServiceSupabase as any).mockReturnValue(makeSupabaseMock());

    const { Resend } = await import('resend');
    const resendMock = makeResendMock();
    (Resend as any).mockImplementation(() => resendMock);

    const { sendOnboardingActiveEmail } = await import('../send-onboarding-active');
    await sendOnboardingActiveEmail(DEFAULT_USER_ID, 'https://staging.paperbrief.ai');

    // The react element props should contain the custom appUrl
    const callArgs = resendMock.emails.send.mock.calls[0][0];
    expect(callArgs.react).toBeDefined();
    // Props are passed to React.createElement — verify via the element type/props
    const props = callArgs.react?.props as Record<string, unknown>;
    expect(props?.appUrl).toBe('https://staging.paperbrief.ai');
  });

  it('falls back to NEXT_PUBLIC_APP_URL env var when no appUrl arg given', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.NEXT_PUBLIC_APP_URL = 'https://preview.paperbrief.ai';
    const { getServiceSupabase } = await import('../../supabase');
    (getServiceSupabase as any).mockReturnValue(makeSupabaseMock());

    const { Resend } = await import('resend');
    const resendMock = makeResendMock();
    (Resend as any).mockImplementation(() => resendMock);

    const { sendOnboardingActiveEmail } = await import('../send-onboarding-active');
    await sendOnboardingActiveEmail(DEFAULT_USER_ID);

    const callArgs = resendMock.emails.send.mock.calls[0][0];
    const props = callArgs.react?.props as Record<string, unknown>;
    expect(props?.appUrl).toBe('https://preview.paperbrief.ai');

    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it('returns error when Resend returns an error', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    const { getServiceSupabase } = await import('../../supabase');
    (getServiceSupabase as any).mockReturnValue(makeSupabaseMock());

    const { Resend } = await import('resend');
    const resendMock = makeResendMock({ error: { message: 'rate limited' }, data: null });
    (Resend as any).mockImplementation(() => resendMock);

    const { sendOnboardingActiveEmail } = await import('../send-onboarding-active');
    const result = await sendOnboardingActiveEmail(DEFAULT_USER_ID);

    expect(result.ok).toBe(false);
    expect((result as any).error).toBe('rate limited');
  });

  it('returns error when Resend throws', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    const { getServiceSupabase } = await import('../../supabase');
    (getServiceSupabase as any).mockReturnValue(makeSupabaseMock());

    const { Resend } = await import('resend');
    const resendMock = { emails: { send: vi.fn().mockRejectedValue(new Error('network timeout')) } };
    (Resend as any).mockImplementation(() => resendMock);

    const { sendOnboardingActiveEmail } = await import('../send-onboarding-active');
    const result = await sendOnboardingActiveEmail(DEFAULT_USER_ID);

    expect(result.ok).toBe(false);
    expect((result as any).error).toBe('network timeout');
  });
});
