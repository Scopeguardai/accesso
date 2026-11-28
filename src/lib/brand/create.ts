import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { BRANDS_DIR, ROOT } from '../paths';
import { slugify } from './assets';
import { listBrands } from './load';

export const MAX_BRANDS = 50;

/** Marks in starter files, so the design system page can list what still needs the brand's own material. */
export const PLACEHOLDER_MARK = 'data-placeholder="true"';
export const STARTER_PALETTE_SOURCE = 'the starter set. Replace these with the brand\'s own colours';
export const STARTER_GUIDE_MARK = 'These are starter rules.';

export const newBrandSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Give the brand a name.')
    .max(60, 'Keep the name under 60 characters.')
    .regex(/^[^<>{}\n\r]+$/, 'Use plain text for the name.'),
  tagline: z.string().trim().max(120, 'Keep the tagline under 120 characters.').default(''),
  website: z.string().trim().max(200, 'Keep the website under 200 characters.').default(''),
});
export type NewBrand = z.infer<typeof newBrandSchema>;

export class BrandError extends Error {}

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function placeholderWordmark(name: string) {
  const text = name.toUpperCase();
  const width = Math.max(48, Math.round(text.length * 15.5));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 24" fill="currentColor" role="img" aria-label="${esc(name)}" ${PLACEHOLDER_MARK}><text x="0" y="19" font-family="system-ui, sans-serif" font-size="20" font-weight="600" letter-spacing="2">${esc(text)}</text></svg>\n`;
}

function placeholderMark(name: string) {
  const letter = [...name.trim()][0]?.toUpperCase() ?? '?';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="currentColor" role="img" aria-label="${esc(name)}" ${PLACEHOLDER_MARK}><circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" stroke-width="3"/><text x="24" y="32" text-anchor="middle" font-family="system-ui, sans-serif" font-size="24" font-weight="600">${esc(letter)}</text></svg>\n`;
}

function starterGuide(name: string) {
  return `# ${name} brand guide for presentations

${STARTER_GUIDE_MARK} Replace them with ${name}'s own: the agent reads this page before it designs every deck.

## Who ${name} is

Say in two or three sentences what ${name} does, who it serves and what it stands for.

## Voice

- Clear and direct. Short sentences. One idea per slide.
- Concrete over abstract: a number, a place, a date beats an adjective.
- Never invent facts, figures, names or quotes. Every figure comes from the brief or the
  knowledge base. If the material is missing, write the slide without it and raise a
  suggestion asking for it.

## Typography

- The headline font for headlines and body text, in sentence case.
- The detail font for small labels, captions and page numbers only.

## Colour

- One palette per deck. Dark backgrounds for the cover, section openers and the close;
  light backgrounds for content.
- The accent colour is for emphasis only: a rule, a key number, one highlighted word.

## Layout

- Generous space. One idea per slide. Vary layouts so neighbouring slides differ.
- Open with a cover and end with a closing slide that says what to do next.

## Imagery

- Use only images from this brand's library, chosen by their notes.
- If no image fits, use a layout without one and suggest the image that is missing.

## Logo

- The wordmark appears on the cover and the closing slide. Do not redraw or recolour it.
`;
}

/** Make a new brand pack with starter colours, fonts, logo placeholders and rules, ready to be filled in. */
export function createBrand(input: NewBrand): string {
  const existing = listBrands();
  if (existing.length >= MAX_BRANDS) throw new BrandError(`Voila holds up to ${MAX_BRANDS} brands.`);
  const base = slugify(input.name, 'brand').replace(/^_+/, '') || 'brand';
  let id = base;
  for (let n = 2; existing.includes(id) || fs.existsSync(path.join(BRANDS_DIR, id)); n += 1) id = `${base.slice(0, 36)}-${n}`;
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(id)) throw new BrandError('Use letters or numbers in the name.');

  const starter = path.join(BRANDS_DIR, '_starter');
  const dir = path.join(BRANDS_DIR, id);
  const pub = path.join(ROOT, 'public', 'brands', id);
  try {
    fs.mkdirSync(dir);
    for (const sub of ['fonts', 'logo', 'images']) fs.mkdirSync(path.join(pub, sub), { recursive: true });
    fs.copyFileSync(path.join(starter, 'Inter-Variable.ttf'), path.join(pub, 'fonts', 'Inter-Variable.ttf'));
    fs.copyFileSync(path.join(starter, 'SpaceMono-Regular.ttf'), path.join(pub, 'fonts', 'SpaceMono-Regular.ttf'));
    fs.writeFileSync(path.join(pub, 'logo', 'wordmark.svg'), placeholderWordmark(input.name));
    fs.writeFileSync(path.join(pub, 'logo', 'mark.svg'), placeholderMark(input.name));
    fs.writeFileSync(path.join(dir, 'BRAND.md'), starterGuide(input.name));
    const brand = {
      id,
      name: input.name,
      tagline: input.tagline,
      ...(input.website ? { website: input.website } : {}),
      copyright: `© ${new Date().getFullYear()}`,
      created: new Date().toISOString(),
      assetBase: `/brands/${id}`,
      fonts: {
        sans: { family: 'Inter', file: 'fonts/Inter-Variable.ttf', weight: '100 900' },
        mono: { family: 'Space Mono', file: 'fonts/SpaceMono-Regular.ttf', weight: '400' },
      },
      logo: { wordmark: 'logo/wordmark.svg', mark: 'logo/mark.svg' },
      defaultPalette: 'starter',
      palettes: {
        starter: {
          label: 'Starter palette',
          source: STARTER_PALETTE_SOURCE,
          dark: '#1C1F1D',
          onDark: '#FFFFFF',
          accent: '#C9D6CF',
          onAccent: '#1C1F1D',
          light: '#F4F5F3',
          paper: '#FFFFFF',
          tint: '#E9ECE8',
          ink: '#1C1F1D',
          muted: '#5F6662',
          line: '#D8DCD7',
        },
      },
      images: [],
      starters: [],
    };
    fs.writeFileSync(path.join(dir, 'brand.json'), `${JSON.stringify(brand, null, 2)}\n`);
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(pub, { recursive: true, force: true });
    throw err;
  }
  return id;
}
