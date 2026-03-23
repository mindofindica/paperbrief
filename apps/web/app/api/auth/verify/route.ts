import { NextRequest, NextResponse } from 'next/server';
import { verifyMagicToken, createSessionCookie } from '../../../../lib/auth';
import { getServiceSupabase } from '../../../../lib/supabase';
import { sendOnboardingActiveEmail } from '../../../../lib/email/send-onboarding-active';

/**
 * Check whether a user has configured any tracks.
 * Used to decide whether to redirect new users to /onboarding.
 */
async function getUserTrackCount(userId: string): Promise<number> {
  const supabase = getServiceSupabase();
  const { count, error } = await supabase
    .from('tracks')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) {
    console.error('[auth/verify] track count error:', error.message);
    return 0; // default to "no tracks" on error → redirect to onboarding
  }
  return count ?? 0;
}

/**
 * Record the user's first login timestamp in user_settings.
 * Returns true if this was indeed the first login (first_login_at was null).
 */
async function recordFirstLogin(userId: string): Promise<boolean> {
  const supabase = getServiceSupabase();

  // Check current first_login_at
  const { data: existing } = await supabase
    .from('user_settings')
    .select('first_login_at')
    .eq('user_id', userId)
    .single();

  const isFirstLogin = !existing?.first_login_at;

  // Upsert: set first_login_at only if it has never been set
  await supabase.from('user_settings').upsert(
    {
      user_id: userId,
      ...(isFirstLogin ? { first_login_at: new Date().toISOString() } : {}),
    },
    { onConflict: 'user_id', ignoreDuplicates: false }
  );

  return isFirstLogin;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  const redirect = request.nextUrl.searchParams.get('redirect') || '/digest';

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const result = await verifyMagicToken(token);
  if (!result.valid) {
    return NextResponse.redirect(new URL('/login?error=invalid', request.url));
  }

  const userId = result.userId!;

  // Record first login (non-fatal — don't block auth if this fails)
  let isFirstLogin = false;
  try {
    isFirstLogin = await recordFirstLogin(userId);
  } catch (err) {
    console.error('[auth/verify] recordFirstLogin failed:', err);
  }

  // Send onboarding active email on first login (fire-and-forget — non-fatal)
  if (isFirstLogin) {
    sendOnboardingActiveEmail(userId).catch((err) => {
      console.error('[auth/verify] sendOnboardingActiveEmail failed:', err);
    });
  }

  // Determine redirect destination
  let destination = redirect;
  if (isFirstLogin || redirect === '/digest') {
    // For first-time users: check if they have any tracks configured
    // If not, send them to onboarding to pick their research interests
    try {
      const trackCount = await getUserTrackCount(userId);
      if (trackCount === 0) {
        destination = '/onboarding';
      }
    } catch (err) {
      console.error('[auth/verify] track count check failed:', err);
      // Fall through to original redirect on error
    }
  }

  const sessionCookie = createSessionCookie(userId);
  const response = NextResponse.redirect(new URL(destination, request.url));
  response.cookies.set('pb_session', sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: '/',
  });

  return response;
}
