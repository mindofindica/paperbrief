/**
 * POST /api/resubscribe
 *
 * Re-enable digest emails for an authenticated user who previously
 * unsubscribed. Requires a valid session cookie (you must be logged in
 * to re-subscribe — prevents third-party re-subscriptions).
 *
 * Returns 200 { ok: true } on success.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySessionCookie } from "../../../lib/auth";
import { getServiceSupabase } from "../../../lib/supabase";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Require authentication
  const session = request.cookies.get("pb_session")?.value;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { valid, userId } = verifySessionCookie(session);
  if (!valid || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabase();

  const { error } = await supabase.from("user_email_prefs").upsert(
    {
      user_id: userId,
      digest_subscribed: true,
      unsubscribed_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    console.error("[resubscribe] DB error:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  console.log("[resubscribe] User resubscribed:", userId);
  return NextResponse.json({ ok: true, message: "Resubscribed successfully" });
}

export const dynamic = "force-dynamic";
