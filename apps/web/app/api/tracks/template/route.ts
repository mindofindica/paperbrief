/**
 * POST /api/tracks/template
 *
 * Batch-create tracks from pre-built templates. Accepts a list of template
 * keys; validates them, enforces plan limits, skips duplicates (by track name),
 * and inserts the rest in one shot.
 *
 * Body: { keys: string[] }
 *
 * Response 200: { created: Track[], skipped: string[], limitReached: boolean }
 * Response 400: bad request
 * Response 401: unauthenticated
 * Response 403: plan limit already reached (zero slots available)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "../../../../lib/supabase";
import { verifySessionCookie } from "../../../../lib/auth";
import { getSubscription } from "../../../../lib/stripe";
import {
  getTemplateByKey,
  validateTemplateKeys,
  type TrackTemplate,
} from "../../../../lib/track-templates";

function getUserId(request: NextRequest): string | null {
  const session = request.cookies.get("pb_session")?.value;
  if (!session) return null;
  const result = verifySessionCookie(session);
  return result.valid ? (result.userId ?? null) : null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: { keys?: unknown };
  try {
    body = (await request.json()) as { keys?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.keys) || body.keys.length === 0) {
    return NextResponse.json(
      { error: "keys must be a non-empty array of template keys" },
      { status: 400 },
    );
  }

  const keys = body.keys as string[];

  const { valid, unknown } = validateTemplateKeys(keys);
  if (!valid) {
    return NextResponse.json(
      { error: `Unknown template keys: ${unknown.join(", ")}` },
      { status: 400 },
    );
  }

  const supabase = getServiceSupabase();

  // ── Plan limit check ────────────────────────────────────────────────────────
  const [subscription, { count: existingCount }] = await Promise.all([
    getSubscription(userId),
    supabase
      .from("tracks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("active", true),
  ]);

  const slotsAvailable = subscription.trackLimit - (existingCount ?? 0);

  if (slotsAvailable <= 0) {
    return NextResponse.json(
      {
        error:
          subscription.plan === "pro"
            ? `Pro plan limit reached (${subscription.trackLimit} tracks)`
            : `Free plan allows ${subscription.trackLimit} track. Upgrade to Pro for up to 5 tracks.`,
        plan: subscription.plan,
        trackLimit: subscription.trackLimit,
        upgrade: subscription.plan !== "pro",
      },
      { status: 403 },
    );
  }

  // ── Duplicate detection ─────────────────────────────────────────────────────
  // Build the list of track names we'd be creating
  const templates = keys.map((k) => getTemplateByKey(k)!);
  const wantedNames = templates.map((t) => t.name);

  const { data: existingTracks } = await supabase
    .from("tracks")
    .select("name")
    .eq("user_id", userId)
    .in("name", wantedNames);

  const existingNames = new Set((existingTracks ?? []).map((t: { name: string }) => t.name));

  const toCreate = templates.filter((t) => !existingNames.has(t.name));
  const skipped = templates.filter((t) => existingNames.has(t.name)).map((t) => t.key);

  if (toCreate.length === 0) {
    return NextResponse.json({ created: [], skipped, limitReached: false });
  }

  // ── Enforce slot limit ──────────────────────────────────────────────────────
  const createSlice: TrackTemplate[] = toCreate.slice(0, slotsAvailable);
  const limitReached = toCreate.length > slotsAvailable;

  // ── Insert ──────────────────────────────────────────────────────────────────
  const rows = createSlice.map((t) => ({
    user_id: userId,
    name: t.name,
    keywords: t.keywords,
    arxiv_cats: t.arxiv_cats,
    min_score: t.min_score,
    active: true,
  }));

  const { data: inserted, error } = await supabase
    .from("tracks")
    .insert(rows)
    .select("id, name, keywords, arxiv_cats, min_score, active, created_at");

  if (error) {
    console.error("[tracks/template][POST]", error);
    return NextResponse.json({ error: "Failed to create tracks" }, { status: 500 });
  }

  return NextResponse.json({ created: inserted ?? [], skipped, limitReached });
}
