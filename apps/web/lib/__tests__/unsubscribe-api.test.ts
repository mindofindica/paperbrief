/**
 * unsubscribe-api.test.ts
 *
 * Unit tests for GET /api/unsubscribe and POST /api/resubscribe.
 * Mocks Supabase service client and the verifySessionCookie utility.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { generateUnsubscribeToken } from "../unsubscribe-token";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Supabase mock — tracks upsert calls
const mockUpsert = vi.fn().mockResolvedValue({ error: null });
const mockSelect = vi.fn().mockReturnValue({
  eq: vi.fn().mockReturnValue({
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
});

vi.mock("../supabase", () => ({
  getServiceSupabase: () => ({
    from: () => ({
      upsert: mockUpsert,
      select: mockSelect,
    }),
  }),
}));

vi.mock("../auth", () => ({
  verifySessionCookie: vi.fn(),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = "test-user-123";
const EMAIL = "user@example.com";

function makeUnsubscribeRequest(overrides?: {
  uid?: string;
  email?: string;
  token?: string;
}): NextRequest {
  const uid = overrides?.uid ?? USER_ID;
  const email = overrides?.email ?? EMAIL;
  const token =
    overrides?.token !== undefined
      ? overrides.token
      : generateUnsubscribeToken(uid, email);

  const url = new URL("https://paperbrief.io/api/unsubscribe");
  if (uid) url.searchParams.set("uid", uid);
  if (email) url.searchParams.set("email", email);
  if (token) url.searchParams.set("token", token);
  return new NextRequest(url.toString());
}

// ── GET /api/unsubscribe ──────────────────────────────────────────────────────

describe("GET /api/unsubscribe", () => {
  beforeEach(() => {
    vi.resetModules();
    mockUpsert.mockReset();
    mockUpsert.mockResolvedValue({ error: null });
    process.env.UNSUBSCRIBE_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://paperbrief.io";
  });

  afterEach(() => {
    delete process.env.UNSUBSCRIBE_SECRET;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("redirects to /unsubscribe?status=success on valid token", async () => {
    const { GET } = await import("../../app/api/unsubscribe/route");
    const req = makeUnsubscribeRequest();
    const res = await GET(req);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://paperbrief.io/unsubscribe?status=success"
    );
  });

  it("calls supabase upsert with digest_subscribed=false", async () => {
    const { GET } = await import("../../app/api/unsubscribe/route");
    const req = makeUnsubscribeRequest();
    await GET(req);

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        digest_subscribed: false,
      }),
      expect.any(Object)
    );
  });

  it("redirects to /unsubscribe?status=error on invalid token", async () => {
    const { GET } = await import("../../app/api/unsubscribe/route");
    const req = makeUnsubscribeRequest({ token: "bad-token-xyz" });
    const res = await GET(req);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://paperbrief.io/unsubscribe?status=error"
    );
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("redirects to error page when uid is missing", async () => {
    const { GET } = await import("../../app/api/unsubscribe/route");
    const url = new URL("https://paperbrief.io/api/unsubscribe");
    url.searchParams.set("email", EMAIL);
    url.searchParams.set("token", generateUnsubscribeToken(USER_ID, EMAIL));
    const req = new NextRequest(url.toString());
    const res = await GET(req);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("status=error");
  });

  it("redirects to error page when email is missing", async () => {
    const { GET } = await import("../../app/api/unsubscribe/route");
    const url = new URL("https://paperbrief.io/api/unsubscribe");
    url.searchParams.set("uid", USER_ID);
    url.searchParams.set("token", generateUnsubscribeToken(USER_ID, EMAIL));
    const req = new NextRequest(url.toString());
    const res = await GET(req);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("status=error");
  });

  it("redirects to error page when DB fails", async () => {
    mockUpsert.mockResolvedValueOnce({ error: new Error("DB down") });
    const { GET } = await import("../../app/api/unsubscribe/route");
    const req = makeUnsubscribeRequest();
    const res = await GET(req);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("status=error");
  });
});

// ── POST /api/resubscribe ─────────────────────────────────────────────────────

describe("POST /api/resubscribe", () => {

  beforeEach(() => {
    vi.resetModules();
    mockUpsert.mockReset();
    mockUpsert.mockResolvedValue({ error: null });
    process.env.UNSUBSCRIBE_SECRET = "test-secret";
  });

  afterEach(() => {
    delete process.env.UNSUBSCRIBE_SECRET;
  });

  it("returns 401 when no session cookie", async () => {
    const { POST } = await import("../../app/api/resubscribe/route");
    const req = new NextRequest("https://paperbrief.io/api/resubscribe", {
      method: "POST",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 when session cookie is invalid", async () => {
    const { verifySessionCookie } = await import("../auth");
    vi.mocked(verifySessionCookie).mockReturnValue({ valid: false, userId: undefined });

    const { POST } = await import("../../app/api/resubscribe/route");
    const req = new NextRequest("https://paperbrief.io/api/resubscribe", {
      method: "POST",
      headers: { cookie: "pb_session=bad-session" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 and upserts digest_subscribed=true on valid session", async () => {
    const { verifySessionCookie } = await import("../auth");
    vi.mocked(verifySessionCookie).mockReturnValue({
      valid: true,
      userId: USER_ID,
    });

    const { POST } = await import("../../app/api/resubscribe/route");
    const req = new NextRequest("https://paperbrief.io/api/resubscribe", {
      method: "POST",
      headers: { cookie: "pb_session=valid-session" },
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        digest_subscribed: true,
      }),
      expect.any(Object)
    );
  });

  it("returns 500 when DB fails", async () => {
    const { verifySessionCookie } = await import("../auth");
    vi.mocked(verifySessionCookie).mockReturnValue({
      valid: true,
      userId: USER_ID,
    });
    mockUpsert.mockResolvedValueOnce({ error: new Error("DB error") });

    const { POST } = await import("../../app/api/resubscribe/route");
    const req = new NextRequest("https://paperbrief.io/api/resubscribe", {
      method: "POST",
      headers: { cookie: "pb_session=valid-session" },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
