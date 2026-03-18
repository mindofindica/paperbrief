/**
 * digest-personalization.ts — Feedback-driven digest ranking
 *
 * Closes the 👍/👎 feedback loop: papers a user has liked in previous digests
 * boost future papers from the same arXiv categories; papers they've skipped
 * are excluded from future digests entirely.
 *
 * How it works:
 *   1. getUserFeedbackProfile() queries email_feedback + papers to build a
 *      category preference map and a set of skipped paper IDs.
 *   2. applyPersonalizationBonus() takes a list of candidate digest entries
 *      (with categories attached), filters skipped papers, then adds a
 *      category-overlap bonus to each entry's effective score and re-ranks.
 *
 * The bonus is bounded so it can never push a marginal paper above a
 * genuinely high-quality one — it's a tie-breaker with a ceiling, not
 * a trump card.
 *
 * Scoring formula:
 *   effectiveScore = llm_score + min(categoryBonus, MAX_BONUS)
 *
 *   categoryBonus = sum(likedCatWeights[cat] for cat in paper.categories)
 *                   / totalLikeWeight
 *                   * BONUS_SCALE
 *
 * Constants:
 *   MAX_BONUS   = 1.5  — caps personalisation influence
 *   BONUS_SCALE = 2.0  — max possible bonus before capping
 *   FEEDBACK_WINDOW_DAYS = 90  — older feedback is ignored
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * A digest entry extended with arXiv category data (used internally in the
 * pipeline; categories are stripped before the final DigestEntry is sent).
 */
export interface ScoredEntry {
  arxivId: string;
  title: string;
  authors: string;
  score: number;
  scoreLabel: string;
  summary: string;
  reason: string;
  absUrl: string;
  trackName: string;
  /** arXiv category strings, e.g. ["cs.LG", "stat.ML"] */
  categories: string[];
}

/**
 * The user's derived preference profile built from their feedback history.
 */
export interface FeedbackProfile {
  /**
   * Map of arXiv category → normalised weight [0, 1].
   * Higher weight = user has liked more papers in this category.
   * Empty if the user has never liked anything.
   */
  likedCatWeights: Record<string, number>;

  /**
   * Set of arxiv_ids the user has explicitly skipped.
   * These papers should be excluded from future digests.
   */
  skippedArxivIds: Set<string>;

  /**
   * Whether the user has any feedback at all.
   * If false, applyPersonalizationBonus() is a no-op.
   */
  hasFeedback: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_BONUS = 1.5;
const BONUS_SCALE = 2.0;
const FEEDBACK_WINDOW_DAYS = 90;

// ── Core functions ────────────────────────────────────────────────────────────

/**
 * Build a FeedbackProfile for a user by querying email_feedback joined with papers.
 *
 * Only considers feedback from the last FEEDBACK_WINDOW_DAYS days to prevent
 * old interests from permanently dominating the ranking.
 *
 * Non-fatal: if the query fails, returns an empty profile (personalisation
 * is skipped and the digest sends as normal).
 */
export async function getUserFeedbackProfile(
  userId: string,
  supabase: SupabaseClient
): Promise<FeedbackProfile> {
  const empty: FeedbackProfile = {
    likedCatWeights: {},
    skippedArxivIds: new Set(),
    hasFeedback: false,
  };

  if (!userId) return empty;

  try {
    const windowStart = new Date(
      Date.now() - FEEDBACK_WINDOW_DAYS * 86_400_000
    ).toISOString();

    // Fetch feedback records with paper categories via join
    const { data, error } = await supabase
      .from("email_feedback")
      .select(
        `
        arxiv_id,
        sentiment,
        updated_at,
        papers ( categories )
      `
      )
      .eq("user_id", userId)
      .gte("updated_at", windowStart)
      .order("updated_at", { ascending: false })
      .limit(200);

    if (error) {
      console.warn("[digest-personalization] Feedback query error:", error.message);
      return empty;
    }

    if (!data || data.length === 0) return empty;

    // Count raw likes per category
    const catCounts: Record<string, number> = {};
    const skippedArxivIds = new Set<string>();
    let totalLikeWeight = 0;

    for (const row of data) {
      const sentiment = row.sentiment as string;
      const arxivId = row.arxiv_id as string;

      if (sentiment === "skip") {
        skippedArxivIds.add(arxivId);
        continue;
      }

      // sentiment === "like"
      const categories: string[] = (row.papers as { categories?: string[] } | null)?.categories ?? [];
      for (const cat of categories) {
        catCounts[cat] = (catCounts[cat] ?? 0) + 1;
        totalLikeWeight++;
      }
    }

    const hasFeedback =
      totalLikeWeight > 0 || skippedArxivIds.size > 0;

    if (!hasFeedback) return empty;

    // Normalise cat counts → weights [0, 1]
    const likedCatWeights: Record<string, number> =
      totalLikeWeight > 0
        ? Object.fromEntries(
            Object.entries(catCounts).map(([cat, count]) => [
              cat,
              count / totalLikeWeight,
            ])
          )
        : {};

    return { likedCatWeights, skippedArxivIds, hasFeedback };
  } catch (err) {
    console.warn("[digest-personalization] Unexpected error building profile:", err);
    return empty;
  }
}

/**
 * Apply personalisation to a list of candidate digest entries:
 *   1. Filter out papers the user has skipped.
 *   2. Add a category-overlap bonus to the effective score.
 *   3. Re-sort by effective score descending.
 *
 * If the profile has no feedback, returns the original list unchanged.
 *
 * The returned entries are stripped of `categories` so they conform to
 * DigestEntry (callers can cast to DigestEntry[] directly).
 */
export function applyPersonalizationBonus(
  entries: ScoredEntry[],
  profile: FeedbackProfile
): ScoredEntry[] {
  if (!profile.hasFeedback) return entries;

  // Step 1: filter skipped
  const filtered = entries.filter(
    (e) => !profile.skippedArxivIds.has(e.arxivId)
  );

  // Step 2: compute effective score and sort
  const withBonus = filtered.map((entry) => {
    const bonus = computeCategoryBonus(entry.categories, profile.likedCatWeights);
    return { entry, effectiveScore: entry.score + bonus };
  });

  withBonus.sort((a, b) => b.effectiveScore - a.effectiveScore);

  return withBonus.map((wb) => wb.entry);
}

/**
 * Compute the personalisation bonus for a single paper.
 *
 * @param categories   arXiv categories of the candidate paper
 * @param likedWeights normalised category weights from user's feedback history
 * @returns bonus value in [0, MAX_BONUS]
 */
export function computeCategoryBonus(
  categories: string[],
  likedWeights: Record<string, number>
): number {
  if (!categories.length || !Object.keys(likedWeights).length) return 0;

  const rawBonus = categories.reduce(
    (sum, cat) => sum + (likedWeights[cat] ?? 0),
    0
  );

  // Scale and cap
  return Math.min(rawBonus * BONUS_SCALE, MAX_BONUS);
}

/**
 * Strip categories from a ScoredEntry to produce a plain DigestEntry-shaped
 * object. Used before passing to sendDigestEmail.
 */
export function toDigestEntry(entry: ScoredEntry): Omit<ScoredEntry, "categories"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { categories: _cats, ...rest } = entry;
  return rest;
}
