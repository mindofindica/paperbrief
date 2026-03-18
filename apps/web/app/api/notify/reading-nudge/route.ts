/**
 * POST /api/notify/reading-nudge
 *
 * Cron-triggered endpoint that sends weekly reading nudge emails to users
 * who have unread papers saved for ≥7 days.
 *
 * Protected by CRON_SECRET bearer token in production.
 *
 * Query params:
 *   dry_run=1 — fetch candidates and return counts but do not send emails
 *   days=N    — override the staleness threshold (default: 7)
 *   limit=N   — max users to process in one run (default: 50, max: 200)
 *
 * Response:
 *   { ok: true, processed: N, sent: N, skipped: N, errors: N }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '../../../../lib/supabase';
import { sendReadingNudgeEmail } from '../../../../lib/email/send-reading-nudge';
import type { NudgePaper } from '../../../../lib/email/templates/reading-nudge';

export const dynamic = 'force-dynamic';

// ── Auth ──────────────────────────────────────────────────────────────────────

function isAuthorised(request: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

// ── Supabase query ────────────────────────────────────────────────────────────

interface UserCandidate {
  user_id: string;
  email: string;
  unread_count: number;
  papers: NudgePaper[];
}

async function getNudgeCandidates(
  staleDays: number,
  limit: number,
): Promise<UserCandidate[]> {
  const supabase = getServiceSupabase();

  // Cut-off: papers saved before this date are "stale"
  const cutoff = new Date(Date.now() - staleDays * 86_400_000).toISOString();

  // Get users with unread papers saved before the cutoff
  // We join reading_list → users (via auth.users via a helper RPC or profiles table)
  // Using a direct Supabase query with a join to profiles for email
  const { data, error } = await supabase
    .from('reading_list')
    .select(`
      user_id,
      arxiv_id,
      priority,
      saved_at,
      papers (
        title,
        authors,
        categories
      ),
      profiles!inner (
        email
      )
    `)
    .eq('status', 'unread')
    .lt('saved_at', cutoff)
    .order('priority', { ascending: false })
    .order('saved_at', { ascending: false })
    .limit(limit * 10); // over-fetch to allow grouping

  if (error) {
    throw new Error(`[reading-nudge] Supabase query failed: ${error.message}`);
  }

  if (!data || data.length === 0) return [];

  // Group by user_id
  type Row = typeof data[number];
  const userMap = new Map<string, { email: string; papers: NudgePaper[] }>();

  for (const row of data as Row[]) {
    const userId = row.user_id;
    const profile = (row as unknown as { profiles: { email: string } }).profiles;
    if (!profile?.email) continue;

    if (!userMap.has(userId)) {
      userMap.set(userId, { email: profile.email, papers: [] });
    }

    const entry = userMap.get(userId)!;
    // We only surface top 3 papers per user (already sorted by priority desc)
    const paperData = (row as unknown as { papers: { title: string; authors: string | null; categories: string[] | null } | null }).papers;
    entry.papers.push({
      arxiv_id: row.arxiv_id,
      title: paperData?.title ?? row.arxiv_id,
      authors: paperData?.authors ?? null,
      track: Array.isArray(paperData?.categories) ? paperData!.categories[0] ?? null : null,
      saved_at: row.saved_at,
    });
  }

  // Convert to candidates, limit to `limit` users
  const candidates: UserCandidate[] = [];
  for (const [userId, { email, papers }] of userMap) {
    if (candidates.length >= limit) break;
    candidates.push({
      user_id: userId,
      email,
      unread_count: papers.length,
      papers: papers.slice(0, 3), // top 3 for email
    });
  }

  return candidates;
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const dryRun  = params.get('dry_run') === '1';
  const days    = Math.max(1, Math.min(30, parseInt(params.get('days')  ?? '7',  10) || 7));
  const limit   = Math.max(1, Math.min(200, parseInt(params.get('limit') ?? '50', 10) || 50));

  try {
    const candidates = await getNudgeCandidates(days, limit);

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dry_run: true,
        candidates: candidates.length,
        totalUnread: candidates.reduce((sum, c) => sum + c.unread_count, 0),
      });
    }

    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const candidate of candidates) {
      const result = await sendReadingNudgeEmail({
        to: candidate.email,
        userId: candidate.user_id,
        papers: candidate.papers,
        unreadCount: candidate.unread_count,
      });

      if (result.ok) {
        sent++;
      } else {
        const failResult = result as { ok: false; error: string; skipped?: boolean };
        if (failResult.skipped) {
          skipped++;
        } else {
          errors++;
          console.error('[reading-nudge] Failed to send to', candidate.email, failResult.error);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      processed: candidates.length,
      sent,
      skipped,
      errors,
    });
  } catch (err) {
    console.error('[reading-nudge] Fatal error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
