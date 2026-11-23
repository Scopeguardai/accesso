/**
 * The knowledge-entry file format: a small header between --- lines, then
 * the text. No file system access here, so the browser can use it too
 * (for example to read the header of an uploaded .md file).
 */

export const STATUSES = ['draft', 'verified'] as const;
export type EntryStatus = (typeof STATUSES)[number];

export type EntryMeta = {
  title: string;
  tags: string[];
  source: string;
  updated: string;
  status: string;
};

/** What lists and search results show about an entry. */
export type KnowledgeSummary = EntryMeta & { path: string; snippet: string; score?: number };

const HEADER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseEntry(raw: string, fallbackTitle = 'Untitled'): EntryMeta & { body: string } {
  const meta: Record<string, string> = {};
  let body = raw;
  const match = HEADER.exec(raw);
  if (match) {
    body = raw.slice(match[0].length);
    for (const line of match[1].split(/\r?\n/)) {
      const m = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
      if (m) meta[m[1].toLowerCase()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return {
    title: meta.title || fallbackTitle,
    tags: splitTags(meta.tags ?? ''),
    source: meta.source ?? '',
    updated: meta.updated ?? '',
    status: meta.status ?? '',
    body: body.trim(),
  };
}

export function splitTags(value: string): string[] {
  return [
    ...new Set(
      value
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

/** Header values are single lines; brackets and commas would break the tag list. */
const line = (v: string) => v.replace(/[\r\n]+/g, ' ').trim();

export function serializeEntry(meta: EntryMeta, body: string): string {
  const tags = meta.tags.map((t) => line(t).replace(/[[\],]/g, '')).filter(Boolean);
  return [
    '---',
    `title: ${line(meta.title)}`,
    `tags: [${tags.join(', ')}]`,
    `source: ${line(meta.source)}`,
    `updated: ${line(meta.updated)}`,
    `status: ${line(meta.status)}`,
    '---',
    '',
    body.trim(),
    '',
  ].join('\n');
}

/** The first paragraph, shortened: what a list shows under the title. */
export function firstParagraph(body: string, max = 220): string {
  const p = body.split(/\n\s*\n/).map((s) => s.replace(/\s+/g, ' ').trim()).find(Boolean) ?? '';
  return p.length > max ? `${p.slice(0, max - 1).trimEnd()}…` : p;
}
