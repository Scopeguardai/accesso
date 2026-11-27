import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * One shared team password, set as ACCESSO_PASSWORD. Signing in stores a cookie
 * derived from the password, so changing the password signs everyone out.
 * With no password set the app is open, as it was before sign-in existed.
 */

export const SESSION_COOKIE = 'accesso_session';
export const SESSION_DAYS = 30;

const password = () => process.env.ACCESSO_PASSWORD?.trim() ?? '';

export const passwordSet = () => password().length > 0;

const same = (a: string, b: string) => {
  const [x, y] = [Buffer.from(a), Buffer.from(b)];
  return x.length === y.length && timingSafeEqual(x, y);
};

export const sessionToken = () => createHmac('sha256', password()).update('accesso-session-v1').digest('hex');

export const validSession = (cookie: string | undefined) => passwordSet() && !!cookie && same(cookie, sessionToken());

export const passwordMatches = (attempt: string) =>
  // Compared as digests so the comparison takes the same time whatever the lengths.
  passwordSet() && same(createHmac('sha256', 'cmp').update(attempt).digest('hex'), createHmac('sha256', 'cmp').update(password()).digest('hex'));

/** Where to go after signing in: only a path inside this app. */
export const safeNext = (next: string | null | undefined) =>
  next && /^\/(?![/\\])[\w\-./?=&%]*$/.test(next) && !next.startsWith('/login') ? next : '/';
