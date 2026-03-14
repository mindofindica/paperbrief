import { NextRequest, NextResponse } from 'next/server';
import { createMagicToken } from '../../../lib/auth';
import { sendMagicLinkEmail } from '../../../lib/email/send-magic-link';
import { getServiceSupabase } from '../../../lib/supabase';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://paperbrief.ai';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { email } = (await request.json()) as { email?: string };
    if (!email) {
      return NextResponse.json({ error: 'Missing email' }, { status: 400 });
    }

    // Look up (or create) the user in Supabase auth to get their real UUID
    const supabase = getServiceSupabase();
    let userId: string;

    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existing = (existingUsers?.users ?? []).find(u => u.email === email);

    if (existing) {
      userId = existing.id;
    } else {
      // Create the user so they get a stable UUID
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
