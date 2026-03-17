import { NextRequest, NextResponse } from 'next/server';
import { createSessionCookie } from '../../../../lib/auth';
import { getServiceSupabase } from '../../../../lib/supabase';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { email, password } = (await request.json()) as { email?: string; password?: string };
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    // Use Supabase Auth to verify credentials
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Create our custom session cookie (same as magic link flow)
    const sessionCookie = createSessionCookie(data.user.id);

    const response = NextResponse.json({ ok: true });
    response.cookies.set('pb_session', sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (err) {
    console.error('[auth/password][POST]', err);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
