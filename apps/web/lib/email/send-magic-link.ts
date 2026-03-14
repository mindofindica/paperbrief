import { Resend } from "resend";
import * as React from "react";
import { MagicLinkEmail } from "./templates/magic-link";

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; error: string; skipped?: boolean };

function getResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export async function sendMagicLinkEmail(
  email: string,
  magicUrl: string,
): Promise<SendResult> {
  const resend = getResendClient();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping magic link email");
    return { ok: false, error: "RESEND_API_KEY not configured", skipped: true };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: "PaperBrief <hello@paperbrief.ai>",
      to: email,
      subject: "Your PaperBrief sign-in link",
      react: React.createElement(MagicLinkEmail, { magicUrl, expiresInHours: 24 }),
    });

    if (error) {
      console.error("[email] Resend error sending magic link:", error);
      return { ok: false, error: error.message };
    }

    return { ok: true, id: data!.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[email] Failed to send magic link:", msg);
    return { ok: false, error: msg };
  }
}
