'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSessionCookie } from '../../../lib/auth';
import { getServiceSupabase } from '../../../lib/supabase';

export async function loginWithPassword(
  _prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Email and password required' };
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return { error: 'Invalid email or password' };
  }

  const sessionCookie = createSessionCookie(data.user.id);
  const cookieStore = await cookies();
  cookieStore.set('pb_session', sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60,
    path: '/',
  });

  redirect('/dashboard');
}
