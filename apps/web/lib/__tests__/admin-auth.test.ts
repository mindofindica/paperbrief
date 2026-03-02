import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { requireAdmin } from "../admin-auth";

function makeRequest(secret?: string): Request {
  const headers: Record<string, string> = {};
  if (secret !== undefined) headers["x-admin-secret"] = secret;
  return new Request("http://localhost/api/admin/test", { headers });
}

describe("requireAdmin", () => {
  const original = process.env.ADMIN_SECRET;

  beforeEach(() => {
    process.env.ADMIN_SECRET = "test-secret-abc";
  });

  afterEach(() => {
    process.env.ADMIN_SECRET = original;
  });

  it("returns null when correct secret is provided", () => {
    const result = requireAdmin(makeRequest("test-secret-abc"));
    expect(result).toBeNull();
  });

  it("returns 401 when wrong secret is provided", async () => {
    const result = requireAdmin(makeRequest("wrong-secret"));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
    const body = await result!.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when no secret header is provided", async () => {
    const result = requireAdmin(makeRequest());
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("returns 503 when ADMIN_SECRET env var is not set", async () => {
    delete process.env.ADMIN_SECRET;
    const result = requireAdmin(makeRequest("any-value"));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(503);
    const body = await result!.json();
    expect(body.error).toMatch(/not configured/i);
  });
});
