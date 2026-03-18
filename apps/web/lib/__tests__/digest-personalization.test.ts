/**
 * digest-personalization.test.ts
 *
 * Tests for feedback-driven digest ranking:
 *   - getUserFeedbackProfile() — builds preference profile from email_feedback
 *   - computeCategoryBonus()  — category-overlap bonus calculation
 *   - applyPersonalizationBonus() — re-ranks entries, filters skipped papers
 *   - toDigestEntry()         — strips categories for final DigestEntry
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getUserFeedbackProfile,
  computeCategoryBonus,
  applyPersonalizationBonus,
  toDigestEntry,
  type ScoredEntry,
  type FeedbackProfile,
} from "../digest-personalization";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_ID = "user-abc-123";

/** Build a minimal ScoredEntry for test use */
function entry(
  arxivId: string,
  score: number,
  categories: string[],
  overrides?: Partial<ScoredEntry>
): ScoredEntry {
  return {
    arxivId,
    title: `Paper ${arxivId}`,
    authors: "Author A",
    score,
    scoreLabel: "⭐ Relevant",
    summary: "Some abstract.",
    reason: "Matched track",
    absUrl: `https://arxiv.org/abs/${arxivId}`,
    trackName: "Test Track",
    categories,
    ...overrides,
  };
}

/** Build a FeedbackProfile directly */
function profile(
  likedCatWeights: Record<string, number>,
  skippedArxivIds: string[],
  hasFeedback: boolean = true
): FeedbackProfile {
  return {
    likedCatWeights,
    skippedArxivIds: new Set(skippedArxivIds),
    hasFeedback,
  };
}

/** Create a mock Supabase client that returns the given data/error */
function mockSupabase(rows: object[] | null, error?: { message: string }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: rows, error: error ?? null }),
  };
  return {
    from: vi.fn().mockReturnValue(chain),
  } as unknown as SupabaseClient;
}

// ── getUserFeedbackProfile ────────────────────────────────────────────────────

describe("getUserFeedbackProfile", () => {
  it("returns empty profile for empty userId", async () => {
    const supabase = mockSupabase(null);
    const result = await getUserFeedbackProfile("", supabase);
    expect(result.hasFeedback).toBe(false);
    expect(result.likedCatWeights).toEqual({});
    expect(result.skippedArxivIds.size).toBe(0);
  });

  it("returns empty profile when no feedback rows", async () => {
    const supabase = mockSupabase([]);
    const result = await getUserFeedbackProfile(USER_ID, supabase);
    expect(result.hasFeedback).toBe(false);
  });

  it("returns empty profile when DB returns null data", async () => {
    const supabase = mockSupabase(null);
    const result = await getUserFeedbackProfile(USER_ID, supabase);
    expect(result.hasFeedback).toBe(false);
  });

  it("returns empty profile on DB error (non-fatal)", async () => {
    const supabase = mockSupabase(null, { message: "connection refused" });
    const result = await getUserFeedbackProfile(USER_ID, supabase);
    expect(result.hasFeedback).toBe(false);
    expect(result.likedCatWeights).toEqual({});
  });

  it("collects skipped arxiv IDs correctly", async () => {
    const rows = [
      { arxiv_id: "2401.00001", sentiment: "skip", updated_at: "2026-01-01", papers: null },
      { arxiv_id: "2401.00002", sentiment: "skip", updated_at: "2026-01-02", papers: null },
    ];
    const supabase = mockSupabase(rows);
    const result = await getUserFeedbackProfile(USER_ID, supabase);
    expect(result.hasFeedback).toBe(true);
    expect(result.skippedArxivIds.has("2401.00001")).toBe(true);
    expect(result.skippedArxivIds.has("2401.00002")).toBe(true);
    expect(Object.keys(result.likedCatWeights)).toHaveLength(0);
  });

  it("builds normalised likedCatWeights from liked papers", async () => {
    const rows = [
      { arxiv_id: "2401.00001", sentiment: "like", updated_at: "2026-01-01", papers: { categories: ["cs.LG", "cs.CL"] } },
      { arxiv_id: "2401.00002", sentiment: "like", updated_at: "2026-01-02", papers: { categories: ["cs.LG"] } },
    ];
    const supabase = mockSupabase(rows);
    const result = await getUserFeedbackProfile(USER_ID, supabase);
    expect(result.hasFeedback).toBe(true);
    // cs.LG appears 2x out of 3 total cat mentions → weight = 2/3
    expect(result.likedCatWeights["cs.LG"]).toBeCloseTo(2 / 3);
    // cs.CL appears 1x out of 3 → weight = 1/3
    expect(result.likedCatWeights["cs.CL"]).toBeCloseTo(1 / 3);
  });

  it("handles liked papers with null categories gracefully", async () => {
    const rows = [
      { arxiv_id: "2401.00001", sentiment: "like", updated_at: "2026-01-01", papers: null },
      { arxiv_id: "2401.00002", sentiment: "like", updated_at: "2026-01-02", papers: { categories: null } },
    ];
    const supabase = mockSupabase(rows);
    // No categories to count, but we still tried to "like" → hasFeedback via skips? No.
    // Actually with no category data and no skips, we should get hasFeedback=false
    const result = await getUserFeedbackProfile(USER_ID, supabase);
    expect(result.hasFeedback).toBe(false);
    expect(result.likedCatWeights).toEqual({});
  });

  it("handles mix of liked (with categories) and skipped papers", async () => {
    const rows = [
      { arxiv_id: "2401.00001", sentiment: "like", updated_at: "2026-01-01", papers: { categories: ["stat.ML"] } },
      { arxiv_id: "2401.00002", sentiment: "skip", updated_at: "2026-01-02", papers: null },
    ];
    const supabase = mockSupabase(rows);
    const result = await getUserFeedbackProfile(USER_ID, supabase);
    expect(result.hasFeedback).toBe(true);
    expect(result.likedCatWeights["stat.ML"]).toBeCloseTo(1.0);
    expect(result.skippedArxivIds.has("2401.00002")).toBe(true);
  });

  it("normalises weights so they sum to 1 across all liked categories", async () => {
    const rows = [
      { arxiv_id: "p1", sentiment: "like", updated_at: "2026-01-01", papers: { categories: ["cs.LG", "cs.CL", "cs.AI"] } },
    ];
    const supabase = mockSupabase(rows);
    const result = await getUserFeedbackProfile(USER_ID, supabase);
    const total = Object.values(result.likedCatWeights).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(1.0);
  });

  it("returns empty profile gracefully on unexpected exception", async () => {
    const badSupabase = {
      from: vi.fn().mockImplementation(() => { throw new Error("boom"); }),
    } as unknown as SupabaseClient;
    const result = await getUserFeedbackProfile(USER_ID, badSupabase);
    expect(result.hasFeedback).toBe(false);
  });
});

