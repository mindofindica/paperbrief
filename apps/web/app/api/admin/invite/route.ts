/**
 * POST /api/admin/invite
 *
 * Batch-invite the top N pending waitlist users (oldest signups first).
 * Requires x-admin-secret header.
 *
 * Request body: { limit: number }   (max 100 per call)
 *
 * For each selected user:
 *  1. Generate a unique invite_token
 *  2. Stamp invited_at + invite_token + invite_sent_by="batch" in DB
 *  3. Send invite email via Resend (graceful skip if key not set)
 *
 * Response:
 * {
 *   invited: string[];     // emails successfully processed
 *   emailsSent: number;    // emails actually delivered (may be < invited.length if Resend key missing)
 *   errors: Array<{ email: string; error: string }>;
 * }
 */
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/admin-auth";
import { generateInviteToken } from "../../../../lib/invite-token";
import { sendInviteEmail } from "../../../../lib/email/send-invite";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const MAX_BATCH = 100;

export async function POST(req: Request) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawLimit = (body as Record<string, unknown>)?.limit;
  const limit =
    typeof rawLimit === "number" && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), MAX_BATCH)
      : null;

  if (!limit) {
    return NextResponse.json(
      { error: "limit must be a positive integer (max 100)" },
      { status: 400 }
    );
  }

  // Fetch oldest pending (uninvited) waitlist entries
  const { data: pending, error: fetchErr } = await supabase
    .from("paperbrief_waitlist")
    .select("id, email")
    .is("invited_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!pending || pending.length === 0) {
    return NextResponse.json({ invited: [], emailsSent: 0, errors: [], message: "No pending users to invite" });
  }

  const invited: string[] = [];
  const errors: Array<{ email: string; error: string }> = [];
  let emailsSent = 0;
  const now = new Date().toISOString();

  for (const user of pending) {
    const token = generateInviteToken();

    // Mark as invited in DB
    const { error: updateErr } = await supabase
      .from("paperbrief_waitlist")
      .update({
        invited_at: now,
        invite_token: token,
        invite_sent_by: "batch",
      })
      .eq("id", user.id);

    if (updateErr) {
      errors.push({ email: user.email, error: updateErr.message });
      continue;
    }

    invited.push(user.email);

    // Send invite email (non-blocking failure)
    const result = await sendInviteEmail({ to: user.email, token });
    if (result.ok) {
      emailsSent++;
    } else if (!result.skipped) {
      // Log but don't fail the whole batch for email delivery issues
      console.warn("[admin/invite] Email failed for", user.email, result.error);
    }
  }

  return NextResponse.json({ invited, emailsSent, errors });
}
