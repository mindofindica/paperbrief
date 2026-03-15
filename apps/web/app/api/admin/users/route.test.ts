/**
 * Tests for GET /api/admin/users
 *
 * Covers:
 *  - Auth guard (401, 503)
 *  - Empty user list
 *  - User list with enriched data (tracks, digests, reading list)
 *  - Pagination params (limit, offset)
 *  - DB error handling
 *  - Response shape validation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Supabase mock helpers ─────────────────────────────────────────────────────

// We need to mock both auth.admin.listUsers and the from().select().in() chain.

const mockListUsers = vi.fn();
const mockFrom = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      admin: {
        listUsers: mockListUsers,
      },
    },
    from: mockFrom,
  })),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USERS = [
  {
    id: "user-001",
    email: "alice@university.edu",
    created_at: "2026-03-01T10:00:00Z",
    last_sign_in_at: "2026-03-14T09:00:00Z",
  },
  {
    id: "user-002",
    email: "bob@research.org",
    created_at: "2026-03-05T14:00:00Z",
    last_sign_in_at: "2026-03-10T08:00:00Z",
  },
];

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/admin/users", { headers });
}

function authedRequest(): Request {
  return makeRequest({ "x-admin-secret": "test-secret" });
}

// Chain builder that resolves to { data, error }
function makeChain(result: { data?: any; error?: any }) {
  const chain: any = {};
  const resolved = { data: result.data ?? null, error: result.error ?? null };
  chain.then = (resolve: any) => Promise.resolve(resolved).then(resolve);
  chain.catch = (fn: any) => Promise.resolve(resolved).catch(fn);
  chain.select = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.is = vi.fn(() => chain);
  return chain;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/admin/users — auth guard", () => {
  beforeEach(() => {
    process.env.ADMIN_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.ADMIN_SECRET;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("returns 401 when no secret header is provided", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when wrong secret is provided", async () => {
    const { GET } = await import("./route");
    const res = await GET(makeRequest({ "x-admin-secret": "wrong-secret" }));
    expect(res.status).toBe(401);
  });

  it("returns 503 when ADMIN_SECRET env var is not set", async () => {
    delete process.env.ADMIN_SECRET;
    const { GET } = await import("./route");
    const res = await GET(makeRequest({ "x-admin-secret": "any" }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/not configured/i);
  });

  it("returns 503 when Supabase env vars are missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { GET } = await import("./route");
    const res = await GET(authedRequest());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/not configured/i);
  });
});

describe("GET /api/admin/users — empty user list", () => {
  beforeEach(() => {
    process.env.ADMIN_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    vi.clearAllMocks();
    mockListUsers.mockResolvedValue({
      data: { users: [], total: 0 },
      error: null,
    });
  });

  afterEach(() => {
    delete process.env.ADMIN_SECRET;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("returns total:0 and empty users array when no users exist", async () => {
    const { GET } = await import("./route");
    const res = await GET(authedRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(0);
    expect(body.users).toEqual([]);
  });
});

describe("GET /api/admin/users — with users", () => {
  beforeEach(() => {
    process.env.ADMIN_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    vi.clearAllMocks();

    mockListUsers.mockResolvedValue({
      data: { users: USERS, total: 2 },
      error: null,
    });

    // from() calls: tracks, deliveries, reading_list
    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "tracks") {
        return makeChain({
          data: [
            { user_id: "user-001" },
            { user_id: "user-001" },
            { user_id: "user-002" },
          ],
        });
      }
      if (table === "deliveries") {
        return makeChain({
          data: [
            { user_id: "user-001", delivered_at: "2026-03-14T07:00:00Z" },
            { user_id: "user-001", delivered_at: "2026-03-13T07:00:00Z" },
            { user_id: "user-002", delivered_at: "2026-03-10T07:00:00Z" },
          ],
        });
      }
      if (table === "reading_list") {
        return makeChain({
          data: [
            { user_id: "user-001" },
            { user_id: "user-001" },
            { user_id: "user-001" },
          ],
        });
      }
      return makeChain({ data: [] });
    });
  });

  afterEach(() => {
    delete process.env.ADMIN_SECRET;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("returns correct user count and total", async () => {
    const { GET } = await import("./route");
    const res = await GET(authedRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.users).toHaveLength(2);
  });

  it("enriches users with track counts", async () => {
    const { GET } = await import("./route");
    const res = await GET(authedRequest());
    const body = await res.json();
    const alice = body.users.find((u: any) => u.email === "alice@university.edu");
    expect(alice).toBeDefined();
    expect(alice.track_count).toBe(2);
    const bob = body.users.find((u: any) => u.email === "bob@research.org");
    expect(bob.track_count).toBe(1);
  });

  it("enriches users with digest counts", async () => {
    const { GET } = await import("./route");
    const res = await GET(authedRequest());
    const body = await res.json();
    const alice = body.users.find((u: any) => u.email === "alice@university.edu");
    expect(alice.digest_count).toBe(2);
    const bob = body.users.find((u: any) => u.email === "bob@research.org");
    expect(bob.digest_count).toBe(1);
  });

  it("enriches users with reading list counts", async () => {
    const { GET } = await import("./route");
    const res = await GET(authedRequest());
    const body = await res.json();
    const alice = body.users.find((u: any) => u.email === "alice@university.edu");
    expect(alice.reading_list_count).toBe(3);
    const bob = body.users.find((u: any) => u.email === "bob@research.org");
    expect(bob.reading_list_count).toBe(0);
  });

  it("includes last_digest_at for users who have received digests", async () => {
    const { GET } = await import("./route");
    const res = await GET(authedRequest());
    const body = await res.json();
    const alice = body.users.find((u: any) => u.email === "alice@university.edu");
    expect(alice.last_digest_at).toBe("2026-03-14T07:00:00Z");
  });

  it("sets last_digest_at to null for users with no digests", async () => {
    mockListUsers.mockResolvedValue({
      data: { users: [USERS[1]], total: 1 },
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "deliveries") return makeChain({ data: [] });
      return makeChain({ data: [] });
    });

    const { GET } = await import("./route");
    const res = await GET(authedRequest());
    const body = await res.json();
    expect(body.users[0].last_digest_at).toBeNull();
  });

  it("returns users sorted by created_at descending (newest first)", async () => {
    const { GET } = await import("./route");
    const res = await GET(authedRequest());
    const body = await res.json();
    // user-002 joined Mar 5, user-001 joined Mar 1 — but USERS array has user-001 first
    // sorted descending means user-002 (Mar 5) should come first
    expect(body.users[0].email).toBe("bob@research.org"); // Mar 5
    expect(body.users[1].email).toBe("alice@university.edu"); // Mar 1
  });
});

describe("GET /api/admin/users — response shape", () => {
  beforeEach(() => {
    process.env.ADMIN_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    vi.clearAllMocks();

    mockListUsers.mockResolvedValue({
      data: { users: [USERS[0]], total: 1 },
      error: null,
    });
    mockFrom.mockImplementation(() => makeChain({ data: [] }));
  });

  afterEach(() => {
    delete process.env.ADMIN_SECRET;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("each user has the required fields", async () => {
    const { GET } = await import("./route");
    const res = await GET(authedRequest());
    const body = await res.json();
    const user = body.users[0];
    expect(user).toHaveProperty("id");
    expect(user).toHaveProperty("email");
    expect(user).toHaveProperty("created_at");
    expect(user).toHaveProperty("track_count");
    expect(user).toHaveProperty("digest_count");
    expect(user).toHaveProperty("reading_list_count");
    expect(user).toHaveProperty("last_digest_at");
    expect(user).toHaveProperty("last_active_at");
  });

  it("track_count, digest_count, reading_list_count are non-negative integers", async () => {
    const { GET } = await import("./route");
    const res = await GET(authedRequest());
    const body = await res.json();
    const user = body.users[0];
    expect(user.track_count).toBeGreaterThanOrEqual(0);
    expect(user.digest_count).toBeGreaterThanOrEqual(0);
    expect(user.reading_list_count).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(user.track_count)).toBe(true);
  });
});

describe("GET /api/admin/users — error handling", () => {
  beforeEach(() => {
    process.env.ADMIN_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.ADMIN_SECRET;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("returns 500 when listUsers fails", async () => {
    mockListUsers.mockResolvedValue({
      data: null,
      error: { message: "auth error" },
    });

    const { GET } = await import("./route");
    const res = await GET(authedRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/Failed to fetch users/i);
  });
});

describe("GET /api/admin/users — pagination", () => {
  beforeEach(() => {
    process.env.ADMIN_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    vi.clearAllMocks();
    mockListUsers.mockResolvedValue({ data: { users: [], total: 0 }, error: null });
    mockFrom.mockImplementation(() => makeChain({ data: [] }));
  });

  afterEach(() => {
    delete process.env.ADMIN_SECRET;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("passes limit param to listUsers (capped at 200)", async () => {
    const { GET } = await import("./route");
    const req = new Request("http://localhost/api/admin/users?limit=300", {
      headers: { "x-admin-secret": "test-secret" },
    });
    await GET(req);
    const callArgs = mockListUsers.mock.calls[0][0];
    expect(callArgs.perPage).toBe(200); // capped
  });

  it("passes offset param to listUsers as page number", async () => {
    const { GET } = await import("./route");
    const req = new Request("http://localhost/api/admin/users?limit=50&offset=50", {
      headers: { "x-admin-secret": "test-secret" },
    });
    await GET(req);
    const callArgs = mockListUsers.mock.calls[0][0];
    expect(callArgs.page).toBe(2); // offset=50, limit=50 → page 2
  });

  it("uses sensible defaults when params are missing", async () => {
    const { GET } = await import("./route");
    await GET(authedRequest());
    const callArgs = mockListUsers.mock.calls[0][0];
    expect(callArgs.perPage).toBe(50);
    expect(callArgs.page).toBe(1);
  });
});
