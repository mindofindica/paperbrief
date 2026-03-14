/**
 * GET /api/admin/users
 *
 * Returns a list of registered users with their track counts, digest history,
 * and reading list size — useful for admin overview of PaperBrief's user base.
 *
 * Requires x-admin-secret header matching ADMIN_SECRET env var.
 *
 * Query params:
 *   ?limit=50   — max users to return (default: 50, max: 200)
 *   ?offset=0   — pagination offset
 *
 * Response:
 * {
 *   total: number;
 *   users: AdminUser[];
 * }
 *
 * AdminUser:
 * {
 *   id: string;
 *   email: string;
 *   created_at: string;
 *   track_count: number;
 *   digest_count: number;
 *   reading_list_count: number;
 *   last_digest_at: string | null;
 *   last_active_at: string | null;
 * }
 */
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/admin-auth";

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  track_count: number;
  digest_count: number;
  reading_list_count: number;
  last_digest_at: string | null;
  last_active_at: string | null;
}

export async function GET(req: Request) {
  const authError = requireAdmin(req);
  if (authError) return authError;

  const supabase = getServiceSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(req.url);
  const rawLimit = parseInt(searchParams.get("limit") ?? "50", 10);
  const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 50 : rawLimit), 200);
  const rawOffset = parseInt(searchParams.get("offset") ?? "0", 10);
  const offset = Math.max(0, isNaN(rawOffset) ? 0 : rawOffset);

  // 1. Fetch users from auth.users via admin API
  const { data: authData, error: authError2 } = await supabase.auth.admin.listUsers({
    page: Math.floor(offset / limit) + 1,
    perPage: limit,
  });

  if (authError2) {
    console.error("[admin/users] auth.admin.listUsers error:", authError2);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }

  const users = authData?.users ?? [];
  const total = authData?.total ?? 0;

  if (users.length === 0) {
    return NextResponse.json({ total: 0, users: [] });
  }

  const userIds = users.map((u) => u.id);

  // 2. Fetch track counts per user
  const { data: trackRows } = await supabase
    .from("tracks")
    .select("user_id")
    .in("user_id", userIds)
    .eq("active", true);

  const trackCounts: Record<string, number> = {};
  for (const row of trackRows ?? []) {
    trackCounts[row.user_id] = (trackCounts[row.user_id] ?? 0) + 1;
  }

  // 3. Fetch digest counts + last digest date per user
  const { data: digestRows } = await supabase
    .from("deliveries")
    .select("user_id, delivered_at")
    .in("user_id", userIds)
    .order("delivered_at", { ascending: false });

  const digestCounts: Record<string, number> = {};
  const lastDigestAt: Record<string, string> = {};
  for (const row of digestRows ?? []) {
    digestCounts[row.user_id] = (digestCounts[row.user_id] ?? 0) + 1;
    if (!lastDigestAt[row.user_id]) {
      lastDigestAt[row.user_id] = row.delivered_at;
    }
  }

  // 4. Fetch reading list counts per user
  const { data: rlRows } = await supabase
    .from("reading_list")
    .select("user_id")
    .in("user_id", userIds);

  const rlCounts: Record<string, number> = {};
  for (const row of rlRows ?? []) {
    rlCounts[row.user_id] = (rlCounts[row.user_id] ?? 0) + 1;
  }

  // 5. Assemble response
  const adminUsers: AdminUser[] = users.map((u) => ({
    id: u.id,
    email: u.email ?? "(no email)",
    created_at: u.created_at,
    track_count: trackCounts[u.id] ?? 0,
    digest_count: digestCounts[u.id] ?? 0,
    reading_list_count: rlCounts[u.id] ?? 0,
    last_digest_at: lastDigestAt[u.id] ?? null,
    last_active_at: u.last_sign_in_at ?? null,
  }));

  // Sort by created_at desc (newest users first)
  adminUsers.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return NextResponse.json({ total, users: adminUsers });
}
