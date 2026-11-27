import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { BRANDS_DIR, safeId } from '../paths';

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

const paletteSchema = z.object({
  label: z.string(),
  source: z.string().optional(),
  dark: hex,
  onDark: hex,
  accent: hex,
  onAccent: hex,
  light: hex,
  paper: hex,
  tint: hex,
  ink: hex,
  muted: hex,
  line: hex,
});
export type Palette = z.infer<typeof paletteSchema>;

const fontSchema = z.object({ family: z.string(), file: z.string(), weight: z.string() });

const brandSchema = z.object({
  id: z.string(),
  name: z.string(),
  tagline: z.string(),
  website: z.string().optional(),
  copyright: z.string(),
  /** Example briefs shown when starting a new presentation. */
  starters: z.array(z.string()).default([]),
  assetBase: z.string(),
  fonts: z.object({ sans: fontSchema, mono: fontSchema }),
  logo: z.object({ wordmark: z.string(), mark: z.string() }),
  defaultPalette: z.string(),
  palettes: z.record(z.string(), paletteSchema),
  images: z.array(
    z.object({
      id: z.string(),
      file: z.string(),
      orientation: z.enum(['landscape', 'portrait', 'square']),
      alt: z.string(),
      use: z.string(),
    }),
  ),
});
export type Brand = z.infer<typeof brandSchema> & {
  guide: string;
  /** Inline SVG markup, so the logo can take its colour from the slide. */
  svg: { wordmark: string; mark: string };
};

const cache = new Map<string, Brand>();

export function loadBrand(brandId: string): Brand {
  const cached = cache.get(brandId);
  if (cached && process.env.NODE_ENV === 'production') return cached;

  const dir = path.join(BRANDS_DIR, safeId(brandId));
  const data = brandSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, 'brand.json'), 'utf8')));
  if (!data.palettes[data.defaultPalette]) {
    throw new Error(`Brand ${brandId}: defaultPalette "${data.defaultPalette}" is not defined`);
  }
  const publicDir = path.join(BRANDS_DIR, '..', 'public', data.assetBase);
  const readSvg = (rel: string) => fs.readFileSync(path.join(publicDir, rel), 'utf8');
  const brand: Brand = {
    ...data,
    guide: fs.readFileSync(path.join(dir, 'BRAND.md'), 'utf8'),
    svg: { wordmark: readSvg(data.logo.wordmark), mark: readSvg(data.logo.mark) },
  };
  cache.set(brandId, brand);
  return brand;
}

/** Forget a brand's cached copy, so the next load reads its files again. */
export function clearBrandCache(brandId: string) {
  cache.delete(brandId);
}

export function listBrands(): string[] {
  return fs
    .readdirSync(BRANDS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(BRANDS_DIR, d.name, 'brand.json')))
    .map((d) => d.name);
}

export function paletteFor(brand: Brand, name: string | undefined): Palette {
  return brand.palettes[name ?? ''] ?? brand.palettes[brand.defaultPalette];
}

export function imageFor(brand: Brand, assetId: string) {
  return brand.images.find((i) => i.id === assetId);
}
