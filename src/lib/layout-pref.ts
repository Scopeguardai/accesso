import { cookies } from 'next/headers';

/**
 * How the person last arranged the workspace: which columns are collapsed and
 * how wide they dragged them. Kept in a cookie so the page renders that way at once.
 */
export type LayoutPref = {
  projects: boolean;
  conversation: boolean;
  /** Column widths in pixels; undefined means the default width. */
  projectsWidth?: number;
  conversationWidth?: number;
};

export const LAYOUT_COOKIE = 'accesso_layout';

const width = (raw: string | undefined, min: number, max: number) => {
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : undefined;
};

/** "10.260.480": projects collapsed, conversation open, widths 260 and 480 (0 for default). */
export async function readLayout(): Promise<LayoutPref> {
  const [flags = '', sb, mid] = ((await cookies()).get(LAYOUT_COOKIE)?.value ?? '').split('.');
  return {
    projects: flags[0] === '1',
    conversation: flags[1] === '1',
    projectsWidth: width(sb, 180, 480),
    conversationWidth: width(mid, 280, 1200),
  };
}
