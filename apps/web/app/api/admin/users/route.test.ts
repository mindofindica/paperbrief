/**
 * Tests for GET /api/admin/users
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "./route";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));

import { createClient } from "@supabase/supabase-js";
const mockCreateClient = vi.mocked(createClient);

function makeRequest(headers: Record<string, string> = {}, url = "http://localhost/api/admin/users") {
  return new Request(url, { headers });
}

function makeAdminRequest(url?: string) {
  return makeRequest({ "x-admin-secret": "test-secret" }, url);
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_A = {
  id: "user-a",
  email: "alice@example.com",
  created_at: "2026-03-01T10:00:00Z",
  last_sign_in_at: "2026-03-14T08:00:00Z",
};

const USER_B = {
  id: "user-b",
  email: "bob@example.com",
  created_at: "2026-03-05T12:00:00Z",
  last_sign_in_at: null,
};

function makeSupabaseMock({
  authUsers = [USER_A, USER_B],
  authTotal = 2,
  authError = null as null | { message: string },
  trackRows = [] as { user_id: string }[],
  digestRows = [] as { user_id: string; delivered_at: string }[],
  rlRows = [] as { user_id: string }[],
} = {}) {
  const supabase = {
    auth: {
      admin: {
        listUsers: vi.fn().mockResolvedValue({
          data: { users: authUsers, total: authTotal },
          error: authError,
        }),
      },
    },
    from: vi.fn((table: string) => {
      if (table === "tracks") {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: trackRows, error: null }),
        };
      }
      if (table === "deliveries") {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: digestRows, error: null }),
        };
      }
      if (table === "reading_list") {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: rlRows, error: null }),
        };
      }
      return { select: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [], error: null }) };
    }),
  };
  return supabase;
}

// ── Auth guard tests ──────────────────────────────────────────────────────────

describe("GET /api/admin/users — auth guard", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_SECRET", "test-secret");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  });

  it("returns 401 when x-admin-secret header is missing", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when x-admin-secret header is wrong", async () => {
    const res = await GET(makeRequest({ "x-admin-secret": "wrong" }));
    expect(res.status).toBe(401);
  });

  it("returns 503 when ADMIN_SECRET env var is not set", async () => {
    vi.stubEnv("ADMIN_SECRET", "");
    const res = await GET(makeAdminRequest());
    expect(res.status).toBe(503);
  });

  it("returns 503 when DB env vars are missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const res = await GET(makeAdminRequest());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/Database/i);
  });
});

// ── Happy path tests ──────────────────────────────────────────────────────────

describe("GET /api/admin/users — data", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_SECRET", "test-secret");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  });

  it("returns user list with correct shape", async () => {
    const mock = makeSupabaseMock();
    mockCreateClient.mockReturnValue(mock as unknown as ReturnType<typeof createClient>);

    const res = await GET(makeAdminRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.users).toHaveLength(2);

    const alice = body.users.find((u: { email: string }) => u.email === "alice@example.com");
    expect(alice).toBeDefined();
    expect(alice.track_count).toBe(0);
    expect(alice.digest_count).toBe(0);
    expect(alice.reading_list_count).toBe(0);
    expect(alice.last_active_at).toBe("2026-03-14T08:00:00Z");
  });

  it("counts tracks per user correctly", async () => {
    const mock = makeSupabaseMock({
      trackRows: [
        { user_id: "user-a" },
        { user_id: "user-a" },
        { user_id: "user-b" },
      ],
    });
    mockCreateClient.mockReturnValue(mock as unknown as ReturnType<typeof createClient>);

    const res = await GET(makeAdminRequest());
    const body = await res.json();
    const alice = body.users.find((u: { email: string }) => u.email === "alice@example.com");
    const bob = body.users.find((u: { email: string }) => u.email === "bob@example.com");
    expect(alice.track_count).toBe(2);
    expect(bob.track_count).toBe(1);
  });

  it("counts digests and last digest per user", async () => {
    const mock = makeSupabaseMock({
      digestRows: [
        { user_id: "user-a", delivered_at: "2026-03-14T07:00:00Z" },
        { user_id: "user-a", delivered_at: "2026-03-07T07:00:00Z" },
      ],
    });
    mockCreateClient.mockReturnValue(mock as unknown as ReturnType<typeof createClient>);

    const res = await GET(makeAdminRequest());
    const body = await res.json();
    const alice = body.users.find((u: { email: string }) => u.email === "alice@example.com");
    expect(alice.digest_count).toBe(2);
    expect(alice.last_digest_at).toBe("2026-03-14T07:00:00Z");
  });

  it("counts reading list items per user", async () => {
    const mock = makeSupabaseMock({
      rlRows: [{ user_id: "user-b" }, { user_id: "user-b" }, { user_id: "user-b" }],
    });
    mockCreateClient.mockReturnValue(mock as unknown as ReturnType<typeof createClient>);

    const res = await GET(makeAdminRequest());
    const body = await res.json();
    const bob = body.users.find((u: { email: string }) => u.email === "bob@example.com");
    expect(bob.reading_list_count).toBe(3);
  });

  it("handles null last_sign_in_at gracefully", async () => {
    const mock = makeSupabaseMock({ authUsers: [USER_B] });
    mockCreateClient.mockReturnValue(mock as unknown as ReturnType<typeof createClient>);

    const res = await GET(makeAdminRequest());
    const body = await res.json();
    expect(body.users[0].last_active_at).toBeNull();
  });

  it("returns empty list when no users", async () => {
    const mock = makeSupabaseMock({ authUsers: [], authTotal: 0 });
    mockCreateClient.mockReturnValue(mock as unknown as ReturnType<typeof createClient>);

    const res = await GET(makeAdminRequest());
    const body = await res.json();
    expect(body.total).toBe(0);
    expect(body.users).toHaveLength(0);
  });

  it("returns 500 when auth.admin.listUsers fails", async () => {
    const mock = makeSupabaseMock({ authError: { message: "DB error" } });
    mockCreateClient.mockReturnValue(mock as unknown as ReturnType<typeof createClient>);

    const res = await GET(makeAdminRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/Failed to fetch users/i);
  });

  it("respects limit query param (capped at 200)", async () => {
    const mock = makeSupabaseMock();
    mockCreateClient.mockReturnValue(mock as unknown as ReturnType<typeof createClient>);

    await GET(makeAdminRequest("http://localhost/api/admin/users?limit=300"));
    // listUsers should be called with perPage capped at 200
    expect(mock.auth.admin.listUsers).toHaveBeenCalledWith(
      expect.objectContaining({ perPage: 200 })
    );
  });

  it("uses default limit of 50 when not specified", async () => {
    const mock = makeSupabaseMock();
    mockCreateClient.mockReturnValue(mock as unknown as ReturnType<typeof createClient>);

    await GET(makeAdminRequest());
    expect(mock.auth.admin.listUsers).toHaveBeenCalledWith(
      expect.objectContaining({ perPage: 50 })
    );
  });

  it("sorts users by created_at descending (newest first)", async () => {
    const mock = makeSupabaseMock();
    mockCreateClient.mockReturnValue(mock as unknown as ReturnType<typeof createClient>);

    const res = await GET(makeAdminRequest());
    const body = await res.json();
    // USER_B joined 2026-03-05, USER_A joined 2026-03-01 → B first
    expect(body.users[0].email).toBe("bob@example.com");
    expect(body.users[1].email).toBe("alice@example.com");
  });

  it("falls back to '(no email)' for users without email", async () => {
    const userNoEmail = { ...USER_A, email: undefined };
    const mock = makeSupabaseMock({ authUsers: [userNoEmail as unknown as typeof USER_A] });
    mockCreateClient.mockReturnValue(mock as unknown as ReturnType<typeof createClient>);

    const res = await GET(makeAdminRequest());
    const body = await res.json();
    expect(body.users[0].email).toBe("(no email)");
  });
});
