import { designChoiceSchema, type Design, type DesignChoice } from './looks';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { listDecks } from '../deck/store';
import type { Slide } from '../deck/schema';
import { BRANDS_DIR, ROOT, safeId } from '../paths';
import {
  AssetError,
  FONT_EXT,
  fontFormat,
  imageInfo,
  MAX_IMAGES,
  MAX_PALETTES,
  orientationOf,
  sanitizeSvg,
  slugify,
} from './assets';
import { PLACEHOLDER_MARK, STARTER_GUIDE_MARK, STARTER_PALETTE_SOURCE } from './create';
import { clearBrandCache, listBrands, loadBrand } from './load';

/** The ten colours of a palette, in the order the design system page shows them. */
export const COLOUR_ROLES = [
  'dark',
  'onDark',
  'accent',
  'onAccent',
  'light',
  'paper',
  'tint',
  'ink',
  'muted',
  'line',
] as const;
export type ColourRole = (typeof COLOUR_ROLES)[number];

/** Everything the design system page shows for one brand. Plain data, safe to send to the browser. */
export type DesignData = {
  id: string;
  name: string;
  tagline: string;
  website: string;
  assetBase: string;
  /** What still holds starter material and needs the brand's own. */
  todo: { section: string; text: string }[];
  /** The deck design: the look and its options, with the look's defaults filled in. */
  design: Design;
  defaultPalette: string;
  palettes: {
    key: string;
    label: string;
    source?: string;
    colours: Record<ColourRole, string>;
    /** How many of this brand's decks are drawn with the palette. */
    usedBy: number;
  }[];
  fonts: { role: 'sans' | 'mono'; family: string; file: string; weight: string }[];
  logo: { wordmark: string; mark: string };
  images: { id: string; file: string; orientation: string; alt: string; use: string; usedBy: number }[];
  starters: string[];
  guide: string;
};

function imagesIn(slide: Slide): string[] {
  const refs: string[] = [];
  if ('image' in slide && slide.image) refs.push(slide.image.asset);
  if ('images' in slide && slide.images) refs.push(...slide.images.map((i) => i.asset));
  return refs;
}

export function designData(brandId: string): DesignData {
  const b = loadBrand(brandId);
  const decks = listDecks().filter((d) => d.brand === brandId);
  // A deck whose palette is missing is drawn with the default palette.
  const paletteOf = (d: (typeof decks)[number]) => (b.palettes[d.palette] ? d.palette : b.defaultPalette);
  const todo: DesignData['todo'] = [];
  if (b.svg.wordmark.includes(PLACEHOLDER_MARK)) todo.push({ section: 'logo', text: 'Upload the wordmark' });
  if (b.svg.mark.includes(PLACEHOLDER_MARK)) todo.push({ section: 'logo', text: 'Upload the symbol' });
  if (Object.values(b.palettes).some((p) => p.source === STARTER_PALETTE_SOURCE)) {
    todo.push({ section: 'colours', text: "Set the brand's colours" });
  }
  if (b.images.length === 0) todo.push({ section: 'images', text: 'Add images' });
  if (b.guide.includes(STARTER_GUIDE_MARK)) todo.push({ section: 'rules', text: 'Write the brand rules' });
  return {
    id: b.id,
    name: b.name,
    tagline: b.tagline,
    website: b.website ?? '',
    assetBase: b.assetBase,
    todo,
    design: b.design,
    defaultPalette: b.defaultPalette,
    palettes: Object.entries(b.palettes).map(([key, p]) => ({
      key,
      label: p.label,
      source: p.source,
      colours: Object.fromEntries(COLOUR_ROLES.map((r) => [r, p[r].toUpperCase()])) as Record<ColourRole, string>,
      usedBy: decks.filter((d) => paletteOf(d) === key).length,
    })),
    fonts: (['sans', 'mono'] as const).map((role) => ({ role, ...b.fonts[role] })),
    logo: b.svg,
    images: b.images.map(({ id, file, orientation, alt, use }) => ({
      id,
      file,
      orientation,
      alt,
      use,
      usedBy: decks.filter((d) => d.slides.some((s) => imagesIn(s).includes(id))).length,
    })),
    starters: b.starters,
    guide: b.guide,
  };
}

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Colours must be written as # and six digits, like #062C3D.');

