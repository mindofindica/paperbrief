/**
 * send-invite.ts — Resend wrapper for beta invite emails
 *
 * Sends a magic-link invite to a waitlist user being admitted to the beta.
 */

import { Resend } from "resend";
import * as React from "react";
import { BetaInviteEmail } from "./templates/beta-invite";

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; error: string; skipped?: boolean };

function getResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export interface SendInviteOptions {
  /** Recipient email address */
  to: string;
  /** Magic-link token — embedded in the invite URL */
  token: string;
  /** Base URL for the invite link (defaults to NEXT_PUBLIC_APP_URL or https://paperbrief.io) */
  baseUrl?: string;
  /** Override from address */
  from?: string;
}

/**
 * Send a beta invite email with a magic-link.
 * Gracefully skips if RESEND_API_KEY is not configured.
 */
export async function sendInviteEmail(opts: SendInviteOptions): Promise<SendResult> {
  const { to, token, baseUrl, from } = opts;

  const resend = getResendClient();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping invite email");
    return { ok: false, error: "RESEND_API_KEY not configured", skipped: true };
  }

  if (!to || !to.includes("@")) {
    return { ok: false, error: "Invalid recipient email address" };
  }

  if (!token) {
    return { ok: false, error: "Missing invite token" };
  }

  const appUrl =
    baseUrl ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://paperbrief.io";

  const inviteUrl = `${appUrl}/join?token=${encodeURIComponent(token)}`;

  try {
    const { data, error } = await resend.emails.send({
      from: from ?? "PaperBrief <hello@paperbrief.ai>",
      to: [to],
      subject: "You're in — welcome to PaperBrief Beta 🎉",
      react: React.createElement(BetaInviteEmail, { email: to, inviteUrl }),
    });

    if (error) {
      console.error("[email] Resend error (invite):", error);
      return { ok: false, error: error.message };
    }

    console.log("[email] Invite email sent:", data?.id, "→", to);
    return { ok: true, id: data!.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] Unexpected error (invite):", message);
    return { ok: false, error: message };
  }
}
