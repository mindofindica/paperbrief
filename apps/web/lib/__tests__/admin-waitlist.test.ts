/**
 * Tests for GET /api/admin/waitlist
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Supabase thenable chain mock — each from() returns a builder that resolves to a result
// and also supports chaining methods that return a NEW thenable resolving to another result
const mockResults: Array<{ count?: number; data?: any; error: any }> = [];

function makeBuilder(resultIndex: number): any {
  const self: any = {};
  // Make it awaitable — resolves to mockResults[resultIndex]
  self.then = (resolve: (v: any) => any, reject: (e: any) => any) => {
    const r = mockResults[resultIndex] ?? { count: null, data: null, error: null };
    return Promise.resolve(r).then(resolve, reject);
  };
  self.catch = (fn: any) => Promise.resolve(mockResults[resultIndex]).catch(fn);
  // Chain methods produce a new builder pointing to next result
  self.select = vi.fn(() => makeBuilder(resultIndex));
  self.not = vi.fn(() => makeBuilder(resultIndex + 1));
  self.is = vi.fn(() => makeBuilder(resultIndex));
  self.order = vi.fn(() => makeBuilder(resultIndex + 2));
  return self;
}

let fromCallCount = 0;
const mockFrom = vi.fn(() => {
  const idx = fromCallCount;
  fromCallCount++;
  return makeBuilder(idx * 2); // space results 2 apart per from() call
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

import { GET } from "../../app/api/admin/waitlist/route";

function makeRequest(params: Record<string, string> = {}, secret = "test-secret"): Request {
  const url = new URL("http://localhost/api/admin/waitlist");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString(), {
    headers: { "x-admin-secret": secret },
  });
}

describe("GET /api/admin/waitlist", () => {
  beforeEach(() => {
    process.env.ADMIN_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    fromCallCount = 0;
    mockResults.length = 0;
    vi.clearAllMocks();
  });

  it("returns 401 without admin secret", async () => {
    const res = await GET(makeRequest({}, "wrong"));
    expect(res.status).toBe(401);
  });

  it("returns 503 when Supabase is not configured", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const res = await GET(makeRequest());
    expect(res.status).toBe(503);
  });

  it("returns correct stats structure with total/invited/pending", async () => {
    // from() call 0 → index 0 → total: count=10 (resolves at .select() → index 0)
    // from() call 1 → index 2 → for invited, resolves at .not() → index 3
    mockResults[0] = { count: 10, error: null };  // total: await from().select(...)
    mockResults[3] = { count: 3, error: null };   // invited: await from().select().not(...)
    fromCallCount = 0; // reset

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.total).toBe("number");
    expect(typeof body.invited).toBe("number");
    expect(typeof body.pending).toBe("number");
    expect(body.pending).toBe(body.total - body.invited);
  });

  it("does not include entries without ?full=1", async () => {
    mockResults[0] = { count: 5, error: null };
    mockResults[3] = { count: 2, error: null };
    fromCallCount = 0;

    const res = await GET(makeRequest());
    const body = await res.json();
    expect(body.entries).toBeUndefined();
  });

  it("returns 200 with empty waitlist", async () => {
    mockResults[0] = { count: 0, error: null };
    mockResults[3] = { count: 0, error: null };
    fromCallCount = 0;

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(0);
    expect(body.pending).toBe(0);
  });
});
