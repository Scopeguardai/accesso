import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { BRANDS_DIR, safeId } from '../paths';
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
  assetBase: string;
  defaultPalette: string;
  palettes: { key: string; label: string; source?: string; colours: Record<ColourRole, string> }[];
  fonts: { role: 'sans' | 'mono'; family: string; file: string; weight: string }[];
  logo: { wordmark: string; mark: string };
  images: { id: string; file: string; orientation: string; alt: string; use: string }[];
  starters: string[];
  guide: string;
};

export function designData(brandId: string): DesignData {
  const b = loadBrand(brandId);
  return {
    id: b.id,
    name: b.name,
    tagline: b.tagline,
    assetBase: b.assetBase,
    defaultPalette: b.defaultPalette,
    palettes: Object.entries(b.palettes).map(([key, p]) => ({
      key,
      label: p.label,
      source: p.source,
      colours: Object.fromEntries(COLOUR_ROLES.map((r) => [r, p[r].toUpperCase()])) as Record<ColourRole, string>,
    })),
    fonts: (['sans', 'mono'] as const).map((role) => ({ role, ...b.fonts[role] })),
    logo: b.svg,
    images: b.images.map(({ id, file, orientation, alt, use }) => ({ id, file, orientation, alt, use })),
    starters: b.starters,
    guide: b.guide,
  };
}

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Colours must be written as # and six digits, like #062C3D.');

export const designInputSchema = z.object({
  defaultPalette: z.string(),
  palettes: z.record(
    z.string(),
    z.object({
      label: z.string().trim().min(1, 'Every palette needs a name.').max(60, 'Keep palette names under 60 characters.'),
      colours: z.object(Object.fromEntries(COLOUR_ROLES.map((r) => [r, hex])) as Record<ColourRole, typeof hex>),
    }),
  ),
  images: z.array(
    z.object({
      id: z.string(),
      alt: z.string().trim().min(1, 'Every image needs a description.').max(200),
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

/**
 * Save the editable parts of a brand: palette names and colours, the default
 * palette, image notes, example briefs and the brand rules. Everything else in
 * brand.json (fonts, logo files, image files, sources) is kept as it is.
 */
export function saveDesign(brandId: string, input: DesignInput): DesignData {
  if (!listBrands().includes(brandId)) throw new DesignError('That brand no longer exists.');
  const dir = path.join(BRANDS_DIR, safeId(brandId));
  const file = path.join(dir, 'brand.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));

  const keys = Object.keys(raw.palettes);
  const sent = Object.keys(input.palettes);
  if (sent.length !== keys.length || !sent.every((k) => keys.includes(k))) {
    throw new DesignError('The palettes have changed since the page was opened. Reload and try again.');
  }
  if (!keys.includes(input.defaultPalette)) throw new DesignError('Choose one of the palettes as the default.');
  const imageIds = new Set((raw.images as { id: string }[]).map((i) => i.id));
  if (input.images.length !== imageIds.size || !input.images.every((i) => imageIds.has(i.id))) {
    throw new DesignError('The images have changed since the page was opened. Reload and try again.');
  }

  raw.defaultPalette = input.defaultPalette;
  for (const key of keys) {
    const p = input.palettes[key];
    raw.palettes[key] = { ...raw.palettes[key], label: p.label, ...uppercase(p.colours) };
  }
  raw.images = (raw.images as { id: string }[]).map((img) => {
    const edit = input.images.find((i) => i.id === img.id)!;
    return { ...img, alt: edit.alt, use: edit.use };
  });
  raw.starters = input.starters;

  writeAtomic(file, `${JSON.stringify(raw, null, 2)}\n`);
  writeAtomic(path.join(dir, 'BRAND.md'), `${input.guide}\n`);
  clearBrandCache(brandId);
  return designData(brandId);
}

function uppercase(colours: Record<ColourRole, string>) {
  return Object.fromEntries(Object.entries(colours).map(([k, v]) => [k, v.toUpperCase()]));
}

function writeAtomic(file: string, text: string) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}
