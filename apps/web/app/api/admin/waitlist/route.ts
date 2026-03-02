/**
 * GET /api/admin/waitlist
 *
 * Returns waitlist stats for admin dashboard / CLI use.
 * Requires x-admin-secret header matching ADMIN_SECRET env var.
 *
 * Response:
 * {
 *   total: number;       // all waitlist entries
 *   invited: number;     // entries with invited_at set
 *   pending: number;     // entries without invited_at (not yet invited)
 *   entries: WaitlistEntry[];  // full list when ?full=1
 * }
 */
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/admin-auth";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(req: Request) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 503 }
    );
  }

  const url = new URL(req.url);
  const full = url.searchParams.get("full") === "1";

  try {
    // Count stats
    const { count: total, error: totalErr } = await supabase
      .from("paperbrief_waitlist")
      .select("*", { count: "exact", head: true });

    if (totalErr) throw totalErr;

    const { count: invited, error: invitedErr } = await supabase
      .from("paperbrief_waitlist")
      .select("*", { count: "exact", head: true })
      .not("invited_at", "is", null);

    if (invitedErr) throw invitedErr;

    const stats = {
      total: total ?? 0,
      invited: invited ?? 0,
      pending: (total ?? 0) - (invited ?? 0),
    };

    if (!full) {
      return NextResponse.json(stats);
    }

    // Full entry list
    const { data: entries, error: listErr } = await supabase
      .from("paperbrief_waitlist")
      .select("id, email, source, created_at, invited_at, invite_sent_by")
      .order("created_at", { ascending: true });

    if (listErr) throw listErr;

    return NextResponse.json({ ...stats, entries });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[admin/waitlist] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
