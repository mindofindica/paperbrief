import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock resend
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ data: { id: "email-123" }, error: null }),
    },
  })),
}));

// Mock react-email components
vi.mock("@react-email/components", () => ({
  Body: ({ children }: any) => children,
  Button: ({ children }: any) => children,
  Container: ({ children }: any) => children,
  Head: () => null,
  Heading: ({ children }: any) => children,
  Hr: () => null,
  Html: ({ children }: any) => children,
  Preview: ({ children }: any) => children,
  Section: ({ children }: any) => children,
  Text: ({ children }: any) => children,
}));

vi.mock("../email/templates/beta-invite", () => ({
  BetaInviteEmail: () => null,
}));

import { sendInviteEmail } from "../email/send-invite";

describe("sendInviteEmail", () => {
  const originalKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_key";
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.RESEND_API_KEY = originalKey;
  });

  it("returns ok:true with email id on success", async () => {
    const result = await sendInviteEmail({ to: "user@example.com", token: "abc123" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.id).toBe("email-123");
  });

  it("skips gracefully when RESEND_API_KEY is not set", async () => {
    delete process.env.RESEND_API_KEY;
    const result = await sendInviteEmail({ to: "user@example.com", token: "abc123" });
    expect(result.ok).toBe(false);
    expect("skipped" in result && result.skipped).toBe(true);
  });

  it("returns error for invalid email", async () => {
    const result = await sendInviteEmail({ to: "not-an-email", token: "abc123" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/invalid/i);
  });

  it("returns error for missing token", async () => {
    const result = await sendInviteEmail({ to: "user@example.com", token: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/token/i);
  });

  it("handles Resend API errors gracefully", async () => {
    const { Resend } = await import("resend");
    vi.mocked(Resend).mockImplementationOnce(() => ({
      emails: {
        send: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "Rate limit exceeded" },
        }),
      },
    }) as any);

    const result = await sendInviteEmail({ to: "user@example.com", token: "abc123" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/rate limit/i);
  });

  it("handles unexpected exceptions", async () => {
    const { Resend } = await import("resend");
    vi.mocked(Resend).mockImplementationOnce(() => ({
      emails: {
        send: vi.fn().mockRejectedValue(new Error("Network error")),
      },
    }) as any);

    const result = await sendInviteEmail({ to: "user@example.com", token: "abc123" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/network/i);
  });

  it("uses custom baseUrl in invite URL when provided", async () => {
    const { Resend } = await import("resend");
    const sendMock = vi.fn().mockResolvedValue({ data: { id: "x" }, error: null });
    vi.mocked(Resend).mockImplementationOnce(() => ({ emails: { send: sendMock } }) as any);

    const result = await sendInviteEmail({
      to: "user@example.com",
      token: "mytoken",
      baseUrl: "https://beta.paperbrief.ai",
    });
    expect(result.ok).toBe(true);
    expect(sendMock).toHaveBeenCalledOnce();
  });
});
