/**
 * feedback-token.test.ts
 *
 * Tests for HMAC-based email feedback token generation, verification,
 * and URL building (👍/👎 links embedded in digest emails).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  generateFeedbackToken,
  verifyFeedbackToken,
  buildFeedbackUrl,
  buildLikeUrl,
  buildSkipUrl,
  type FeedbackSentiment,
} from "../feedback-token";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID  = "550e8400-e29b-41d4-a716-446655440000";
const ARXIV_ID = "2401.12345";
const LIKE: FeedbackSentiment = "like";
const SKIP: FeedbackSentiment = "skip";

beforeAll(() => {
  process.env.FEEDBACK_SECRET = "test-feedback-secret-for-unit-tests";
});

afterAll(() => {
  delete process.env.FEEDBACK_SECRET;
});

// ── Token generation ──────────────────────────────────────────────────────────

describe("generateFeedbackToken", () => {
  it("returns a non-empty string", () => {
    const token = generateFeedbackToken(USER_ID, ARXIV_ID, LIKE);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(10);
  });

  it("is deterministic — same inputs produce same token", () => {
    const t1 = generateFeedbackToken(USER_ID, ARXIV_ID, LIKE);
    const t2 = generateFeedbackToken(USER_ID, ARXIV_ID, LIKE);
    expect(t1).toBe(t2);
  });

  it("differs between 'like' and 'skip' for the same paper", () => {
    const tLike = generateFeedbackToken(USER_ID, ARXIV_ID, LIKE);
    const tSkip = generateFeedbackToken(USER_ID, ARXIV_ID, SKIP);
    expect(tLike).not.toBe(tSkip);
  });

  it("differs when userId changes", () => {
    const t1 = generateFeedbackToken(USER_ID, ARXIV_ID, LIKE);
    const t2 = generateFeedbackToken("different-user-id", ARXIV_ID, LIKE);
    expect(t1).not.toBe(t2);
  });

  it("differs when arxivId changes", () => {
    const t1 = generateFeedbackToken(USER_ID, ARXIV_ID, LIKE);
    const t2 = generateFeedbackToken(USER_ID, "2401.99999", LIKE);
    expect(t1).not.toBe(t2);
  });

  it("produces URL-safe base64 (no +, /, or = chars)", () => {
    const token = generateFeedbackToken(USER_ID, ARXIV_ID, LIKE);
    expect(token).not.toMatch(/[+/=]/);
  });
});

// ── Token verification ────────────────────────────────────────────────────────

describe("verifyFeedbackToken", () => {
  it("accepts a valid like token", () => {
    const token = generateFeedbackToken(USER_ID, ARXIV_ID, LIKE);
    expect(verifyFeedbackToken(token, USER_ID, ARXIV_ID, LIKE)).toBe(true);
  });

  it("accepts a valid skip token", () => {
    const token = generateFeedbackToken(USER_ID, ARXIV_ID, SKIP);
    expect(verifyFeedbackToken(token, USER_ID, ARXIV_ID, SKIP)).toBe(true);
  });

  it("rejects a like token when sentiment is skip", () => {
    const token = generateFeedbackToken(USER_ID, ARXIV_ID, LIKE);
    expect(verifyFeedbackToken(token, USER_ID, ARXIV_ID, SKIP)).toBe(false);
  });

  it("rejects a tampered token", () => {
    const token = generateFeedbackToken(USER_ID, ARXIV_ID, LIKE);
    const tampered = token.slice(0, -4) + "XXXX";
    expect(verifyFeedbackToken(tampered, USER_ID, ARXIV_ID, LIKE)).toBe(false);
  });

  it("rejects a token for a different user", () => {
    const token = generateFeedbackToken(USER_ID, ARXIV_ID, LIKE);
    expect(verifyFeedbackToken(token, "wrong-user", ARXIV_ID, LIKE)).toBe(false);
  });

  it("rejects a token for a different paper", () => {
    const token = generateFeedbackToken(USER_ID, ARXIV_ID, LIKE);
    expect(verifyFeedbackToken(token, USER_ID, "2401.00001", LIKE)).toBe(false);
  });

  it("rejects empty token", () => {
    expect(verifyFeedbackToken("", USER_ID, ARXIV_ID, LIKE)).toBe(false);
  });

  it("rejects when userId is empty", () => {
    const token = generateFeedbackToken(USER_ID, ARXIV_ID, LIKE);
    expect(verifyFeedbackToken(token, "", ARXIV_ID, LIKE)).toBe(false);
  });

  it("rejects when arxivId is empty", () => {
    const token = generateFeedbackToken(USER_ID, ARXIV_ID, LIKE);
    expect(verifyFeedbackToken(token, USER_ID, "", LIKE)).toBe(false);
  });
});

// ── URL building ──────────────────────────────────────────────────────────────

describe("buildFeedbackUrl", () => {
  const BASE = "https://paperbrief.ai";

  it("contains the correct path", () => {
    const url = buildFeedbackUrl(USER_ID, ARXIV_ID, LIKE, BASE);
    expect(url).toContain("/api/feedback/email");
  });

  it("includes uid, arxiv, sentiment, and token params", () => {
    const url = buildFeedbackUrl(USER_ID, ARXIV_ID, LIKE, BASE);
    const parsed = new URL(url);
    expect(parsed.searchParams.get("uid")).toBe(USER_ID);
    expect(parsed.searchParams.get("arxiv")).toBe(ARXIV_ID);
    expect(parsed.searchParams.get("sentiment")).toBe("like");
    expect(parsed.searchParams.get("token")).toBeTruthy();
  });

  it("generates a verifiable token embedded in the URL", () => {
    const url = buildFeedbackUrl(USER_ID, ARXIV_ID, LIKE, BASE);
    const parsed = new URL(url);
    const token = parsed.searchParams.get("token")!;
    expect(verifyFeedbackToken(token, USER_ID, ARXIV_ID, LIKE)).toBe(true);
  });

  it("like and skip URLs embed different tokens", () => {
    const likeUrl = buildFeedbackUrl(USER_ID, ARXIV_ID, LIKE, BASE);
    const skipUrl = buildFeedbackUrl(USER_ID, ARXIV_ID, SKIP, BASE);
    const likeToken = new URL(likeUrl).searchParams.get("token");
    const skipToken = new URL(skipUrl).searchParams.get("token");
    expect(likeToken).not.toBe(skipToken);
  });
});

describe("buildLikeUrl", () => {
  it("sets sentiment=like", () => {
    const url = buildLikeUrl(USER_ID, ARXIV_ID, "https://paperbrief.ai");
    expect(new URL(url).searchParams.get("sentiment")).toBe("like");
  });
});

describe("buildSkipUrl", () => {
  it("sets sentiment=skip", () => {
    const url = buildSkipUrl(USER_ID, ARXIV_ID, "https://paperbrief.ai");
    expect(new URL(url).searchParams.get("sentiment")).toBe("skip");
  });
});
