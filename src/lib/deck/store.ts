import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { DECKS_DIR, safeId } from '../paths';
import { deckSchema, type Deck } from './schema';

/**
 * Decks are JSON files in data/decks. Good enough for one machine;
 * swap this module for a database before hosting for several users.
 */

const file = (id: string) => path.join(DECKS_DIR, `${safeId(id)}.json`);

export function newDeckId(): string {
  return randomBytes(5).toString('hex');
}

export function readDeck(id: string): Deck | null {
  try {
    return deckSchema.parse(JSON.parse(fs.readFileSync(file(id), 'utf8')));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
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

export function logActivity(id: string, text: string): void {
  updateDeck(id, (d) => {
    d.activity.push({ at: new Date().toISOString(), text: text.slice(0, 300) });
    if (d.activity.length > 60) d.activity.splice(0, d.activity.length - 60);
  });
}

export function listDecks(): Deck[] {
  if (!fs.existsSync(DECKS_DIR)) return [];
  return fs
    .readdirSync(DECKS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readDeck(f.replace(/\.json$/, '')))
    .filter((d): d is Deck => d !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
