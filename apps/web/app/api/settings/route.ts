/**
 * GET  /api/settings — fetch current user's digest settings
 * PATCH /api/settings — update digest settings
 *
 * Settings stored in `user_settings` Supabase table.
 * If no row exists, returns plan-aware defaults (no row required for read).
 *
 * Plan rules enforced on write:
 *  - Free users: only 'weekly' or 'auto' allowed for digest_frequency_override
 *  - Pro users:  any value allowed ('auto', 'daily', 'twice_weekly', 'weekly')
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '../../../lib/supabase';
import { verifySessionCookie } from '../../../lib/auth';
import { getSubscription } from '../../../lib/stripe';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DigestFrequencyOverride = 'auto' | 'daily' | 'twice_weekly' | 'weekly';

export interface UserSettings {
  digestFrequencyOverride: DigestFrequencyOverride;
  /** Resolved frequency based on override + plan: always one of daily | twice_weekly | weekly */
  digestFrequencyResolved: 'daily' | 'twice_weekly' | 'weekly';
  digestHour: number;       // 0–23 UTC
  digestPaused: boolean;
  plan: 'free' | 'pro';
}

const PRO_FREQUENCIES: DigestFrequencyOverride[] = ['auto', 'daily', 'twice_weekly', 'weekly'];
const FREE_FREQUENCIES: DigestFrequencyOverride[] = ['auto', 'weekly'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getUserIdFromRequest(req: NextRequest): string | null {
  const session = req.cookies.get('pb_session')?.value;
  if (!session) return null;
  const result = verifySessionCookie(session);
  return result.valid ? result.userId ?? null : null;
}

/**
 * Resolve the concrete digest schedule from the stored override + plan.
 */
export function resolveFrequency(
  override: DigestFrequencyOverride,
  plan: 'free' | 'pro',
): 'daily' | 'twice_weekly' | 'weekly' {
  if (override === 'auto') {
    return plan === 'pro' ? 'daily' : 'weekly';
  }
  // Pro-only frequencies fall back to weekly if plan degrades
  if (plan === 'free' && (override === 'daily' || override === 'twice_weekly')) {
    return 'weekly';
  }
  return override;
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [sub, db] = await Promise.all([
    getSubscription(userId),
    Promise.resolve(getServiceSupabase()),
  ]);

  const { data, error } = await db
    .from('user_settings')
    .select('digest_frequency_override, digest_hour, digest_paused')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[settings][GET]', error);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }

  const override: DigestFrequencyOverride =
    (data?.digest_frequency_override as DigestFrequencyOverride) ?? 'auto';

  const settings: UserSettings = {
    digestFrequencyOverride: override,
    digestFrequencyResolved: resolveFrequency(override, sub.plan),
    digestHour: data?.digest_hour ?? 7,
    digestPaused: data?.digest_paused ?? false,
    plan: sub.plan,
  };

  return NextResponse.json({ settings });
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

interface SettingsPatch {
  digestFrequencyOverride?: DigestFrequencyOverride;
  digestHour?: number;
  digestPaused?: boolean;
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: SettingsPatch;
  try {
    body = (await request.json()) as SettingsPatch;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { digestFrequencyOverride, digestHour, digestPaused } = body;

  // Validate individual fields
  const validFrequencies: DigestFrequencyOverride[] = ['auto', 'daily', 'twice_weekly', 'weekly'];
  if (digestFrequencyOverride !== undefined && !validFrequencies.includes(digestFrequencyOverride)) {
    return NextResponse.json(
      { error: `digestFrequencyOverride must be one of: ${validFrequencies.join(', ')}` },
      { status: 400 },
    );
  }

  if (digestHour !== undefined) {
    if (!Number.isInteger(digestHour) || digestHour < 0 || digestHour > 23) {
      return NextResponse.json(
        { error: 'digestHour must be an integer between 0 and 23' },
        { status: 400 },
      );
    }
  }

  if (digestPaused !== undefined && typeof digestPaused !== 'boolean') {
    return NextResponse.json({ error: 'digestPaused must be a boolean' }, { status: 400 });
  }

  // Plan check: free users cannot set pro-only frequencies
  if (digestFrequencyOverride && (digestFrequencyOverride === 'daily' || digestFrequencyOverride === 'twice_weekly')) {
    const sub = await getSubscription(userId);
    if (sub.plan === 'free') {
      return NextResponse.json(
        {
          error: `'${digestFrequencyOverride}' is a Pro feature. Upgrade to unlock daily and twice-weekly digests.`,
          upgrade: true,
          plan: 'free',
        },
        { status: 403 },
      );
    }
  }

  // Build the upsert payload (only include provided fields)
  const upsertData: Record<string, unknown> = { user_id: userId };
  if (digestFrequencyOverride !== undefined) upsertData['digest_frequency_override'] = digestFrequencyOverride;
  if (digestHour !== undefined) upsertData['digest_hour'] = digestHour;
  if (digestPaused !== undefined) upsertData['digest_paused'] = digestPaused;

  const db = getServiceSupabase();

  // If only user_id, there's nothing to update
  if (Object.keys(upsertData).length === 1) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { error } = await db
    .from('user_settings')
    .upsert(upsertData, { onConflict: 'user_id' });

  if (error) {
    console.error('[settings][PATCH]', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }

  // Return updated settings
  return GET(request);
}

// Export plan helpers for testing
export { FREE_FREQUENCIES, PRO_FREQUENCIES };