export const designInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'The brand needs a name.')
    .max(60, 'Keep the name under 60 characters.')
    .regex(/^[^<>{}\n\r]+$/, 'Use plain text for the name.'),
  tagline: z.string().trim().max(120, 'Keep the tagline under 120 characters.'),
  website: z.string().trim().max(200, 'Keep the website under 200 characters.'),
  design: designChoiceSchema.optional(),
  defaultPalette: z.string(),
  palettes: z
    .record(
      z.string().regex(/^[a-z][a-z0-9-]{0,39}$/, 'A palette has an invalid id. Reload and try again.'),
      z.object({
        label: z.string().trim().min(1, 'Every palette needs a name.').max(60, 'Keep palette names under 60 characters.'),
        colours: z.object(Object.fromEntries(COLOUR_ROLES.map((r) => [r, hex])) as Record<ColourRole, typeof hex>),
      }),
    )
    .refine((p) => Object.keys(p).length >= 1, 'Keep at least one palette.')
    .refine((p) => Object.keys(p).length <= MAX_PALETTES, `Keep it to ${MAX_PALETTES} palettes or fewer.`),
  images: z.array(
    z.object({
      id: z.string(),
      alt: z.string().trim().min(1, 'Every image needs a description of what it shows.').max(200),
      use: z.string().trim().max(300),
    }),
  ),
  starters: z
    .array(z.string().trim().min(1).max(400, 'Keep each example brief under 400 characters.'))
    .max(8, 'Keep it to eight example briefs or fewer.'),
  guide: z
    .string()
    .trim()
    .min(1, 'The brand rules cannot be empty: the agent reads them before every deck.')
    .max(30000, 'The brand rules are too long. Keep them under 30,000 characters.'),
});
export type DesignInput = z.infer<typeof designInputSchema>;

export class DesignError extends Error {}

type RawBrand = {
  name: string;
  tagline: string;
  website?: string;
  assetBase: string;
  design?: DesignChoice;
  defaultPalette: string;
  palettes: Record<string, Record<string, string>>;
  fonts: Record<'sans' | 'mono', { family: string; file: string; weight: string }>;
  logo: { wordmark: string; mark: string };
  images: { id: string; file: string; orientation: string; alt: string; use: string }[];
  starters: string[];
};

