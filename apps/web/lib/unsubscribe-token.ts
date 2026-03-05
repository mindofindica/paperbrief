/**
 * unsubscribe-token.ts — HMAC-based one-click unsubscribe tokens
 *
 * Generates a deterministic, tamper-proof token that encodes a user's
 * intent to unsubscribe from digest emails.
 *
 * Format: HMAC-SHA256(secret, "userId:email") → URL-safe base64
 *
 * The token is *not* time-limited — unsubscribe links in old emails must
 * continue to work forever. Replay attacks are harmless (idempotent unsubscribe).
 *
 * The secret is read from UNSUBSCRIBE_SECRET (falls back to MAGIC_LINK_SECRET).
 * If neither is set, the token still works in CI/test via a fallback constant.
 */

import { createHmac } from "crypto";

const FALLBACK_SECRET = "paperbrief-dev-unsubscribe-secret";

function getSecret(): string {
  return (
    process.env.UNSUBSCRIBE_SECRET ||
    process.env.MAGIC_LINK_SECRET ||
    FALLBACK_SECRET
  );
}

/**
 * Generate an HMAC-based unsubscribe token for a user.
 * Embed uid + email + token in the unsubscribe URL so the endpoint
 * can verify without a DB lookup.
 */
export function generateUnsubscribeToken(userId: string, email: string): string {
  const secret = getSecret();
  const payload = `${userId}:${email}`;
  return createHmac("sha256", secret)
    .update(payload)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Verify an unsubscribe token.
 * Returns true only if the token matches the expected HMAC for this userId + email.
 */
export function verifyUnsubscribeToken(
  token: string,
  userId: string,
  email: string
): boolean {
  if (!token || !userId || !email) return false;
  try {
    const expected = generateUnsubscribeToken(userId, email);
    // Constant-time comparison to prevent timing attacks
    return timingSafeEqual(token, expected);
  } catch {
    return false;
  }
}

/**
 * Build a full unsubscribe URL for embedding in emails.
 * Defaults to the production domain; override via BASE_URL env var.
 */
export function buildUnsubscribeUrl(
  userId: string,
  email: string,
  baseUrl?: string
): string {
  const base =
    baseUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://paperbrief.io";
  const token = generateUnsubscribeToken(userId, email);
  const params = new URLSearchParams({
    uid: userId,
    email,
    token,
  });
  return `${base}/api/unsubscribe?${params.toString()}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Constant-time string comparison.
 * Avoids early-exit timing leaks that could help an attacker forge a token.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still iterate to avoid length-based timing leak
    let diff = 0;
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    return false; // lengths differ → always false, but we ran the loop
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
