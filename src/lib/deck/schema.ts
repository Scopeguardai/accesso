import { z } from 'zod';

/**
 * The deck format. A presentation is stored as data, never as HTML:
 * the agent writes it, the renderer draws it, and editing (by prompt now,
 * directly later) changes the same source.
 */

export const THEMES = ['light', 'paper', 'tint', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

const id = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'lower-case letters, digits and hyphens only');

const imageRef = z.object({
  asset: z.string().describe('Image id from the brand image library'),
  alt: z.string().max(200).optional().describe('Overrides the library alt text'),
});
export type ImageRef = z.infer<typeof imageRef>;

const common = {
  id: id.describe('Stable slide id, e.g. "why-now". Keep it when editing a slide.'),
  theme: z.enum(THEMES).optional().describe('Omit to use the layout default'),
  label: z.string().max(40).optional().describe('Short kicker shown in Space Mono'),
  sources: z
    .array(z.string())
    .optional()
    .describe('Knowledge-base paths the facts on this slide came from'),
  notes: z.string().max(1200).optional().describe('Speaker notes; not shown on the slide'),
};

const short = (n: number) => z.string().min(1).max(n);

export const slideSchema = z.discriminatedUnion('layout', [
  z.object({
    ...common,
    layout: z.literal('cover'),
    title: short(80).optional().describe('Omit to show the logo alone'),
    subtitle: short(120).optional().describe('Defaults to the brand tagline'),
  }),
  z.object({
    ...common,
    layout: z.literal('agenda'),
    title: short(40),
    items: z.array(z.object({ title: short(50), note: short(60).optional() })).min(2).max(6),
    image: imageRef.optional(),
  }),
  z.object({
    ...common,
    layout: z.literal('section'),
    title: short(40),
    body: short(240).optional(),
    image: imageRef.optional(),
  }),
  z.object({
    ...common,
    layout: z.literal('statement'),
    heading: short(110),
    body: short(360).optional(),
    stat: z.object({ value: short(12), label: short(60) }).optional(),
  }),
  z.object({
    ...common,
    layout: z.literal('split'),
    heading: short(90),
    body: short(360).optional(),
    bullets: z.array(short(110)).max(4).optional(),
    image: imageRef,
    imageSide: z.enum(['left', 'right']).default('right'),
  }),
  z.object({
    ...common,
    layout: z.literal('stats'),
    heading: short(90),
    body: short(280).optional(),
    stats: z
      .array(z.object({ value: short(12), label: short(40), note: short(120).optional() }))
      .min(2)
      .max(4),
  }),
  z.object({
    ...common,
    layout: z.literal('list'),
    heading: short(90),
    items: z.array(z.object({ title: short(50), body: short(160) })).min(2).max(5),
  }),
  z.object({
    ...common,
    layout: z.literal('quote'),
    quote: short(280),
    name: short(60).optional(),
    role: short(80).optional(),
  }),
  z.object({
    ...common,
    layout: z.literal('gallery'),
    heading: short(90),
    body: short(320).optional(),
    images: z.array(imageRef).min(2).max(3),
  }),
  z.object({
    ...common,
    layout: z.literal('timeline'),
    heading: short(90),
    body: short(240).optional(),
    steps: z
      .array(z.object({ label: short(16), title: short(40), body: short(120).optional() }))
      .min(3)
      .max(5),
  }),
  z.object({
    ...common,
    layout: z.literal('bigNumber'),
    value: short(10),
    caption: short(40),
    body: short(280).optional(),
  }),
  z.object({
    ...common,
    layout: z.literal('photo'),
    kicker: short(40).optional(),
    title: short(70),
    image: imageRef,
  }),
  z.object({
    ...common,
    layout: z.literal('closing'),
    title: short(40),
    contacts: z.array(z.object({ label: short(20), value: short(80) })).max(3).optional(),
  }),
]);
export type Slide = z.infer<typeof slideSchema>;
export type Layout = Slide['layout'];

export const LAYOUTS = slideSchema.options.map((o) => o.shape.layout.value) as Layout[];

export const outlineItemSchema = z.object({
  title: short(80),
  purpose: short(200).describe('What this slide must make the audience understand'),
  layout: z.enum(LAYOUTS as [Layout, ...Layout[]]),
});
export type OutlineItem = z.infer<typeof outlineItemSchema>;

export const suggestionSchema = z.object({
  kind: z.enum(['content', 'design']),
  slideId: z.string().optional(),
  text: short(280),
});
export type Suggestion = z.infer<typeof suggestionSchema>;

export const briefSchema = z.object({
  topic: short(200),
  audience: z.string().max(200).default(''),
  goal: z.string().max(300).default(''),
  slideCount: z.number().int().min(3).max(20).default(8),
  tone: z.string().max(120).default(''),
  mustInclude: z.string().max(4000).default(''),
  palette: z.string().max(40).optional(),
});
export type Brief = z.infer<typeof briefSchema>;

export const deckSchema = z.object({
  id,
  brand: z.string(),
  client: z.string().describe('Knowledge-base folder this deck may read'),
  title: z.string().max(120),
  palette: z.string(),
  status: z.enum(['generating', 'ready', 'error']),
  statusNote: z.string().optional(),
  brief: briefSchema,
  outline: z.array(outlineItemSchema).default([]),
  slides: z.array(slideSchema).default([]),
  suggestions: z.array(suggestionSchema).default([]),
  activity: z.array(z.object({ at: z.string(), text: z.string() })).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Deck = z.infer<typeof deckSchema>;

/** Layout defaults the renderer falls back to when a slide sets no theme. */
export const DEFAULT_THEME: Record<Layout, Theme> = {
  cover: 'dark',
  agenda: 'dark',
  section: 'light',
  statement: 'light',
  split: 'paper',
  stats: 'paper',
  list: 'light',
  quote: 'dark',
  gallery: 'light',
  timeline: 'paper',
  bigNumber: 'dark',
  photo: 'dark',
  closing: 'dark',
};

/** One line per layout, shown to the agent. */
export const LAYOUT_GUIDE: Record<Layout, string> = {
  cover: 'Opening slide. Logo, optional title, tagline. Always first.',
  agenda: 'Contents list of 2 to 6 parts, optionally over a landscape photo.',
  section: 'Opens a part of the deck with one large word or short phrase.',
  statement: 'One strong headline with a short paragraph and an optional single stat.',
  split: 'Headline and text on one side, one image on the other.',
  stats: 'Headline with 2 to 4 figures side by side.',
  list: 'Headline with 2 to 5 short rows, each a title and a line of text.',
  quote: 'A single quotation with attribution. Only for real, sourced quotes.',
  gallery: 'Headline and text beside 2 or 3 images.',
  timeline: 'Headline with 3 to 5 dated or ordered steps.',
  bigNumber: 'One very large figure with a caption. Use once per deck at most.',
  photo: 'Full-bleed landscape photo with a short title.',
  closing: 'Final slide. Short sign-off and contact details. Always last.',
};

export function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
}
