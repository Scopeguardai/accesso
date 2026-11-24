import { cookies } from 'next/headers';

/** Which workspace columns the person has collapsed, remembered in a cookie so the page renders that way at once. */
export type LayoutPref = { projects: boolean; conversation: boolean };

export const LAYOUT_COOKIE = 'accesso_layout';

/** "10" means projects collapsed, conversation open. */
export async function readLayout(): Promise<LayoutPref> {
  const value = (await cookies()).get(LAYOUT_COOKIE)?.value ?? '';
  return { projects: value[0] === '1', conversation: value[1] === '1' };
}
