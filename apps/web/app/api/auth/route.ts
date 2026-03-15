import { NextRequest, NextResponse } from 'next/server';
import { createMagicToken } from '../../../lib/auth';
import { sendMagicLinkEmail } from '../../../lib/email/send-magic-link';
import { getServiceSupabase } from '../../../lib/supabase';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://paperbrief.ai';

/**
 * Look up a user's UUID by email via a direct SQL call.
 * Avoids auth.admin.listUsers() which is unreliable on free-tier Supabase.
 */
async function getUserIdByEmail(email: string): Promise<string | null> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .rpc('get_user_id_by_email', { p_email: email });
  if (error || !data) return null;
  return data as string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { email } = (await request.json()) as { email?: string };
    if (!email) {
      return NextResponse.json({ error: 'Missing email' }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    // Resolve the user's real UUID — create account if first login
    let userId = await getUserIdByEmail(email);
    if (!userId) {
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      if (createError || !created?.user) {
        console.error('[auth] Failed to create user:', createError);
        return NextResponse.json({ error: 'Failed to create magic link' }, { status: 500 });
      }
      userId = created.user.id;
    }

    const { token } = await createMagicToken(userId);
    const magicUrl = `${BASE_URL}/api/auth/verify?token=${token}&redirect=/dashboard`;

    const result = await sendMagicLinkEmail(email, magicUrl);

    if (!result.ok && !(result as any).skipped) {
      console.error('[auth] Failed to send magic link email:', (result as any).error);
      return NextResponse.json({ error: 'Failed to send magic link' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[auth][POST]', err);
    return NextResponse.json({ error: 'Failed to create magic link' }, { status: 500 });
  }
}
