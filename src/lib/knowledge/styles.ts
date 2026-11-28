import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { KNOWLEDGE_DIR, safeId } from '../paths';

/**
 * Presentation styles: how a brand's presentations of a given kind are built
 * (an investor pitch, a sales proposal, an internal update). They sit beside the
 * knowledge base in knowledge/<client>/_styles, one Markdown file each. Unlike
 * knowledge entries they are guidance, not facts: the agent follows them and
 * never cites them, and knowledge search does not return them.
 */

export const MAX_STYLES = 12;

export type PresentationStyle = { id: string; name: string; when: string; body: string; updated: string };

const oneLine = (max: number, message: string) =>
  z.string().trim().min(1, message).max(max).regex(/^[^<>\n\r]*$/, 'Use plain text on one line.');

export const styleInputSchema = z.object({
  name: oneLine(80, 'Give the style a name, like Investor pitch.'),
  when: z.string().trim().max(200).regex(/^[^<>\n\r]*$/, 'Use plain text on one line.').default(''),
  body: z.string().trim().min(20, 'Describe the style: how these presentations are structured and written.').max(8000),
});
export type StyleInput = z.infer<typeof styleInputSchema>;

export class StyleError extends Error {}

const dirOf = (client: string) => path.join(KNOWLEDGE_DIR, safeId(client), '_styles');
const ID = /^[a-z0-9][a-z0-9-]{0,59}$/;

function parse(id: string, raw: string): PresentationStyle {
  const meta: Record<string, string> = {};
  let body = raw;
  const header = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (header) {
    body = raw.slice(header[0].length);
    for (const l of header[1].split(/\r?\n/)) {
      const m = /^([a-z]+):\s*(.*)$/.exec(l);
      if (m) meta[m[1]] = m[2].trim();
    }
  }
  return { id, name: meta.name || id, when: meta.when ?? '', updated: meta.updated ?? '', body: body.trim() };
}

export function listStyles(client: string): PresentationStyle[] {
  const dir = dirOf(client);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md') && ID.test(f.slice(0, -3)))
    .map((f) => parse(f.slice(0, -3), fs.readFileSync(path.join(dir, f), 'utf8')))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '') || 'style';

function write(client: string, id: string, input: StyleInput) {
  const text = `---\nname: ${input.name}\nwhen: ${input.when}\nupdated: ${new Date().toISOString().slice(0, 10)}\n---\n\n${input.body}\n`;
  fs.mkdirSync(dirOf(client), { recursive: true });
  fs.writeFileSync(path.join(dirOf(client), `${id}.md`), text);
}

export function createStyle(client: string, input: StyleInput): PresentationStyle {
  const existing = listStyles(client);
  if (existing.length >= MAX_STYLES) throw new StyleError(`A brand holds up to ${MAX_STYLES} presentation styles. Remove one first.`);
  if (existing.some((s) => s.name.toLowerCase() === input.name.toLowerCase())) {
    throw new StyleError('There is already a style with that name.');
  }
  const base = slug(input.name);
  let id = base;
  for (let n = 2; existing.some((s) => s.id === id); n += 1) id = `${base}-${n}`;
  write(client, id, input);
  return listStyles(client).find((s) => s.id === id)!;
}

export function updateStyle(client: string, id: string, input: StyleInput): PresentationStyle {
  const existing = listStyles(client);
  if (!existing.some((s) => s.id === id)) throw new StyleError('That style no longer exists.');
  if (existing.some((s) => s.id !== id && s.name.toLowerCase() === input.name.toLowerCase())) {
    throw new StyleError('There is already a style with that name.');
  }
  write(client, id, input);
  return listStyles(client).find((s) => s.id === id)!;
}

export function deleteStyle(client: string, id: string) {
  if (!listStyles(client).some((s) => s.id === id)) throw new StyleError('That style no longer exists.');
  fs.rmSync(path.join(dirOf(client), `${id}.md`), { force: true });
}

/**
 * What the agent is told about styles for one deck. `choice` is a style id,
 * "none" for no style, or empty to let the agent pick the one that fits.
 */
export function styleGuidance(client: string, choice: string | undefined): string {
  if (choice === 'none') return '';
  let styles: PresentationStyle[] = [];
  try {
    styles = listStyles(client);
  } catch {
    return '';
  }
  if (styles.length === 0) return '';
  const block = (s: PresentationStyle) =>
    `<presentation_style name="${s.name.replace(/"/g, '')}">\n${s.when ? `Use for: ${s.when}\n\n` : ''}${s.body.replace(/<\/?presentation_style[^>]*>/gi, '')}\n</presentation_style>`;
  const rules =
    'A presentation style says how this brand builds presentations of one kind: their structure, length, tone and slide habits. ' +
    'It is guidance written by the team, not a source of facts: never cite it and never take figures or claims from it. ' +
    'The brand guide still governs look and voice, and the brief wins wherever it disagrees with the style.';
  const chosen = styles.find((s) => s.id === choice);
  if (chosen) return `${rules}\n\nThe person chose this style. Follow it.\n\n${block(chosen)}`;
  return `${rules}\n\nThe person did not choose a style. Use the one below that best fits the brief, and say which you used in your reply; if none fits, use none and say so.\n\n${styles.map(block).join('\n\n')}`;
}