// ── computeCategoryBonus ──────────────────────────────────────────────────────

describe("computeCategoryBonus", () => {
  it("returns 0 for empty categories", () => {
    expect(computeCategoryBonus([], { "cs.LG": 1 })).toBe(0);
  });

  it("returns 0 for empty likedWeights", () => {
    expect(computeCategoryBonus(["cs.LG"], {})).toBe(0);
  });

  it("returns 0 when there is no overlap", () => {
    expect(computeCategoryBonus(["cs.CV"], { "cs.LG": 0.8, "stat.ML": 0.2 })).toBe(0);
  });

  it("computes bonus for a single matching category", () => {
    const bonus = computeCategoryBonus(["cs.LG"], { "cs.LG": 1.0 });
    // 1.0 * BONUS_SCALE (2.0) = 2.0, capped to MAX_BONUS (1.5)
    expect(bonus).toBe(1.5);
  });

  it("computes bonus for partial overlap", () => {
    // Paper has cs.LG (weight 0.5) and cs.CV (no weight) — bonus = 0.5 * 2 = 1.0
    const bonus = computeCategoryBonus(["cs.LG", "cs.CV"], { "cs.LG": 0.5 });
    expect(bonus).toBeCloseTo(1.0);
  });

  it("caps bonus at MAX_BONUS (1.5) even with full overlap", () => {
    const bonus = computeCategoryBonus(["cs.LG", "cs.CL"], { "cs.LG": 0.7, "cs.CL": 0.3 });
    // (0.7 + 0.3) * 2.0 = 2.0 → capped to 1.5
    expect(bonus).toBe(1.5);
  });

  it("is non-negative for any valid input", () => {
    const bonus = computeCategoryBonus(["cs.LG"], { "cs.LG": 0.1 });
    expect(bonus).toBeGreaterThanOrEqual(0);
  });

  it("handles a paper with many categories summing below cap", () => {
    const bonus = computeCategoryBonus(
      ["cs.LG", "cs.CL", "cs.AI"],
      { "cs.LG": 0.1, "cs.CL": 0.2 }
    );
    // (0.1 + 0.2) * 2.0 = 0.6 — below cap
    expect(bonus).toBeCloseTo(0.6);
    expect(bonus).toBeLessThan(1.5);
  });
});

