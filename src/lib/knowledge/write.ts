import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { listDecks } from '../deck/store';
import { KNOWLEDGE_DIR, safeId } from '../paths';
import { serializeEntry, splitTags, STATUSES } from './format';
import { listKnowledge, type KnowledgeEntry } from './search';

/**
 * Adding, changing and deleting knowledge entries from the app.
 * An entry can only be changed or deleted if it is one that listKnowledge
 * already returns for that client, so no request can reach a file outside
 * the client's own folder.
 */

export const entryInputSchema = z.object({
  title: z.string().trim().min(1, 'Give the entry a title.').max(160),
  tags: z.union([z.array(z.string()), z.string()]).transform((t) => (Array.isArray(t) ? splitTags(t.join(',')) : splitTags(t))),
  source: z.string().trim().max(300).default(''),
  status: z.enum(STATUSES).default('draft'),
  body: z.string().trim().min(1, 'Write the text the agent may use.').max(50_000),
});
export type EntryInput = z.infer<typeof entryInputSchema>;

export class EntryNotFound extends Error {}

const today = () => new Date().toISOString().slice(0, 10);

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return slug || 'entry';
}

function existing(client: string, relPath: string): KnowledgeEntry {
  const entry = listKnowledge(client).find((e) => e.path === relPath);
  if (!entry) throw new EntryNotFound(`No knowledge entry at ${relPath}`);
  return entry;
}

const fileOf = (relPath: string) => path.join(KNOWLEDGE_DIR, ...relPath.split('/'));

/** Write a new entry and return its path, e.g. "fossefall/funding.md". */
export function createEntry(client: string, input: EntryInput): string {
  const dir = path.join(KNOWLEDGE_DIR, safeId(client));
  fs.mkdirSync(dir, { recursive: true });
  const slug = slugify(input.title);
  let name = `${slug}.md`;
  for (let n = 2; fs.existsSync(path.join(dir, name)); n++) name = `${slug}-${n}.md`;
  fs.writeFileSync(path.join(dir, name), serializeEntry({ ...input, updated: today() }, input.body), { flag: 'wx' });
  return `${client}/${name}`;
}

export function updateEntry(client: string, relPath: string, input: EntryInput): void {
  const entry = existing(client, relPath);
  fs.writeFileSync(fileOf(entry.path), serializeEntry({ ...input, updated: today() }, input.body));
}

export function deleteEntry(client: string, relPath: string): void {
  const entry = existing(client, relPath);
  fs.unlinkSync(fileOf(entry.path));
}

/** Which presentations cite an entry, and on which slides. */
export function entryUsage(client: string, relPath: string) {
  return listDecks()
    .filter((d) => d.client === client)
    .map((d) => ({
      id: d.id,
      title: d.title,
      slides: d.slides.flatMap((s, i) => (s.sources?.includes(relPath) ? [i + 1] : [])),
    }))
    .filter((u) => u.slides.length > 0);
}

