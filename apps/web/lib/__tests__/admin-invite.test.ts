/**
 * Tests for POST /api/admin/invite (batch) and POST /api/admin/invite/:email (single)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Stable Supabase mock ───────────────────────────────────────────────────────
// We define the result stores and set them in each test.
// Using regular objects (not vi.fn chains) for the inner chain to avoid clearAllMocks issues.

const supabaseState = {
  pendingRows: [] as Array<{ id: string; email: string }>,
  updateError: null as { message: string } | null,
  singleRow: null as { id: string; email: string; invited_at: string | null } | null,
  singleError: null as { message: string } | null,
};

function makeChainResult<T>(result: T) {
  // Returns a thenable object (awaitable) that also supports chaining
  const obj: any = {
    then: (res: any, rej: any) => Promise.resolve(result).then(res, rej),
    catch: (fn: any) => Promise.resolve(result).catch(fn),
    // Extra chain methods that return themselves or another result
    select: () => obj,
    is: () => obj,
    not: () => obj,
    eq: () => obj,
    single: () => Promise.resolve({ data: supabaseState.singleRow, error: supabaseState.singleError }),
    update: () => ({
      eq: () => Promise.resolve({ error: supabaseState.updateError }),
    }),
    order: () => ({
      limit: (n: number) => Promise.resolve({ data: supabaseState.pendingRows, error: null }),
    }),
    limit: (n: number) => Promise.resolve({ data: supabaseState.pendingRows, error: null }),
  };
  return obj;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: (_table: string) => makeChainResult({ data: null, error: null }),
  })),
}));

// ── Email mock ─────────────────────────────────────────────────────────────────
const mockSendInviteEmail = vi.fn();
vi.mock("../email/send-invite", () => ({
  sendInviteEmail: (...args: any[]) => mockSendInviteEmail(...args),
}));

import { POST as batchInvite } from "../../app/api/admin/invite/route";
import { POST as singleInvite } from "../../app/api/admin/invite/[email]/route";

function makeBatchRequest(body: unknown, secret = "test-secret"): Request {
  return new Request("http://localhost/api/admin/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-secret": secret },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/invite (batch)", () => {
  beforeEach(() => {
    process.env.ADMIN_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    supabaseState.pendingRows = [
      { id: "1", email: "alice@example.com" },
      { id: "2", email: "bob@example.com" },
    ];
    supabaseState.updateError = null;
    mockSendInviteEmail.mockReset();
    mockSendInviteEmail.mockResolvedValue({ ok: true, id: "email-abc" });
  });

  it("returns 401 without correct admin secret", async () => {
    const res = await batchInvite(makeBatchRequest({ limit: 5 }, "wrong"));
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing limit", async () => {
    const res = await batchInvite(makeBatchRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/limit/i);
  });

  it("returns 400 for non-positive limit", async () => {
    const res = await batchInvite(makeBatchRequest({ limit: 0 }));
    expect(res.status).toBe(400);
  });

  it("invites pending users and returns results", async () => {
    const res = await batchInvite(makeBatchRequest({ limit: 10 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invited).toEqual(["alice@example.com", "bob@example.com"]);
    expect(body.emailsSent).toBe(2);
    expect(body.errors).toEqual([]);
  });

  it("caps limit at 100 (batch doesn't error with large values)", async () => {
    const res = await batchInvite(makeBatchRequest({ limit: 500 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invited).toBeDefined();
  });

  it("counts emailsSent=0 when Resend key not configured", async () => {
    mockSendInviteEmail.mockResolvedValue({
      ok: false,
      error: "RESEND_API_KEY not configured",
      skipped: true,
    });
    const res = await batchInvite(makeBatchRequest({ limit: 10 }));
    const body = await res.json();
    expect(body.invited).toHaveLength(2);
    expect(body.emailsSent).toBe(0);
  });

  it("returns empty result and message when no pending users", async () => {
    supabaseState.pendingRows = [];
    const res = await batchInvite(makeBatchRequest({ limit: 10 }));
    const body = await res.json();
    expect(body.invited).toEqual([]);
    expect(body.message).toMatch(/no pending/i);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/admin/invite", {
      method: "POST",
      headers: { "x-admin-secret": "test-secret" },
      body: "not json",
    });
    const res = await batchInvite(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for limit as string", async () => {
    const res = await batchInvite(makeBatchRequest({ limit: "ten" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/invite/:email (single)", () => {
  beforeEach(() => {
    process.env.ADMIN_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    supabaseState.singleRow = { id: "42", email: "user@example.com", invited_at: null };
    supabaseState.singleError = null;
    supabaseState.updateError = null;
    mockSendInviteEmail.mockReset();
    mockSendInviteEmail.mockResolvedValue({ ok: true, id: "email-xyz" });
  });

  function makeReq(email: string, secret = "test-secret"): Request {
    return new Request(`http://localhost/api/admin/invite/${email}`, {
      method: "POST",
      headers: { "x-admin-secret": secret },
    });
  }

  it("returns 401 without admin secret", async () => {
    const res = await singleInvite(makeReq("user@example.com", "bad"), {
      params: { email: "user@example.com" },
    });
    expect(res.status).toBe(401);
  });

  it("successfully invites a waitlist user", async () => {
    const res = await singleInvite(makeReq("user@example.com"), {
      params: { email: "user@example.com" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.email).toBe("user@example.com");
    expect(body.emailSent).toBe(true);
    expect(body.token).toBeDefined();
    expect(body.token.length).toBeGreaterThan(0);
  });

  it("returns 404 when email not on waitlist", async () => {
    supabaseState.singleRow = null;
    supabaseState.singleError = { message: "not found" };
    const res = await singleInvite(makeReq("ghost@example.com"), {
      params: { email: "ghost@example.com" },
    });
    expect(res.status).toBe(404);
  });

  it("marks reinvite:true for previously invited user", async () => {
    supabaseState.singleRow = {
      id: "42",
      email: "user@example.com",
      invited_at: "2026-02-01T00:00:00Z",
    };
    const res = await singleInvite(makeReq("user@example.com"), {
      params: { email: "user@example.com" },
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.reinvite).toBe(true);
  });

  it("marks reinvite:false for first-time invite", async () => {
    supabaseState.singleRow = {
      id: "42",
      email: "user@example.com",
      invited_at: null,
    };
    const res = await singleInvite(makeReq("user@example.com"), {
      params: { email: "user@example.com" },
    });
    const body = await res.json();
    expect(body.reinvite).toBe(false);
  });

  it("returns 400 for invalid email in URL", async () => {
    const res = await singleInvite(makeReq("not-an-email"), {
      params: { email: "not-an-email" },
    });
    expect(res.status).toBe(400);
  });

  it("reports emailSent:false when Resend not configured", async () => {
    mockSendInviteEmail.mockResolvedValue({
      ok: false,
      error: "RESEND_API_KEY not configured",
      skipped: true,
    });
    const res = await singleInvite(makeReq("user@example.com"), {
      params: { email: "user@example.com" },
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.emailSent).toBe(false);
  });
});
