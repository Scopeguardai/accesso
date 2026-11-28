import fs from 'node:fs';
import path from 'node:path';
import { ROOT, safeId } from '../paths';

/**
 * Example presentations: decks a brand has made before (PDF or PowerPoint), uploaded so
 * the agent can study how they are built and draft a presentation style from them.
 * They are kept in data/examples/<brand>, never committed, and are only ever read.
 */

export const EXAMPLES_DIR = path.join(ROOT, 'data', 'examples');
export const MAX_EXAMPLES = 5;
const MAX_BYTES = 66_000_000;

export class ExampleError extends Error {}

export type ExampleFile = { file: string; name: string; kind: 'pdf' | 'pptx'; size: number };
export type ExampleSlide = { text: string; layout?: string; pictures?: number; charts?: number; tables?: number };
export type ExampleDeck = ExampleFile & { slides: ExampleSlide[]; canView: boolean };

const dirOf = (brand: string) => path.join(EXAMPLES_DIR, safeId(brand));
const FILE = /^\d{1,2}-[\w ()&+-]{1,80}\.(pdf|pptx)$/;

export function listExamples(brand: string): ExampleFile[] {
  const dir = dirOf(brand);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => FILE.test(f))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    .map((f) => ({
      file: f,
      name: f.replace(/^\d+-/, ''),
      kind: f.endsWith('.pdf') ? ('pdf' as const) : ('pptx' as const),
      size: fs.statSync(path.join(dir, f)).size,
    }));
}

export function saveExample(brand: string, name: string, bytes: Buffer): ExampleFile {
  const ext = name.toLowerCase().endsWith('.pdf') ? 'pdf' : name.toLowerCase().endsWith('.pptx') ? 'pptx' : null;
  if (!ext) {
    throw new ExampleError(
      /\.(ppt|key|odp)$/i.test(name)
        ? 'That kind of presentation file cannot be read. Export it as a PDF and upload that.'
        : 'Upload presentations as PDF or PowerPoint (.pptx) files.',
    );
  }
  if (bytes.length > MAX_BYTES) throw new ExampleError('That presentation is too large (over 65 MB). Export a smaller PDF.');
  const magic = bytes.subarray(0, 5).toString('latin1');
  if (ext === 'pdf' ? magic !== '%PDF-' : !magic.startsWith('PK')) throw new ExampleError(`${name} is not a real ${ext === 'pdf' ? 'PDF' : 'PowerPoint'} file.`);
  const existing = listExamples(brand);
  if (existing.length >= MAX_EXAMPLES) throw new ExampleError(`Up to ${MAX_EXAMPLES} example presentations at a time. Remove one first.`);
  const clean = name.replace(/\.[^.]+$/, '').replace(/[^\w ()&+-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70) || 'Presentation';
  const next = (existing.reduce((n, e) => Math.max(n, parseInt(e.file, 10)), 0) + 1) % 100;
  const file = `${next}-${clean}.${ext}`;
  fs.mkdirSync(dirOf(brand), { recursive: true });
  fs.writeFileSync(path.join(dirOf(brand), file), bytes);
  return { file, name: `${clean}.${ext}`, kind: ext, size: bytes.length };
}

export function removeExample(brand: string, file: string) {
  if (!listExamples(brand).some((e) => e.file === file)) throw new ExampleError('That example is no longer there.');
  fs.rmSync(path.join(dirOf(brand), file), { force: true });
}

export function clearExamples(brand: string) {
  for (const e of listExamples(brand)) fs.rmSync(path.join(dirOf(brand), e.file), { force: true });
}

const bytesOf = (brand: string, e: ExampleFile) => fs.readFileSync(path.join(dirOf(brand), e.file));

const xmlText = (xml: string) =>
  [...xml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)]
    .map((p) => [...p[0].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => t[1]).join(''))
    .filter((t) => t.trim())
    .join('\n')
    .replace(/&amp;/g, '&')
    .replace(/&lt;|&gt;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

/** The slides of an example, as text with what is known about each slide's make-up. */
export async function readExample(brand: string, e: ExampleFile): Promise<ExampleDeck> {
  const buf = bytesOf(brand, e);
  if (e.kind === 'pdf') {
    try {
      const { extractText, getDocumentProxy } = await import('unpdf');
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const pages = (await extractText(pdf, { mergePages: false })).text;
      return { ...e, slides: pages.slice(0, 80).map((text) => ({ text: text.trim() })), canView: true };
    } catch {
      throw new ExampleError(`${e.name} could not be read. It may be damaged or password-protected.`);
    }
  }
  try {
    const { unzipSync } = await import('fflate');
    const parts = unzipSync(new Uint8Array(buf), {
      filter: (f) => f.originalSize < 30_000_000 && /^ppt\/(slides\/(_rels\/)?slide\d+\.xml(\.rels)?|slideLayouts\/slideLayout\d+\.xml)$/.test(f.name),
    });
    const text = (name: string) => (parts[name] ? Buffer.from(parts[name]).toString('utf8') : '');
    const numbers = Object.keys(parts)
      .map((n) => /^ppt\/slides\/slide(\d+)\.xml$/.exec(n)?.[1])
      .filter((n): n is string => !!n)
      .map(Number)
      .sort((a, b) => a - b);
    const slides = numbers.slice(0, 80).map((n) => {
      const xml = text(`ppt/slides/slide${n}.xml`);
      const layoutFile = /Target="\.\.\/slideLayouts\/(slideLayout\d+\.xml)"/.exec(text(`ppt/slides/_rels/slide${n}.xml.rels`))?.[1];
      const layout = layoutFile ? /<p:cSld[^>]*\sname="([^"]*)"/.exec(text(`ppt/slideLayouts/${layoutFile}`))?.[1] : undefined;
      return {
        text: xmlText(xml),
        layout: layout?.replace(/[<>]/g, '').slice(0, 60),
        pictures: (xml.match(/<p:pic\b/g) ?? []).length,
        charts: (xml.match(/<c:chart\b/g) ?? []).length,
        tables: (xml.match(/<a:tbl\b/g) ?? []).length,
      };
    });
    if (slides.length === 0) throw new Error('no slides');
    return { ...e, slides, canView: false };
  } catch {
    throw new ExampleError(`${e.name} could not be read as a PowerPoint file. Export it as a PDF and upload that.`);
  }
}

/** A picture of one slide of a PDF example, for the agent to look at its layout. */
export async function slideImage(brand: string, e: ExampleFile, slide: number): Promise<Buffer> {
  if (e.kind !== 'pdf') throw new ExampleError('Only PDF examples can be looked at.');
  const { renderPageAsImage } = await import('unpdf');
  const png = await renderPageAsImage(new Uint8Array(bytesOf(brand, e)), slide, {
    canvasImport: () => import('@napi-rs/canvas'),
    width: 1024,
  });
  const sharp = (await import('sharp')).default;
  return sharp(Buffer.from(png)).flatten({ background: '#ffffff' }).jpeg({ quality: 72 }).toBuffer();
}
