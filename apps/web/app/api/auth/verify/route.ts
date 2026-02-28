import { NextRequest, NextResponse } from 'next/server';
import { verifyMagicToken, createSessionCookie } from '../../../../lib/auth';

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

  const sessionCookie = createSessionCookie(result.userId!);
  const response = NextResponse.redirect(new URL(redirect, request.url));
  response.cookies.set('pb_session', sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: '/',
  });

  return response;
}
