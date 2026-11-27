import { NextResponse } from 'next/server';
import { passwordMatches, passwordSet, SESSION_COOKIE, SESSION_DAYS, sessionToken } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Wrong guesses are counted per address so the password cannot be tried at speed.
const store = globalThis as typeof globalThis & { __accessoLoginTries?: Map<string, { n: number; until: number }> };
const tries = (store.__accessoLoginTries ??= new Map());
const WINDOW_MS = 10 * 60_000;
const MAX_TRIES = 8;

const cookie = (request: Request, value: string, maxAge: number) => ({
  name: SESSION_COOKIE,
  value,
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: (request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol).startsWith('https'),
  path: '/',
  maxAge,
});

/** Sign in with the team password. */
export async function POST(request: Request) {
  if (!passwordSet()) return NextResponse.json({ error: 'No team password is set, so there is nothing to sign in to.' }, { status: 400 });
  const who = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  const now = Date.now();
  const seen = tries.get(who);
  if (seen && seen.until > now && seen.n >= MAX_TRIES) {
    return NextResponse.json({ error: 'Too many wrong tries. Wait ten minutes and try again.' }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const attempt = typeof body?.password === 'string' ? body.password.slice(0, 500) : '';
  if (!passwordMatches(attempt)) {
    tries.set(who, { n: seen && seen.until > now ? seen.n + 1 : 1, until: now + WINDOW_MS });
    if (tries.size > 5000) tries.clear();
    return NextResponse.json({ error: 'That password is not right.' }, { status: 401 });
  }
  tries.delete(who);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(cookie(request, sessionToken(), SESSION_DAYS * 86_400));
  return res;
}

/** Sign out. */
export async function DELETE(request: Request) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(cookie(request, '', 0));
  return res;
}
