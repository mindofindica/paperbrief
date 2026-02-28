import { NextRequest, NextResponse } from 'next/server';

const PROTECTED_PATHS = ['/digest', '/reading-list'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if path is protected
  const isProtected = PROTECTED_PATHS.some(p => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  // Allow token-based access (magic link click)
  const token = request.nextUrl.searchParams.get('token');
  if (token) {
    // Redirect to verify endpoint which will set cookie and redirect back
    const verifyUrl = new URL('/api/auth/verify', request.url);
    verifyUrl.searchParams.set('token', token);
    verifyUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(verifyUrl);
  }

  // Check session cookie
  const session = request.cookies.get('pb_session');
  if (!session?.value) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/digest/:path*', '/reading-list/:path*'],
};
