import fs from 'node:fs';
import path from 'node:path';
import { ROOT, safeId } from '../paths';
import { fontFormat, imageInfo, sanitizeSvg } from './assets';
import { cleanPath, ext, kindOf, MAX_FILE, UNUSABLE, type SourceKind } from './source-types';

/**
 * A brand's folder: the client's own files (logos, fonts, photos, guidelines and
 * notes), copied in from someone's computer as a folder or a zip. The agent searches
 * it for brand assets. It lives in data/sources/<brand>, which is never committed.
 *
 * Everything that reads a source goes through listFiles and readFile, so another
 * place to search (a Google Drive or SharePoint folder) can be added beside this one.
 */

export const SOURCES_DIR = path.join(ROOT, 'data', 'sources');

export type { SourceKind } from './source-types';
export { cleanPath, kindOf } from './source-types';
export type SourceFile = { path: string; kind: SourceKind; size: number };
export type Skipped = { path: string; reason: string };

export class SourceFileError extends Error {}

const MAX_TOTAL = 600_000_000;
const MAX_FILES = 800;
const MAX_ZIP_FILES = 2000;

const dirOf = (brandId: string) => path.join(SOURCES_DIR, safeId(brandId));

function walk(root: string, rel = ''): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(root, p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

export function listFiles(brandId: string): SourceFile[] {
  const root = dirOf(brandId);
  return walk(root)
    .map((p) => ({ path: p, kind: kindOf(p), size: fs.statSync(path.join(root, p)).size }))
    .filter((f): f is SourceFile => f.kind !== null)
    .sort((a, b) => a.path.localeCompare(b.path));
}

function fullPath(brandId: string, rel: string): string {
  const clean = cleanPath(rel);
  if (!clean) throw new SourceFileError('That file is not in the brand folder.');
  const root = dirOf(brandId);
  const full = path.join(root, clean);
  if (!full.startsWith(root + path.sep)) throw new SourceFileError('That file is not in the brand folder.');
  return full;
}

export function readFile(brandId: string, rel: string): Buffer {
  const full = fullPath(brandId, rel);
  if (!kindOf(full) || !fs.existsSync(full)) throw new SourceFileError('That file is not in the brand folder.');
  return fs.readFileSync(full);
}

/** Check a file's contents match its type, so a renamed file cannot pass as a font or photo. */
function contentProblem(rel: string, buf: Buffer): string | null {
  const kind = kindOf(rel);
  if (kind === 'font' && !fontFormat(buf)) return 'Not a font file, despite its name.';
  if (kind === 'image' && !imageInfo(buf)) return 'Not a JPG, PNG or WebP image, despite its name.';
  if (kind === 'logo') {
    try {
      sanitizeSvg(buf.toString('utf8'), 'Logo');
    } catch {
      return 'This SVG has no shapes that can be used.';
    }
  }
  if (ext(rel) === 'pdf' && buf.subarray(0, 5).toString('latin1') !== '%PDF-') return 'Not a PDF, despite its name.';
  if (['docx', 'pptx'].includes(ext(rel)) && buf.subarray(0, 2).toString('latin1') !== 'PK') return 'Not a Word or PowerPoint file.';
  return null;
}

/** Expand a zip into named files. Sizes are checked before anything is unpacked. */
async function unzip(name: string, buf: Buffer): Promise<{ files: { path: string; bytes: Buffer }[]; skipped: Skipped[] }> {
  const { unzipSync } = await import('fflate');
  const skipped: Skipped[] = [];
  let total = 0;
  let count = 0;
  let unpacked: Record<string, Uint8Array>;
  try {
    unpacked = unzipSync(new Uint8Array(buf), {
      filter: (file) => {
        if (file.name.endsWith('/')) return false;
        count += 1;
        const rel = cleanPath(file.name);
        if (!rel || count > MAX_ZIP_FILES) return false;
        const k = kindOf(rel);
        if (!k) {
          const why = UNUSABLE[ext(rel)];
          if (why) skipped.push({ path: rel, reason: why });
          return false;
        }
        if (file.originalSize > MAX_FILE) {
          skipped.push({ path: rel, reason: 'Too large (over 60 MB).' });
          return false;
        }
        total += file.originalSize;
        if (total > MAX_TOTAL) throw new SourceFileError('That zip unpacks to more than 600 MB. Split it up.');
        return true;
      },
    });
  } catch (err) {
    if (err instanceof SourceFileError) throw err;
    throw new SourceFileError(`${name} could not be opened as a zip file.`);
  }
  return {
    // Paths inside the zip are kept as they are, so a zip of a folder lands where choosing the folder would.
    files: Object.entries(unpacked).map(([p, bytes]) => ({ path: cleanPath(p) ?? p, bytes: Buffer.from(bytes) })),
    skipped,
  };
}

/** Add files (paths relative to the chosen folder). Zips are unpacked; unusable files are listed, not kept. */
export async function addFiles(
  brandId: string,
  incoming: { path: string; bytes: Buffer }[],
): Promise<{ added: string[]; skipped: Skipped[] }> {
  const root = dirOf(brandId);
  const added: string[] = [];
  const skipped: Skipped[] = [];
  const existing = listFiles(brandId);
  let total = existing.reduce((n, f) => n + f.size, 0);
  let count = existing.length;

  const queue = [...incoming];
  while (queue.length > 0) {
    const item = queue.shift()!;
    const rel = cleanPath(item.path);
    if (!rel) continue;
    if (ext(rel) === 'zip') {
      const { files, skipped: inZip } = await unzip(rel, item.bytes);
      queue.push(...files);
      skipped.push(...inZip);
      continue;
    }
    if (!kindOf(rel)) {
      const why = UNUSABLE[ext(rel)];
      if (why) skipped.push({ path: rel, reason: why });
      continue;
    }
    if (item.bytes.length > MAX_FILE) {
      skipped.push({ path: rel, reason: 'Too large (over 60 MB).' });
      continue;
    }
    const problem = contentProblem(rel, item.bytes);
    if (problem) {
      skipped.push({ path: rel, reason: problem });
      continue;
    }
    if (count + 1 > MAX_FILES || total + item.bytes.length > MAX_TOTAL) {
      skipped.push({ path: rel, reason: 'The brand folder is full (800 files or 600 MB).' });
      continue;
    }
    const full = path.join(root, rel);
    if (!full.startsWith(root + path.sep)) continue;
    const replacing = fs.existsSync(full) ? fs.statSync(full).size : 0;
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, item.bytes);
    total += item.bytes.length - replacing;
    if (!replacing) count += 1;
    added.push(rel);
  }
  return { added, skipped };
}