// ── applyPersonalizationBonus ─────────────────────────────────────────────────

describe("applyPersonalizationBonus", () => {
  it("returns original list unchanged when hasFeedback is false", () => {
    const entries = [entry("p1", 4, ["cs.LG"]), entry("p2", 5, ["cs.CL"])];
    const noProfile = profile({}, [], false);
    const result = applyPersonalizationBonus(entries, noProfile);
    expect(result).toEqual(entries);
  });

  it("filters out papers the user has skipped", () => {
    const entries = [entry("p1", 4, ["cs.LG"]), entry("p2", 5, ["cs.CL"])];
    const p = profile({}, ["p1"]);
    const result = applyPersonalizationBonus(entries, p);
    expect(result.map((e) => e.arxivId)).toEqual(["p2"]);
  });

  it("does not filter papers that were not skipped", () => {
    const entries = [entry("p1", 4, ["cs.LG"]), entry("p2", 3, ["cs.AI"])];
    const p = profile({}, ["p3"]); // p3 not in list
    const result = applyPersonalizationBonus(entries, p);
    expect(result).toHaveLength(2);
  });

  it("re-ranks papers so liked categories float to the top", () => {
    const entries = [
      entry("p1", 4, ["cs.CV"]),         // no match
      entry("p2", 4, ["cs.LG", "cs.CL"]), // matches → gets bonus
      entry("p3", 4, ["cs.LG"]),           // partial match
    ];
    const p = profile({ "cs.LG": 0.7, "cs.CL": 0.3 }, []);
    const result = applyPersonalizationBonus(entries, p);
    // p2 has both cs.LG + cs.CL → highest effective score
    expect(result[0]!.arxivId).toBe("p2");
    // p3 has cs.LG only → second
    expect(result[1]!.arxivId).toBe("p3");
    // p1 has no match → last
    expect(result[2]!.arxivId).toBe("p1");
  });

  it("preserves a higher LLM score over a small category bonus", () => {
    // p_high has score 5, no match; p_low has score 3, full match (bonus ≤ 1.5)
    // 5 > 3 + 1.5 = 4.5 → p_high stays first
    const entries = [
      entry("p_high", 5, ["cs.CV"]),
      entry("p_low", 3, ["cs.LG"]),
    ];
    const p = profile({ "cs.LG": 1.0 }, []);
    const result = applyPersonalizationBonus(entries, p);
    expect(result[0]!.arxivId).toBe("p_high");
  });

  it("does not change entry scores (only re-ranks by effective score)", () => {
    const entries = [entry("p1", 4, ["cs.LG"]), entry("p2", 3, ["cs.LG"])];
    const p = profile({ "cs.LG": 1.0 }, []);
    const result = applyPersonalizationBonus(entries, p);
    // scores should not be mutated
    expect(result.find((e) => e.arxivId === "p1")!.score).toBe(4);
    expect(result.find((e) => e.arxivId === "p2")!.score).toBe(3);
  });

  it("returns empty array when all entries are filtered by skip", () => {
    const entries = [entry("p1", 4, ["cs.LG"]), entry("p2", 3, ["cs.AI"])];
    const p = profile({}, ["p1", "p2"]);
    const result = applyPersonalizationBonus(entries, p);
    expect(result).toHaveLength(0);
  });

  it("handles empty entries list gracefully", () => {
    const p = profile({ "cs.LG": 1.0 }, ["p99"]);
    const result = applyPersonalizationBonus([], p);
    expect(result).toEqual([]);
  });

  it("handles entries with empty categories (no bonus, not filtered)", () => {
    const entries = [
      entry("p1", 4, []),          // no categories
      entry("p2", 3, ["cs.LG"]),   // has category
    ];
    const p = profile({ "cs.LG": 1.0 }, []);
    const result = applyPersonalizationBonus(entries, p);
    // p2 gets bonus: 1.0 * 2.0 = 2.0 (capped 1.5) → effective = 4.5 > 4
    expect(result[0]!.arxivId).toBe("p2");
    expect(result[1]!.arxivId).toBe("p1");
  });

  it("is stable when all entries have equal effective score", () => {
    // All same score, no category overlap → original order preserved
    const entries = [entry("a", 4, ["cs.CV"]), entry("b", 4, ["cs.CV"]), entry("c", 4, ["cs.CV"])];
    const p = profile({ "cs.LG": 1.0 }, []); // no overlap
    const result = applyPersonalizationBonus(entries, p);
    // Effective scores are all equal → sort is stable (V8 Array.sort is stable)
    expect(result.map((e) => e.arxivId)).toEqual(["a", "b", "c"]);
  });

  it("can boost a lower-scored paper above a higher-scored one via category match", () => {
    // p_low score 3.5, full match (bonus 1.5) → effective 5.0
    // p_high score 4.9, no match → effective 4.9
    const entries = [
      entry("p_high", 4.9, ["cs.CV"]),
      entry("p_low", 3.5, ["cs.LG"]),
    ];
    const p = profile({ "cs.LG": 1.0 }, []);
    const result = applyPersonalizationBonus(entries, p);
    expect(result[0]!.arxivId).toBe("p_low");
  });

  it("treats liked arxiv_id as bonus signal, not skip protection", () => {
    // A liked paper that appears again should NOT be skipped
    const entries = [entry("prev-liked", 4, ["cs.LG"])];
    const p = profile({ "cs.LG": 1.0 }, []); // not in skippedArxivIds
    const result = applyPersonalizationBonus(entries, p);
    expect(result).toHaveLength(1);
    expect(result[0]!.arxivId).toBe("prev-liked");
  });

  it("skips exact arxiv ID match, not partial substring match", () => {
    const entries = [
      entry("2401.12345", 4, ["cs.LG"]),
      entry("2401.123",   4, ["cs.LG"]), // not the same ID
    ];
    const p = profile({}, ["2401.12345"]);
    const result = applyPersonalizationBonus(entries, p);
    expect(result.map((e) => e.arxivId)).toEqual(["2401.123"]);
  });
});