function brandFiles(brandId: string) {
  if (!listBrands().includes(brandId)) throw new DesignError('That brand no longer exists.');
  const dir = path.join(BRANDS_DIR, safeId(brandId));
  const file = path.join(dir, 'brand.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as RawBrand;
  const publicRoot = path.join(ROOT, 'public');
  const publicDir = path.join(publicRoot, raw.assetBase.replace(/^\/+/, ''));
  if (!publicDir.startsWith(publicRoot + path.sep)) throw new DesignError('The brand pack is misconfigured.');
  return { dir, file, raw, publicDir };
}

function commit(brandId: string, file: string, raw: RawBrand) {
  writeAtomic(file, `${JSON.stringify(raw, null, 2)}\n`);
  clearBrandCache(brandId);
  return designData(brandId);
}

/**
 * Save the editable text and colours of a brand: palettes (added, renamed,
 * recoloured or removed), the default palette, image notes, example briefs and
 * the brand rules. Fonts, logo files and image files change through the upload
 * functions below; everything else in brand.json is kept as it is.
 */
export function saveDesign(brandId: string, input: DesignInput): DesignData {
  const { dir, file, raw } = brandFiles(brandId);

  const keys = Object.keys(input.palettes);
  if (!keys.includes(input.defaultPalette)) throw new DesignError('Choose one of the palettes as the default.');
  const imageIds = new Set(raw.images.map((i) => i.id));
  if (input.images.length !== imageIds.size || !input.images.every((i) => imageIds.has(i.id))) {
    throw new DesignError('The images have changed since the page was opened. Reload and try again.');
  }

  raw.name = input.name;
  raw.tagline = input.tagline;
  if (input.design?.look) raw.design = input.design;
  if (input.website) raw.website = input.website;
  else delete raw.website;
  raw.defaultPalette = input.defaultPalette;
  raw.palettes = Object.fromEntries(
    keys.map((key) => {
      const p = input.palettes[key];
      const before = raw.palettes[key] ?? {};
      const colours = uppercase(p.colours);
      const next: Record<string, string> = { ...before, label: p.label, ...colours };
      // Once a starter palette's colours are changed, it is the brand's own.
      const changed = Object.entries(colours).some(([k, v]) => (before[k] ?? '').toUpperCase() !== v);
      if (before.source === STARTER_PALETTE_SOURCE && changed) delete next.source;
      return [key, next];
    }),
  );
  raw.images = raw.images.map((img) => {
    const edit = input.images.find((i) => i.id === img.id)!;
    return { ...img, alt: edit.alt, use: edit.use };
  });
  raw.starters = input.starters;

  writeAtomic(path.join(dir, 'BRAND.md'), `${input.guide}\n`);
  return commit(brandId, file, raw);
}

/** Replace the wordmark or the symbol with an uploaded SVG, cleaned first. */
export function replaceLogo(brandId: string, which: 'wordmark' | 'mark', svgText: string): DesignData {
  const { file, raw, publicDir } = brandFiles(brandId);
  const svg = sanitizeSvg(svgText, raw.name);
  const current = path.join(publicDir, raw.logo[which]);
  if (!current.startsWith(publicDir + path.sep) || !raw.logo[which].endsWith('.svg')) {
    raw.logo[which] = `logo/${which}.svg`;
  }
  const dest = path.join(publicDir, raw.logo[which]);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  writeAtomic(dest, `${svg}\n`);
  return commit(brandId, file, raw);
}

/** Replace the headline font or the detail font with an uploaded font file. */
export function replaceFont(
  brandId: string,
  role: 'sans' | 'mono',
  buf: Buffer,
  family: string,
  weight: string,
): DesignData {
  const { file, raw, publicDir } = brandFiles(brandId);
  if (buf.length > 6_000_000) throw new AssetError('That font file is too large. Use one under 6 MB.');
  const format = fontFormat(buf);
  if (!format) throw new AssetError('That file is not a font. Upload a .ttf, .otf, .woff or .woff2 file.');
  const name = family.trim();
  if (!/^[\p{L}\p{N} .'-]{1,60}$/u.test(name)) throw new AssetError('Give the font a plain name, like Inter.');
  const w = weight.trim();
  if (!/^\d{3}( \d{3})?$/.test(w)) {
    throw new AssetError('Write the weight as one number, like 400, or a range for a variable font, like 100 900.');
  }

  const old = raw.fonts[role].file;
  const rel = `fonts/${slugify(name, role)}-${role}.${FONT_EXT[format]}`;
  const dest = path.join(publicDir, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  raw.fonts[role] = { family: name, file: rel, weight: w };

  const other = role === 'sans' ? 'mono' : 'sans';
  if (old !== rel && raw.fonts[other].file !== old) removeInside(publicDir, old);
  return commit(brandId, file, raw);
}

/** Add an uploaded photograph to the image library, with the notes the agent picks it by. */
export function addImage(brandId: string, buf: Buffer, alt: string, use: string): DesignData {
  const { file, raw, publicDir } = brandFiles(brandId);
  if (raw.images.length >= MAX_IMAGES) throw new AssetError(`The library holds up to ${MAX_IMAGES} images. Remove one first.`);
  if (buf.length > 10_000_000) throw new AssetError('That image is too large. Use one under 10 MB.');
  const info = imageInfo(buf);
  if (!info || !info.width || !info.height) {
    throw new AssetError('That file is not a photo Voila can use. Upload a JPG, PNG or WebP.');
  }
  const description = alt.trim();
  if (!description) throw new AssetError('Say what the image shows: the agent chooses images by it.');
  if (description.length > 200 || use.trim().length > 300) {
    throw new AssetError('Keep the notes short: under 200 characters for what it shows, 300 for when to use it.');
  }

  const base = slugify(description, 'image');
  let id = base;
  for (
    let n = 2;
    raw.images.some((i) => i.id === id) || fs.existsSync(path.join(publicDir, `images/${id}.${info.ext}`));
    n += 1
  ) {
    id = `${base}-${n}`;
  }
  const rel = `images/${id}.${info.ext}`;
  const dest = path.join(publicDir, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf, { flag: 'wx' });

  raw.images.push({ id, file: rel, orientation: orientationOf(info.width, info.height), alt: description, use: use.trim() });
  return commit(brandId, file, raw);
}

/** Remove an image from the library and delete its file. Slides that used it show a marked gap. */
export function removeImage(brandId: string, imageId: string): DesignData {
  const { file, raw, publicDir } = brandFiles(brandId);
  const img = raw.images.find((i) => i.id === imageId);
  if (!img) throw new DesignError('That image has already been removed.');
  raw.images = raw.images.filter((i) => i.id !== imageId);
  removeInside(publicDir, img.file);
  return commit(brandId, file, raw);
}

function removeInside(publicDir: string, rel: string) {
  const target = path.join(publicDir, rel);
  if (target.startsWith(publicDir + path.sep) && fs.existsSync(target)) fs.unlinkSync(target);
}

function uppercase(colours: Record<ColourRole, string>) {
  return Object.fromEntries(Object.entries(colours).map(([k, v]) => [k, v.toUpperCase()]));
}

function writeAtomic(file: string, text: string) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

/** Set only the deck design of a brand: the look and its options. */
export function saveLook(brandId: string, choice: DesignChoice): DesignData {
  const { file, raw } = brandFiles(brandId);
  if (!choice.look) throw new DesignError('Choose a design.');
  raw.design = choice;
  return commit(brandId, file, raw);
}
