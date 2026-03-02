/**
 * invite-token.ts — secure random token generator for beta invites
 *
 * Generates a URL-safe base64 token of the requested byte length.
 * Uses Node crypto (available in Next.js API routes / edge-compatible).
 */
import { randomBytes } from "crypto";

/** Default token length in bytes (produces ~32 char base64url string) */
const DEFAULT_BYTES = 24;

/**
 * Generate a secure random invite token.
 * Returns a URL-safe base64 string (no +/= chars).
 */
export function generateInviteToken(bytes = DEFAULT_BYTES): string {
  return randomBytes(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}