export function removeFile(brandId: string, rel: string) {
  const full = fullPath(brandId, rel);
  fs.rmSync(full, { force: true });
  // Tidy empty folders left behind, up to the brand folder itself.
  const root = dirOf(brandId);
  for (let dir = path.dirname(full); dir.startsWith(root + path.sep); dir = path.dirname(dir)) {
    if (fs.readdirSync(dir).length > 0) break;
    fs.rmdirSync(dir);
  }
}

export function clearFiles(brandId: string) {
  fs.rmSync(dirOf(brandId), { recursive: true, force: true });
}

/* ---------- reading what is inside ---------- */

/** The family and style names stored inside a TTF or OTF font. Compressed web fonts give nothing. */
export function fontNames(buf: Buffer): { family?: string; style?: string } {
  try {
    const tag = buf.subarray(0, 4).toString('latin1');
    if (tag !== '\u0000\u0001\u0000\u0000' && tag !== 'OTTO' && tag !== 'true') return {};
    const tables = buf.readUInt16BE(4);
    let nameOffset = -1;
    for (let i = 0; i < tables; i += 1) {
      const rec = 12 + i * 16;
      if (buf.subarray(rec, rec + 4).toString('latin1') === 'name') nameOffset = buf.readUInt32BE(rec + 8);
    }
    if (nameOffset < 0) return {};
    const count = buf.readUInt16BE(nameOffset + 2);
    const strings = nameOffset + buf.readUInt16BE(nameOffset + 4);
    const found: Record<number, string> = {};
    for (let i = 0; i < count; i += 1) {
      const r = nameOffset + 6 + i * 12;
      const [platform, , language, nameId, length, offset] = [0, 2, 4, 6, 8, 10].map((o) => buf.readUInt16BE(r + o));
      if (![1, 2, 16, 17].includes(nameId)) continue;
      const raw = buf.subarray(strings + offset, strings + offset + length);
      let text = '';
      if (platform === 3 || platform === 0) {
        for (let k = 0; k + 1 < raw.length; k += 2) text += String.fromCharCode(raw.readUInt16BE(k));
      } else if (platform === 1 && language === 0) text = raw.toString('latin1');
      if (text && (!found[nameId] || platform === 3)) found[nameId] = text.replace(/[\u0000<>]/g, '').trim();
    }
    return { family: found[16] || found[1], style: found[17] || found[2] };
  } catch {
    return {};
  }
}

