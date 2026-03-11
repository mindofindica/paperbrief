/**
 * GET /api/feedback/email?uid=<userId>&arxiv=<arxivId>&sentiment=<like|skip>&token=<hmac>
 *
 * One-click feedback endpoint for digest emails.
 *
 * Flow:
 *   1. Verify HMAC token (userId + arxivId + sentiment)
 *   2. Upsert into email_feedback table (idempotent — last click wins)
 *   3. Redirect to the paper on arXiv
 *
 * No session required — the HMAC is the proof of identity.
 * Token is bound to userId + arxivId + sentiment so it can't be reused
 * for a different paper or flipped to the opposite sentiment.
 *
 * Replay attacks are harmless (idempotent upsert, same user+paper).
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyFeedbackToken, type FeedbackSentiment } from "../../../../lib/feedback-token";
import { getServiceSupabase } from "../../../../lib/supabase";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://paperbrief.ai";
const ARXIV_ABS_BASE = "https://arxiv.org/abs";

const VALID_SENTIMENTS = new Set<string>(["like", "skip"]);

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const uid       = params.get("uid");
  const arxivId   = params.get("arxiv");
  const sentiment = params.get("sentiment");
  const token     = params.get("token");

  // ── Validate inputs ─────────────────────────────────────────────────────────

  if (!uid || !arxivId || !sentiment || !token) {
    return NextResponse.redirect(`${APP_URL}/?feedback=invalid`, { status: 302 });
  }

  if (!VALID_SENTIMENTS.has(sentiment)) {
    return NextResponse.redirect(`${APP_URL}/?feedback=invalid`, { status: 302 });
  }

  // ── Verify HMAC ─────────────────────────────────────────────────────────────

  const valid = verifyFeedbackToken(token, uid, arxivId, sentiment as FeedbackSentiment);
  if (!valid) {
    console.warn("[feedback/email] Invalid token for uid=%s arxiv=%s sentiment=%s", uid, arxivId, sentiment);
    return NextResponse.redirect(`${APP_URL}/?feedback=invalid`, { status: 302 });
  }

  // ── Upsert feedback ─────────────────────────────────────────────────────────

  try {
    const supabase = getServiceSupabase();
    const { error } = await supabase.from("email_feedback").upsert(
      {
        user_id:   uid,
        arxiv_id:  arxivId,
        sentiment,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,arxiv_id" }
    );

    if (error) {
      console.error("[feedback/email] DB upsert error:", error);
      // Don't block — still redirect to the paper. Feedback loss is
      // better than a broken link in the user's email.
    } else {
      console.log(
        "[feedback/email] Recorded %s for uid=%s arxiv=%s",
        sentiment,
        uid,
        arxivId
      );
    }
  } catch (err) {
    console.error("[feedback/email] Unexpected error:", err);
    // Fail open — redirect to paper anyway
  }

  // ── Redirect to arXiv paper ─────────────────────────────────────────────────

  // Normalise arxivId: strip any "arxiv:" prefix, allow "XXXX.XXXXX" format
  const cleanId = arxivId.replace(/^arxiv:/i, "");
  const paperUrl = `${ARXIV_ABS_BASE}/${encodeURIComponent(cleanId)}`;

  return NextResponse.redirect(paperUrl, { status: 302 });
}
