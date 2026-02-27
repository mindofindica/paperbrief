/**
 * Email validation utilities.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Returns the normalised (lowercase, trimmed) email if valid, or null if invalid.
 */
export function validateEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const normalised = raw.toLowerCase().trim();
  return EMAIL_RE.test(normalised) ? normalised : null;
}
