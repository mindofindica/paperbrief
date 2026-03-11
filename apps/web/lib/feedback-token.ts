/**
 * feedback-token.ts — HMAC-based one-click feedback tokens for digest emails
 *
 * Generates a deterministic, tamper-proof token encoding a user's
 * 👍/👎 intent for a specific paper in a specific email.
 *
 * Format: HMAC-SHA256(secret, "userId:arxivId:sentiment") → URL-safe base64
 *
 * Tokens are NOT time-limited — feedback links in old emails must
 * keep working. The upsert in the API is idempotent so replay is harmless.
 *
 * Sentiment values: "like" | "skip"
 *
 * The secret is read from FEEDBACK_SECRET (falls back to UNSUBSCRIBE_SECRET,
 * then MAGIC_LINK_SECRET). A dev constant is used in CI/test when none are set.
 */

import { createHmac } from "crypto";

export type FeedbackSentiment = "like" | "skip";

const FALLBACK_SECRET = "paperbrief-dev-feedback-secret";

function getSecret(): string {
  return (
    process.env.FEEDBACK_SECRET ||
    process.env.UNSUBSCRIBE_SECRET ||
    process.env.MAGIC_LINK_SECRET ||
    FALLBACK_SECRET
  );
}

/**
 * Generate an HMAC token that encodes userId + arxivId + sentiment.
 * The token is URL-safe base64 (no +, /, or =).
 */
export function generateFeedbackToken(
  userId: string,
  arxivId: string,
  sentiment: FeedbackSentiment
): string {
  const secret = getSecret();
  const payload = `${userId}:${arxivId}:${sentiment}`;
  return createHmac("sha256", secret)
    .update(payload)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Verify a feedback token against the expected HMAC.
 * Returns true only if the token matches for this userId + arxivId + sentiment.
 */
export function verifyFeedbackToken(
  token: string,
  userId: string,
  arxivId: string,
  sentiment: FeedbackSentiment
): boolean {
  if (!token || !userId || !arxivId || !sentiment) return false;
  try {
    const expected = generateFeedbackToken(userId, arxivId, sentiment);
    return timingSafeEqual(token, expected);
  } catch {
    return false;
  }
}

/**
 * Build a 👍 (like) feedback URL for embedding in digest emails.
 */
export function buildLikeUrl(
  userId: string,
  arxivId: string,
  baseUrl?: string
): string {
  return buildFeedbackUrl(userId, arxivId, "like", baseUrl);
}

/**
 * Build a 👎 (skip) feedback URL for embedding in digest emails.
 */
export function buildSkipUrl(
  userId: string,
  arxivId: string,
  baseUrl?: string
): string {
  return buildFeedbackUrl(userId, arxivId, "skip", baseUrl);
}

/**
 * Build a full feedback URL for a given sentiment.
 * GET /api/feedback/email?uid=<userId>&arxiv=<arxivId>&sentiment=<like|skip>&token=<hmac>
 */
export function buildFeedbackUrl(
  userId: string,
  arxivId: string,
  sentiment: FeedbackSentiment,
  baseUrl?: string
): string {
  const base =
    baseUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://paperbrief.ai";
  const token = generateFeedbackToken(userId, arxivId, sentiment);
  const params = new URLSearchParams({
    uid: userId,
    arxiv: arxivId,
    sentiment,
    token,
  });
  return `${base}/api/feedback/email?${params.toString()}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Constant-time string comparison — prevents timing-based token forgery.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length !== b.length ? 1 : 0;
  for (let i = 0; i < maxLen; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
