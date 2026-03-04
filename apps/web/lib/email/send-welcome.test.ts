import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock Resend ──────────────────────────────────────────────────────────────
vi.mock("resend", () => {
  const mockSend = vi.fn();
  return {
    Resend: vi.fn().mockImplementation(() => ({
      emails: { send: mockSend },
    })),
    __mockSend: mockSend,
  };
});

// ─── Mock React createElement so tests don't need JSX transform ──────────────
vi.mock("react", () => ({
  default: { createElement: vi.fn().mockReturnValue(null) },
  createElement: vi.fn().mockReturnValue(null),
}));

// ─── Mock templates ───────────────────────────────────────────────────────────
vi.mock("./templates/welcome", () => ({
  WelcomeEmail: vi.fn(),
}));
vi.mock("./templates/already-waitlisted", () => ({
  AlreadyWaitlistedEmail: vi.fn(),
}));

import { sendWelcomeEmail, sendAlreadyWaitlistedEmail } from "./send-welcome";
import { Resend } from "resend";

// Helper to grab the mock send function from the mocked Resend instance
function getMockSend() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Resend as any).__mockSend ?? (Resend as any).mock?.results?.[0]?.value?.emails?.send;
}

// We need to access the mock send directly through the mock module
let mockSend: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.clearAllMocks();
  // Re-import to get fresh mock reference after clearAllMocks
  const resendModule = await import("resend");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockSend = (resendModule as any).__mockSend;
});

afterEach(() => {
  delete process.env.RESEND_API_KEY;
});

// ─── sendWelcomeEmail ─────────────────────────────────────────────────────────

describe("sendWelcomeEmail", () => {
  describe("when RESEND_API_KEY is not set", () => {
    it("returns skipped result without throwing", async () => {
      delete process.env.RESEND_API_KEY;
      const result = await sendWelcomeEmail("test@example.com");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.skipped).toBe(true);
        expect(result.error).toMatch(/RESEND_API_KEY/);
      }
    });

    it("does not call Resend send when key is missing", async () => {
      delete process.env.RESEND_API_KEY;
      await sendWelcomeEmail("test@example.com");
      // Resend constructor should not have been called with undefined key path
      // (we only check that no send was attempted)
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe("when RESEND_API_KEY is set", () => {
    beforeEach(() => {
      process.env.RESEND_API_KEY = "re_test_key";
    });

    it("returns ok:true with id on success", async () => {
      mockSend.mockResolvedValueOnce({ data: { id: "email-123" }, error: null });
      const result = await sendWelcomeEmail("user@example.com");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.id).toBe("email-123");
      }
    });

    it("sends to the correct recipient", async () => {
      mockSend.mockResolvedValueOnce({ data: { id: "abc" }, error: null });
      await sendWelcomeEmail("recipient@example.com");
      expect(mockSend).toHaveBeenCalledOnce();
      const callArg = mockSend.mock.calls[0][0];
      expect(callArg.to).toContain("recipient@example.com");
    });

    it("sends from the PaperBrief address", async () => {
      mockSend.mockResolvedValueOnce({ data: { id: "abc" }, error: null });
      await sendWelcomeEmail("user@example.com");
      const callArg = mockSend.mock.calls[0][0];
      expect(callArg.from).toMatch(/paperbrief/i);
    });

    it("uses a welcoming subject line", async () => {
      mockSend.mockResolvedValueOnce({ data: { id: "abc" }, error: null });
      await sendWelcomeEmail("user@example.com");
      const callArg = mockSend.mock.calls[0][0];
      expect(callArg.subject.toLowerCase()).toMatch(/waitlist|welcome/);
    });

    it("returns ok:false with error message when Resend returns an error", async () => {
      mockSend.mockResolvedValueOnce({ data: null, error: { message: "invalid api key" } });
      const result = await sendWelcomeEmail("user@example.com");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/invalid api key/i);
      }
    });

    it("returns ok:false when Resend throws", async () => {
      mockSend.mockRejectedValueOnce(new Error("network timeout"));
      const result = await sendWelcomeEmail("user@example.com");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/network timeout/);
      }
    });

    it("handles non-Error throws gracefully", async () => {
      mockSend.mockRejectedValueOnce("string error");
      const result = await sendWelcomeEmail("user@example.com");
      expect(result.ok).toBe(false);
    });
  });
});

// ─── sendAlreadyWaitlistedEmail ───────────────────────────────────────────────

describe("sendAlreadyWaitlistedEmail", () => {
  describe("when RESEND_API_KEY is not set", () => {
    it("returns skipped result without throwing", async () => {
      delete process.env.RESEND_API_KEY;
      const result = await sendAlreadyWaitlistedEmail("test@example.com");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.skipped).toBe(true);
      }
    });

    it("does not call Resend send when key is missing", async () => {
      delete process.env.RESEND_API_KEY;
      await sendAlreadyWaitlistedEmail("test@example.com");
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe("when RESEND_API_KEY is set", () => {
    beforeEach(() => {
      process.env.RESEND_API_KEY = "re_test_key";
    });

    it("returns ok:true with id on success", async () => {
      mockSend.mockResolvedValueOnce({ data: { id: "dup-456" }, error: null });
      const result = await sendAlreadyWaitlistedEmail("user@example.com");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.id).toBe("dup-456");
      }
    });

    it("sends to the correct recipient", async () => {
      mockSend.mockResolvedValueOnce({ data: { id: "abc" }, error: null });
      await sendAlreadyWaitlistedEmail("dup@example.com");
      const callArg = mockSend.mock.calls[0][0];
      expect(callArg.to).toContain("dup@example.com");
    });

    it("uses a friendly subject for duplicate signups", async () => {
      mockSend.mockResolvedValueOnce({ data: { id: "abc" }, error: null });
      await sendAlreadyWaitlistedEmail("dup@example.com");
      const callArg = mockSend.mock.calls[0][0];
      expect(callArg.subject.toLowerCase()).toMatch(/already|waitlist/);
    });

    it("returns ok:false when Resend returns an error", async () => {
      mockSend.mockResolvedValueOnce({ data: null, error: { message: "rate limited" } });
      const result = await sendAlreadyWaitlistedEmail("user@example.com");
      expect(result.ok).toBe(false);
    });

    it("returns ok:false when Resend throws", async () => {
      mockSend.mockRejectedValueOnce(new Error("connection refused"));
      const result = await sendAlreadyWaitlistedEmail("user@example.com");
      expect(result.ok).toBe(false);
    });
  });
});
