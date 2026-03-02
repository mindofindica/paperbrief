/**
 * POST /api/admin/invite/:email
 *
 * Invite a single waitlist user by email address.
 * Requires x-admin-secret header.
 *
 * - Works whether the user was already marked invited or not (idempotent re-invite)
 * - Generates a fresh token each call (useful for re-sending lost invites)
 *
 * Response: { ok: true; email: string; emailSent: boolean; token: string }
 */
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../../lib/admin-auth";
import { generateInviteToken } from "../../../../../lib/invite-token";
import { sendInviteEmail } from "../../../../../lib/email/send-invite";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ email: string }> }
) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const { email: rawEmail } = await params;
  const email = decodeURIComponent(rawEmail).toLowerCase().trim();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid email in URL" }, { status: 400 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 503 }
    );
  }

  // Confirm user is on the waitlist
  const { data: user, error: fetchErr } = await supabase
    .from("paperbrief_waitlist")
    .select("id, email, invited_at")
    .eq("email", email)
    .single();

  if (fetchErr || !user) {
    return NextResponse.json(
      { error: "Email not found on waitlist" },
      { status: 404 }
    );
  }

  const token = generateInviteToken();
  const now = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from("paperbrief_waitlist")
    .update({
      invited_at: now,
      invite_token: token,
      invite_sent_by: "admin",
    })
    .eq("id", user.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const emailResult = await sendInviteEmail({ to: email, token });
  const emailSent = emailResult.ok;

  if (!emailResult.ok && !emailResult.skipped) {
    console.warn("[admin/invite/:email] Email delivery failed:", emailResult.error);
  }

  return NextResponse.json({
    ok: true,
    email,
    emailSent,
    token,
    reinvite: !!user.invited_at,
  });
}
