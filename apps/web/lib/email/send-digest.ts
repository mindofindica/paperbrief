/**
 * send-digest.ts — Resend wrapper for the weekly digest email
 *
 * Mirrors the send-welcome.ts pattern from the welcome-email branch.
 */

import { Resend } from "resend";
import * as React from "react";
import { DigestEmail } from "./templates/digest";
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
  /** Override unsubscribe URL (defaults to https://paperbrief.io/unsubscribe) */
  unsubscribeUrl?: string;
  /** Override dashboard URL (defaults to https://paperbrief.io/dashboard) */
  dashboardUrl?: string;
  /** Override from address (defaults to digest@paperbrief.io) */
  from?: string;
}

/**
 * Send the weekly HTML digest email to a single recipient.
 *
 * Falls back gracefully if RESEND_API_KEY is not configured — useful for
 * local dev / CI where the key isn't present.
 */
export async function sendDigestEmail(opts: SendDigestOptions): Promise<SendResult> {
  const { to, digest, unsubscribeUrl, dashboardUrl, from } = opts;

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