// ── toDigestEntry ─────────────────────────────────────────────────────────────

describe("toDigestEntry", () => {
  it("strips the categories field from a ScoredEntry", () => {
    const scored = entry("p1", 4, ["cs.LG", "cs.CL"]);
    const digest = toDigestEntry(scored);
    expect("categories" in digest).toBe(false);
  });

  it("preserves all other DigestEntry fields", () => {
    const scored = entry("p1", 4, ["cs.LG"]);
    const digest = toDigestEntry(scored);
    expect(digest.arxivId).toBe("p1");
    expect(digest.score).toBe(4);
    expect(digest.trackName).toBe("Test Track");
    expect(digest.absUrl).toContain("p1");
  });
});

// ── Integration: full profile → ranking pipeline ──────────────────────────────

describe("personalization pipeline integration", () => {
  it("end-to-end: liked categories boost papers, skipped papers are removed", async () => {
    const rows = [
      // user liked 3 cs.LG papers → strong cs.LG signal
      { arxiv_id: "old-1", sentiment: "like", updated_at: "2026-01-01", papers: { categories: ["cs.LG"] } },
      { arxiv_id: "old-2", sentiment: "like", updated_at: "2026-01-02", papers: { categories: ["cs.LG"] } },
      { arxiv_id: "old-3", sentiment: "like", updated_at: "2026-01-03", papers: { categories: ["cs.LG"] } },
      // and skipped one cs.CV paper
      { arxiv_id: "skip-me", sentiment: "skip", updated_at: "2026-01-04", papers: null },
    ];
    const supabase = mockSupabase(rows);

    const feedbackProfile = await getUserFeedbackProfile(USER_ID, supabase);
    expect(feedbackProfile.hasFeedback).toBe(true);
    expect(feedbackProfile.skippedArxivIds.has("skip-me")).toBe(true);
    expect(feedbackProfile.likedCatWeights["cs.LG"]).toBeCloseTo(1.0);

    const candidates = [
      entry("skip-me", 5, ["cs.CV"]),   // should be removed
      entry("cv-paper", 5, ["cs.CV"]),  // score 5, no match
      entry("lg-paper", 4, ["cs.LG"]),  // score 4, full match → effective 4+1.5=5.5
    ];

    const ranked = applyPersonalizationBonus(candidates, feedbackProfile);

    // skip-me should be gone
    expect(ranked.map((e) => e.arxivId)).not.toContain("skip-me");
    // lg-paper should beat cv-paper despite lower LLM score
    expect(ranked[0]!.arxivId).toBe("lg-paper");
    expect(ranked[1]!.arxivId).toBe("cv-paper");
  });

  it("end-to-end: no feedback → returns original entries unchanged", async () => {
    const supabase = mockSupabase([]);
    const feedbackProfile = await getUserFeedbackProfile(USER_ID, supabase);

    const candidates = [
      entry("p1", 3, ["cs.LG"]),
      entry("p2", 5, ["cs.CV"]),
    ];

    const ranked = applyPersonalizationBonus(candidates, feedbackProfile);
    expect(ranked).toEqual(candidates);
  });
});
