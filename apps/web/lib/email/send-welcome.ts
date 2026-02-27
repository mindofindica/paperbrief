import { Resend } from "resend";
import * as React from "react";
import { WelcomeEmail } from "./templates/welcome";
import { AlreadyWaitlistedEmail } from "./templates/already-waitlisted";

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; error: string; skipped?: boolean };

/**
 * Lazily initialise the Resend client.
 * Returns null if RESEND_API_KEY is not set (graceful no-op in that case).
 */
function getResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

/** Send the welcome email to a new waitlist signup. */
export async function sendWelcomeEmail(email: string): Promise<SendResult> {
  const resend = getResendClient();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping welcome email");
    return { ok: false, error: "RESEND_API_KEY not configured", skipped: true };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: "PaperBrief <hello@paperbrief.app>",
      to: [email],
      subject: "You're on the PaperBrief waitlist 🎉",
      react: React.createElement(WelcomeEmail, { email }),
    });

    if (error) {
      console.error("[email] Resend error (welcome):", error);
      return { ok: false, error: error.message };
    }

    console.log("[email] Welcome email sent:", data?.id, "→", email);
    return { ok: true, id: data!.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] Unexpected error (welcome):", message);
    return { ok: false, error: message };
  }
}

/** Send the "you're already on the list" email for duplicate signups. */
export async function sendAlreadyWaitlistedEmail(email: string): Promise<SendResult> {
  const resend = getResendClient();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping duplicate email");
    return { ok: false, error: "RESEND_API_KEY not configured", skipped: true };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: "PaperBrief <hello@paperbrief.app>",
      to: [email],
      subject: "You're already on the PaperBrief waitlist!",
      react: React.createElement(AlreadyWaitlistedEmail, { email }),
    });

    if (error) {
      console.error("[email] Resend error (duplicate):", error);
      return { ok: false, error: error.message };
    }

    console.log("[email] Duplicate email sent:", data?.id, "→", email);
    return { ok: true, id: data!.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] Unexpected error (duplicate):", message);
    return { ok: false, error: message };
  }
}
