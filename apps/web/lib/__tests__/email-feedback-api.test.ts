/**
 * email-feedback-api.test.ts
 *
 * Unit tests for GET /api/feedback/email
 * Verifies: token validation, DB upsert, redirect behaviour, error paths.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { generateFeedbackToken, type FeedbackSentiment } from "../feedback-token";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockUpsert = vi.fn().mockResolvedValue({ error: null });

vi.mock("../supabase", () => ({
  getServiceSupabase: () => ({
    from: () => ({
      upsert: mockUpsert,
    }),
  }),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID  = "550e8400-e29b-41d4-a716-446655440000";
const ARXIV_ID = "2401.12345";
const APP_URL  = "https://paperbrief.ai";

beforeAll(() => {
  process.env.FEEDBACK_SECRET = "test-feedback-secret";
  process.env.NEXT_PUBLIC_APP_URL = APP_URL;
});

afterAll(() => {
  delete process.env.FEEDBACK_SECRET;
  delete process.env.NEXT_PUBLIC_APP_URL;
});

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRequest(params: {
  uid?: string;
  arxiv?: string;
  sentiment?: string;
  token?: string;
}): NextRequest {
  const url = new URL(`${APP_URL}/api/feedback/email`);
  if (params.uid !== undefined)       url.searchParams.set("uid", params.uid);
  if (params.arxiv !== undefined)     url.searchParams.set("arxiv", params.arxiv);
  if (params.sentiment !== undefined) url.searchParams.set("sentiment", params.sentiment);
  if (params.token !== undefined)     url.searchParams.set("token", params.token);
  return new NextRequest(url.toString());
}

function validRequest(sentiment: FeedbackSentiment = "like"): NextRequest {
  const token = generateFeedbackToken(USER_ID, ARXIV_ID, sentiment);
  return makeRequest({ uid: USER_ID, arxiv: ARXIV_ID, sentiment, token });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/feedback/email — happy path", () => {
  it("redirects to the arXiv paper URL on valid like token", async () => {
    const { GET } = await import("../../app/api/feedback/email/route");
    const res = await GET(validRequest("like"));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("arxiv.org/abs/");
    expect(res.headers.get("location")).toContain(ARXIV_ID);
  });

  it("redirects to the arXiv paper URL on valid skip token", async () => {
    const { GET } = await import("../../app/api/feedback/email/route");
    const res = await GET(validRequest("skip"));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("arxiv.org/abs/");
  });

  it("calls supabase upsert with correct data", async () => {
    const { GET } = await import("../../app/api/feedback/email/route");
    await GET(validRequest("like"));

    expect(mockUpsert).toHaveBeenCalledOnce();
    const [upsertData] = mockUpsert.mock.calls[0];
    expect(upsertData).toMatchObject({
      user_id:   USER_ID,
      arxiv_id:  ARXIV_ID,
      sentiment: "like",
    });
  });

  it("upserts with skip sentiment when clicked skip", async () => {
    const { GET } = await import("../../app/api/feedback/email/route");
    await GET(validRequest("skip"));

    const [upsertData] = mockUpsert.mock.calls[0];
    expect(upsertData.sentiment).toBe("skip");
  });
});

describe("GET /api/feedback/email — validation failures", () => {
  it("redirects to /?feedback=invalid when uid is missing", async () => {
    const { GET } = await import("../../app/api/feedback/email/route");
    const token = generateFeedbackToken(USER_ID, ARXIV_ID, "like");
    const res = await GET(makeRequest({ arxiv: ARXIV_ID, sentiment: "like", token }));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("feedback=invalid");
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("redirects to /?feedback=invalid when arxiv is missing", async () => {
    const { GET } = await import("../../app/api/feedback/email/route");
    const token = generateFeedbackToken(USER_ID, ARXIV_ID, "like");
    const res = await GET(makeRequest({ uid: USER_ID, sentiment: "like", token }));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("feedback=invalid");
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("redirects to /?feedback=invalid for invalid sentiment value", async () => {
    const { GET } = await import("../../app/api/feedback/email/route");
    const res = await GET(makeRequest({ uid: USER_ID, arxiv: ARXIV_ID, sentiment: "love", token: "anything" }));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("feedback=invalid");
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("redirects to /?feedback=invalid when token is tampered", async () => {
    const { GET } = await import("../../app/api/feedback/email/route");
    const token = generateFeedbackToken(USER_ID, ARXIV_ID, "like");
    const tampered = token.slice(0, -4) + "XXXX";
    const res = await GET(makeRequest({ uid: USER_ID, arxiv: ARXIV_ID, sentiment: "like", token: tampered }));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("feedback=invalid");
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("redirects to /?feedback=invalid when like token is used for skip", async () => {
    const { GET } = await import("../../app/api/feedback/email/route");
    // Generate a like token but claim skip sentiment
    const token = generateFeedbackToken(USER_ID, ARXIV_ID, "like");
    const res = await GET(makeRequest({ uid: USER_ID, arxiv: ARXIV_ID, sentiment: "skip", token }));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("feedback=invalid");
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe("GET /api/feedback/email — DB failure resilience", () => {
  it("still redirects to arXiv even when DB upsert fails", async () => {
    mockUpsert.mockResolvedValueOnce({ error: { message: "connection refused" } });

    const { GET } = await import("../../app/api/feedback/email/route");
    const res = await GET(validRequest("like"));

    // Should still redirect to arXiv — fail open, paper > feedback loss
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("arxiv.org");
  });
});
