/**
 * send-digest.ts — Resend wrapper for the weekly digest email
 *
 * Mirrors the send-welcome.ts pattern from the welcome-email branch.
 */

import { Resend } from "resend";
import * as React from "react";
import { DigestEmail } from "./templates/digest";
import { buildLikeUrl, buildSkipUrl } from "../feedback-token";
import type { Digest } from "@paperbrief/core";

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; error: string; skipped?: boolean };

/**
 * Lazily initialise the Resend client.
 * Returns null when RESEND_API_KEY is not set — graceful no-op.
 */
function getResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export interface SendDigestOptions {
  /** Recipient email address */
  to: string;
  /** The built Digest object */
  digest: Digest;
  /**
   * Personalised unsubscribe URL (should include uid + email + HMAC token).
   * Build with buildUnsubscribeUrl() from lib/unsubscribe-token.ts.
   * Defaults to the bare /unsubscribe page (non-personalised fallback).
   */
  unsubscribeUrl?: string;
  /** Override dashboard URL (defaults to https://paperbrief.ai/dashboard) */
  dashboardUrl?: string;
  /** Override from address (defaults to hello@paperbrief.ai) */
  from?: string;
  /**
   * Base URL for building per-paper 👍/👎 feedback links.
   * Required to embed feedback buttons in the email.
   * When omitted, feedback buttons are hidden (safe fallback for back-compat).
   *
   * Typically: process.env.NEXT_PUBLIC_APP_URL or "https://paperbrief.ai"
   */
  feedbackBaseUrl?: string;
}

/**
 * Send the weekly HTML digest email to a single recipient.
 *
 * Falls back gracefully if RESEND_API_KEY is not configured — useful for
 * local dev / CI where the key isn't present.
 */
export async function sendDigestEmail(opts: SendDigestOptions): Promise<SendResult> {
  const { to, digest, unsubscribeUrl, dashboardUrl, from, feedbackBaseUrl } = opts;

  const resend = getResendClient();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping digest email");
    return { ok: false, error: "RESEND_API_KEY not configured", skipped: true };
  }

  if (!to || !to.includes("@")) {
    return { ok: false, error: "Invalid recipient email address" };
  }

  if (digest.entries.length === 0) {
    console.info("[email] Digest has no entries — skipping send for", to);
    return { ok: false, error: "Digest is empty", skipped: true };
  }

  // Build per-paper feedback URLs if we have a userId and base URL
  const feedbackUrls = buildFeedbackUrls(digest.userId, digest.entries, feedbackBaseUrl);

  const subject = buildSubject(digest);

  try {
    const { data, error } = await resend.emails.send({
      from: from ?? "PaperBrief <hello@paperbrief.ai>",
      to: [to],
      subject,
      react: React.createElement(DigestEmail, {
        digest,
        unsubscribeUrl,
        dashboardUrl,
        feedbackUrls,
      }),
    });

    if (error) {
      console.error("[email] Resend error (digest):", error);
      return { ok: false, error: error.message };
    }

    console.log("[email] Digest email sent:", data?.id, "→", to);
    return { ok: true, id: data!.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] Unexpected error (digest):", message);
    return { ok: false, error: message };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a feedbackUrls map for all entries in the digest.
 * Returns undefined when userId or feedbackBaseUrl is missing (buttons hidden).
 */
function buildFeedbackUrls(
  userId: string,
  entries: Array<{ arxivId: string }>,
  feedbackBaseUrl?: string
): Record<string, { likeUrl: string; skipUrl: string }> | undefined {
  if (!userId || !feedbackBaseUrl) return undefined;
  const urls: Record<string, { likeUrl: string; skipUrl: string }> = {};
  for (const entry of entries) {
    urls[entry.arxivId] = {
      likeUrl: buildLikeUrl(userId, entry.arxivId, feedbackBaseUrl),
      skipUrl: buildSkipUrl(userId, entry.arxivId, feedbackBaseUrl),
    };
  }
  return urls;
}

/**
 * Build a concise, informative subject line.
 *
 * Examples:
 *   "📄 PaperBrief — 7 papers for you this week (Feb 24)"
 *   "📄 PaperBrief — 1 paper for you this week (Mar 03)"
 */
function buildSubject(digest: Digest): string {
  const n = digest.entries.length;
  const papers = n === 1 ? "1 paper" : `${n} papers`;
  // weekOf is "YYYY-MM-DD" (Monday); format as "Mon DD"
  const weekLabel = formatWeekLabel(digest.weekOf);
  return `📄 PaperBrief — ${papers} for you this week (${weekLabel})`;
}

function formatWeekLabel(isoDate: string): string {
  try {
    const d = new Date(isoDate + "T00:00:00Z");
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return isoDate;
  }
}
