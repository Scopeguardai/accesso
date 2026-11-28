import fs from 'node:fs';
import path from 'node:path';
import { isRunning } from '../agent/run';
import { listDecks } from '../deck/store';
import { BRANDS_DIR, DECKS_DIR, KNOWLEDGE_DIR, ROOT, safeId } from '../paths';
import { isSearching } from './folder-agent';
import { isImporting } from './import';
import { SOURCES_DIR } from './sources';
import { clearBrandCache, listBrands, loadBrand } from './load';

/**
 * Deleting a brand moves everything that belongs to it (its pack, its files, its
 * knowledge base and its presentations) into data/trash, so it can be restored.
 * Nothing is erased.
 */

export const TRASH_DIR = path.join(ROOT, 'data', 'trash');

export class RemoveError extends Error {}

export type TrashItem = { id: string; brandId: string; name: string; deletedAt: string; decks: number };

type TrashInfo = { brandId: string; name: string; deletedAt: string; decks: string[] };

const PUBLIC_BRANDS = path.join(ROOT, 'public', 'brands');

/** Move a file or folder, copying when a plain rename cannot cross devices. */
function move(from: string, to: string) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try {
    fs.renameSync(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
    fs.cpSync(from, to, { recursive: true });
    fs.rmSync(from, { recursive: true, force: true });
  }
}

/** Move a set of paths, putting back the ones already moved if any move fails. */
function moveAll(pairs: [string, string][]) {
  const done: [string, string][] = [];
  try {
    for (const [from, to] of pairs) {
      if (!fs.existsSync(from)) continue;
      move(from, to);
      done.push([from, to]);
    }
  } catch (err) {
    for (const [from, to] of done.reverse()) {
      try {
        move(to, from);
      } catch {
        /* left in the trash folder, where it can still be found */
      }
    }
    throw err;
  }
}

/** What deleting a brand would take with it, for the confirmation. */
export function brandFootprint(brandId: string) {
  return { decks: listDecks().filter((d) => d.brand === brandId).map((d) => d.id) };
}

export function deleteBrand(brandId: string): TrashItem {
  if (!listBrands().includes(brandId)) throw new RemoveError('That brand no longer exists.');
  const id = safeId(brandId);
  if (isImporting(id) || isSearching(id)) throw new RemoveError('The agent is reading material for this brand. Wait for it to finish, then delete.');
  const { decks } = brandFootprint(id);
  if (decks.some((d) => isRunning(d))) {
    throw new RemoveError('The agent is working on one of this brand’s presentations. Wait for it to finish, then delete.');
  }
  let name = id;
  try {
    name = loadBrand(id).name;
  } catch {
    /* a damaged pack can still be deleted */
  }
  const deletedAt = new Date().toISOString();
  const trashId = `${deletedAt.replace(/[:.]/g, '-')}-${id}`;
  const into = path.join(TRASH_DIR, trashId);
  fs.mkdirSync(into, { recursive: true });
  const info: TrashInfo = { brandId: id, name, deletedAt, decks };
  fs.writeFileSync(path.join(into, 'info.json'), `${JSON.stringify(info, null, 2)}\n`);
  try {
    moveAll([
      // The presentations first and the pack last, so a failure never leaves decks without their brand.
      ...decks.map((d): [string, string] => [path.join(DECKS_DIR, `${d}.json`), path.join(into, 'decks', `${d}.json`)]),
      [path.join(KNOWLEDGE_DIR, id), path.join(into, 'knowledge')],
      [path.join(PUBLIC_BRANDS, id), path.join(into, 'public')],
      [path.join(SOURCES_DIR, id), path.join(into, 'sources')],
      [path.join(BRANDS_DIR, id), path.join(into, 'brand')],
    ]);
  } catch (err) {
    fs.rmSync(into, { recursive: true, force: true });
    throw err;
  }
  clearBrandCache(id);
  return { id: trashId, brandId: id, name, deletedAt, decks: decks.length };
}

export function listTrash(): TrashItem[] {
  if (!fs.existsSync(TRASH_DIR)) return [];
  const items: TrashItem[] = [];
  for (const entry of fs.readdirSync(TRASH_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const info = JSON.parse(fs.readFileSync(path.join(TRASH_DIR, entry.name, 'info.json'), 'utf8')) as TrashInfo;
      if (!fs.existsSync(path.join(TRASH_DIR, entry.name, 'brand', 'brand.json'))) continue;
      items.push({
        id: entry.name,
        brandId: String(info.brandId),
        name: String(info.name).replace(/[<>]/g, '').slice(0, 80),
        deletedAt: String(info.deletedAt),
        decks: Array.isArray(info.decks) ? info.decks.length : 0,
      });
    } catch {
      /* not a deleted brand */
    }
  }
  return items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

/** Put a deleted brand back with its files, knowledge base and presentations. Returns its id. */
export function restoreBrand(trashId: string): string {
  if (!/^[\w-]{1,120}$/.test(trashId)) throw new RemoveError('That deleted brand could not be found.');
  const from = path.join(TRASH_DIR, trashId);
  let info: TrashInfo;
  try {
    info = JSON.parse(fs.readFileSync(path.join(from, 'info.json'), 'utf8'));
  } catch {
    throw new RemoveError('That deleted brand could not be found.');
  }
  const id = safeId(info.brandId);
  if (fs.existsSync(path.join(BRANDS_DIR, id))) {
    throw new RemoveError(`A brand with the same name ("${id}") exists now. Delete or rename that one first.`);
  }
  const decks = (info.decks ?? []).map(safeId);
  if (decks.some((d) => fs.existsSync(path.join(DECKS_DIR, `${d}.json`)))) {
    throw new RemoveError('One of its presentations exists again, so it cannot be put back automatically.');
  }
  moveAll([
    [path.join(from, 'brand'), path.join(BRANDS_DIR, id)],
    [path.join(from, 'public'), path.join(PUBLIC_BRANDS, id)],
    [path.join(from, 'knowledge'), path.join(KNOWLEDGE_DIR, id)],
    [path.join(from, 'sources'), path.join(SOURCES_DIR, id)],
    ...decks.map((d): [string, string] => [path.join(from, 'decks', `${d}.json`), path.join(DECKS_DIR, `${d}.json`)]),
  ]);
  fs.rmSync(from, { recursive: true, force: true });
  clearBrandCache(id);
  return id;
}