const xmlText = (xml: string, paragraph: RegExp) =>
  xml
    .replace(paragraph, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;|&gt;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** The readable text of a document in the folder, cut to a size the agent can take in. */
export async function documentText(brandId: string, rel: string, maxChars = 40_000): Promise<string> {
  const buf = readFile(brandId, rel);
  const e = ext(rel);
  let text = '';
  if (e === 'md' || e === 'txt') text = buf.toString('utf8');
  else if (e === 'pdf') {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const pages = (await extractText(pdf, { mergePages: false })).text;
    text = pages.map((t, i) => `--- Page ${i + 1} ---\n${t.trim()}`).join('\n\n');
  } else if (e === 'docx' || e === 'pptx') {
    const { unzipSync } = await import('fflate');
    const parts = unzipSync(new Uint8Array(buf), {
      filter: (f) =>
        f.originalSize < 20_000_000 &&
        (e === 'docx' ? f.name === 'word/document.xml' : /^ppt\/slides\/slide\d+\.xml$/.test(f.name)),
    });
    const names = Object.keys(parts).sort((a, b) => Number(a.match(/\d+/)?.[0] ?? 0) - Number(b.match(/\d+/)?.[0] ?? 0));
    text = names
      .map((n, i) => {
        const xml = Buffer.from(parts[n]).toString('utf8');
        return e === 'docx' ? xmlText(xml, /<\/w:p>/g) : `--- Slide ${i + 1} ---\n${xmlText(xml, /<\/a:p>/g)}`;
      })
      .join('\n\n');
  }
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n\n[The document continues; the rest was left out.]` : text;
}

/** A small JPEG of a photo or logo, for the agent to look at and for previews. */
export async function previewImage(brandId: string, rel: string, size = 768): Promise<Buffer> {
  const buf = readFile(brandId, rel);
  const sharp = (await import('sharp')).default;
  const input = kindOf(rel) === 'logo' ? Buffer.from(sanitizeSvg(buf.toString('utf8'), 'Logo').replace('currentColor', '#1c1f1d')) : buf;
  return sharp(input, { density: kindOf(rel) === 'logo' ? 300 : 72, limitInputPixels: 120_000_000 })
    .rotate()
    .resize(size, size, { fit: 'inside', withoutEnlargement: kindOf(rel) !== 'logo' })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 78 })
    .toBuffer();
}

/** A photo made ready for the image library: turned upright and kept under the library's size limit. */
export async function libraryImage(brandId: string, rel: string): Promise<Buffer> {
  const buf = readFile(brandId, rel);
  const sharp = (await import('sharp')).default;
  return sharp(buf, { limitInputPixels: 120_000_000 })
    .rotate()
    .resize(2400, 2400, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();
}

/** A CSS weight for a font file: the full range for a variable font, otherwise from its style name. */
export function fontWeight(buf: Buffer, style = ''): string {
  try {
    const tables = buf.readUInt16BE(4);
    for (let i = 0; i < tables; i += 1) {
      if (buf.subarray(12 + i * 16, 16 + i * 16).toString('latin1') === 'fvar') return '100 900';
    }
  } catch {
    /* not a plain font file */
  }
  const s = style.toLowerCase().replace(/italic|oblique/g, '');
  const scale: [RegExp, string][] = [
    [/thin|hairline/, '100'],
    [/extra\s*light|ultra\s*light/, '200'],
    [/light/, '300'],
    [/medium/, '500'],
    [/semi\s*bold|demi/, '600'],
    [/extra\s*bold|ultra\s*bold/, '800'],
    [/black|heavy/, '900'],
    [/bold/, '700'],
  ];
  return scale.find(([re]) => re.test(s))?.[1] ?? '400';
}
