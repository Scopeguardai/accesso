import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { DECKS_DIR, safeId } from '../paths';
import { deckSchema, type AgentEntry, type Deck, type Step, type ThreadEntry } from './schema';

/**
 * Decks are JSON files in data/decks. Good enough for one machine;
 * swap this module for a database before hosting for several users.
 */

const file = (id: string) => path.join(DECKS_DIR, `${safeId(id)}.json`);

export function newDeckId(): string {
  return randomBytes(5).toString('hex');
}

export function newEntryId(): string {
  return randomBytes(4).toString('hex');
}

/** The deck with this id, or null if there is none or its file cannot be read. */
export function readDeck(id: string): Deck | null {
  let raw: string;
  try {
    raw = fs.readFileSync(file(id), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  const parsed = deckSchema.safeParse((() => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  })());
  if (!parsed.success) {
    console.warn(`Deck ${id} could not be read and is being ignored: ${parsed.error.issues[0]?.message ?? 'invalid JSON'}`);
    return null;
  }
  return parsed.data;
}

export function writeDeck(deck: Deck): Deck {
  const next = { ...deck, updatedAt: new Date().toISOString() };
  fs.mkdirSync(DECKS_DIR, { recursive: true });
  const tmp = `${file(deck.id)}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, file(deck.id));
  return next;
}

/** Read, change and write in one step. All agent tools go through this. */
export function updateDeck(id: string, change: (deck: Deck) => void): Deck {
  const deck = readDeck(id);
  if (!deck) throw new Error(`Deck ${id} not found`);
  change(deck);
  return writeDeck(deck);
}

type NewEntry =
  | Omit<Extract<ThreadEntry, { role: 'user' }>, 'id' | 'at'>
  | Omit<AgentEntry, 'id' | 'at'>;

export function appendThread(id: string, entry: NewEntry): Deck {
  return updateDeck(id, (d) => {
    d.thread.push({ ...entry, id: newEntryId(), at: new Date().toISOString() } as ThreadEntry);
  });
}

function workingEntry(deck: Deck): AgentEntry | undefined {
  const last = deck.thread.at(-1);
  return last?.role === 'agent' && last.status === 'working' ? last : undefined;
}

/** Record a step on the agent run in progress. Does nothing if no run is in progress. */
export function logStep(id: string, kind: Step['kind'], text: string, ref?: string): void {
  updateDeck(id, (d) => {
    const entry = workingEntry(d);
    if (!entry) return;
    entry.steps.push({ kind, text: text.slice(0, 240), ref });
    if (entry.steps.length > 120) entry.steps.splice(0, entry.steps.length - 120);
  });
}

/** Close the agent run in progress with its reply or error. */
export function finishRun(id: string, status: 'done' | 'error', text: string, deckStatus: Deck['status']): Deck {
  return updateDeck(id, (d) => {
    const entry = workingEntry(d);
    if (entry) {
      entry.status = status;
      entry.text = text.slice(0, 2000);
    }
    d.status = deckStatus;
    d.statusNote = status === 'error' ? text.slice(0, 600) : undefined;
  });
}

/** A run that died with the server leaves the deck marked as working; close it. */
export function settleInterrupted(deck: Deck, running: boolean): Deck {
  const stale = Date.now() - Date.parse(deck.updatedAt) > 90_000;
  if (deck.status !== 'generating' || running || !stale) return deck;
  return finishRun(
    deck.id,
    'error',
    'This run was interrupted before it finished, probably because the app restarted. Send the request again.',
    deck.slides.length > 0 ? 'ready' : 'error',
  );
}

export type DeckSummary = {
  id: string;
  brand: string;
  title: string;
  status: Deck['status'];
  slideCount: number;
  updatedAt: string;
};

export const summarize = (d: Deck): DeckSummary => ({
  id: d.id,
  brand: d.brand,
  title: d.title,
  status: d.status,
  slideCount: d.slides.length,
  updatedAt: d.updatedAt,
});

/** Every readable deck, newest first. A file that fails to parse is skipped, not fatal. */
export function listDecks(): Deck[] {
  if (!fs.existsSync(DECKS_DIR)) return [];
  const decks: Deck[] = [];
  for (const f of fs.readdirSync(DECKS_DIR)) {
    const id = f.replace(/\.json$/, '');
    if (!f.endsWith('.json') || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(id)) continue;
    const d = readDeck(id);
    if (d) decks.push(d);
  }
  return decks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
