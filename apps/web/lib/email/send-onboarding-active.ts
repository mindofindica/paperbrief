import { Resend } from "resend";
import * as React from "react";
import { OnboardingActiveEmail } from "./templates/onboarding-active";
import { getServiceSupabase } from "../supabase";

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; error: string; skipped?: boolean };

function getResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

/**
 * Look up a user's email address via the Supabase auth admin API.
 * Returns null if the user is not found or the call fails.
 */
async function getUserEmail(userId: string): Promise<string | null> {
  const supabase = getServiceSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error || !data.user?.email) return null;
    return data.user.email;
  } catch {
    return null;
  }
}

/**
 * Mark in user_settings that the onboarding active email has been sent.
 * This prevents duplicate sends if the verify route fires more than once
 * (e.g. token re-use edge case or test environments).
 */
async function markOnboardingEmailSent(userId: string): Promise<void> {
  const supabase = getServiceSupabase();
  if (!supabase) return;

  await supabase
    .from("user_settings")
    .upsert(
      { user_id: userId, onboarding_sent_at: new Date().toISOString() },
      { onConflict: "user_id", ignoreDuplicates: false }
    );
}

/**
 * Check whether we've already sent the onboarding active email for this user.
 */
async function hasOnboardingEmailBeenSent(userId: string): Promise<boolean> {
  const supabase = getServiceSupabase();
  if (!supabase) return false;

  const { data } = await supabase
    .from("user_settings")
    .select("onboarding_sent_at")
    .eq("user_id", userId)
    .single();

  return !!data?.onboarding_sent_at;
}

/**
 * Send the "You're in! Here's what to explore first" onboarding active email.
 *
 * Safe to call on every first login — internally checks `onboarding_sent_at`
 * and no-ops if the email was already sent.
 *
 * @param userId  The authenticated user's UUID
 * @param appUrl  Optional override for the app base URL (defaults to env or production URL)
 */
export async function sendOnboardingActiveEmail(
  userId: string,
  appUrl?: string
): Promise<SendResult> {
  // Guard: only send once per user
  const alreadySent = await hasOnboardingEmailBeenSent(userId);
  if (alreadySent) {
    return { ok: false, error: "onboarding email already sent", skipped: true };
  }

  const email = await getUserEmail(userId);
  if (!email) {
    console.warn("[email] Could not resolve email for user:", userId);
    return { ok: false, error: "Could not resolve user email" };
  }

  const resend = getResendClient();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping onboarding active email");
    return { ok: false, error: "RESEND_API_KEY not configured", skipped: true };
  }

  const resolvedAppUrl =
    appUrl ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://paperbrief.ai";

  try {
    const { data, error } = await resend.emails.send({
      from: "PaperBrief <hello@paperbrief.ai>",
      to: [email],
      subject: "You're in! Here's what to explore on PaperBrief 🎉",
      react: React.createElement(OnboardingActiveEmail, {
        email,
        appUrl: resolvedAppUrl,
      }),
    });

    if (error) {
      console.error("[email] Resend error (onboarding-active):", error);
      return { ok: false, error: error.message };
    }

    // Mark as sent — best-effort, don't fail if this errors
    try {
      await markOnboardingEmailSent(userId);
    } catch (err) {
      console.error("[email] Failed to mark onboarding_sent_at:", err);
    }

    console.log("[email] Onboarding active email sent:", data?.id, "→", email);
    return { ok: true, id: data!.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] Unexpected error (onboarding-active):", message);
    return { ok: false, error: message };
  }
}
