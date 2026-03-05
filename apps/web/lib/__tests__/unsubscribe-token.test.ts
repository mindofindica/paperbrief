/**
 * unsubscribe-token.test.ts
 *
 * Tests for HMAC-based unsubscribe token generation and verification.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
  buildUnsubscribeUrl,
} from "../unsubscribe-token";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const EMAIL = "test@example.com";

beforeAll(() => {
  process.env.UNSUBSCRIBE_SECRET = "test-secret-for-unit-tests";
});

afterAll(() => {
  delete process.env.UNSUBSCRIBE_SECRET;
});

// ── Token generation ──────────────────────────────────────────────────────────

describe("generateUnsubscribeToken", () => {
  it("returns a non-empty string", () => {
    const token = generateUnsubscribeToken(USER_ID, EMAIL);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(10);
  });

  it("is deterministic — same inputs produce same token", () => {
    const t1 = generateUnsubscribeToken(USER_ID, EMAIL);
    const t2 = generateUnsubscribeToken(USER_ID, EMAIL);
    expect(t1).toBe(t2);
  });

  it("differs when userId changes", () => {
    const t1 = generateUnsubscribeToken(USER_ID, EMAIL);
    const t2 = generateUnsubscribeToken("different-user-id", EMAIL);
    expect(t1).not.toBe(t2);
  });

  it("differs when email changes", () => {
    const t1 = generateUnsubscribeToken(USER_ID, EMAIL);
    const t2 = generateUnsubscribeToken(USER_ID, "other@example.com");
    expect(t1).not.toBe(t2);
  });

  it("produces URL-safe base64 (no +, /, or = chars)", () => {
    const token = generateUnsubscribeToken(USER_ID, EMAIL);
    expect(token).not.toMatch(/[+/=]/);
  });
});

// ── Token verification ────────────────────────────────────────────────────────

describe("verifyUnsubscribeToken", () => {
  it("accepts a valid token", () => {
    const token = generateUnsubscribeToken(USER_ID, EMAIL);
    expect(verifyUnsubscribeToken(token, USER_ID, EMAIL)).toBe(true);
  });

  it("rejects a tampered token (single char changed)", () => {
    const token = generateUnsubscribeToken(USER_ID, EMAIL);
    const tampered = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect(verifyUnsubscribeToken(tampered, USER_ID, EMAIL)).toBe(false);
  });

  it("rejects wrong userId", () => {
    const token = generateUnsubscribeToken(USER_ID, EMAIL);
    expect(verifyUnsubscribeToken(token, "wrong-user-id", EMAIL)).toBe(false);
  });

  it("rejects wrong email", () => {
    const token = generateUnsubscribeToken(USER_ID, EMAIL);
    expect(verifyUnsubscribeToken(token, USER_ID, "wrong@example.com")).toBe(false);
  });

  it("rejects empty token", () => {
    expect(verifyUnsubscribeToken("", USER_ID, EMAIL)).toBe(false);
  });

  it("rejects empty userId", () => {
    const token = generateUnsubscribeToken(USER_ID, EMAIL);
    expect(verifyUnsubscribeToken(token, "", EMAIL)).toBe(false);
  });

  it("rejects empty email", () => {
    const token = generateUnsubscribeToken(USER_ID, EMAIL);
    expect(verifyUnsubscribeToken(token, USER_ID, "")).toBe(false);
  });

  it("rejects token generated with different secret", () => {
    // Temporarily swap secret
    const originalSecret = process.env.UNSUBSCRIBE_SECRET;
    process.env.UNSUBSCRIBE_SECRET = "different-secret";
    const tokenWithOtherSecret = generateUnsubscribeToken(USER_ID, EMAIL);
    process.env.UNSUBSCRIBE_SECRET = originalSecret!;

    const tokenWithCurrentSecret = generateUnsubscribeToken(USER_ID, EMAIL);
    // They should differ
    expect(tokenWithOtherSecret).not.toBe(tokenWithCurrentSecret);
    // And the other-secret token should fail verification with current secret
    expect(verifyUnsubscribeToken(tokenWithOtherSecret, USER_ID, EMAIL)).toBe(false);
  });
});

// ── URL builder ───────────────────────────────────────────────────────────────

describe("buildUnsubscribeUrl", () => {
  it("produces a valid HTTPS URL", () => {
    const url = buildUnsubscribeUrl(USER_ID, EMAIL, "https://paperbrief.io");
    expect(() => new URL(url)).not.toThrow();
  });

  it("includes uid, email, and token query params", () => {
    const url = buildUnsubscribeUrl(USER_ID, EMAIL, "https://paperbrief.io");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("uid")).toBe(USER_ID);
    expect(parsed.searchParams.get("email")).toBe(EMAIL);
    expect(parsed.searchParams.get("token")).toBeTruthy();
  });

  it("points to /api/unsubscribe path", () => {
    const url = buildUnsubscribeUrl(USER_ID, EMAIL, "https://paperbrief.io");
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/api/unsubscribe");
  });

  it("token in URL passes verification", () => {
    const url = buildUnsubscribeUrl(USER_ID, EMAIL, "https://paperbrief.io");
    const parsed = new URL(url);
    const token = parsed.searchParams.get("token")!;
    expect(verifyUnsubscribeToken(token, USER_ID, EMAIL)).toBe(true);
  });

  it("uses NEXT_PUBLIC_APP_URL env var when no baseUrl provided", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://custom.app";
    const url = buildUnsubscribeUrl(USER_ID, EMAIL);
    expect(url.startsWith("https://custom.app")).toBe(true);
    delete process.env.NEXT_PUBLIC_APP_URL;
  });
});
