import { NextResponse, type NextRequest } from 'next/server';
import { passwordSet, SESSION_COOKIE, validSession } from '@/lib/auth';

/** Everything except the sign-in page needs the team password, once one is set. */
export function proxy(request: NextRequest) {
  if (!passwordSet()) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  const signedIn = validSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (pathname === '/api/login') return NextResponse.next();
  if (pathname === '/login') {
    return signedIn ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next();
  }
  if (signedIn) return NextResponse.next();
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }
  const login = new URL('/login', request.url);
  if (pathname !== '/') login.searchParams.set('next', pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|icon.svg|favicon.ico).*)'],
};
