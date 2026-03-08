import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { getServiceSupabase } from "../../../../lib/supabase";
import { verifySessionCookie } from "../../../../lib/auth";
import { getSubscription } from "../../../../lib/stripe";

vi.mock("../../../../lib/supabase", () => ({ getServiceSupabase: vi.fn() }));
vi.mock("../../../../lib/auth", () => ({ verifySessionCookie: vi.fn() }));
vi.mock("../../../../lib/stripe", () => ({ getSubscription: vi.fn() }));

const supabaseMock = vi.mocked(getServiceSupabase);
const authMock = vi.mocked(verifySessionCookie);
const subMock = vi.mocked(getSubscription);

const FREE_SUB = {
  plan: "free" as const,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  planExpiresAt: null,
  trackLimit: 1,
  digestFrequency: "weekly",
};

const PRO_SUB = { ...FREE_SUB, plan: "pro" as const, trackLimit: 5 };

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body: unknown, cookie = "valid-session"): NextRequest {
  return new NextRequest("http://localhost/api/tracks/template", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `pb_session=${cookie}`,
    },
    body: JSON.stringify(body),
  });
}

type SupabaseChain = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
};

function makeChain(overrides: Partial<SupabaseChain> = {}): SupabaseChain {
  const chain: SupabaseChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
    insert: vi.fn().mockReturnThis(),
    ...overrides,
  };
  return chain;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetAllMocks();
  authMock.mockReturnValue({ valid: true, userId: "user-1" });
  subMock.mockResolvedValue(FREE_SUB);
});

describe("POST /api/tracks/template", () => {
  // ── Auth ──────────────────────────────────────────────────────────────────

  it("returns 401 when no session cookie", async () => {
    authMock.mockReturnValue({ valid: false, userId: undefined });
    const res = await POST(makeRequest({ keys: ["llms"] }));
    expect(res.status).toBe(401);
  });

  // ── Input validation ──────────────────────────────────────────────────────

  it("returns 400 when body is not valid JSON", async () => {
    const req = new NextRequest("http://localhost/api/tracks/template", {
      method: "POST",
      headers: { Cookie: "pb_session=valid", "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when keys is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when keys is empty array", async () => {
    const res = await POST(makeRequest({ keys: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when an unknown template key is provided", async () => {
    const res = await POST(makeRequest({ keys: ["not-a-real-template"] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Unknown template keys/);
  });

  // ── Plan limit ────────────────────────────────────────────────────────────

  it("returns 403 when free user already has 1 track (no slots)", async () => {
    subMock.mockResolvedValue(FREE_SUB); // limit = 1
    const chain = makeChain();
    // Simulate count query returning 1
    chain.select.mockImplementationOnce(() => ({
      eq: vi.fn().mockReturnThis(),
      // This makes the count query resolve with count = 1
      then: (fn: (v: { count: number; error: null }) => void) =>
        fn({ count: 1, error: null }),
    }));
    supabaseMock.mockReturnValue({ from: vi.fn().mockReturnValue(chain) } as unknown as ReturnType<typeof getServiceSupabase>);

    const res = await POST(makeRequest({ keys: ["llms"] }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.upgrade).toBe(true);
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it("creates tracks for valid keys (pro plan, enough slots)", async () => {
    subMock.mockResolvedValue(PRO_SUB); // limit = 5

    const insertedTracks = [
      { id: "t1", name: "Large Language Models", keywords: [], arxiv_cats: [], min_score: 0.65, active: true, created_at: new Date().toISOString() },
      { id: "t2", name: "AI Agents & Reasoning", keywords: [], arxiv_cats: [], min_score: 0.65, active: true, created_at: new Date().toISOString() },
    ];

    let callIdx = 0;
    supabaseMock.mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        callIdx++;
        if (callIdx === 1) {
          // count query
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
              }),
            }),
          };
        }
        if (callIdx === 2) {
          // existing name check
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          };
        }
        // insert
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: insertedTracks, error: null }),
          }),
        };
      }),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const res = await POST(makeRequest({ keys: ["llms", "agents"] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toHaveLength(2);
    expect(body.skipped).toEqual([]);
    expect(body.limitReached).toBe(false);
  });

  it("skips duplicate track names and only inserts new ones", async () => {
    subMock.mockResolvedValue(PRO_SUB);

    const insertedTracks = [
      { id: "t2", name: "AI Agents & Reasoning", keywords: [], arxiv_cats: [], min_score: 0.65, active: true, created_at: new Date().toISOString() },
    ];

    let callIdx = 0;
    supabaseMock.mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        callIdx++;
        if (callIdx === 1) {
          // count query
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ count: 1, error: null }),
              }),
            }),
          };
        }
        if (callIdx === 2) {
          // existing names — LLMs already exists
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({
                  data: [{ name: "Large Language Models" }],
                  error: null,
                }),
              }),
            }),
          };
        }
        // insert agents only
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: insertedTracks, error: null }),
          }),
        };
      }),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const res = await POST(makeRequest({ keys: ["llms", "agents"] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toHaveLength(1);
    expect(body.skipped).toContain("llms");
  });

  it("returns 200 with empty created when all keys are duplicates", async () => {
    subMock.mockResolvedValue(PRO_SUB);

    let callIdx = 0;
    supabaseMock.mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        callIdx++;
        if (callIdx === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ count: 1, error: null }),
              }),
            }),
          };
        }
        // existing names — all already exist
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ name: "Large Language Models" }],
                error: null,
              }),
            }),
          }),
        };
      }),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    const res = await POST(makeRequest({ keys: ["llms"] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toHaveLength(0);
    expect(body.skipped).toContain("llms");
  });

  it("sets limitReached=true when requested > available slots", async () => {
    subMock.mockResolvedValue(FREE_SUB); // limit = 1, 0 existing

    const insertedTracks = [
      { id: "t1", name: "Large Language Models", keywords: [], arxiv_cats: [], min_score: 0.65, active: true, created_at: new Date().toISOString() },
    ];

    let callIdx = 0;
    supabaseMock.mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        callIdx++;
        if (callIdx === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
              }),
            }),
          };
        }
        if (callIdx === 2) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          };
        }
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ data: insertedTracks, error: null }),
          }),
        };
      }),
    } as unknown as ReturnType<typeof getServiceSupabase>);

    // Request 2 templates, but only 1 slot available
    const res = await POST(makeRequest({ keys: ["llms", "agents"] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.limitReached).toBe(true);
    expect(body.created).toHaveLength(1);
  });
});
