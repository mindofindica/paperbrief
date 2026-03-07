/**
 * GET /api/unsubscribe?uid=<userId>&email=<email>&token=<hmac>
 *
 * One-click unsubscribe endpoint embedded in every digest email.
 * Validates the HMAC token, marks the user as unsubscribed in
 * user_email_prefs, then redirects to /unsubscribe?status=success.
 *
 * RFC 8058 (one-click unsubscribe) compatible:
 *   GET  → validate + unsubscribe + redirect to confirmation page
 *   POST → same but returns 200 JSON (for mail clients that POST)
 *
 * No session required — the HMAC is the proof of intent.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyUnsubscribeToken } from "../../../lib/unsubscribe-token";
import { getServiceSupabase } from "../../../lib/supabase";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://paperbrief.io";

// ── Shared handler ────────────────────────────────────────────────────────────

async function handleUnsubscribe(
  uid: string | null,
  email: string | null,
  token: string | null
): Promise<{ ok: boolean; error?: string }> {
  if (!uid || !email || !token) {
    return { ok: false, error: "Missing uid, email, or token" };
  }

  if (!verifyUnsubscribeToken(token, uid, email)) {
    return { ok: false, error: "Invalid or tampered token" };
  }

  const supabase = getServiceSupabase();

  // Upsert — create row if it doesn't exist, set subscribed=false
  const { error } = await supabase.from("user_email_prefs").upsert(
    {
      user_id: uid,
      digest_subscribed: false,
      unsubscribed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    console.error("[unsubscribe] DB error:", error);
    return { ok: false, error: "Database error" };
  }

  console.log("[unsubscribe] User unsubscribed:", uid);
  return { ok: true };
}

// ── GET — browser click from email ────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const uid = params.get("uid");
  const email = params.get("email");
  const token = params.get("token");

  const result = await handleUnsubscribe(uid, email, token);

  if (!result.ok) {
    // Don't leak error details in redirects; send to error page
    return NextResponse.redirect(
      `${APP_URL}/unsubscribe?status=error`,
      { status: 302 }
    );
  }

  return NextResponse.redirect(
    `${APP_URL}/unsubscribe?status=success`,
    { status: 302 }
  );
}

// ── POST — RFC 8058 mail-client one-click ─────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  let uid: string | null = null;
  let email: string | null = null;
  let token: string | null = null;

  // RFC 8058 sends application/x-www-form-urlencoded body
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const body = await request.json();
      uid = body.uid ?? null;
      email = body.email ?? null;
      token = body.token ?? null;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  } else {
    // Form-encoded
    try {
      const body = await request.formData();
      uid = body.get("uid") as string | null;
      email = body.get("email") as string | null;
      token = body.get("token") as string | null;
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
  }

  const result = await handleUnsubscribe(uid, email, token);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, message: "Unsubscribed successfully" });
}

export const dynamic = "force-dynamic";
