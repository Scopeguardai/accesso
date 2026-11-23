import path from 'node:path';

/** Repo root. Override with ACCESSO_ROOT when the app runs from another directory. */
export const ROOT = process.env.ACCESSO_ROOT ?? process.cwd();
export const BRANDS_DIR = path.join(ROOT, 'brands');
export const KNOWLEDGE_DIR = path.join(ROOT, 'knowledge');
export const DECKS_DIR = path.join(ROOT, 'data', 'decks');
export const SKILLS_DIR = path.join(ROOT, 'plugin', 'skills');

/** Ids become file names, so they must never contain path separators. */
export function safeId(value: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(value)) throw new Error(`Invalid id: ${value}`);
  return value;
}
