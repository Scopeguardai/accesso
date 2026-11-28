import fs from 'node:fs';
import path from 'node:path';
import { KNOWLEDGE_DIR, safeId } from '../paths';
import { firstParagraph, parseEntry, type KnowledgeSummary } from './format';

/**
 * The knowledge base is plain Markdown under knowledge/<client>/.
 * Each file has a small header (title, tags, source, updated) and a body.
 * Search is keyword scoring over those files: no index, no service.
 * When a client's folder grows past a few hundred files, put a search
 * index behind `searchKnowledge` and keep the same return shape.
 */

export type KnowledgeEntry = {
  /** Path relative to knowledge/, e.g. "fossefall/platform.md". Used as the citation. */
  path: string;
  title: string;
  tags: string[];
  source: string;
  updated: string;
  status: string;
  body: string;
};

export type KnowledgeHit = Omit<KnowledgeEntry, 'body'> & { score: number; snippet: string };

function parse(relPath: string, raw: string): KnowledgeEntry {
  return { path: relPath, ...parseEntry(raw, path.basename(relPath, '.md')) };
}

export function summarizeEntry({ body, ...rest }: KnowledgeEntry): KnowledgeSummary {
  return { ...rest, snippet: firstParagraph(body) };
}

export function listKnowledge(client: string): KnowledgeEntry[] {
  const dir = path.join(KNOWLEDGE_DIR, safeId(client));
  if (!fs.existsSync(dir)) return [];
  const out: KnowledgeEntry[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      // Folders starting with _ hold other things (presentation styles), not knowledge entries.
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('_')) walk(full);
      }
      else if (entry.name.endsWith('.md') && !entry.name.startsWith('_')) {
        const rel = path.relative(KNOWLEDGE_DIR, full).split(path.sep).join('/');
        out.push(parse(rel, fs.readFileSync(full, 'utf8')));
      }
    }
  };
  walk(dir);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** A client may only read inside its own folder. */
export function readKnowledge(client: string, relPath: string): KnowledgeEntry | null {
  return listKnowledge(client).find((e) => e.path === relPath) ?? null;
}

const STOP = new Set(
  'a an and are as at be by for from has have how in is it its of on or our that the their this to was we what when which who why with'.split(
    ' ',
  ),
);

const terms = (text: string) =>
  (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => t.length > 1 && !STOP.has(t));

function snippet(body: string, query: string[]): string {
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim());
  let best = paragraphs[0] ?? '';
  let bestScore = -1;
  for (const p of paragraphs) {
    const lower = p.toLowerCase();
    const score = query.reduce((n, t) => n + (lower.includes(t) ? 1 : 0), 0);
    if (score > bestScore) [best, bestScore] = [p, score];
  }
  return best.length > 320 ? `${best.slice(0, 317)}...` : best;
}

export function searchKnowledge(client: string, query: string, limit = 5): KnowledgeHit[] {
  const q = [...new Set(terms(query))];
  const entries = listKnowledge(client);
  if (q.length === 0) {
    return entries.slice(0, limit).map(({ body, ...rest }) => ({ ...rest, score: 0, snippet: snippet(body, []) }));
  }
  return entries
    .map(({ body, ...rest }) => {
      const title = terms(rest.title);
      const text = terms(body);
      let score = 0;
      for (const t of q) {
        if (title.includes(t)) score += 5;
        if (rest.tags.some((tag) => tag.includes(t))) score += 4;
        const count = text.filter((w) => w === t || w.startsWith(t)).length;
        if (count) score += 1 + Math.min(count, 5) * 0.5;
      }
      return { ...rest, score, snippet: snippet(body, q) };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
